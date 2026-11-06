import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
import { campaignPerformance, sumPerf, type Perf, type PerfAlloc, type PerfLead, type PerfOrder } from "@/lib/campaign-math";

export type PerfCampaign = {
  id: string; name: string; platformName: string;
  campaign_expense_allocations: { amount_cents: number; status: string; expenses: { amount_cents: number; status: string; competence_date: string; expense_payments: { amount_cents: number; status: string }[] } | null }[];
};

const fortalezaDate = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const money = (v: number | null) => (v === null ? "—" : formatBRL(v));
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function useAttribution() {
  return useQuery({
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
}

export function CampaignPerformance({ campaigns, start, end }: { campaigns: PerfCampaign[]; start: string; end: string }) {
  const { data } = useAttribution();
  const [only, setOnly] = useState("todas");
  const rows = campaigns.filter((c) => only === "todas" || c.id === only).map((c) => {
    const allocs: PerfAlloc[] = c.campaign_expense_allocations.map((a) => ({ amount_cents: a.amount_cents, status: a.status, expense: a.expenses ? { amount_cents: a.expenses.amount_cents, status: a.expenses.status, competence_date: a.expenses.competence_date, payments: a.expenses.expense_payments } : null }));
    const leads: PerfLead[] = (data?.leads ?? []).filter((l) => l.campaign_id === c.id).map((l) => ({ id: l.id, status: l.status, order_id: l.order_id, contactedDate: fortalezaDate(l.contacted_at) }));
    const orders: PerfOrder[] = (data?.orders ?? []).filter((o) => o.campaign_id === c.id).map((o) => {
      const f = Array.isArray(o.order_financials) ? o.order_financials[0] : o.order_financials;
      return {
        id: o.id, openedDate: fortalezaDate(o.opened_at), competenceDate: String(o.completed_at ?? o.opened_at).slice(0, 10), cancelled: o.status === "cancelado",
        totalCents: f ? f.total_cents : null, companyShareCents: f ? f.company_share_cents : null,
        receivedCents: (o.customer_payments ?? []).filter((p: any) => p.status === "ativo").reduce((s: number, p: any) => s + p.amount_cents, 0),
      };
    });
    return { c, p: campaignPerformance({ allocs, leads, orders }, start, end) };
  });
  const total = sumPerf(rows.map((r) => r.p));

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Desempenho das campanhas</h2>
          <p className="text-xs text-muted-foreground">ROI considera apenas o investimento publicitário — não inclui as demais despesas operacionais da empresa.</p>
        </div>
        <Select value={only} onValueChange={setOnly}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Campanha (desempenho)"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas as campanhas filtradas</SelectItem>{campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi label="Investimento registrado" value={money(total.investmentCents)} hint={`Pago: ${formatBRL(total.investmentPaidCents)}`} />
        <Kpi label="Receita da MaqnoLar atribuída" value={money(total.companyRevenueCents)} hint={`Bruto: ${formatBRL(total.grossCents)} · já recebido: ${formatBRL(total.companyRevenueReceivedCents)}`} />
        <Kpi label="Resultado após publicidade" value={money(total.resultCents)} tone={total.resultCents < 0 ? "neg" : "pos"} />
        <Kpi label="ROI publicitário" value={pct(total.roiPct)} tone={total.roiPct !== null && total.roiPct < 0 ? "neg" : "pos"} />
        <Kpi label="Leads (perdidos)" value={`${total.leads} (${total.lost})`} hint={`Convertidos: ${total.converted}`} />
        <Kpi label="Taxa de conversão" value={pct(total.conversionPct)} />
        <Kpi label="Custo por lead" value={money(total.cplCents)} />
        <Kpi label="Custo por atendimento" value={money(total.costPerOrderCents)} hint={`${total.orders} atendimento(s)`} />
      </div>

      {total.outsidePeriod && (
        <div className="flex gap-2 rounded-md border border-accent/50 bg-accent/10 p-2 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-accent-foreground" />
          <span>Parte do investimento ou dos resultados destas campanhas está fora do período selecionado. Investimento e receitas podem ter ocorrido em meses diferentes — use “Ano” ou “Período” para ver o ciclo completo.</span>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid gap-2 md:hidden">
            {rows.map(({ c, p }) => (
              <Card key={c.id}><CardContent className="grid gap-2 p-3 text-xs">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{c.name}</p><p className="text-muted-foreground">{c.platformName}</p></div>
                  <p className={`font-display text-base font-semibold ${p.roiPct !== null && p.roiPct < 0 ? "text-destructive" : "text-primary"}`}>ROI {pct(p.roiPct)}</p></div>
                <div className="grid grid-cols-3 gap-1">
                  <Cell l="Investido" v={money(p.investmentCents)} /><Cell l="Receita MaqnoLar" v={money(p.companyRevenueCents)} /><Cell l="Resultado" v={money(p.resultCents)} />
                  <Cell l="Leads" v={`${p.leads}`} /><Cell l="Conversão" v={pct(p.conversionPct)} /><Cell l="CPL" v={money(p.cplCents)} />
                </div>
                {p.outsidePeriod && <p className="text-[11px] text-muted-foreground">Há valores desta campanha fora do período.</p>}
              </CardContent></Card>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>{["Campanha", "Investido", "Pago", "Leads", "Conv.", "Perdidos", "Atend.", "CPL", "Custo/atend.", "Fat. bruto", "Receita MaqnoLar", "Resultado", "ROI"].map((h, i) => <th key={h} className={`p-2 ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(({ c, p }) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2"><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.platformName}{p.outsidePeriod ? " · valores fora do período" : ""}</p></td>
                    <Td v={money(p.investmentCents)} /><Td v={money(p.investmentPaidCents)} /><Td v={p.leads} /><Td v={`${p.converted} (${pct(p.conversionPct)})`} /><Td v={p.lost} /><Td v={p.orders} />
                    <Td v={money(p.cplCents)} /><Td v={money(p.costPerOrderCents)} /><Td v={money(p.grossCents)} /><Td v={money(p.companyRevenueCents)} />
                    <Td v={money(p.resultCents)} neg={p.resultCents < 0} /><Td v={pct(p.roiPct)} neg={p.roiPct !== null && p.roiPct < 0} bold />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <details className="rounded-md border p-2 text-xs text-muted-foreground">
        <summary className="flex cursor-pointer items-center gap-1 font-medium text-foreground"><Info className="h-3.5 w-3.5" />Como os indicadores são calculados</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Investimento</b>: despesas vinculadas à campanha, pela data de competência da despesa. “Pago” acompanha os pagamentos dessas despesas.</li>
          <li><b>Leads, convertidos e perdidos</b>: pela data do contato do lead.</li>
          <li><b>Atendimentos</b>: pela data de abertura, usando a campanha gravada em cada atendimento.</li>
          <li><b>Faturamento e receita da MaqnoLar</b>: pela competência do atendimento (conclusão, ou abertura se ainda não concluído), mesmo critério do fluxo de caixa. A receita é só a parte da MaqnoLar na composição financeira (após peças e divisão com o técnico); atendimentos sem orçamento aprovado ou cancelados não contam.</li>
          <li><b>CPL</b> = investimento ÷ leads · <b>Custo por atendimento</b> = investimento ÷ atendimentos · <b>Conversão</b> = convertidos ÷ leads · <b>Resultado</b> = receita da MaqnoLar − investimento · <b>ROI</b> = resultado ÷ investimento. Quando o divisor é zero aparece “—”.</li>
          <li>Atendimentos sem campanha não entram nestes indicadores.</li>
        </ul>
      </details>
    </section>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "pos" | "neg" }) {
  return (
    <Card><CardContent className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-display text-lg font-semibold sm:text-xl ${tone === "neg" ? "text-destructive" : tone === "pos" ? "text-primary" : ""}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </CardContent></Card>
  );
}
const Cell = ({ l, v }: { l: string; v: string }) => <div><p className="text-muted-foreground">{l}</p><p className="font-medium">{v}</p></div>;
const Td = ({ v, neg, bold }: { v: string | number; neg?: boolean; bold?: boolean }) => <td className={`p-2 text-right whitespace-nowrap ${neg ? "text-destructive" : ""} ${bold ? "font-semibold" : ""}`}>{v}</td>;
