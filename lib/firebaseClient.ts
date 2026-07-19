"use client";

// Firebase config values below are all public/client-safe by design
// (same as any web app's Firebase setup) -- what actually gates
// access is Firebase's own per-project security rules plus this
// app's own Supabase auth, not secrecy of these values. The one
// genuinely secret credential (the service account key used to
// *send* pushes) lives server-side only, in lib/push.ts, read from
// an environment variable that's never shipped to the browser.
import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

// Push isn't supported everywhere (iOS Safari needs the app added to
// the home screen first; some browsers/contexts lack service worker
// support at all) -- callers should treat a null return as "quietly
// don't offer push here" rather than an error.
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!(await isSupported())) return null;
  return getMessaging(getFirebaseApp());
}
