// Caudal · función "atajo": recibe lo que mandan los atajos del iPhone (Apple Pay, SMS, correo, Siri)
// y lo deja en la bandeja "Por revisar". Se identifica con la llave personal, no con sesión.
// IMPORTANTE: al crearla, desactiva "Verify JWT" / "Enforce JWT verification".
import { createClient } from "npm:@supabase/supabase-js@2";

// Llave de administrador del proyecto (Supabase la entrega sola a la función).
const adminKey = (): string => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); return o.default ?? Object.values(o)[0] as string; } catch { return ""; }
};

const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const bogota = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method !== "POST") return out({ ok: false, mensaje: "Usa POST" }, 405);
  let b: Record<string, unknown> = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    b = ct.includes("json") ? await req.json() : Object.fromEntries((await req.formData()).entries());
  } catch { return out({ ok: false, mensaje: "No entendí el contenido" }, 400); }

  const token = String(b.token ?? "").trim();
  if (token.length < 20) return out({ ok: false, mensaje: "Falta la llave" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, adminKey());
  const { data: tk } = await admin.from("shortcut_tokens").select("user_id").eq("token", token).maybeSingle();
  if (!tk) return out({ ok: false, mensaje: "Llave inválida" }, 401);

  const s = (k: string) => (b[k] == null ? "" : String(b[k]).slice(0, 2000));
  let item: Record<string, string>, raw: string;
  if (s("monto")) { item = { kind: "applepay", monto: s("monto"), comercio: s("comercio"), tarjeta: s("tarjeta") }; raw = "Apple Pay · " + s("comercio"); }
  else if (s("n")) { item = { kind: "sms", n: s("n") }; raw = s("n").slice(0, 160); }
  else if (s("t")) { item = { kind: "texto", t: s("t") }; raw = s("t").slice(0, 160); }
  else return out({ ok: false, mensaje: "No llegó ningún dato (usa monto, n o t)" }, 400);
  item.date = bogota();

  const { error } = await admin.from("inbox").insert({ user_id: tk.user_id, raw, item });
  if (error) return out({ ok: false, mensaje: "No se pudo guardar" }, 500);
  return out({ ok: true, mensaje: "Anotado en Caudal: " + raw });
});
