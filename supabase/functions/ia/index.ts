// Caudal · función "ia": lee texto, voz transcrita y fotos de recibos con Claude (o Gemini).
// Solo responde a usuarios con sesión iniciada. La llave vive en los secretos del proyecto: ANTHROPIC_API_KEY o GEMINI_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

// Llave de administrador del proyecto (Supabase la entrega sola a la función).
const adminKey = (): string => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); return o.default ?? Object.values(o)[0] as string; } catch { return ""; }
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// precio en dólares por millón de tokens (entrada, salida)
const PRICE: Record<string, [number, number]> = { "claude-haiku-5-5": [0.10, 0.50], "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20] };
const usd = (m: string, i = 0, o = 0) => { const p = PRICE[m] ?? [2, 10]; return (i * p[0] + o * p[1]) / 1e6; };
const noCredits = (msg: string) => /credit balance|billing|purchase credits|insufficient/i.test(msg);
const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, adminKey());
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return out({ error: "Inicia sesión para usar la IA", code: "not_granted" }, 401);

  let body: { prompt?: string; json?: boolean; task?: string; images?: { mime: string; data: string }[] };
  try { body = await req.json(); } catch { return out({ error: "Solicitud inválida", code: "invalid_request" }, 400); }
  const prompt = String(body.prompt ?? "");
  if (!prompt || prompt.length > 400_000) return out({ error: "Texto vacío o demasiado largo", code: "invalid_request" }, 400);
  const images = (body.images ?? []).slice(0, 4);

  // Proveedor: Claude si existe ANTHROPIC_API_KEY; si no, Gemini con GEMINI_API_KEY.
  const claudeKey = Deno.env.get("ANTHROPIC_API_KEY"), geminiKey = Deno.env.get("GEMINI_API_KEY");
  let text = "";
  if (claudeKey) {
    const content: unknown[] = images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime || "image/jpeg", data: i.data } }));
    content.push({ type: "text", text: prompt + (body.json ? "\n\nResponde únicamente con el JSON, sin texto adicional ni bloques de código." : "") });
    // Los modelos nuevos piensan antes de responder y ese pensamiento cuenta en max_tokens: se deja margen amplio.
    // Registrar movimientos: Haiku (rápido y barato). Preguntar y asistente: Sonnet.
    const task = body.task ?? "registro", ask = task === "ask" || task === "asesor";
    const model = ask ? (Deno.env.get("CLAUDE_MODEL_ASK") ?? "claude-sonnet-5-5") : (Deno.env.get("CLAUDE_MODEL") ?? "claude-haiku-5-5");
    const base = { model: model as string, max_tokens: 16000, messages: [{ role: "user", content }] };
    const call = (extra: Record<string, unknown>) => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": claudeKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ ...base, ...extra }),
    });
    let r = await call({ thinking: { type: "adaptive" }, output_config: { effort: ask ? "medium" : "low" } });
    if (r.status === 400) r = await call({}); // modelo que no acepta esas opciones
    if (ask && (r.status === 404 || r.status === 529)) { base.model = "claude-haiku-5-5"; r = await call({ thinking: { type: "adaptive" }, output_config: { effort: "medium" } }); }
    const d = await r.json().catch(() => ({}));
    const log = (extra: Record<string, unknown>) => admin.from("ia_usage").insert({ user_id: user.id, task, model: base.model, inp: d?.usage?.input_tokens ?? 0, outp: d?.usage?.output_tokens ?? 0, usd: usd(base.model, d?.usage?.input_tokens, d?.usage?.output_tokens), ...extra });
    if (!r.ok) {
      const msg = d?.error?.message ?? "Error de Claude";
      if (noCredits(msg)) { await log({ error: "sin_creditos" }); return out({ error: "Se acabaron los créditos de la IA. Recárgalos en console.anthropic.com, en Billing.", code: "no_credits" }, 402); }
      return out({ error: msg, code: r.status === 429 ? "rate_limited" : "upstream_error" }, 502);
    }
    await log({});
    text = (d?.content ?? []).map((p: { type: string; text?: string }) => (p.type === "text" ? p.text ?? "" : "")).join("");
    console.log(JSON.stringify({ model: base.model, stop: d?.stop_reason, in: d?.usage?.input_tokens, out: d?.usage?.output_tokens, chars: text.length }));
    if (!text.trim()) return out({ error: d?.stop_reason === "refusal" ? "La IA no quiso responder esa pregunta. Prueba con otras palabras." : "La IA no alcanzó a responder. Intenta de nuevo.", code: "upstream_error", stop: d?.stop_reason }, 502);
  } else if (geminiKey) {
    const parts: unknown[] = [{ text: prompt }];
    for (const img of images) parts.push({ inline_data: { mime_type: img.mime || "image/jpeg", data: img.data } });
    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash-lite";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: body.json ? { responseMimeType: "application/json", temperature: 0.1 } : { temperature: 0.3 } }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return out({ error: d?.error?.message ?? "Error de Gemini", code: r.status === 429 ? "rate_limited" : "upstream_error" }, 502);
    text = (d?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  } else return out({ error: "Falta configurar ANTHROPIC_API_KEY o GEMINI_API_KEY en Secrets", code: "upstream_error" }, 500);
  return out({ text });
});
