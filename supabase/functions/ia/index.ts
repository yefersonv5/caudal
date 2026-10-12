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
const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, adminKey());
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return out({ error: "Inicia sesión para usar la IA", code: "not_granted" }, 401);

  let body: { prompt?: string; json?: boolean; images?: { mime: string; data: string }[] };
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
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": claudeKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: Deno.env.get("CLAUDE_MODEL") ?? "claude-haiku-5-5", max_tokens: 2048, messages: [{ role: "user", content }] }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return out({ error: d?.error?.message ?? "Error de Claude", code: r.status === 429 ? "rate_limited" : "upstream_error" }, 502);
    text = (d?.content ?? []).map((p: { type: string; text?: string }) => (p.type === "text" ? p.text ?? "" : "")).join("");
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
