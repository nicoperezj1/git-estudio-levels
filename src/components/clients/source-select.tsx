"use client";

import { useEffect, useState } from "react";
import { BUILTIN_SOURCES } from "@/lib/client-sources";

// "¿Como nos conocio?": las opciones de siempre + las que cada negocio crea con "+ Crear otra opcion".
// Lo usan la ficha de clientes y el POS, asi la opcion nueva aparece en los dos y en las metricas.
const NEW = "__new__";

export default function SourceSelect({
  value, onChange, tenantId, className, walkInLabel, ariaLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  tenantId?: string | null;
  className?: string;
  walkInLabel?: string;
  ariaLabel?: string;
}) {
  const [custom, setCustom] = useState<{ code: string; label: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const tq = tenantId ? `?tenantId=${tenantId}` : "";

  useEffect(() => {
    fetch(`/api/client-sources${tq}`).then((r) => r.json()).then((d) => setCustom(Array.isArray(d?.custom) ? d.custom : [])).catch(() => {});
  }, [tq]);

  const create = async () => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/client-sources", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: name, ...(tenantId ? { tenantId } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "No se pudo crear"); return; }
      setCustom((prev) => (prev.some((c) => c.code === d.code) || BUILTIN_SOURCES.some((b) => b.code === d.code) ? prev : [...prev, { code: d.code, label: d.label }]));
      onChange(d.code);
      setCreating(false); setName("");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-1.5">
      <select
        value={creating ? NEW : value}
        aria-label={ariaLabel}
        onChange={(e) => { if (e.target.value === NEW) { setCreating(true); setError(""); } else { setCreating(false); onChange(e.target.value); } }}
        className={className}
      >
        {BUILTIN_SOURCES.map((s) => (
          <option key={s.code} value={s.code}>{s.code === "walk_in" && walkInLabel ? walkInLabel : s.label}</option>
        ))}
        {custom.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        <option value={NEW}>+ Crear otra opción…</option>
      </select>
      {creating && (
        <div className="flex gap-1.5">
          <input
            autoFocus value={name} maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }}
            placeholder="Ej: Radio, Volante, Tarjeta de presentación"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <button type="button" onClick={create} disabled={saving || name.trim().length < 2}
            className="rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "…" : "Crear"}</button>
          <button type="button" onClick={() => { setCreating(false); setName(""); setError(""); }}
            className="rounded-lg px-2 py-2 text-sm text-gray-500 hover:bg-gray-100">Cancelar</button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
