import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, CalendarClock, HardHat, Wrench, Percent, Handshake, TrendingUp,
  TrendingDown, Landmark, LineChart, Megaphone, Briefcase, PiggyBank, FileBarChart, History,
  ShieldCheck, Settings, UserCog, LogOut, type LucideIcon,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import type { SessionInfo } from "@/hooks/use-session";

type Item = {
  label: string;
  icon: LucideIcon;
  to?: "/dashboard" | "/configuracoes" | "/usuarios" | "/clientes" | "/tecnicos" | "/equipamentos" | "/divisao-financeira";
};

const adminGroups: { label: string; items: Item[] }[] = [
  { label: "Visão geral", items: [{ label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" }] },
  {
    label: "Operação",
    items: [
      { label: "Clientes", icon: Users, to: "/clientes" },
      { label: "Atendimentos e agenda", icon: CalendarClock },
      { label: "Usuários e permissões", icon: UserCog, to: "/usuarios" },
      { label: "Equipe e técnicos", icon: HardHat, to: "/tecnicos" },
      { label: "Equipamentos e serviços", icon: Wrench, to: "/equipamentos" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { label: "Composição financeira", icon: Percent, to: "/divisao-financeira" },
      { label: "Acerto diário", icon: Handshake },
      { label: "Receitas", icon: TrendingUp },
      { label: "Despesas", icon: TrendingDown },
      { label: "Contas bancárias", icon: Landmark },
      { label: "Fluxo de caixa", icon: LineChart },
    ],
  },
  {
    label: "Gestão",
    items: [
      { label: "Campanhas e ROI", icon: Megaphone },
      { label: "Sócios e pró-labore", icon: Briefcase },
      { label: "Investimentos", icon: PiggyBank },
      { label: "Relatórios", icon: FileBarChart },
      { label: "Histórico", icon: History },
      { label: "Notas de garantia", icon: ShieldCheck },
    ],
  },
];

const techGroups: { label: string; items: Item[] }[] = [
  {
    label: "Minha área",
    items: [
      { label: "Início", icon: LayoutDashboard, to: "/dashboard" },
      { label: "Meus atendimentos", icon: CalendarClock },
      { label: "Meus acertos", icon: Handshake },
    ],
  },
];

export function AppSidebar({ session }: { session: SessionInfo | null | undefined }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const groups = session?.isAdmin ? adminGroups : techGroups;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Wrench className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-sm font-semibold text-sidebar-accent-foreground">MaqnoLar</span>
            <span className="text-xs text-sidebar-foreground/60">Financeiro</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((it) => (
                  <SidebarMenuItem key={it.label}>
                    {it.to ? (
                      <SidebarMenuButton asChild tooltip={it.label}>
                        <Link to={it.to} activeProps={{ "data-active": true }}>
                          <it.icon />
                          <span>{it.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <>
                        <SidebarMenuButton disabled tooltip={`${it.label} (em breve)`} className="opacity-50">
                          <it.icon />
                          <span>{it.label}</span>
                        </SidebarMenuButton>
                        <SidebarMenuBadge className="text-[10px] text-sidebar-foreground/50">breve</SidebarMenuBadge>
                      </>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Configurações">
              <Link to="/configuracoes" activeProps={{ "data-active": true }}>
                <Settings />
                <span>Configurações</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sair">
              <LogOut />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
