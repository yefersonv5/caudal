// Caudal · función "respaldo": devuelve todos tus datos en un archivo JSON.
// La usa el atajo semanal del iPhone para guardar una copia fuera de Supabase (iCloud Drive).
// Se identifica con la llave personal de los atajos (?k=...). Verify JWT desactivado.
import { createClient } from "npm:@supabase/supabase-js@2";

const adminKey = (): string => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); return o.default ?? Object.values(o)[0] as string; } catch { return ""; }
};
const bogota = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const TABLES = ["settings", "accounts", "categories", "transactions", "budgets", "bills", "recurring", "plans", "inbox"];

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let token = url.searchParams.get("k") ?? "";
  if (!token && req.method === "POST") { try { token = String((await req.json()).token ?? ""); } catch { /* sin cuerpo */ } }
  token = token.trim();
  if (token.length < 20) return new Response(JSON.stringify({ ok: false, mensaje: "Falta la llave" }), { status: 401, headers: { "Content-Type": "application/json" } });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, adminKey());
  const { data: tk } = await admin.from("shortcut_tokens").select("user_id").eq("token", token).maybeSingle();
  if (!tk) return new Response(JSON.stringify({ ok: false, mensaje: "Llave inválida" }), { status: 401, headers: { "Content-Type": "application/json" } });

  const out: Record<string, unknown> = { app: "Caudal", fecha: bogota(), formato: 1 };
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(t).select("*").eq("user_id", tk.user_id).range(from, from + 999);
      if (error) return new Response(JSON.stringify({ ok: false, mensaje: "Error leyendo " + t }), { status: 500, headers: { "Content-Type": "application/json" } });
      rows.push(...(data ?? [])); if (!data || data.length < 1000) break;
    }
    out[t] = rows;
  }
  await admin.from("settings").update({ backup_at: new Date().toISOString() }).eq("user_id", tk.user_id); // para que la app sepa del último respaldo
  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="caudal-respaldo-${bogota()}.json"` },
  });
});
