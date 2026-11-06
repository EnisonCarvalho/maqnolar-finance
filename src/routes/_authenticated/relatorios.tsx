import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { NoAccess } from "@/components/no-access";
import { supabase } from "@/integrations/supabase/client";
import { getFinanceOverview } from "@/lib/finance-ops.functions";
import { getSettlement } from "@/lib/settlement.functions";
import { listPartners, listPartnerMovements, listDistributions } from "@/lib/partners.functions";
import { campaignPerformance, type PerfAlloc, type PerfLead, type PerfOrder } from "@/lib/campaign-math";
import { MOVEMENT_LABELS, type MovementKind } from "@/lib/cashflow-math";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import { PARTNER_TYPE_LABELS, type PartnerMovementType } from "@/lib/partner-math";
import { PeriodFilter, StatCard, accountsQuery, usePeriod } from "@/components/finance-ui";
import { ExportButtons } from "@/components/report-export-buttons";
import { formatISODate } from "@/components/finance-shared";
import { techniciansQuery } from "@/lib/orders-queries";
import { formatBRL } from "@/lib/format";
import { LineChart, CalendarClock, HardHat, Megaphone, Briefcase } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — MaqnoLar Financeiro" },
      { name: "description", content: "Central de relatórios operacionais e financeiros da MaqnoLar." },
      { property: "og:title", content: "Relatórios — MaqnoLar Financeiro" },
      { property: "og:description", content: "Central de relatórios operacionais e financeiros da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Category = "financeiro" | "atendimentos" | "tecnicos" | "campanhas" | "socios";
const CATEGORIES: { key: Category; label: string; icon: typeof LineChart }[] = [
  { key: "financeiro", label: "Financeiro", icon: LineChart },
  { key: "atendimentos", label: "Atendimentos", icon: CalendarClock },
  { key: "tecnicos", label: "Técnicos", icon: HardHat },
  { key: "campanhas", label: "Campanhas", icon: Megaphone },
  { key: "socios", label: "Sócios", icon: Briefcase },
];

const fzDate = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const inRange = (d: string, s: string, e: string) => d >= s && d <= e;
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function Page() {
  const { data: session } = useSession();
  if (session && !session.isAdmin) return <NoAccess />;
  return <Content />;
}

function Content() {
  const [cat, setCat] = useState<Category>("financeiro");
  const period = usePeriod("mes");
  const { start, end } = period.range;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold md:text-3xl">Relatórios</h1>
        <p className="mt-1 text-sm text-muted-foreground">Consultas gerenciais sobre os dados já registrados. Nenhum relatório altera lançamentos.</p>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {CATEGORIES.map((c) => (
          <Button key={c.key} size="sm" variant={cat === c.key ? "default" : "outline"} className="shrink-0" onClick={() => setCat(c.key)}>
            <c.icon className="mr-1 h-4 w-4" />{c.label}
          </Button>
        ))}
      </div>

      <PeriodFilter period={period} />

      {cat === "financeiro" && <Financeiro start={start} end={end} />}
      {cat === "atendimentos" && <Atendimentos start={start} end={end} />}
      {cat === "tecnicos" && <Tecnicos start={start} end={end} />}
      {cat === "campanhas" && <Campanhas start={start} end={end} />}
      {cat === "socios" && <Socios start={start} end={end} />}
    </div>
  );
}

function Criteria({ children }: { children: string }) {
  return <p className="text-xs text-muted-foreground">Critério de data: {children}</p>;
}

// ---------- Financeiro ----------
function Financeiro({ start, end }: { start: string; end: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["fin-overview", start, end], queryFn: () => getFinanceOverview({ data: { start, end } }) });
  const { data: accounts } = useQuery(accountsQuery);
  const [kind, setKind] = useState("todos");
  const [account, setAccount] = useState("todas");

  const i = data?.indicators;
  const movements = (data?.movements ?? []).filter((m) => (kind === "todos" || m.kind === kind) && (account === "todas" || (account === "none" ? !m.accountId : m.accountId === account)));
  const accName = (id: string | null) => (id ? accounts?.find((a) => a.id === id)?.name ?? "—" : "Sem conta");
  const totIn = movements.filter((m) => m.amountCents > 0).reduce((s, m) => s + m.amountCents, 0);
  const totOut = movements.filter((m) => m.amountCents < 0).reduce((s, m) => s - m.amountCents, 0);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!data || !i) return null;
  return (
    <>
      <Criteria>indicadores por competência; movimentações pela data efetiva; contas a pagar/receber são totais em aberto (sem filtro de data).</Criteria>
      <ExportButtons data={{
        title: "Relatório Financeiro",
        period: { start, end },
        criteria: "Indicadores por competência; movimentações pela data efetiva; contas a pagar/receber são totais em aberto (sem filtro de data). Saldo das contas é a posição acumulada até a data final.",
        indicators: [
          { label: "Faturamento bruto", text: formatBRL(i.grossBillingCents), cents: i.grossBillingCents },
          { label: "Receita econômica MaqnoLar", text: formatBRL(i.companyEconomicRevenueCents), cents: i.companyEconomicRevenueCents },
          { label: "Despesas operacionais", text: formatBRL(i.operationalExpensesCents), cents: i.operationalExpensesCents },
          { label: "Resultado econômico", text: formatBRL(i.economicResultCents), cents: i.economicResultCents },
          { label: "Recebimentos efetivos (empresa)", text: formatBRL(i.receivedByCompanyCents), cents: i.receivedByCompanyCents },
          { label: "Contas a pagar (em aberto)", text: formatBRL(i.payablesCents), cents: i.payablesCents },
          { label: "Contas a receber (em aberto)", text: formatBRL(i.receivablesCents), cents: i.receivablesCents },
          { label: `Saldo das contas (até ${formatISODate(end)})`, text: formatBRL(data.cash.totals.closingCents), cents: data.cash.totals.closingCents },
        ],
        columns: ["Data", "Descrição", "Tipo", "Conta", "Valor"],
        colTypes: ["date", "text", "text", "text", "money"],
        rows: movements.map((m) => [m.date, m.description, MOVEMENT_LABELS[m.kind as MovementKind], accName(m.accountId), m.amountCents]),
      }} />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="Faturamento bruto" cents={i.grossBillingCents} />
        <StatCard label="Receita econômica MaqnoLar" cents={i.companyEconomicRevenueCents} tone="pos" />
        <StatCard label="Despesas operacionais" cents={i.operationalExpensesCents} tone="neg" />
        <StatCard label="Resultado econômico" cents={i.economicResultCents} tone="auto" />
        <StatCard label="Recebimentos efetivos (empresa)" cents={i.receivedByCompanyCents} />
        <StatCard label="Contas a pagar" cents={i.payablesCents} hint="Total em aberto" />
        <StatCard label="Contas a receber" cents={i.receivablesCents} hint="Total em aberto" />
        <StatCard label="Saldo das contas" cents={data.cash.totals.closingCents} hint={`Posição até ${formatISODate(end)}`} tone="auto" />
      </div>

      <section className="grid gap-2">
        <h2 className="font-display text-base font-semibold">Movimentações efetivas</h2>
        <div className="grid grid-cols-2 gap-2 sm:max-w-xl">
          <Select value={kind} onValueChange={setKind}><SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>{Object.entries(MOVEMENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          <Select value={account} onValueChange={setAccount}><SelectTrigger aria-label="Conta"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas as contas</SelectItem>{(accounts ?? []).filter((a) => a.ownership === "empresa").map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}<SelectItem value="none">Sem conta definida</SelectItem></SelectContent></Select>
        </div>
        {movements.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma movimentação no período e filtros selecionados.</p>}
        <div className="grid gap-2 md:hidden">
          {movements.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{m.description}</p>
                <p className="text-xs text-muted-foreground">{formatISODate(m.date)} · {MOVEMENT_LABELS[m.kind as MovementKind]} · {accName(m.accountId)}</p>
              </div>
              <p className={`shrink-0 font-semibold ${m.amountCents < 0 ? "text-destructive" : "text-primary"}`}>{m.amountCents < 0 ? "−" : "+"}{formatBRL(Math.abs(m.amountCents))}</p>
            </div>
          ))}
        </div>
        <Card className="hidden md:block"><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="p-3">Data</th><th className="p-3">Descrição</th><th className="p-3">Tipo</th><th className="p-3">Conta</th><th className="p-3 text-right">Valor</th></tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="p-3 whitespace-nowrap">{formatISODate(m.date)}</td><td className="p-3">{m.description}</td>
                  <td className="p-3">{MOVEMENT_LABELS[m.kind as MovementKind]}</td><td className="p-3">{accName(m.accountId)}</td>
                  <td className={`p-3 text-right font-semibold whitespace-nowrap ${m.amountCents < 0 ? "text-destructive" : "text-primary"}`}>{m.amountCents < 0 ? "−" : "+"}{formatBRL(Math.abs(m.amountCents))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t bg-muted/50 text-sm font-semibold"><td className="p-3" colSpan={4}>Totais do filtro (entradas / saídas)</td><td className="p-3 text-right whitespace-nowrap">+{formatBRL(totIn)} / −{formatBRL(totOut)}</td></tr></tfoot>
          </table>
        </CardContent></Card>
        <p className="text-xs text-muted-foreground md:hidden">Totais do filtro: +{formatBRL(totIn)} / −{formatBRL(totOut)}</p>
      </section>
    </>
  );
}

// ---------- Atendimentos ----------
type RepOrder = {
  id: string; code: string; status: OrderStatus; opened_at: string; completed_at: string | null;
  technician_id: string | null;
  customers: { full_name: string } | null;
  technicians: { full_name: string } | null;
  equipment_types: { name: string } | null;
  order_financials: { total_cents: number; company_share_cents: number; technician_share_cents: number }[] | { total_cents: number; company_share_cents: number; technician_share_cents: number } | null;
};

function useReportOrders() {
  return useQuery({
    queryKey: ["report-orders"],
    queryFn: async (): Promise<RepOrder[]> => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, code, status, opened_at, completed_at, technician_id, customers(full_name), technicians(full_name), equipment_types(name), order_financials(total_cents, company_share_cents, technician_share_cents)")
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RepOrder[];
    },
  });
}
const finOf = (o: RepOrder) => (Array.isArray(o.order_financials) ? o.order_financials[0] : o.order_financials) ?? null;

function Atendimentos({ start, end }: { start: string; end: string }) {
  const { data: orders, isLoading } = useReportOrders();
  const { data: technicians } = useQuery(techniciansQuery);
  const [tech, setTech] = useState("todos");
  const [status, setStatus] = useState("todos");

  const list = (orders ?? []).filter((o) =>
    inRange(fzDate(o.opened_at), start, end) &&
    (tech === "todos" || o.technician_id === tech) &&
    (status === "todos" || o.status === status));
  const totalCents = list.reduce((s, o) => s + (finOf(o)?.total_cents ?? 0), 0);
  const companyCents = list.reduce((s, o) => s + (finOf(o)?.company_share_cents ?? 0), 0);
  const techCents = list.reduce((s, o) => s + (finOf(o)?.technician_share_cents ?? 0), 0);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  return (
    <>
      <Criteria>data de abertura do atendimento. Valores vêm da composição financeira de cada atendimento.</Criteria>
      <ExportButtons data={{
        title: "Relatório de Atendimentos",
        period: { start, end },
        criteria: "Data de abertura do atendimento. Valores vêm da composição financeira de cada atendimento.",
        indicators: [
          { label: "Atendimentos", text: String(list.length) },
          { label: "Valor total dos serviços", text: formatBRL(totalCents), cents: totalCents },
          { label: "Participação MaqnoLar", text: formatBRL(companyCents), cents: companyCents },
          { label: "Participação técnicos", text: formatBRL(techCents), cents: techCents },
        ],
        columns: ["Abertura", "Código", "Cliente", "Equipamento", "Técnico", "Status", "Valor"],
        colTypes: ["date", "text", "text", "text", "text", "text", "money"],
        rows: list.map((o) => [fzDate(o.opened_at), o.code, o.customers?.full_name ?? "—", o.equipment_types?.name ?? "—", o.technicians?.full_name ?? "Sem técnico", ORDER_STATUS_LABELS[o.status], finOf(o)?.total_cents ?? null]),
      }} />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Atendimentos</p><p className="font-display text-lg font-semibold sm:text-xl">{list.length}</p></CardContent></Card>
        <StatCard label="Valor total dos serviços" cents={totalCents} />
        <StatCard label="Participação MaqnoLar" cents={companyCents} tone="pos" />
        <StatCard label="Participação técnicos" cents={techCents} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:max-w-xl">
        <Select value={tech} onValueChange={setTech}><SelectTrigger aria-label="Técnico"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os técnicos</SelectItem>{(technicians ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os status</SelectItem>{Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      </div>
      {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum atendimento no período e filtros selecionados.</p>}
      <div className="grid gap-2 md:hidden">
        {list.map((o) => (
          <div key={o.id} className="rounded-md border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="font-medium">{o.code} · {o.customers?.full_name ?? "—"}</p><p className="text-xs text-muted-foreground">{o.equipment_types?.name ?? "—"} · {o.technicians?.full_name ?? "Sem técnico"}</p></div>
              <Badge variant="secondary" className="shrink-0 text-[10px]">{ORDER_STATUS_LABELS[o.status]}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Aberto em {formatISODate(fzDate(o.opened_at))}{o.completed_at ? ` · concluído em ${formatISODate(fzDate(o.completed_at))}` : ""}</p>
            <p className="mt-1 font-semibold">{finOf(o) ? formatBRL(finOf(o)!.total_cents) : "Sem composição"}</p>
          </div>
        ))}
      </div>
      <Card className="hidden md:block"><CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="p-3">Código</th><th className="p-3">Cliente</th><th className="p-3">Equipamento</th><th className="p-3">Técnico</th><th className="p-3">Status</th><th className="p-3">Abertura</th><th className="p-3 text-right">Valor</th></tr></thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{o.code}</td><td className="p-3">{o.customers?.full_name ?? "—"}</td>
                <td className="p-3">{o.equipment_types?.name ?? "—"}</td><td className="p-3">{o.technicians?.full_name ?? "—"}</td>
                <td className="p-3"><Badge variant="secondary" className="text-[10px]">{ORDER_STATUS_LABELS[o.status]}</Badge></td>
                <td className="p-3 whitespace-nowrap">{formatISODate(fzDate(o.opened_at))}</td>
                <td className="p-3 text-right whitespace-nowrap">{finOf(o) ? formatBRL(finOf(o)!.total_cents) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t bg-muted/50 text-sm font-semibold"><td className="p-3" colSpan={6}>Total ({list.length} atendimentos)</td><td className="p-3 text-right whitespace-nowrap">{formatBRL(totalCents)}</td></tr></tfoot>
        </table>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Para abrir um atendimento, use a página <Link to="/atendimentos" className="text-primary underline-offset-2 hover:underline">Atendimentos</Link>.</p>
    </>
  );
}

// ---------- Técnicos ----------
function Tecnicos({ start, end }: { start: string; end: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["settlement", start, end], queryFn: () => getSettlement({ data: { start, end } }) });
  const { data: orders } = useReportOrders();
  const [tech, setTech] = useState("todos");

  const doneByTech = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders ?? []) {
      if (!o.technician_id || !o.completed_at || o.status === "cancelado") continue;
      if (!inRange(fzDate(o.completed_at), start, end)) continue;
      m.set(o.technician_id, (m.get(o.technician_id) ?? 0) + 1);
    }
    return m;
  }, [orders, start, end]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const list = (data?.technicians ?? []).filter((t) => tech === "todos" || t.id === tech);
  const totais = list.reduce((a, t) => ({
    share: a.share + (t.period?.technicianShareCents ?? 0),
    reimb: a.reimb + (t.period?.reimbursementCents ?? 0),
    toTech: a.toTech + (t.period?.transfersToTechnicianCents ?? 0),
    fromTech: a.fromTech + (t.period?.transfersFromTechnicianCents ?? 0),
    pending: a.pending + t.overallPendingCents,
  }), { share: 0, reimb: 0, toTech: 0, fromTech: 0, pending: 0 });

  return (
    <>
      <Criteria>participações e repasses pela data do recebimento/repasse no período; saldo pendente é o acumulado geral, sem filtro de data.</Criteria>
      <div className="grid grid-cols-2 gap-2 sm:max-w-xl">
        <Select value={tech} onValueChange={setTech}><SelectTrigger aria-label="Técnico"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os técnicos</SelectItem>{(data?.technicians ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="Participação no período" cents={totais.share} hint={`Reembolsos de peças: ${formatBRL(totais.reimb)}`} />
        <StatCard label="Repasses aos técnicos" cents={totais.toTech} />
        <StatCard label="Repasses dos técnicos" cents={totais.fromTech} />
        <StatCard label="Saldo pendente (geral)" cents={totais.pending} hint="Positivo: MaqnoLar deve" tone="auto" />
      </div>
      {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum técnico encontrado.</p>}
      <div className="grid gap-2 md:hidden">
        {list.map((t) => (
          <div key={t.id} className="rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{t.name}</p>
              <p className={`font-semibold ${t.overallPendingCents > 0 ? "text-primary" : t.overallPendingCents < 0 ? "text-destructive" : ""}`}>{formatBRL(t.overallPendingCents)}</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
              <div><p className="text-muted-foreground">Serviços concluídos</p><p className="font-medium">{doneByTech.get(t.id) ?? 0}</p></div>
              <div><p className="text-muted-foreground">Participação</p><p className="font-medium">{formatBRL(t.period?.technicianShareCents ?? 0)}</p></div>
              <div><p className="text-muted-foreground">Repasses a ele</p><p className="font-medium">{formatBRL(t.period?.transfersToTechnicianCents ?? 0)}</p></div>
              <div><p className="text-muted-foreground">Repasses dele</p><p className="font-medium">{formatBRL(t.period?.transfersFromTechnicianCents ?? 0)}</p></div>
            </div>
          </div>
        ))}
      </div>
      <Card className="hidden md:block"><CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="p-3">Técnico</th><th className="p-3 text-right">Serviços concluídos</th><th className="p-3 text-right">Participação</th><th className="p-3 text-right">Reembolsos</th><th className="p-3 text-right">Repasses a ele</th><th className="p-3 text-right">Repasses dele</th><th className="p-3 text-right">Saldo pendente</th></tr></thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{t.name}{!t.active && <span className="ml-1 text-xs text-muted-foreground">(inativo)</span>}</td>
                <td className="p-3 text-right">{doneByTech.get(t.id) ?? 0}</td>
                <td className="p-3 text-right">{formatBRL(t.period?.technicianShareCents ?? 0)}</td>
                <td className="p-3 text-right">{formatBRL(t.period?.reimbursementCents ?? 0)}</td>
                <td className="p-3 text-right">{formatBRL(t.period?.transfersToTechnicianCents ?? 0)}</td>
                <td className="p-3 text-right">{formatBRL(t.period?.transfersFromTechnicianCents ?? 0)}</td>
                <td className={`p-3 text-right font-semibold whitespace-nowrap ${t.overallPendingCents > 0 ? "text-primary" : t.overallPendingCents < 0 ? "text-destructive" : ""}`}>{formatBRL(t.overallPendingCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Detalhamento por atendimento e fechamentos na página <Link to="/acerto-diario" className="text-primary underline-offset-2 hover:underline">Acerto diário</Link>.</p>
    </>
  );
}

// ---------- Campanhas ----------
function Campanhas({ start, end }: { start: string; end: string }) {
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, status, campaign_expense_allocations(amount_cents, status, expenses(amount_cents, status, competence_date, expense_payments(amount_cents, status)))")
        .order("name");
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
  const [only, setOnly] = useState("todas");

  const rows = (campaigns ?? []).filter((c) => only === "todas" || c.id === only).map((c) => {
    const allocs: PerfAlloc[] = c.campaign_expense_allocations.map((a: any) => ({
      amount_cents: a.amount_cents, status: a.status,
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
    return { c, p: campaignPerformance({ allocs, leads, orders: ords }, start, end) };
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  return (
    <>
      <Criteria>investimento pela competência da despesa; leads pela data do contato; receita atribuída pela competência do atendimento.</Criteria>
      <div className="grid grid-cols-2 gap-2 sm:max-w-xl">
        <Select value={only} onValueChange={setOnly}><SelectTrigger aria-label="Campanha"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas as campanhas</SelectItem>{(campaigns ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma campanha cadastrada.</p>}
      <div className="grid gap-2 md:hidden">
        {rows.map(({ c, p }) => (
          <div key={c.id} className="rounded-md border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{c.name}</p>
              <p className={`font-display font-semibold ${p.roiPct !== null && p.roiPct < 0 ? "text-destructive" : "text-primary"}`}>ROI {pct(p.roiPct)}</p>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
              <div><p className="text-muted-foreground">Investido</p><p className="font-medium">{formatBRL(p.investmentCents)}</p></div>
              <div><p className="text-muted-foreground">Leads</p><p className="font-medium">{p.leads}</p></div>
              <div><p className="text-muted-foreground">Convertidos</p><p className="font-medium">{p.converted}</p></div>
              <div><p className="text-muted-foreground">CPL</p><p className="font-medium">{p.cplCents === null ? "—" : formatBRL(p.cplCents)}</p></div>
              <div><p className="text-muted-foreground">Receita atribuída</p><p className="font-medium">{formatBRL(p.companyRevenueCents)}</p></div>
              <div><p className="text-muted-foreground">Resultado</p><p className="font-medium">{formatBRL(p.resultCents)}</p></div>
            </div>
          </div>
        ))}
      </div>
      <Card className="hidden md:block"><CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr className="border-b">{["Campanha", "Investimento", "Leads", "Conversões", "CPL", "Receita atribuída", "Resultado", "ROI"].map((h, i) => <th key={h} className={`p-3 ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(({ c, p }) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 text-right">{formatBRL(p.investmentCents)}</td>
                <td className="p-3 text-right">{p.leads}</td>
                <td className="p-3 text-right">{p.converted} ({pct(p.conversionPct)})</td>
                <td className="p-3 text-right">{p.cplCents === null ? "—" : formatBRL(p.cplCents)}</td>
                <td className="p-3 text-right">{formatBRL(p.companyRevenueCents)}</td>
                <td className="p-3 text-right">{formatBRL(p.resultCents)}</td>
                <td className={`p-3 text-right font-semibold ${p.roiPct !== null && p.roiPct < 0 ? "text-destructive" : "text-primary"}`}>{pct(p.roiPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Detalhes e histórico na página <Link to="/campanhas" className="text-primary underline-offset-2 hover:underline">Campanhas</Link>.</p>
    </>
  );
}

// ---------- Sócios ----------
function Socios({ start, end }: { start: string; end: string }) {
  const [partner, setPartner] = useState("todos");
  const [type, setType] = useState("todos");
  const { data: partners } = useQuery({ queryKey: ["partners"], queryFn: () => listPartners() });
  const { data, isLoading } = useQuery({
    queryKey: ["partner-movements", start, end, partner, type],
    queryFn: () => listPartnerMovements({ data: { start, end, partnerId: partner === "todos" ? null : partner, type: type === "todos" ? null : type } }),
  });
  const { data: dists } = useQuery({ queryKey: ["distributions"], queryFn: () => listDistributions() });

  const nameOf = (id: string) => partners?.partners.find((p) => p.id === id)?.full_name ?? "—";
  const movements = data?.movements ?? [];
  const totIn = movements.filter((m) => m.status === "ativo" && (m.type === "aporte" || m.type === "emprestimo_socio")).reduce((s, m) => s + m.amount_cents, 0);
  const totOut = movements.filter((m) => m.status === "ativo" && (m.type === "devolucao_emprestimo" || m.type === "retirada")).reduce((s, m) => s + m.amount_cents, 0);
  const distInPeriod = (dists?.distributions ?? []).filter((d) => d.status === "ativa" && inRange(d.decision_date, start, end));
  const approvedCents = distInPeriod.reduce((s, d) => s + d.total_cents, 0);
  const distIds = new Set(distInPeriod.map((d) => d.id));
  const paidCents = (dists?.payments ?? []).filter((p) => p.status === "ativo" && distIds.has(p.distribution_id)).reduce((s, p) => s + p.amount_cents, 0);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  return (
    <>
      <Criteria>movimentações pela data do lançamento; distribuições pela data da decisão. Resumos por sócio consideram todo o histórico ativo.</Criteria>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="Aportes + empréstimos (período)" cents={totIn} tone="pos" />
        <StatCard label="Devoluções + retiradas (período)" cents={totOut} tone="neg" />
        <StatCard label="Distribuições aprovadas (período)" cents={approvedCents} />
        <StatCard label="Distribuições pagas" cents={paidCents} hint={`Pendente: ${formatBRL(approvedCents - paidCents)}`} />
      </div>

      <section className="grid gap-2">
        <h2 className="font-display text-base font-semibold">Resumo por sócio (histórico completo)</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {(data?.summaries ?? []).map((s) => (
            <Card key={s.partnerId}><CardContent className="grid gap-2 p-3 text-sm">
              <p className="font-medium">{nameOf(s.partnerId)}</p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div><p className="text-muted-foreground">Aportes</p><p className="font-medium">{formatBRL(s.aportesCents)}</p></div>
                <div><p className="text-muted-foreground">Empréstimos</p><p className="font-medium">{formatBRL(s.emprestimosCents)}</p></div>
                <div><p className="text-muted-foreground">Devoluções</p><p className="font-medium">{formatBRL(s.devolvidosCents)}</p></div>
                <div><p className="text-muted-foreground">Saldo de empréstimos</p><p className="font-medium">{formatBRL(s.saldoEmprestimosCents)}</p></div>
                <div><p className="text-muted-foreground">Retiradas</p><p className="font-medium">{formatBRL(s.retiradasCents)}</p></div>
                <div><p className="text-muted-foreground">Distribuições recebidas</p><p className="font-medium">{formatBRL(dists?.totals.paidByPartner[s.partnerId] ?? 0)}</p></div>
              </div>
            </CardContent></Card>
          ))}
          {(data?.summaries ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma movimentação de sócios registrada.</p>}
        </div>
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-base font-semibold">Movimentações do período</h2>
        <div className="grid grid-cols-2 gap-2 sm:max-w-xl">
          <Select value={partner} onValueChange={setPartner}><SelectTrigger aria-label="Sócio"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos os sócios</SelectItem>{(partners?.partners ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select>
          <Select value={type} onValueChange={setType}><SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>{Object.entries(PARTNER_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        </div>
        {movements.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma movimentação no período e filtros selecionados.</p>}
        <div className="grid gap-2 md:hidden">
          {movements.map((m) => (
            <div key={m.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-medium">{m.description}</p><p className="text-xs text-muted-foreground">{nameOf(m.partner_id)} · {PARTNER_TYPE_LABELS[m.type as PartnerMovementType]} · {formatISODate(m.movement_date)}</p></div>
                <p className="shrink-0 font-semibold">{formatBRL(m.amount_cents)}</p>
              </div>
              {m.status !== "ativo" && <p className="mt-1 text-xs text-destructive">Estornado: {m.void_reason}</p>}
            </div>
          ))}
        </div>
        <Card className="hidden md:block"><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="p-3">Data</th><th className="p-3">Sócio</th><th className="p-3">Tipo</th><th className="p-3">Descrição</th><th className="p-3">Status</th><th className="p-3 text-right">Valor</th></tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="p-3 whitespace-nowrap">{formatISODate(m.movement_date)}</td>
                  <td className="p-3">{nameOf(m.partner_id)}</td>
                  <td className="p-3">{PARTNER_TYPE_LABELS[m.type as PartnerMovementType]}</td>
                  <td className="p-3">{m.description}{m.status !== "ativo" && <span className="block text-xs text-destructive">Estornado: {m.void_reason}</span>}</td>
                  <td className="p-3"><Badge variant={m.status === "ativo" ? "default" : "secondary"}>{m.status === "ativo" ? "Ativo" : "Estornado"}</Badge></td>
                  <td className="p-3 text-right whitespace-nowrap">{formatBRL(m.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      </section>
      <p className="text-xs text-muted-foreground">Registro de aportes, retiradas e distribuições na página <Link to="/socios" className="text-primary underline-offset-2 hover:underline">Sócios</Link>.</p>
    </>
  );
}
