// Caudal · función "avisos": envía las notificaciones push que la app dejó programadas en push_queue.
// La llama una tarea programada (pg_cron) cada 10 minutos. No recibe datos: solo despacha lo vencido.
// Las llaves VAPID viven en la tabla app_secrets (solo la lee el administrador).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const adminKey = (): string => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); return o.default ?? Object.values(o)[0] as string; } catch { return ""; }
};
const bogota = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, adminKey());
  const { data: sec } = await admin.from("app_secrets").select("name,value");
  const S = Object.fromEntries((sec ?? []).map((r: { name: string; value: string }) => [r.name, r.value]));
  if (!S.vapid_public || !S.vapid_private) return new Response("sin llaves", { status: 500 });
  webpush.setVapidDetails("mailto:avisos@caudal.app", S.vapid_public, S.vapid_private);

  const now = new Date(), old = new Date(now.getTime() - 6 * 3600_000);
  const { data: due } = await admin.from("push_queue").select("*").is("sent_at", null).lte("at", now.toISOString()).order("at").limit(200);
  let sent = 0, skipped = 0;
  for (const q of due ?? []) {
    let skip = new Date(q.at) < old; // muy viejo: ya no sirve
    if (!skip && q.kind === "diario") {
      // resumen de lo registrado hoy, para que salte a la vista lo que falta
      const { data: hoy } = await admin.from("transactions").select("amount,note,type").eq("user_id", q.user_id).eq("date", bogota()).eq("type", "gasto");
      const n = (hoy ?? []).length, tot = (hoy ?? []).reduce((a: number, t: { amount: number }) => a + Number(t.amount), 0);
      const fmt = (v: number) => "$" + String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      if (!n) { q.title = "¿Qué gastaste hoy?"; q.body = "Aún no registras nada hoy. Anótalo ahora que te acuerdas."; }
      else {
        const names = (hoy ?? []).map((t: { note: string | null }) => t.note).filter(Boolean).slice(0, 4).join(", ");
        q.title = "Hoy llevas " + n + (n === 1 ? " gasto" : " gastos") + " por " + fmt(tot);
        q.body = (names ? names + ". " : "") + "¿Se te quedó algo por anotar?";
      }
    }
    if (!skip) {
      const { data: subs } = await admin.from("push_subs").select("endpoint,keys").eq("user_id", q.user_id);
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: q.title, body: q.body, tag: q.kind, url: "./" }), { TTL: 3600 });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await admin.from("push_subs").delete().eq("user_id", q.user_id).eq("endpoint", s.endpoint);
          else console.log("error push", code, String((e as Error).message ?? e).slice(0, 200));
        }
      }
    } else skipped++;
    await admin.from("push_queue").update({ sent_at: now.toISOString() }).eq("user_id", q.user_id).eq("id", q.id);
  }
  return new Response(JSON.stringify({ sent, skipped, due: (due ?? []).length }), { headers: { "Content-Type": "application/json" } });
});
