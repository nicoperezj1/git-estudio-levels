"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { isNativeApp } from "@/lib/native-app";
import { autoEnableNativePush, syncNativePush } from "@/lib/native-push";

// Al abrir la app movil renueva el registro de avisos de quien esta conectado. En la web no hace nada.
export function NativePushSync() {
  const { user } = useAuth();
  useEffect(() => {
    if (!isNativeApp() || !user?.id) return;
    autoEnableNativePush(user.id).finally(() => syncNativePush(user.id));
  }, [user?.id]);
  return null;
}
