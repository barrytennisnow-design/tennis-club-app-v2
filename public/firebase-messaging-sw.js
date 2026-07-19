// Firebase Cloud Messaging service worker.
//
// This has to be a plain static file at the site root (not something
// built by Next.js) because the browser fetches it directly, before
// any of the app's JS runs -- so the config values below are
// hardcoded rather than read from env vars. That's fine: these are
// the same public/client-safe Firebase config values already used in
// lib/firebaseClient.ts, not secrets.
//
// This only handles BACKGROUND messages (tab not focused, or app not
// open at all). Foreground messages, while the app is open and
// focused, are handled in JS instead -- see lib/notificationsClient.ts
// -- since a foreground push doesn't need a system notification at
// all if the person's already looking at the Notifications page.
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCJOlo3A_aRLCLkkJTKtA_ZOxZ_pAilOrM",
  authDomain: "barrytennisnow-d8001.firebaseapp.com",
  projectId: "barrytennisnow-d8001",
  storageBucket: "barrytennisnow-d8001.firebasestorage.app",
  messagingSenderId: "922363824175",
  appId: "1:922363824175:web:777075e23a65c86c67deda",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? payload.data?.title ?? "Martin County Tennis";
  const body = payload.notification?.body ?? payload.data?.body ?? "";
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    data: { matchId: payload.data?.matchId ?? null },
  });
});

// Tapping the OS notification focuses an existing tab if there is
// one, or opens a new one -- either way landing on the Notifications
// page (which is also where the in-app history lives, per the
// existing "tap to open the match" behavior there).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const matchId = event.notification.data?.matchId;
  const url = matchId ? `/matches#match-${matchId}` : "/notifications";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
