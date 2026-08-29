"use client";

import { useSyncExternalStore } from "react";
import Icon from "./icons";

/**
 * Switches the theme, and remembers the choice.
 *
 * The theme is set on `<html>` before the first paint by the script in
 * layout.tsx, so this reads what that decided rather than deciding again — the
 * document is the store, and the button subscribes to it. Reading it in an
 * effect instead would render the wrong icon and then correct itself.
 *
 * Until someone presses this the app follows the system, including a change
 * made while it is open; after a press, that choice is kept.
 */
const STORAGE_KEY = "momentum-theme";

const listeners = new Set<() => void>();

function saved() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function apply(dark: boolean) {
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const follow = () => {
    if (!saved()) apply(media.matches);
    listener();
  };
  media.addEventListener("change", follow);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", follow);
  };
}

const current = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export default function ThemeToggle() {
  // The server has no document, and the pre-paint script has not run yet, so it
  // renders the light icon and the client corrects it on hydration.
  const dark = useSyncExternalStore(subscribe, current, () => "light") === "dark";

  function choose(next: boolean) {
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // A blocked store costs the memory of the choice, not the choice.
    }
    listeners.forEach((listener) => listener());
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      onClick={() => choose(!dark)}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}
