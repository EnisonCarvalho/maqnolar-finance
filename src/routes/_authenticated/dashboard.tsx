import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { Wallet, Handshake, CalendarClock, TrendingUp } from "lucide-react";

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

const cards = [
  { label: "Receita do período", icon: TrendingUp },
  { label: "Saldo em contas", icon: Wallet },
  { label: "Atendimentos", icon: CalendarClock },
  { label: "Acertos pendentes", icon: Handshake },
];

function Dashboard() {
  const { data: session } = useSession();
  const first = session?.fullName?.split(" ")[0] ?? "";
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">Olá, {first}</h1>
        <p className="mt-1 text-muted-foreground">
          {session?.isAdmin
            ? "Os indicadores aparecerão aqui conforme os módulos forem liberados."
            : "Seus atendimentos e acertos aparecerão aqui em breve."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="font-display text-2xl font-semibold">—</div>
              <p className="mt-1 text-xs text-muted-foreground">Sem dados ainda</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
