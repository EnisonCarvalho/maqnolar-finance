import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarClock, LineChart, Handshake, Menu, type LucideIcon } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import type { SessionInfo } from "@/hooks/use-session";

type NavItem = { label: string; icon: LucideIcon; to: string };

const adminItems: NavItem[] = [
  { label: "Início", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Atendimentos", icon: CalendarClock, to: "/atendimentos" },
  { label: "Caixa", icon: LineChart, to: "/fluxo-de-caixa" },
  { label: "Acerto", icon: Handshake, to: "/acerto-diario" },
];

const techItems: NavItem[] = [
  { label: "Início", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Atendimentos", icon: CalendarClock, to: "/minha-area" },
];

export function MobileNav({ session }: { session: SessionInfo | null | undefined }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { toggleSidebar } = useSidebar();
  const items = session?.isAdmin ? adminItems : techItems;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-flow-col auto-cols-fr">
        {items.map((it) => {
          const active = pathname === it.to || pathname.startsWith(it.to + "/");
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <it.icon className="h-5 w-5" />
              {it.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          Menu
        </button>
      </div>
    </nav>
  );
}
