import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
import { getFinanceOverview } from "@/lib/finance-ops.functions";
import { PeriodFilter, StatCard, usePeriod } from "@/components/finance-ui";
import { formatISODate } from "@/components/finance-shared";
import { techniciansQuery } from "@/lib/orders-queries";
import { OrderDetailSheet } from "@/components/order-detail";
import { useSession } from "@/hooks/use-session";
import { NoAccess } from "@/components/no-access";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Undo2 } from "lucide-react";
import { ReasonDialog } from "@/components/finance-ui";
import { RefundDialog } from "@/components/refund-dialog";
import { refundCustomerPayment, removeOrderRevenue } from "@/lib/settlement.functions";

export const Route = createFileRoute("/_authenticated/receitas")({
  head: () => ({
    meta: [
      { title: "Receitas — MaqnoLar Financeiro" },
      { name: "description", content: "Receitas por OS confirmada, participações da empresa e dos técnicos e situação do recebimento." },
      { property: "og:title", content: "Receitas — MaqnoLar Financeiro" },
      { property: "og:description", content: "Receitas por OS confirmada, participações da empresa e dos técnicos e situação do recebimento." },
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
  const period = usePeriod("mes");
  const fn = useServerFn(getFinanceOverview);
  const { data, isLoading, error } = useQuery({ queryKey: ["fin-overview", period.range.start, period.range.end], queryFn: () => fn({ data: period.range }) });
  const { data: technicians } = useQuery(techniciansQuery);
  const [tech, setTech] = useState("todos");
  const [detailId, setDetailId] = useState<string | null>(null);
  const qc = useQueryClient();
  type Row = NonNullable<typeof data>["confirmedOrders"][number];
  const [removing, setRemoving] = useState<Row | null>(null);
  const [refundRow, setRefundRow] = useState<Row | null>(null);
  const [refundPay, setRefundPay] = useState<{ id: string; amountCents: number; label: string } | null>(null);
  const refresh = () => qc.invalidateQueries();
  const actions = (o: Row) => <div className="flex flex-wrap gap-2">
    <Button size="sm" variant="outline" onClick={() => setDetailId(o.orderId)}><Pencil className="mr-1 h-4 w-4" />Editar</Button>
    {o.payments.length > 0 && <Button size="sm" variant="outline" onClick={() => setRefundRow(o)}><Undo2 className="mr-1 h-4 w-4" />Devolução</Button>}
    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemoving(o)}><Trash2 className="mr-1 h-4 w-4" />Excluir</Button>
  </div>;
  const rows = (data?.confirmedOrders ?? []).filter((o) => tech === "todos" || o.technicianId === tech);
  const totals = rows.reduce((s, o) => ({ company: s.company + o.companyShareCents, technician: s.technician + o.technicianShareCents }), { company: 0, technician: 0 });
  const columns = ["Data", "Nº da OS", "Tipo", "Técnico", "Total cobrado", "Peças", "Parte do técnico", "Parte da MaqnoLar", "Recebimento", "Ações"];
  return <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
    <h1 className="font-display text-2xl font-semibold md:text-3xl">Receitas</h1>
    <PeriodFilter period={period} />
    <Select value={tech} onValueChange={setTech}><SelectTrigger aria-label="Técnico" className="w-full sm:max-w-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os técnicos</SelectItem>{(technicians ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent></Select>
    <div className="grid grid-cols-2 gap-2"><StatCard label="Receitas da MaqnoLar" cents={totals.company} tone="pos" /><StatCard label="Parte dos técnicos" cents={totals.technician} /></div>
    {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar receitas."}</p>}
    {!isLoading && !error && rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum atendimento confirmado no período.</p>}
    <div className="grid gap-2 xl:hidden">{rows.map((o) => <div key={o.orderId} className="grid gap-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="link" className="h-auto p-0" onClick={() => setDetailId(o.orderId)}>{o.code}</Button><Badge variant="outline">{o.receiptStatus}</Badge></div>
      <p>{formatISODate(o.date)} · {o.kind} · {o.technicianName}</p>
      <dl className="grid grid-cols-2 gap-2">{[["Total cobrado", o.totalCents], ["Peças", o.partsCents], ["Parte do técnico", o.technicianShareCents], ["Parte da MaqnoLar", o.companyShareCents]].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-semibold">{formatBRL(Number(value))}</dd></div>)}</dl>
      {actions(o)}
    </div>)}</div>
    <div className="hidden overflow-x-auto xl:block"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground">{columns.map((c) => <th key={c} className="p-2">{c}</th>)}</tr></thead><tbody>{rows.map((o) => <tr key={o.orderId} className="border-b"><td className="p-2 whitespace-nowrap">{formatISODate(o.date)}</td><td className="p-2"><Button variant="link" className="h-auto p-0" onClick={() => setDetailId(o.orderId)}>{o.code}</Button></td><td className="p-2">{o.kind}</td><td className="p-2">{o.technicianName}</td>{[o.totalCents, o.partsCents, o.technicianShareCents, o.companyShareCents].map((v, index) => <td key={index} className="p-2 whitespace-nowrap">{formatBRL(v)}</td>)}<td className="p-2"><Badge variant="outline">{o.receiptStatus}</Badge></td><td className="p-2">{actions(o)}</td></tr>)}</tbody></table></div>
    <OrderDetailSheet orderId={detailId} onClose={() => setDetailId(null)} isAdmin />
    <ReasonDialog open={Boolean(removing)} title="Excluir receita" description={<>Excluir a receita da {removing?.code}? A OS de origem é cancelada, recebimentos ativos são estornados e tudo fica no histórico.</>} action="Excluir" onClose={() => setRemoving(null)}
      onConfirm={async (reason) => { await removeOrderRevenue({ data: { orderId: removing!.orderId, reason } }); await refresh(); }} />
    <Dialog open={Boolean(refundRow)} onOpenChange={(o) => !o && setRefundRow(null)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Devolução — {refundRow?.code}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Escolha o recebimento que será devolvido total ou parcialmente.</p>
      <div className="grid gap-2">{refundRow?.payments.map((p: { id: string; amountCents: number; paidAt: string }) => <Button key={p.id} variant="outline" className="justify-between" onClick={() => { setRefundPay({ id: p.id, amountCents: p.amountCents, label: `${refundRow.code} · ${formatISODate(p.paidAt)}` }); setRefundRow(null); }}><span>{formatISODate(p.paidAt)}</span><span>{formatBRL(p.amountCents)}</span></Button>)}</div>
    </DialogContent></Dialog>
    <RefundDialog target={refundPay} title="Devolução ao cliente" onClose={() => setRefundPay(null)} onConfirm={async (refundCents, reason) => { await refundCustomerPayment({ data: { paymentId: refundPay!.id, refundCents, reason } }); await refresh(); }} />
  </div>;
}
