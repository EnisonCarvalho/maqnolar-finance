import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { ordersQuery } from "@/lib/orders-queries";
import { operationalCounts } from "@/lib/dashboard-math";
import { getFinanceOverview } from "@/lib/finance-ops.functions";
import { getSettlement } from "@/lib/settlement.functions";
import { campaignPerformance, sumPerf, type PerfAlloc, type PerfLead, type PerfOrder } from "@/lib/campaign-math";
import { PeriodFilter, StatCard, usePeriod } from "@/components/finance-ui";
import { formatBRL } from "@/lib/format";
import {
  CalendarClock, CalendarDays, FileClock, CheckCircle2, Wrench, XCircle,
  Plus, UserPlus, Receipt, HandCoins, Megaphone,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — MaqnoLar Financeiro" },
      { name: "description", content: "Painel gerencial operacional e financeiro da MaqnoLar." },
      { property: "og:title", content: "Dashboard — MaqnoLar Financeiro" },
      { property: "og:description", content: "Painel gerencial operacional e financeiro da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const fzDate = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function Dashboard() {
  const { data: session } = useSession();
  if (session?.isAdmin) return <AdminDashboard first={session.fullName.split(" ")[0] ?? ""} />;
  return <TechDashboard first={session?.fullName?.split(" ")[0] ?? ""} />;
}

/** Visão do técnico: apenas indicadores operacionais (financeiro consolidado é restrito a administradores). */
function TechDashboard({ first }: { first: string }) {
  const { data: orders } = useQuery(ordersQuery);
  const all = orders ?? [];
  const cards = [
    { label: "Visitas agendadas", icon: CalendarClock, value: all.filter((o) => o.status === "visita_agendada").length },
    { label: "Orçamentos aguardando aprovação", icon: FileClock, value: all.filter((o) => ["orcamento_enviado", "aguardando_aprovacao"].includes(o.status)).length },
    { label: "Serviços em andamento", icon: Wrench, value: all.filter((o) => ["tecnico_a_caminho", "em_diagnostico", "servico_em_andamento", "aguardando_peca"].includes(o.status)).length },
    { label: "Serviços concluídos", icon: CheckCircle2, value: all.filter((o) => ["servico_concluido", "aguardando_pagamento", "finalizado"].includes(o.status)).length },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold md:text-3xl">Olá, {first}</h1>
        <p className="mt-1 text-muted-foreground">Seus atendimentos e sua agenda.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} to="/minha-area">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">{c.label}</CardTitle>
                <c.icon className="h-4 w-4 shrink-0 text-primary" />
              </CardHeader>
              <CardContent><div className="font-display text-2xl font-semibold">{c.value}</div></CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

const SHORTCUTS = [
  { label: "Novo atendimento", to: "/atendimentos", icon: Plus },
  { label: "Novo lead", to: "/leads", icon: UserPlus },
  { label: "Nova despesa", to: "/despesas", icon: Receipt },
  { label: "Acerto diário", to: "/acerto-diario", icon: HandCoins },
] as const;

function AdminDashboard({ first }: { first: string }) {
  const period = usePeriod("mes");
  const { start, end } = period.range;

  const { data: orders } = useQuery(ordersQuery);
  const { data: fin, isLoading: finLoading } = useQuery({
    queryKey: ["fin-overview", start, end],
    queryFn: () => getFinanceOverview({ data: { start, end } }),
  });
  const { data: settlement } = useQuery({
    queryKey: ["settlement-overall"],
    queryFn: () => getSettlement({ data: { start: null, end: null } }),
  });
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, campaign_expense_allocations(amount_cents, status, expenses(amount_cents, status, competence_date, expense_payments(amount_cents, status)))");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: attribution } = useQuery({
    queryKey: ["campaign-performance"],
    queryFn: async () => {
      const [l, o] = await Promise.all([
        supabase.from("leads").select("id, campaign_id, status, order_id, contacted_at").not("campaign_id", "is", null),
        supabase.from("service_orders").select("id, campaign_id, opened_at, completed_at, status, order_financials(total_cents, company_share_cents), customer_payments(amount_cents, status)").not("campaign_id", "is", null),
      ]);
      if (l.error) throw l.error;
      if (o.error) throw o.error;
      return { leads: l.data ?? [], orders: (o.data ?? []) as any[] };
    },
  });

  const ops = operationalCounts(orders ?? [], start, end);
  const i = fin?.indicators;
  const saldoCents = fin?.cash.totals.closingCents;

  const pend = (settlement?.technicians ?? []).reduce(
    (acc, t) => {
      const p = t.overallPendingCents;
      if (p > 0) acc.pagar += p;
      else acc.receber += -p;
      return acc;
    },
    { pagar: 0, receber: 0 },
  );

  const perf = sumPerf(
    (campaigns ?? []).map((c) => {
      const allocs: PerfAlloc[] = c.campaign_expense_allocations.map((a: any) => ({
        amount_cents: a.amount_cents,
        status: a.status,
        expense: a.expenses ? { amount_cents: a.expenses.amount_cents, status: a.expenses.status, competence_date: a.expenses.competence_date, payments: a.expenses.expense_payments } : null,
      }));
      const leads: PerfLead[] = (attribution?.leads ?? []).filter((l) => l.campaign_id === c.id).map((l) => ({ id: l.id, status: l.status, order_id: l.order_id, contactedDate: fzDate(l.contacted_at) }));
      const ords: PerfOrder[] = (attribution?.orders ?? []).filter((o) => o.campaign_id === c.id).map((o) => {
        const f = Array.isArray(o.order_financials) ? o.order_financials[0] : o.order_financials;
        return {
          id: o.id, openedDate: fzDate(o.opened_at), competenceDate: String(o.completed_at ?? o.opened_at).slice(0, 10), cancelled: o.status === "cancelado",
          totalCents: f ? f.total_cents : null, companyShareCents: f ? f.company_share_cents : null,
          receivedCents: (o.customer_payments ?? []).filter((p: any) => p.status === "ativo").reduce((s: number, p: any) => s + p.amount_cents, 0),
        };
      });
      return campaignPerformance({ allocs, leads, orders: ords }, start, end);
    }),
  );

  const opCards = [
    { label: "Atendimentos do período", icon: CalendarDays, value: ops.atendimentosPeriodo, to: "/atendimentos" },
    { label: "Visitas agendadas", icon: CalendarClock, value: ops.visitasAgendadas, to: "/agenda" },
    { label: "Orçamentos aguardando aprovação", icon: FileClock, value: ops.orcamentosAguardando, to: "/atendimentos" },
    { label: "Serviços em andamento", icon: Wrench, value: ops.emAndamento, to: "/atendimentos" },
    { label: "Serviços concluídos no período", icon: CheckCircle2, value: ops.concluidosPeriodo, to: "/atendimentos" },
    { label: "Serviços confirmados no período", icon: CheckCircle2, value: ops.confirmadosPeriodo, to: "/atendimentos" },
    { label: "Cancelados no período", icon: XCircle, value: ops.canceladosPeriodo, to: "/atendimentos" },
  ] as const;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold md:text-3xl">Olá, {first}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Painel gerencial da MaqnoLar. Faturamento, lucro e saldo bancário são medidas diferentes — cada cartão indica seu critério.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:max-w-2xl">
        {SHORTCUTS.map((s) => (
          <Button key={s.label} asChild variant="outline" className="h-auto justify-start gap-2 py-2.5">
            <Link to={s.to}><s.icon className="h-4 w-4 shrink-0 text-primary" /><span className="text-xs sm:text-sm">{s.label}</span></Link>
          </Button>
        ))}
      </div>

      <PeriodFilter period={period} />

      <section className="grid gap-2">
        <h2 className="font-display text-base font-semibold">Operacional</h2>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
          {opCards.map((c) => (
            <Link key={c.label} to={c.to}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader className="flex flex-row items-center justify-between gap-1 pb-1 pt-3">
                  <CardTitle className="text-[11px] font-medium leading-tight text-muted-foreground sm:text-xs">{c.label}</CardTitle>
                  <c.icon className="h-4 w-4 shrink-0 text-primary" />
                </CardHeader>
                <CardContent className="pb-3"><div className="font-display text-xl font-semibold sm:text-2xl">{c.value}</div></CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-base font-semibold">Financeiro</h2>
        {finLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {i && (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-5">
              <StatCard label="Faturamento bruto" cents={i.grossBillingCents} hint="Atendimentos por competência" />
              <StatCard label="Receita econômica MaqnoLar" cents={i.companyEconomicRevenueCents} hint="Participação + receitas avulsas" tone="pos" />
              <StatCard label="Participação dos técnicos" cents={i.technicianShareCents} hint="Composição financeira · competência" />
              <StatCard label="Recebimentos efetivos (empresa)" cents={i.receivedByCompanyCents} hint="Dinheiro que entrou" />
              <StatCard label="Despesas operacionais" cents={i.operationalExpensesCents} tone="neg" />
              <StatCard label="Resultado econômico" cents={i.economicResultCents} hint="Receita − despesas (competência)" tone="auto" />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <StatCard label="Saldo financeiro das contas" cents={saldoCents ?? 0} hint={`Posição até ${end.split("-").reverse().join("/")}`} tone="auto" />
              <StatCard label="A receber de clientes" cents={i.receivablesCents} hint="Total em aberto" />
              <StatCard label="A pagar" cents={i.payablesCents} hint="Despesas em aberto" />
              <StatCard label="Acertos pendentes com técnicos" cents={pend.pagar - pend.receber} hint={`A pagar ${formatBRL(pend.pagar)} · a receber ${formatBRL(pend.receber)}`} tone="auto" />
            </div>
            <p className="text-xs text-muted-foreground">
              Do faturamento: técnicos {formatBRL(i.technicianShareCents)} · peças {formatBRL(i.partsCents)}. Recebido direto pelos técnicos: {formatBRL(i.receivedByTechniciansCents)} (fora do caixa). Repasses e transferências não são receita nem despesa.
            </p>
          </>
        )}
      </section>

      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Campanhas e leads</h2>
          <Button asChild variant="ghost" size="sm"><Link to="/campanhas"><Megaphone className="mr-1 h-4 w-4" />Ver campanhas</Link></Button>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <StatCard label="Investimento publicitário" cents={perf.investmentCents} hint={`Pago: ${formatBRL(perf.investmentPaidCents)}`} />
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Leads recebidos</p><p className="font-display text-lg font-semibold sm:text-xl">{perf.leads}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Perdidos: {perf.lost}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Leads convertidos</p><p className="font-display text-lg font-semibold sm:text-xl">{perf.converted}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Conversão: {pct(perf.conversionPct)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Custo por lead</p><p className="font-display text-lg font-semibold sm:text-xl">{perf.cplCents === null ? "—" : formatBRL(perf.cplCents)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">ROI publicitário</p><p className={`font-display text-lg font-semibold sm:text-xl ${perf.roiPct !== null && perf.roiPct < 0 ? "text-destructive" : "text-primary"}`}>{pct(perf.roiPct)}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Resultado: {formatBRL(perf.resultCents)}</p></CardContent></Card>
        </div>
      </section>
    </div>
  );
}
