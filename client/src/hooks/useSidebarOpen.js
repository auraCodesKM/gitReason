import { useEffect, useState } from "react";

const STORAGE_KEY = "gr_sidebar_open";
const DESKTOP_QUERY = "(min-width: 901px)";

function isDesktop() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches;
}

function initialOpen() {
  if (!isDesktop()) return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "1";
}

export function useSidebarOpen() {
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    if (isDesktop()) localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  }, [open]);

  return [open, setOpen];
}
