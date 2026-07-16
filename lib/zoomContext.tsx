"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type ZoomCtx = { zoom: number; setZoom: (z: number) => void };

const ZoomContext = createContext<ZoomCtx>({ zoom: 100, setZoom: () => {} });

const STORAGE_KEY = "tennis_club_zoom_by_page";

function readStoredZooms(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Zoom is remembered per PAGE, not as one single site-wide value --
// e.g. the Match Matrix can stay at 70% while Availability stays at
// 100%, and each page comes back at whatever it was last set to.
export function ZoomProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [zoom, setZoomState] = useState(100);

  // Whenever the page changes, load THAT page's last-used zoom
  // (defaulting to 100% if this page has never had one set).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readStoredZooms();
    setZoomState(stored[pathname ?? ""] ?? 100);
  }, [pathname]);

  function setZoom(z: number) {
    setZoomState(z);
    try {
      const stored = readStoredZooms();
      stored[pathname ?? ""] = z;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // ignore -- zoom just won't persist across reloads, not worth failing over
    }
  }

  return <ZoomContext.Provider value={{ zoom, setZoom }}>{children}</ZoomContext.Provider>;
}

export function useZoom() {
  return useContext(ZoomContext);
}

// Wraps page content (everything below the nav bar) in the actual
// CSS zoom -- kept separate from the nav bar itself so the zoom
// control and nav links never shrink/grow along with the page.
export function ZoomedContent({ children }: { children: React.ReactNode }) {
  const { zoom } = useZoom();
  return <div style={{ zoom: zoom / 100 }}>{children}</div>;
}

export const ZOOM_LEVELS = [50, 60, 70, 80, 90, 100, 110, 125, 150];
