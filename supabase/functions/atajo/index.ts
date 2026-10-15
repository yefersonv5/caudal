// Caudal · función "atajo": recibe lo que mandan los atajos del iPhone (notificaciones del banco, Apple Pay, Siri)
// y lo deja en la bandeja "Por revisar". Se identifica con la llave personal, no con sesión.
// Las notificaciones y el dictado se leen con Claude (Haiku): descarta lo que no es un movimiento de dinero
// y separa bien los movimientos dictados. Si el mismo texto llega dos veces seguidas, se guarda una sola vez.
// IMPORTANTE: al crearla, desactiva "Verify JWT" / "Enforce JWT verification".
import { createClient } from "npm:@supabase/supabase-js@2";

const adminKey = (): string => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); return o.default ?? Object.values(o)[0] as string; } catch { return ""; }
};
const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const bogotaNow = () => new Date(Date.now() - 5 * 3600_000);
const bogota = () => bogotaNow().toISOString().slice(0, 10);
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

type Item = { type: string; amount: number; date: string; note: string; categoryId: string | null; accountId: string | null; toAccountId?: string | null; pending?: boolean };

async function leer(admin: ReturnType<typeof createClient>, uid: string, texto: string, kind: "sms" | "texto"): Promise<{ mov: boolean; items: Item[] } | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) return null;
  const [{ data: cats }, { data: accs }, { data: hist }] = await Promise.all([
    admin.from("categories").select("id,name,type,parent_id,hidden").eq("user_id", uid),
    admin.from("accounts").select("id,name,grp,hidden").eq("user_id", uid),
    admin.from("transactions").select("note,category_id").eq("user_id", uid).eq("type", "gasto").not("note", "is", null).order("date", { ascending: false }).limit(400),
  ]);
  const byId = new Map((cats ?? []).map((c: { id: string }) => [c.id, c]));
  const catTxt = (cats ?? []).filter((c: { hidden: boolean }) => !c.hidden).map((c: { id: string; type: string; name: string; parent_id: string | null }) => {
    const p = c.parent_id ? byId.get(c.parent_id) as { name: string } | undefined : undefined; return c.id + " | " + c.type + " | " + (p ? p.name + " > " : "") + c.name;
  }).join("\n");
  const accTxt = (accs ?? []).filter((a: { hidden: boolean }) => !a.hidden).map((a: { id: string; name: string; grp: string }) => a.id + " | " + a.name + " | " + a.grp).join("\n");
  const seen = new Set<string>(); const hints: string[] = [];
  for (const t of hist ?? []) { const n = String(t.note).trim(); const k = n.toLowerCase(); if (!n || seen.has(k)) continue; seen.add(k); const c = byId.get(t.category_id) as { name: string } | undefined; if (c) hints.push(n + " → " + c.name); if (hints.length >= 60) break; }
  const hoy = bogotaNow();
  const prompt = "Eres el lector de movimientos de una app personal de gastos en Colombia (pesos COP). Hoy es " + DIAS[hoy.getUTCDay()] + " " + bogota() + ".\n" +
    (kind === "sms"
      ? "Te llega el texto de una NOTIFICACIÓN del banco (Lulo Bank u otro). Decide si informa un movimiento de dinero real del usuario: una compra o pago con tarjeta, un pago de servicio, una transferencia enviada o recibida, un retiro, un ingreso o un abono. NO son movimientos: promociones, publicidad, códigos de seguridad, inicios de sesión, avisos de corte o de pago próximo, recordatorios, cambios de clave, rendimientos informativos, movimientos entre bolsillos propios del mismo banco, ni rechazos o compras declinadas.\n" +
        "Si es un movimiento: un solo item con el monto del movimiento (nunca el saldo disponible ni el cupo), note = comercio o concepto corto, date = fecha del texto o hoy. Una compra con tarjeta de crédito va con accountId de la tarjeta de crédito si está en la lista.\n"
      : "Te llega lo que el usuario DICTÓ por voz. Conviértelo en movimientos. Ojo: el dictado no trae comas; un solo gasto con varias palabras es UN movimiento. Solo separa cuando claramente nombra varios gastos con su propio valor. Un número que no es un valor de dinero (cantidades, horas, días) no crea un movimiento.\n" +
        "Valores: \"25 mil\" = 25000; un número pequeño sin unidad en un contexto de miles se lee en miles. pending=true si el usuario no está seguro del valor (\"como\", \"más o menos\", \"aprox\").\n") +
    "type: gasto, ingreso o transferencia. categoryId: SOLO un id de la lista, el más específico. accountId: id de la lista si se menciona o se infiere; si no, null.\n\n" +
    "Categorías (id | tipo | nombre):\n" + catTxt + "\n\nCuentas (id | nombre | grupo):\n" + accTxt + "\n\nAsí suele clasificar el usuario (nota → categoría):\n" + hints.join("\n") +
    '\n\nResponde SOLO con JSON: {"movimiento":true,"items":[{"type":"gasto","amount":0,"date":"YYYY-MM-DD","categoryId":"","accountId":null,"toAccountId":null,"note":"","pending":false}]}' +
    "\nSi no es un movimiento: {\"movimiento\":false,\"items\":[]}\n\nTexto:\n<<<\n" + texto + "\n>>>";
  const body = { model: Deno.env.get("CLAUDE_MODEL") ?? "claude-haiku-5-5", max_tokens: 4000, messages: [{ role: "user", content: prompt }] };
  const call = (extra: Record<string, unknown>) => fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ ...body, ...extra }) });
  let r = await call({ thinking: { type: "adaptive" }, output_config: { effort: "low" } });
  if (r.status === 400) r = await call({});
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  const txt = (d?.content ?? []).map((p: { type: string; text?: string }) => (p.type === "text" ? p.text ?? "" : "")).join("");
  const m = txt.match(/\{[\s\S]*\}/); if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const items = (j.items ?? []).map((x: Item) => ({ ...x, amount: Math.round(Math.abs(Number(x.amount) || 0)) })).filter((x: Item) => x.amount > 0);
    return { mov: !!j.movimiento && items.length > 0, items };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return out({ ok: false, mensaje: "Usa POST" }, 405);
  let b: Record<string, unknown> = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    b = ct.includes("json") ? await req.json() : Object.fromEntries((await req.formData()).entries());
  } catch { return out({ ok: false, mensaje: "No entendí el contenido" }, 400); }

  const token = String(b.token ?? new URL(req.url).searchParams.get("k") ?? "").trim();
  if (token.length < 20) return out({ ok: false, mensaje: "Falta la llave" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, adminKey());
  const { data: tk } = await admin.from("shortcut_tokens").select("user_id").eq("token", token).maybeSingle();
  if (!tk) return out({ ok: false, mensaje: "Llave inválida" }, 401);

  const s = (k: string) => (b[k] == null ? "" : String(b[k]).slice(0, 2000));
  let item: Record<string, unknown>, raw: string;
  if (s("monto")) { item = { kind: "applepay", monto: s("monto"), comercio: s("comercio"), tarjeta: s("tarjeta") }; raw = "Apple Pay · " + s("comercio"); }
  else if (s("n")) { item = { kind: "sms", n: s("n") }; raw = s("n").slice(0, 160); }
  else if (s("t")) { item = { kind: "texto", t: s("t") }; raw = s("t").slice(0, 160); }
  else return out({ ok: false, mensaje: "No llegó ningún dato (usa monto, n o t)" }, 400);
  item.date = bogota();

  // el mismo texto dos veces en 3 minutos: se guarda una sola vez
  const since = new Date(Date.now() - 3 * 60_000).toISOString();
  const { data: dup } = await admin.from("inbox").select("id").eq("user_id", tk.user_id).eq("raw", raw).gte("created_at", since).limit(1);
  if (dup && dup.length) return out({ ok: true, mensaje: "Ya estaba anotado" });

  if (item.kind === "sms" || item.kind === "texto") {
    const texto = String(item.kind === "sms" ? item.n : item.t);
    const r = await leer(admin, tk.user_id, texto, item.kind as "sms" | "texto");
    if (r && !r.mov && item.kind === "sms") return out({ ok: true, ignorado: true, mensaje: "No es un movimiento: no se anotó" });
    if (r && r.mov) item.items = r.items; // la app usa esta lectura; si falla, la app lee el texto como antes
  }

  const { error } = await admin.from("inbox").insert({ user_id: tk.user_id, raw, item });
  if (error) return out({ ok: false, mensaje: "No se pudo guardar" }, 500);
  const n = Array.isArray(item.items) ? (item.items as Item[]).length : 1;
  return out({ ok: true, mensaje: "Anotado en Caudal: " + raw + (n > 1 ? " (" + n + " movimientos)" : "") });
});
