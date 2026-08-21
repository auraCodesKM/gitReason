import { useEffect, useState } from "react";

const STORAGE_KEY = "gr_sidebar_open";
const DESKTOP_QUERY = "(min-width: 901px)";

function isDesktop() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches;
}

function initialOpen() {
  if (!isDesktop()) return false; // mobile: drawer starts closed
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "1"; // desktop: visible unless the user collapsed it last time
}

// Same open/closed boolean drives two different interactions depending on
// viewport: a mobile overlay drawer (never persisted - always starts
// closed) and a desktop sidebar that slides its own width in/out (persisted
// across visits, since collapsing it there is a real space preference).
export function useSidebarOpen() {
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    if (isDesktop()) localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  }, [open]);

  return [open, setOpen];
}
