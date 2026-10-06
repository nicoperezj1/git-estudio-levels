"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";

const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

interface DayHours {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export default function HorariosPage() {
  const [hours, setHours] = useState<DayHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetch("/api/business-hours")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setHours(data);
        } else {
          // Defaults
          setHours(dayNames.map((_, i) => ({
            day_of_week: i,
            open_time: "10:00",
            close_time: "21:00",
            is_closed: i === 0,
          })));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const updateDay = (dayOfWeek: number, field: string, value: string | boolean) => {
    setHours(hours.map((h) =>
      h.day_of_week === dayOfWeek ? { ...h, [field]: value } : h
    ));
  };

  const saveDay = async (day: DayHours) => {
    setSaving(day.day_of_week);
    await fetch("/api/business-hours", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayOfWeek: day.day_of_week,
        openTime: day.open_time,
        closeTime: day.close_time,
        isClosed: day.is_closed,
      }),
    });
    setSaving(null);
    showToast(`${dayNames[day.day_of_week]} actualizado`, "success");
  };

  if (loading) return <div className="p-6 text-center text-brand-gray">Cargando...</div>;

  return (
    <div className="p-3 md:p-6 max-w-2xl mx-auto space-y-3 md:space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-brand-dark">Horarios de Atencion</h1>
        <p className="text-sm text-brand-gray">Configura los horarios en que los clientes pueden agendar</p>
      </div>

      <div className="space-y-3">
        {hours.map((day) => (
          <div key={day.day_of_week} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-center gap-3 md:w-36">
              <input
                type="checkbox"
                checked={!day.is_closed}
                onChange={(e) => {
                  updateDay(day.day_of_week, "is_closed", !e.target.checked);
                  saveDay({ ...day, is_closed: !e.target.checked });
                }}
                className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
              />
              <span className={`text-sm font-medium ${day.is_closed ? "text-brand-gray line-through" : "text-brand-dark"}`}>
                {dayNames[day.day_of_week]}
              </span>
            </div>

            {!day.is_closed && (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time"
                  value={day.open_time}
                  onChange={(e) => updateDay(day.day_of_week, "open_time", e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-brand-dark focus:ring-2 focus:ring-brand-blue outline-none"
                />
                <span className="text-brand-gray text-sm">a</span>
                <input
                  type="time"
                  value={day.close_time}
                  onChange={(e) => updateDay(day.day_of_week, "close_time", e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-brand-dark focus:ring-2 focus:ring-brand-blue outline-none"
                />
                <button
                  onClick={() => saveDay(day)}
                  disabled={saving === day.day_of_week}
                  className="ml-auto px-3 py-2 bg-brand-blue text-white text-xs rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving === day.day_of_week ? "..." : "Guardar"}
                </button>
              </div>
            )}

            {day.is_closed && (
              <span className="text-xs text-brand-gray italic">Cerrado</span>
            )}
          </div>
        ))}
      </div>

      <div className="bg-blue-50 rounded-2xl p-4 text-xs text-brand-blue">
        <p className="font-medium mb-1">Nota:</p>
        <p>Estos horarios definen cuando los clientes pueden agendar online. Los bloqueos por profesional se configuran desde el calendario.</p>
      </div>
    </div>
  );
}
