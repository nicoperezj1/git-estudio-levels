"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/components/ui/toast";
import { PageHeader, Panel, inputClass, primaryButton, ghostButton, tableStyles } from "@/components/ui/premium";
import { AD_MEDIUMS, META_URL_PARAMETERS, buildTrackedLink } from "@/lib/ad-tracking";

interface CampaignRow { campaign: string; content: string; medium: string; bookings: number; completed: number; cancelled: number; clients: number; newClients: number }
interface Report { days: number; totalLinkBookings: number; taggedBookings: number; untaggedBookings: number; campaigns: CampaignRow[] }

export default function PublicidadPage() {
  const { role } = useAuth();
  const { tenant } = useTenant();
  const { showToast } = useToast();
  const isAdmin = role === "admin" || role === "super_admin";

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState("");
  const [days, setDays] = useState(90);

  const [medium, setMedium] = useState("paid");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");

  const baseUrl = typeof window !== "undefined" && tenant?.slug ? `${window.location.origin}/b/${tenant.slug}` : "";
  const link = useMemo(
    () => (baseUrl && campaign.trim() ? buildTrackedLink(baseUrl, { medium, campaign, content, term }) : ""),
    [baseUrl, medium, campaign, content, term],
  );

  const loadSetting = async () => {
    const d = await fetch("/api/settings/publicidad", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    setEnabled(!!d.enabled);
    setMigrationMissing(!!d.migrationMissing);
  };
  const loadReport = async (n: number) => {
    setReportError("");
    const r = await fetch(`/api/publicidad/reporte?days=${n}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setReport(null); setReportError(d.error || "No se pudo cargar el reporte"); return; }
    setReport(d);
  };
  useEffect(() => { if (isAdmin) { loadSetting(); } }, [isAdmin]);
  useEffect(() => { if (isAdmin) { loadReport(days); } }, [isAdmin, days]);

  const toggle = async (next: boolean) => {
    setSaving(true);
    const r = await fetch("/api/settings/publicidad", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { showToast(d.error || "No se pudo guardar", "error"); return; }
    setEnabled(next);
    showToast(next ? "Seguimiento de publicidad activado" : "Seguimiento de publicidad apagado", "success");
  };
  const copy = (text: string, msg: string) => { navigator.clipboard.writeText(text); showToast(msg, "success"); };

  if (!isAdmin) return <div className="p-6 text-sm text-brand-gray">Solo el administrador puede ver esta sección.</div>;

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-4xl animate-fade-in">
      <PageHeader title="Publicidad" subtitle="Saber de qué anuncio viene cada reserva por link" />

      <Panel title="Seguimiento" subtitle="Apagado por defecto. Al activarlo, las reservas por link guardan el anuncio o publicación de donde vino el cliente.">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={!!enabled} disabled={enabled === null || saving} onChange={(e) => toggle(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300" />
          <span>
            <span className="block text-sm font-medium text-brand-dark">Guardar el origen de las reservas (campaña y anuncio)</span>
            <span className="block text-xs text-brand-gray">Solo se guardan las etiquetas del link (utm) y el identificador de clic de Meta. No se guardan datos personales extra.</span>
          </span>
        </label>
        {migrationMissing && <p className="mt-2 text-xs text-red-600">Falta aplicar la migración 110 en la base de datos.</p>}
      </Panel>

      <Panel title="Generar link con etiquetas" subtitle="Usa este link en el anuncio, en la biografía de Instagram o en una publicación. Así sabremos de dónde viene cada reserva.">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-gray">Dónde lo vas a poner</label>
            <select value={medium} onChange={(e) => setMedium(e.target.value)} className={inputClass}>
              {AD_MEDIUMS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-gray">Campaña (obligatorio)</label>
            <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="ej: agenda barberos octubre" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-gray">Anuncio o publicación (opcional)</label>
            <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="ej: reel corte clasico" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-gray">Conjunto de anuncios (opcional)</label>
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ej: hombres 18-35 puente alto" className={inputClass} />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
          <input readOnly value={link || "Escribe la campaña para generar el link"} className={`${inputClass} font-mono text-xs`} />
          <button type="button" disabled={!link} onClick={() => copy(link, "Link copiado")} className={`${primaryButton} md:flex-shrink-0`}><Copy className="h-4 w-4" /> Copiar</button>
        </div>
        <details className="mt-3 text-xs text-brand-gray">
          <summary className="cursor-pointer font-medium text-brand-dark">Para anuncios de Meta: parámetros automáticos</summary>
          <p className="mt-2">En Ads Manager, dentro del anuncio, pega esto en «Parámetros de URL». Meta pone solo el nombre de la campaña, el conjunto y el anuncio, y la reserva guarda ese origen. El link del anuncio debe ser el de reservas: <span className="font-mono">{baseUrl || "(tu link de reservas)"}</span></p>
          <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
            <input readOnly value={META_URL_PARAMETERS} className={`${inputClass} font-mono text-xs`} />
            <button type="button" onClick={() => copy(META_URL_PARAMETERS, "Parámetros copiados")} className={`${ghostButton} md:flex-shrink-0`}><Copy className="h-4 w-4" /> Copiar</button>
          </div>
        </details>
      </Panel>

      <Panel title="Reservas por campaña" subtitle="Reservas hechas por el link de reservas del negocio"
        action={
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs">
            <option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option><option value={180}>Últimos 180 días</option>
          </select>
        } flush>
        {reportError && <p className="px-5 pb-4 text-sm text-red-600">{reportError}</p>}
        {report && (
          <>
            <p className="px-5 pb-3 text-xs text-brand-gray">
              {report.totalLinkBookings} reservas por link; {report.taggedBookings} con origen de anuncio y {report.untaggedBookings} sin etiqueta (link sin utm, o seguimiento apagado).
            </p>
            {report.campaigns.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-brand-gray">Todavía no hay reservas con origen de anuncio. Activa el seguimiento y usa los links con etiquetas.</p>
            ) : (
              <div className={tableStyles.wrap}>
                <table className={tableStyles.table}>
                  <thead className={tableStyles.thead}>
                    <tr><th className={tableStyles.th}>Campaña</th><th className={tableStyles.th}>Anuncio</th><th className={tableStyles.thRight}>Reservas</th><th className={tableStyles.thRight}>Completadas</th><th className={tableStyles.thRight}>Canceladas</th><th className={tableStyles.thRight}>Clientes nuevos</th></tr>
                  </thead>
                  <tbody className={tableStyles.tbody}>
                    {report.campaigns.map((c, i) => (
                      <tr key={i} className={tableStyles.tr}>
                        <td className={tableStyles.td}>{c.campaign}<span className="ml-2 text-[11px] text-brand-gray">{c.medium}</span></td>
                        <td className={tableStyles.td}>{c.content || "-"}</td>
                        <td className={tableStyles.tdRight}>{c.bookings}</td>
                        <td className={tableStyles.tdRight}>{c.completed}</td>
                        <td className={tableStyles.tdRight}>{c.cancelled}</td>
                        <td className={tableStyles.tdRight}>{c.newClients}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
