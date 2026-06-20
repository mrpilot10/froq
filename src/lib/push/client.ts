"use client";

import { savePushSubscription } from "@/app/merchant/actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function waitForServiceWorkerReady(
  registration: ServiceWorkerRegistration,
  timeoutMs = 8000,
): Promise<ServiceWorkerRegistration> {
  if (registration.active) return registration;
  try {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration>((_, reject) => {
        window.setTimeout(() => reject(new Error("Service worker timeout")), timeoutMs);
      }),
    ]);
  } catch {
    // Fall back to the registration we already have.
  }
  return registration;
}

/**
 * Ensures the service worker is registered and the browser is subscribed to
 * push, then persists the subscription against the current merchant. Safe to
 * call repeatedly. Returns true when a subscription is active.
 */
export async function enablePushForMerchant(): Promise<boolean> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return false;
  if (Notification.permission !== "granted") return false;

  const registration =
    (await registerServiceWorker()) ??
    (await navigator.serviceWorker.getRegistration("/").catch(() => null));
  if (!registration) return false;

  const ready = await waitForServiceWorkerReady(registration);

  let subscription = await ready.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch {
      return false;
    }
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const res = await savePushSubscription({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
  return res.ok;
}
