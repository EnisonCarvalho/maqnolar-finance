import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { ordersQuery } from "@/lib/orders-queries";
import { CalendarClock, CalendarDays, FileClock, CheckCircle2, Wrench } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — MaqnoLar Financeiro" },
      { name: "description", content: "Resumo operacional e financeiro da MaqnoLar." },
      { property: "og:title", content: "Dashboard — MaqnoLar Financeiro" },
      { property: "og:description", content: "Resumo operacional e financeiro da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: session } = useSession();
  const { data: orders } = useQuery(ordersQuery);
  const first = session?.fullName?.split(" ")[0] ?? "";

  const cards = useMemo(() => {
    const all = orders ?? [];
    const now = new Date();
    const isToday = (iso: string | null) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    };
    return [
      {
        label: "Atendimentos do dia",
        icon: CalendarDays,
        value: all.filter((o) => isToday(o.scheduled_start) && o.status !== "cancelado").length,
        to: "/agenda" as const,
      },
      {
        label: "Visitas agendadas",
        icon: CalendarClock,
        value: all.filter((o) => o.status === "visita_agendada").length,
        to: "/atendimentos" as const,
      },
      {
        label: "Orçamentos aguardando aprovação",
        icon: FileClock,
        value: all.filter((o) => ["orcamento_enviado", "aguardando_aprovacao"].includes(o.status)).length,
        to: "/atendimentos" as const,
      },
      {
        label: "Serviços em andamento",
        icon: Wrench,
        value: all.filter((o) => ["tecnico_a_caminho", "em_diagnostico", "servico_em_andamento", "aguardando_peca"].includes(o.status)).length,
        to: "/atendimentos" as const,
      },
      {
        label: "Serviços concluídos",
        icon: CheckCircle2,
        value: all.filter((o) => ["servico_concluido", "aguardando_pagamento", "finalizado"].includes(o.status)).length,
        to: "/atendimentos" as const,
      },
    ];
  }, [orders]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold md:text-3xl">Olá, {first}</h1>
        <p className="mt-1 text-muted-foreground">
          {session?.isAdmin
            ? "Resumo operacional da MaqnoLar. Os indicadores financeiros serão conectados quando os módulos de recebimentos e acertos forem implementados."
            : "Seus atendimentos e sua agenda do dia."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <Link key={c.label} to={session?.isAdmin ? c.to : "/minha-area"}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">{c.label}</CardTitle>
                <c.icon className="h-4 w-4 shrink-0 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="font-display text-2xl font-semibold">{c.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
