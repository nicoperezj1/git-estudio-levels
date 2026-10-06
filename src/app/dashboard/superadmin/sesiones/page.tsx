"use client";

import { useState, useEffect } from "react";

interface Session {
  id: string;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  device: string;
  browser: string;
  ip_address: string | null;
  logged_in_at: string;
  active: boolean;
}

const deviceIcons: Record<string, string> = {
  mobile: "📱",
  tablet: "📱",
  desktop: "💻",
  unknown: "❓",
};

export default function SesionesPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/log-session?limit=100")
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-3 md:p-6 max-w-5xl mx-auto space-y-3 md:space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Sesiones de Login</h1>
        <p className="text-sm text-brand-gray">Historial de accesos al sistema por profesional</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-brand-gray">Cargando...</div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-brand-gray">Sin sesiones registradas</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-brand-light border-b border-gray-100">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-brand-gray">Usuario</th>
                <th className="text-left p-3 text-xs font-medium text-brand-gray">Dispositivo</th>
                <th className="text-left p-3 text-xs font-medium text-brand-gray">Browser</th>
                <th className="text-left p-3 text-xs font-medium text-brand-gray">IP</th>
                <th className="text-left p-3 text-xs font-medium text-brand-gray">Fecha/Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-brand-light/50">
                  <td className="p-3">
                    <p className="font-medium text-brand-dark">{s.user_email || "—"}</p>
                    {s.user_role && <p className="text-[10px] text-brand-gray">{s.user_role}</p>}
                  </td>
                  <td className="p-3">
                    <span className="text-lg mr-1">{deviceIcons[s.device] || "❓"}</span>
                    <span className="text-xs text-brand-gray capitalize">{s.device}</span>
                  </td>
                  <td className="p-3 text-brand-gray">{s.browser}</td>
                  <td className="p-3 text-brand-gray font-mono text-xs">{s.ip_address || "—"}</td>
                  <td className="p-3 text-brand-gray text-xs">
                    {new Date(s.logged_in_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                    {" "}
                    {new Date(s.logged_in_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
