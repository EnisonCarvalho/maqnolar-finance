import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ThemePref = "light" | "dark" | "system";

type Ctx = { theme: ThemePref; setTheme: (t: ThemePref, persist?: boolean) => void };
const ThemeContext = createContext<Ctx | null>(null);
const KEY = "maqnolar-theme";

function apply(t: ThemePref) {
  const dark =
    t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>("system");

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as ThemePref | null) ?? "system";
    setThemeState(saved);
  }, []);

  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => apply("system");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [theme]);

  const setTheme = useCallback(async (t: ThemePref, persist = true) => {
    setThemeState(t);
    localStorage.setItem(KEY, t);
    if (!persist) return;
    const { data } = await supabase.auth.getUser();
    if (data.user) await supabase.from("profiles").update({ theme: t }).eq("id", data.user.id);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
