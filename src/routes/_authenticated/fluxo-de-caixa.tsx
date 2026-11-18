import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
import { getFinanceOverview, closeMonth, reopenMonth } from "@/lib/finance-ops.functions";
import { MOVEMENT_LABELS, type MovementKind } from "@/lib/cashflow-math";
import { techniciansQuery } from "@/lib/orders-queries";
import { accountsQuery, PeriodFilter, ReasonDialog, StatCard, usePeriod } from "@/components/finance-ui";
import { formatISODate } from "@/components/finance-shared";
import { useSession } from "@/hooks/use-session";
import { NoAccess } from "@/components/no-access";

export const Route = createFileRoute("/_authenticated/fluxo-de-caixa")({
  head: () => ({
    meta: [
      { title: "Fluxo de caixa — MaqnoLar Financeiro" },
      { name: "description", content: "Participação recebida, despesas pagas e saldo de caixa da MaqnoLar." },
      { property: "og:title", content: "Fluxo de caixa — MaqnoLar Financeiro" },
      { property: "og:description", content: "Participação recebida, despesas pagas e saldo de caixa da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { data: session } = useSession();
  if (session && !session.isAdmin) return <NoAccess />;
  return <Content />;
}

function Content() {
  const qc = useQueryClient();
  const period = usePeriod("mes");
  const fn = useServerFn(getFinanceOverview);
  const { data, isLoading, error } = useQuery({ queryKey: ["fin-overview", period.range.start, period.range.end], queryFn: () => fn({ data: period.range }) });
  const { data: accounts } = useQuery(accountsQuery);
  const { data: technicians } = useQuery(techniciansQuery);
  const [kind, setKind] = useState("todos");
  const [account, setAccount] = useState("todas");
  const [tech, setTech] = useState("todos");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reopening, setReopening] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["fin-overview"] });

  const closeM = useMutation({
    mutationFn: () => closeMonth({ data: { month } }),
    onSuccess: async () => { toast.success("Mês fechado. Lançamentos nesse mês ficam bloqueados até a reabertura."); await refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível fechar."),
  });

  const i = data?.indicators;
  const accName = (id: string | null) => (id ? accounts?.find((a) => a.id === id)?.name ?? "—" : "Sem conta");
  const movements = (data?.movements ?? []).filter((m) => (kind === "todos" || m.kind === kind) && (account === "todas" || (account === "none" ? !m.accountId : m.accountId === account)) && (tech === "todos" || m.technicianId === tech));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold md:text-3xl">Fluxo de caixa</h1>
        <p className="mt-1 text-sm text-muted-foreground">Participação da MaqnoLar recebida − despesas pagas.</p>
      </div>
      <PeriodFilter period={period} />
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Erro ao carregar."}</p>}

      {data && i && (
        <>
          <section className="grid gap-2">
            <h2 className="font-display text-base font-semibold">Caixa no período</h2>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <StatCard label="Saldo inicial" cents={data.cash.totals.openingCents} />
              <StatCard label="Entradas efetivas" cents={data.cash.totals.inflowCents} tone="pos" />
              <StatCard label="Saídas efetivas" cents={data.cash.totals.outflowCents} tone="neg" />
              <StatCard label="Saldo final" cents={data.cash.totals.closingCents} tone="auto" />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <StatCard label="Entradas previstas" cents={data.planned.inflowCents} hint="Receitas avulsas a receber no período" />
              <StatCard label="Saídas previstas" cents={data.planned.outflowCents} hint="Despesas a vencer no período" />
            </div>
          </section>

          <section className="grid gap-2">
            <h2 className="font-display text-base font-semibold">Indicadores</h2>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <StatCard label="Faturamento bruto" cents={i.grossBillingCents} hint="Atendimentos concluídos no período" />
              <StatCard label="Receita econômica MaqnoLar" cents={i.companyEconomicRevenueCents} hint="Participação + receitas avulsas" tone="pos" />
              <StatCard label="Recebimentos efetivos (empresa)" cents={i.receivedByCompanyCents} />
              <StatCard label="Recebido pelos técnicos" cents={i.receivedByTechniciansCents} hint="Fora do caixa da empresa" />
              <StatCard label="Despesas operacionais" cents={i.operationalExpensesCents} tone="neg" />
              <StatCard label="Resultado econômico" cents={i.economicResultCents} tone="auto" />
              <StatCard label="Contas a pagar" cents={i.payablesCents} hint="Total em aberto" />
              <StatCard label="Contas a receber" cents={i.receivablesCents} hint="Clientes + receitas pendentes" />
            </div>
            <p className="text-xs text-muted-foreground">Do faturamento: participação dos técnicos {formatBRL(i.technicianShareCents)} · peças {formatBRL(i.partsCents)}. Repasses, reembolsos e transferências não entram como receita ou despesa.</p>
          </section>

          <section className="grid gap-2">
            <h2 className="font-display text-base font-semibold">Movimentações realizadas</h2>
            {data.movements.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma movimentação efetiva no período.</p>}
            <div className="grid gap-2 md:hidden">{data.movements.map((m) => <div key={m.id} className="grid gap-2 rounded-md border p-3 text-sm"><p className="font-medium">{formatISODate(m.date)} · {m.description}</p><dl className="grid grid-cols-3 gap-2"><div><dt className="text-xs text-muted-foreground">Entrada</dt><dd>{formatBRL(Math.max(m.amountCents, 0))}</dd></div><div><dt className="text-xs text-muted-foreground">Saída</dt><dd>{formatBRL(Math.max(-m.amountCents, 0))}</dd></div><div><dt className="text-xs text-muted-foreground">Saldo</dt><dd className="font-semibold">{formatBRL(m.balanceCents)}</dd></div></dl></div>)}</div>
            <div className="hidden overflow-x-auto md:block"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground">{["Data", "Descrição", "Entrada", "Saída", "Saldo"].map((c) => <th key={c} className="p-3">{c}</th>)}</tr></thead><tbody>{data.movements.map((m) => <tr key={m.id} className="border-b"><td className="p-3">{formatISODate(m.date)}</td><td className="p-3">{m.description}</td><td className="p-3">{formatBRL(Math.max(m.amountCents, 0))}</td><td className="p-3">{formatBRL(Math.max(-m.amountCents, 0))}</td><td className="p-3 font-semibold">{formatBRL(m.balanceCents)}</td></tr>)}</tbody></table></div>
          </section>

          <section className="grid gap-2">
            <h2 className="font-display text-base font-semibold">Fechamento mensal</h2>
            <Card><CardContent className="grid gap-3 p-4">
              <p className="text-sm text-muted-foreground">Fechar um mês grava os indicadores e bloqueia novos lançamentos, estornos e correções com data nesse mês até que seja reaberto com justificativa.</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1"><Label className="text-xs">Mês</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" /></div>
                <Button disabled={closeM.isPending || !month} onClick={() => closeM.mutate()}><Lock className="mr-1 h-4 w-4" />Fechar mês</Button>
              </div>
              {(data.closings ?? []).map((c: any) => (
                <div key={c.id} className="flex items-start justify-between gap-2 rounded-md bg-muted/50 p-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{formatISODate(c.month).slice(3)} <Badge variant={c.status === "fechado" ? "default" : "secondary"} className="ml-1">{c.status === "fechado" ? "Fechado" : "Reaberto"}</Badge></p>
                    <p className="text-xs text-muted-foreground">Resultado {formatBRL(c.snapshot?.indicators?.economicResultCents ?? 0)} · Saldo final {formatBRL(c.snapshot?.cash?.totals?.closingCents ?? 0)}</p>
                    {c.reopen_reason && <p className="text-xs text-muted-foreground">Reaberto: {c.reopen_reason}</p>}
                  </div>
                  {c.status === "fechado" && <Button size="sm" variant="ghost" onClick={() => setReopening(c.id)}><RotateCcw className="mr-1 h-4 w-4" />Reabrir</Button>}
                </div>
              ))}
            </CardContent></Card>
          </section>
        </>
      )}
      <ReasonDialog open={Boolean(reopening)} title="Reabrir mês" description="O fechamento original fica preservado no histórico." action="Reabrir" onClose={() => setReopening(null)}
        onConfirm={async (reason) => { await reopenMonth({ data: { id: reopening!, reason } }); toast.success("Mês reaberto."); await refresh(); }} />
    </div>
  );
}

