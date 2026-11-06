import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { useSession } from "@/hooks/use-session";
import { useTheme } from "@/lib/theme";
import { NoAccess } from "@/components/no-access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { data: session } = useSession();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (session?.theme) setTheme(session.theme, false);
  }, [session?.theme, setTheme]);

  if (session === undefined) return null;
  if (!session || (!session.isAdmin && !session.isTecnico)) return <NoAccess />;

  return (
    <SidebarProvider>
      <AppSidebar session={session} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
          <div className="hidden md:block">
            <SidebarTrigger />
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{session?.fullName}</span>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
              {session?.isAdmin ? "Administrador" : "Técnico"}
            </span>
          </div>
        </header>
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
          <Outlet />
        </main>
        <MobileNav session={session} />
      </SidebarInset>
    </SidebarProvider>
  );
}
