import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SessionInfo = {
  userId: string;
  email: string;
  fullName: string;
  theme: "light" | "dark" | "system";
  isAdmin: boolean;
  isTecnico: boolean;
  active: boolean;
  roles: string[];
};

export const sessionQuery = queryOptions({
  queryKey: ["session-info"],
  queryFn: async (): Promise<SessionInfo | null> => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return null;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("full_name, theme, active").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    const r = (roles ?? []).map((x) => x.role as string);
    return {
      userId: user.id,
      email: user.email ?? "",
      fullName: profile?.full_name || user.email || "",
      theme: (profile?.theme as SessionInfo["theme"]) ?? "system",
      active: profile?.active ?? false,
      isAdmin: (profile?.active ?? false) && r.includes("admin"),
      isTecnico: (profile?.active ?? false) && r.includes("tecnico"),
      roles: r,
    };
  },
});

export function useSession() {
  return useQuery(sessionQuery);
}
