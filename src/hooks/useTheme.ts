import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("ng-theme") as Theme) ?? "system";
  });

  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function apply() {
      const isDark =
        theme === "dark" || (theme === "system" && media.matches);
      setResolved(isDark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", isDark);
    }

    apply();
    const handler = () => {
      if (theme === "system") apply();
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  function cycleTheme() {
    const next: Theme =
      theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
    setTheme(next);
    localStorage.setItem("ng-theme", next);
  }

  return { theme, resolved, cycleTheme };
}
