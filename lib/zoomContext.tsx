"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ZoomCtx = { zoom: number; setZoom: (z: number) => void };

const ZoomContext = createContext<ZoomCtx>({ zoom: 100, setZoom: () => {} });

const STORAGE_KEY = "tennis_club_zoom";

// Site-wide zoom, remembered across page loads/navigation (not tied
// to any one page). Same options and behavior that used to live only
// on the Match Matrix page.
export function ZoomProvider({ children }: { children: React.ReactNode }) {
  const [zoom, setZoomState] = useState(100);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (saved) setZoomState(Number(saved));
  }, []);

  function setZoom(z: number) {
    setZoomState(z);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(z));
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
