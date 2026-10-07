"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useIsNativeApp } from "@/lib/native-app";

function PushNotificationPromptInner() {
  const [permission, setPermission] = useState<string>("default");
  const [show, setShow] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if ("Notification" in window && "serviceWorker" in navigator) {
      setPermission(Notification.permission);
      const dismissed = localStorage.getItem("push-prompt-dismissed");
      if (Notification.permission === "default" && !dismissed) {
        const timer = setTimeout(() => setShow(true), 3000);
        return () => clearTimeout(timer);
      }
      // If already granted, silently register subscription
      if (Notification.permission === "granted" && user?.id) {
        registerSubscription(user.id);
      }
    }
  }, [user?.id]);

  const registerSubscription = async (userId: string) => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON(), userId }),
      });
    } catch (err) {
      console.error("Error registering push subscription:", err);
    }
  };

  const subscribe = async () => {
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm === "granted" && user?.id) {
        await registerSubscription(user.id);
        setShow(false);
        localStorage.setItem("push-prompt-dismissed", "true");
      }
    } catch (err) {
      console.error("Error subscribing to push:", err);
    }
  };

  if (!show || permission !== "default") return null;

  return (
    <div className="fixed bottom-24 left-4 lg:bottom-4 z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-sm animate-slide-in">
      <p className="font-medium text-gray-900 text-sm mb-1">Activar notificaciones?</p>
      <p className="text-xs text-gray-500 mb-3">Recibe alertas cuando llega un cliente o se agenda una cita.</p>
      <div className="flex gap-2">
        <button onClick={() => { setShow(false); localStorage.setItem("push-prompt-dismissed", "true"); }}
          className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50">Ahora no</button>
        <button onClick={subscribe}
          className="px-3 py-1.5 text-xs bg-brand-blue text-white rounded-lg hover:bg-brand-blue/90">Activar</button>
      </div>
    </div>
  );
}

/**
 * Permanent "activate notifications" button. Unlike the one-time banner above (which
 * never comes back once dismissed), this lets a professional turn on push whenever they
 * want — e.g. Vicente, who said appointment alerts weren't arriving because he'd never
 * completed the subscription. Drop it anywhere in the dashboard (e.g. Mi Agenda).
 */
function PushNotificationButtonInner() {
  const [permission, setPermission] = useState<string>("default");
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if ("Notification" in window && "serviceWorker" in navigator) {
      setPermission(Notification.permission);
    } else {
      setPermission("unsupported");
    }
  }, []);

  const enable = async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === "granted") {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON(), userId: user.id }),
        });
        // Clear the dismissed flag so state stays consistent with the banner.
        localStorage.setItem("push-prompt-dismissed", "true");
      }
    } catch (err) {
      console.error("Error enabling push:", err);
    } finally {
      setBusy(false);
    }
  };

  if (permission === "unsupported") return null;

  if (permission === "granted") {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-full">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        Notificaciones activadas
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <p className="text-xs text-brand-gray">
        Notificaciones bloqueadas en el navegador. Actívalas desde los ajustes del sitio (candado junto a la dirección) para recibir avisos de nuevas citas.
      </p>
    );
  }

  return (
    <button
      onClick={enable}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue text-white text-xs font-medium rounded-full hover:bg-brand-blue/90 disabled:opacity-60"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
      {busy ? "Activando..." : "Activar notificaciones"}
    </button>
  );
}

// Dentro de la app movil todavia no hay avisos nativos: no se muestra un boton que no funciona
// (se activara con el push nativo, Fase 3 del plan de la app).
export function PushNotificationPrompt() {
  const inApp = useIsNativeApp();
  if (inApp) return null;
  return <PushNotificationPromptInner />;
}

export function PushNotificationButton() {
  const inApp = useIsNativeApp();
  if (inApp) return null;
  return <PushNotificationButtonInner />;
}
