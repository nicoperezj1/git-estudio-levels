import { createAdminSupabase } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

// Centro de notificaciones. Una sola función para avisar a personas del equipo:
//  - si el negocio activó el centro (tenants.notification_center_enabled): guarda el aviso en la bandeja de cada
//    persona (respetando sus preferencias) y envía el push con texto seguro para la pantalla bloqueada;
//  - si NO lo activó: se comporta exactamente como antes (solo el push, sin guardar nada).
// Nunca lanza errores: un aviso que falla no debe romper una venta, una cita ni un cobro.

export type NotifyKind =
  | "appointment_new" | "appointment_changed" | "client_arrived"
  | "planilla_created" | "planilla_approved"
  | "announcement" | "cash_problem" | "supply_request";

// `essential`: no se puede silenciar. `generic`: texto para pantalla bloqueada (sin nombres ni montos).
export const NOTIFY_KINDS: Record<NotifyKind, { label: string; essential: boolean; generic: { title: string; body: string } }> = {
  appointment_new:     { label: "Nuevas citas", essential: false, generic: { title: "Nueva cita agendada", body: "Abre la app para ver el detalle." } },
  appointment_changed: { label: "Citas canceladas o cambiadas", essential: false, generic: { title: "Cambió una de tus citas", body: "Abre la app para ver el detalle." } },
  client_arrived:      { label: "Cliente llegó", essential: false, generic: { title: "Tu cliente llegó", body: "Te está esperando." } },
  planilla_created:    { label: "Descuento por planilla por aprobar", essential: true, generic: { title: "Descuento por planilla por aprobar", body: "Hay un código pendiente." } },
  planilla_approved:   { label: "Descuento por planilla aprobado", essential: true, generic: { title: "Se aprobó un descuento por planilla", body: "Abre la app para ver el detalle." } },
  announcement:        { label: "Avisos del administrador", essential: true, generic: { title: "Nuevo aviso de tu negocio", body: "Abre la app para leerlo." } },
  cash_problem:        { label: "Problemas de caja", essential: true, generic: { title: "Se reportó un problema de caja", body: "Revísalo en la app." } },
  supply_request:      { label: "Solicitudes de insumos", essential: false, generic: { title: "Nueva solicitud de insumos", body: "Revísala en la app." } },
};

export interface NotifyInput {
  tenantId: string | null | undefined;
  kind: NotifyKind;
  userIds?: string[];
  roles?: string[];                 // + todos los activos del negocio con alguno de estos roles
  title: string;                    // texto completo (bandeja)
  body?: string;
  url?: string;                     // ruta interna al tocar el aviso
  pushTitle?: string;               // si se indica, reemplaza el texto del push (por defecto el mismo de la bandeja)
  pushBody?: string;
  requiresAck?: boolean;
  groupId?: string;
  createdBy?: string | null;
  createdByName?: string | null;
}

// Hora de Chile "HH:MM" (para el horario de silencio).
function chileHHMM(): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value || "00";
  const m = parts.find((p) => p.type === "minute")?.value || "00";
  return `${h === "24" ? "00" : h}:${m}`;
}

export function inQuietHours(now: string, start?: string | null, end?: string | null): boolean {
  if (!start || !end || start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end; // cruza medianoche (22:00 a 08:00)
}

export interface NotifyResult { stored: number; pushed: number; centerEnabled: boolean }

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const out: NotifyResult = { stored: 0, pushed: 0, centerEnabled: false };
  try {
    if (!input.tenantId) return out;
    const supabase = createAdminSupabase();
    const meta = NOTIFY_KINDS[input.kind];

    // Destinatarios
    const ids = new Set<string>((input.userIds || []).filter(Boolean));
    if (input.roles && input.roles.length > 0) {
      const { data: staff } = await supabase.from("profiles").select("id").eq("tenant_id", input.tenantId).in("role", input.roles).eq("active", true);
      (staff || []).forEach((s: any) => ids.add(s.id));
    }
    if (input.createdBy) ids.delete(input.createdBy); // quien lo envía no se avisa a sí mismo
    if (ids.size === 0) return out;
    let recipients = Array.from(ids);

    // ¿El negocio activó el centro? (si falta la migración 100, se trata como apagado)
    const { data: t, error: tErr } = await supabase.from("tenants").select("notification_center_enabled").eq("id", input.tenantId).maybeSingle();
    out.centerEnabled = !tErr && !!(t as any)?.notification_center_enabled;

    if (!out.centerEnabled) {
      // Comportamiento de siempre: solo push.
      const r = await sendPush({ userIds: recipients, title: input.pushTitle || input.title, body: input.pushBody ?? input.body, url: input.url, onlyTenantId: input.tenantId });
      out.pushed = r.sent;
      return out;
    }

    // Preferencias de cada persona
    const { data: prefsRows } = await supabase.from("notification_preferences").select("user_id, muted_kinds, quiet_start, quiet_end, hide_details").in("user_id", recipients);
    const prefs = new Map<string, any>((prefsRows || []).map((p: any) => [p.user_id, p]));
    if (!meta.essential) {
      recipients = recipients.filter((id) => !(prefs.get(id)?.muted_kinds || []).includes(input.kind));
    }
    if (recipients.length === 0) return out;

    // Bandeja: una fila por persona
    const rows = recipients.map((id) => ({
      tenant_id: input.tenantId, user_id: id, kind: input.kind, title: input.title, body: input.body || null, url: input.url || null,
      requires_ack: !!input.requiresAck, group_id: input.groupId || null, created_by: input.createdBy || null, created_by_name: input.createdByName || null,
    }));
    const { error: insErr } = await supabase.from("notifications").insert(rows);
    if (insErr) console.error("[notify] no se pudo guardar en la bandeja:", insErr.message);
    else out.stored = rows.length;

    // Push: respeta el horario de silencio y el modo "sin detalles" de cada persona
    const now = chileHHMM();
    let pushed = 0;
    for (const id of recipients) {
      const p = prefs.get(id);
      if (inQuietHours(now, p?.quiet_start, p?.quiet_end)) continue;
      const hide = !!p?.hide_details;
      const r = await sendPush({
        userId: id,
        title: hide ? meta.generic.title : (input.pushTitle || input.title),
        body: hide ? meta.generic.body : (input.pushBody ?? input.body),
        url: input.url,
        onlyTenantId: input.tenantId,
      });
      pushed += r.sent;
    }
    out.pushed = pushed;
  } catch (e) {
    console.error("[notify] error ignorado:", e);
  }
  return out;
}
