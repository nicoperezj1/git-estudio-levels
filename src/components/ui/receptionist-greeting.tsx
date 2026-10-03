"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";

// Saludo "Hola David" para quien tiene cargo Recepcionista, con el "Nombre de encargado" de su
// ficha (profiles.manager_name, migracion 089). Va en su propia consulta y tolera que la columna
// aun no exista: en ese caso, o sin nombre cargado, simplemente no muestra nada.
export function ReceptionistGreeting({ className = "" }: { className?: string }) {
  const { user, effectiveRole } = useAuth();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (effectiveRole !== "receptionist" || !user?.id) return;
    let cancelled = false;
    createClient()
      .from("profiles")
      .select("manager_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const n = (data as any)?.manager_name;
        setName(typeof n === "string" && n.trim() ? n.trim() : null);
      });
    return () => { cancelled = true; };
  }, [user?.id, effectiveRole]);

  if (!name) return null;
  return <p className={`text-sm font-medium text-brand-blue ${className}`}>Hola {name}</p>;
}
