import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "lupa-theme";

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // storage unavailable
  }
  return "system";
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(read);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = choice === "dark" || (choice === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      // storage unavailable
    }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [choice]);
  return [choice, setChoice] as const;
}
