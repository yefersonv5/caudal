// Caudal · función "semanal": cada domingo arma el resumen de la semana con Claude y lo manda por notificación.
// Usa el último contexto que dejó la app (ia_notas, kind "ctx") más los gastos reales de los últimos 7 días.
// La llama pg_cron con { key } = app_secrets.cron_key; sin esa llave no hace nada (cada llamada cuesta).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const adminKey = (): string => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); return o.default ?? Object.values(o)[0] as string; } catch { return ""; }
};
const MODEL = Deno.env.get("CLAUDE_MODEL_ASK") ?? "claude-sonnet-5-5";
const PRICE: Record<string, [number, number]> = { "claude-haiku-5-5": [0.10, 0.50], "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20] };
const bogota = (d = 0) => new Date(Date.now() - 5 * 3600_000 - d * 864e5).toISOString().slice(0, 10);
const cop = (v: number) => "$" + String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const RULES = "Eres el asistente financiero personal de __NOMBRE__ en Bogotá. Es domingo y le escribes el resumen de su semana: corto, útil y cercano, en español de Colombia, sin la raya larga. Cifras como $1.234.567.\n" +
  "Abajo tienes su contexto (perfil, metas, memoria de lo que le has recomendado y el estado del mes, puede tener unos días) y los gastos reales de los últimos 7 días (lo más nuevo manda).\n" +
  "Cuenta: cuánto gastó en la semana y en qué se fue, cómo va el mes frente al plan (lo que se va a pasar), cómo van sus metas, si cumplió algo que le recomendaste, y lo único más importante que debería hacer esta semana que empieza. Nada genérico.\n" +
  "Responde SOLO con JSON: {\"titulo\":\"máximo 40 caracteres\",\"notificacion\":\"máximo 140 caracteres, lo más importante\",\"resumen\":\"de 4 a 6 viñetas que empiezan con '- ', con **negrita** en lo clave\"}";

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, adminKey());
  const { data: sec } = await admin.from("app_secrets").select("name,value");
  const S = Object.fromEntries((sec ?? []).map((r: { name: string; value: string }) => [r.name, r.value]));
  let body: { key?: string; user?: string } = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  if (!S.cron_key || body.key !== S.cron_key) return new Response("no autorizado", { status: 401 });
  const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!claudeKey) return new Response("sin llave de Claude", { status: 500 });
  if (S.vapid_public && S.vapid_private) webpush.setVapidDetails("mailto:avisos@caudal.app", S.vapid_public, S.vapid_private);

  // personas con contexto reciente (abrieron la app en las últimas 3 semanas)
  let q = admin.from("ia_notas").select("user_id,date,data").eq("kind", "ctx").gte("date", bogota(21));
  if (body.user) q = q.eq("user_id", body.user);
  const { data: ctxs } = await q;
  const done: unknown[] = [];
  for (const c of ctxs ?? []) {
    const uid = c.user_id as string, today = bogota();
    const { data: prev } = await admin.from("ia_notas").select("id").eq("user_id", uid).eq("kind", "semanal").gte("date", bogota(5)).limit(1);
    if (prev && prev.length && !body.user) continue; // ya tiene el de esta semana

    const { data: cats } = await admin.from("categories").select("id,name,parent_id").eq("user_id", uid);
    const cm = new Map((cats ?? []).map((x: { id: string; name: string; parent_id: string | null }) => [x.id, x]));
    const cn = (id: string | null) => { const x = id ? cm.get(id) : null; if (!x) return "Sin categoría"; const p = x.parent_id ? cm.get(x.parent_id) : null; return p ? p.name + " > " + x.name : x.name; };
    const { data: tx } = await admin.from("transactions").select("date,type,amount,category_id,note").eq("user_id", uid).gte("date", bogota(7)).in("type", ["gasto", "ingreso"]).order("date");
    const gastos = (tx ?? []).filter((t: { type: string }) => t.type === "gasto");
    const tot = gastos.reduce((a: number, t: { amount: number }) => a + Number(t.amount), 0);
    const lines = (tx ?? []).map((t: { date: string; type: string; amount: number; category_id: string | null; note: string | null }) => [t.date, t.type, cop(Number(t.amount)), cn(t.category_id), (t.note ?? "").replace(/[\n,]/g, " ")].join(", "));
    const data = c.data as { text?: string; nombre?: string };
    const prompt = RULES.replace("__NOMBRE__", data.nombre || "la persona") + "\n\n## Contexto (del " + c.date + ")\n" + (data.text ?? "") +
      "\n\n## Gastos e ingresos reales de los últimos 7 días (" + gastos.length + " gastos por " + cop(tot) + ")\n" + (lines.join("\n") || "Ninguno registrado.");

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": claudeKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, thinking: { type: "adaptive" }, output_config: { effort: "medium" }, messages: [{ role: "user", content: prompt + "\n\nResponde únicamente con el JSON." }] }),
    });
    const d = await r.json().catch(() => ({}));
    const U = d?.usage ?? {}, p = PRICE[MODEL] ?? [2, 10];
    await admin.from("ia_usage").insert({ user_id: uid, task: "semanal", model: MODEL, inp: U.input_tokens ?? 0, outp: U.output_tokens ?? 0, usd: ((U.input_tokens ?? 0) * p[0] + (U.output_tokens ?? 0) * p[1]) / 1e6, ...(r.ok ? {} : { error: String(d?.error?.message ?? r.status).slice(0, 200) }) });
    if (!r.ok) { done.push({ uid, error: r.status }); continue; }
    const text = (d?.content ?? []).map((x: { type: string; text?: string }) => (x.type === "text" ? x.text ?? "" : "")).join("");
    let j: { titulo?: string; notificacion?: string; resumen?: string } = {};
    try { j = JSON.parse((text.match(/\{[\s\S]*\}/) ?? ["{}"])[0]); } catch { /* respuesta inválida */ }
    if (!j.resumen) { done.push({ uid, error: "sin resumen" }); continue; }
    const id = "semanal-" + today;
    await admin.from("ia_notas").upsert({ user_id: uid, id, kind: "semanal", date: today, data: j, status: "nueva", updated_at: new Date().toISOString() });

    let sent = 0;
    if (S.vapid_public && S.vapid_private) {
      const { data: subs } = await admin.from("push_subs").select("endpoint,keys").eq("user_id", uid);
      for (const s of subs ?? []) {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: j.titulo || "Tu semana", body: j.notificacion || "Mira cómo te fue esta semana.", tag: "semanal", url: "./?semanal=1" }), { TTL: 6 * 3600 }); sent++; }
        catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await admin.from("push_subs").delete().eq("user_id", uid).eq("endpoint", s.endpoint); }
      }
    }
    done.push({ uid, sent });
  }
  return new Response(JSON.stringify({ done }), { headers: { "Content-Type": "application/json" } });
});
