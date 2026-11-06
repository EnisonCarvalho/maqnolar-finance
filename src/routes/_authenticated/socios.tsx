import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Ban, Wallet, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, parseBRLToCents } from "@/lib/format";
import { createDistribution, createPartnerMovement, listDistributions, listPartnerMovements, listPartners, payDistribution, voidDistribution, voidDistributionPayment, voidPartnerMovement } from "@/lib/partners.functions";
import { PARTNER_TYPE_LABELS, PARTNER_TYPE_SIGN, type PartnerMovement, type PartnerMovementType } from "@/lib/partner-math";
import { distributionStatus, type DistributionPayment, type ProfitDistribution } from "@/lib/profit-math";
import { getFinanceOverview } from "@/lib/finance-ops.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { AccountSelect, PeriodFilter, ReasonDialog, StatCard, usePeriod, accountsQuery } from "@/components/finance-ui";
import { ReceiptInput, ReceiptLink, formatISODate, todayISO, uploadReceipt } from "@/components/finance-shared";
import { useSession } from "@/hooks/use-session";
import { NoAccess } from "@/components/no-access";

export const Route = createFileRoute("/_authenticated/socios")({
  head: () => ({
    meta: [
      { title: "Gestão dos Sócios — MaqnoLar Financeiro" },
      { name: "description", content: "Aportes, empréstimos, devoluções e retiradas dos sócios Enison e Jonathan, com controle individual e histórico." },
      { property: "og:title", content: "Gestão dos Sócios — MaqnoLar Financeiro" },
      { property: "og:description", content: "Aportes, empréstimos, devoluções e retiradas dos sócios, com controle individual e histórico." },
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

type Draft = { partnerId: string; type: PartnerMovementType; amount: string; date: string; accountId: string; description: string; notes: string; receipt: File | null };
const emptyDraft = (): Draft => ({ partnerId: "", type: "aporte", amount: "", date: todayISO(), accountId: "", description: "", notes: "", receipt: null });

function Content() {
  const qc = useQueryClient();
  const period = usePeriod("mes");
  const listFn = useServerFn(listPartnerMovements);
  const partnersFn = useServerFn(listPartners);
  const [partner, setPartner] = useState("todos");
  const [type, setType] = useState("todos");
  const [account, setAccount] = useState("todas");
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState<PartnerMovement | null>(null);

  const filters = { start: period.range.start, end: period.range.end, partnerId: partner === "todos" ? null : partner, type: type === "todos" ? null : type, accountId: account === "todas" ? null : account };
  const { data, isLoading, error } = useQuery({ queryKey: ["partner-movements", filters], queryFn: () => listFn({ data: filters }) });
  const { data: partnersData } = useQuery({ queryKey: ["partners"], queryFn: () => partnersFn({}) });
  const { data: accounts } = useQuery(accountsQuery);
  const partners = partnersData?.partners ?? [];
  const partnerName = (id: string) => partners.find((p) => p.id === id)?.full_name ?? "Sócio";
  const accountName = (id: string) => accounts?.find((a) => a.id === id)?.name ?? "—";
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["partner-movements"] });
    await qc.invalidateQueries({ queryKey: ["fin-overview"] });
  };

  const amountCents = parseBRLToCents(draft.amount);
  const formValid = Boolean(draft.partnerId && draft.accountId && draft.description.trim() && amountCents && amountCents > 0 && draft.date);

  async function submit() {
    if (!amountCents) return;
    setSaving(true);
    try {
      const receiptPath = draft.receipt ? await uploadReceipt(draft.receipt) : null;
      await createPartnerMovement({ data: { partnerId: draft.partnerId, type: draft.type, amountCents, date: draft.date, accountId: draft.accountId, description: draft.description, notes: draft.notes, receiptPath } });
      toast.success("Movimentação registrada.");
      setConfirming(false);
      setFormOpen(false);
      setDraft(emptyDraft());
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar.");
    } finally {
      setSaving(false);
    }
  }

  const summaries = data?.summaries ?? [];
  const movements = data?.movements ?? [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold md:text-3xl">Gestão dos Sócios</h1>
          <p className="mt-1 text-sm text-muted-foreground">Aportes, empréstimos e retiradas de Enison e Jonathan. Movimentam o saldo das contas, mas nunca contam como receita ou despesa operacional.</p>
        </div>
        <Button onClick={() => setFormOpen(true)}><Plus className="mr-1 h-4 w-4" />Nova movimentação</Button>
      </div>

      <section className="grid gap-2 md:grid-cols-2">
        {partners.map((p) => {
          const s = summaries.find((x) => x.partnerId === p.id);
          return (
            <Card key={p.id}>
              <CardContent className="grid gap-3 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary"><Wallet className="h-4 w-4" /></div>
                  <p className="font-display text-lg font-semibold">{p.full_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  <div><p className="text-xs text-muted-foreground">Aportes</p><p className="font-semibold">{formatBRL(s?.aportesCents ?? 0)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Empréstimos feitos</p><p className="font-semibold">{formatBRL(s?.emprestimosCents ?? 0)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Empréstimos devolvidos</p><p className="font-semibold">{formatBRL(s?.devolvidosCents ?? 0)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Empréstimos a devolver</p><p className={`font-semibold ${(s?.saldoEmprestimosCents ?? 0) > 0 ? "text-destructive" : ""}`}>{formatBRL(s?.saldoEmprestimosCents ?? 0)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Retiradas</p><p className="font-semibold">{formatBRL(s?.retiradasCents ?? 0)}</p></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {partners.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">Nenhum sócio (administrador ativo) encontrado.</p>}
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-base font-semibold">Filtros</h2>
        <PeriodFilter period={period} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:max-w-3xl">
          <Select value={partner} onValueChange={setPartner}><SelectTrigger aria-label="Sócio"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos os sócios</SelectItem>{partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select>
          <Select value={type} onValueChange={setType}><SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>{Object.entries(PARTNER_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          <Select value={account} onValueChange={setAccount}><SelectTrigger aria-label="Conta"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas as contas</SelectItem>{(accounts ?? []).filter((a) => a.ownership === "empresa").map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
        </div>
      </section>

      <section className="grid gap-2">
        <h2 className="font-display text-base font-semibold">Movimentações no período</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Erro ao carregar."}</p>}
        {data && movements.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma movimentação no período com esses filtros.</p>}

        <div className="grid gap-2 md:hidden">
          {movements.map((m) => (
            <div key={m.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{m.description}</p>
                  <p className="text-xs text-muted-foreground">{formatISODate(m.movement_date)} · {PARTNER_TYPE_LABELS[m.type]} · {partnerName(m.partner_id)} · {accountName(m.account_id)}</p>
                </div>
                <p className={`shrink-0 font-semibold ${PARTNER_TYPE_SIGN[m.type] < 0 ? "text-destructive" : "text-primary"}`}>{PARTNER_TYPE_SIGN[m.type] < 0 ? "−" : "+"}{formatBRL(m.amount_cents)}</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {m.status === "estornado" ? <Badge variant="secondary">Estornado{m.void_reason ? `: ${m.void_reason}` : ""}</Badge> : <Badge>Ativo</Badge>}
                <ReceiptLink path={m.receipt_path} />
                {m.status === "ativo" && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setVoiding(m)}><Ban className="mr-1 h-3.5 w-3.5" />Estornar</Button>}
              </div>
              {m.notes && <p className="mt-1 text-xs text-muted-foreground">{m.notes}</p>}
            </div>
          ))}
        </div>

        <Card className="hidden md:block"><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="p-3">Data</th><th className="p-3">Sócio</th><th className="p-3">Tipo</th><th className="p-3">Descrição</th><th className="p-3">Conta</th><th className="p-3 text-right">Valor</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="p-3 whitespace-nowrap">{formatISODate(m.movement_date)}</td>
                  <td className="p-3">{partnerName(m.partner_id)}</td>
                  <td className="p-3">{PARTNER_TYPE_LABELS[m.type]}</td>
                  <td className="p-3"><span className="font-medium">{m.description}</span>{m.receipt_path && <span className="ml-2 inline-block align-middle"><ReceiptLink path={m.receipt_path} /></span>}{m.notes && <p className="text-xs text-muted-foreground">{m.notes}</p>}</td>
                  <td className="p-3">{accountName(m.account_id)}</td>
                  <td className={`p-3 text-right font-semibold whitespace-nowrap ${PARTNER_TYPE_SIGN[m.type] < 0 ? "text-destructive" : "text-primary"}`}>{PARTNER_TYPE_SIGN[m.type] < 0 ? "−" : "+"}{formatBRL(m.amount_cents)}</td>
                  <td className="p-3">{m.status === "estornado" ? <Badge variant="secondary" title={m.void_reason ?? undefined}>Estornado</Badge> : <Badge>Ativo</Badge>}</td>
                  <td className="p-3 text-right">{m.status === "ativo" && <Button size="sm" variant="ghost" onClick={() => setVoiding(m)}><Ban className="mr-1 h-3.5 w-3.5" />Estornar</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      </section>

      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setConfirming(false); } }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{confirming ? "Confirmar movimentação" : "Nova movimentação de sócio"}</DialogTitle></DialogHeader>
          {!confirming ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Sócio *</Label>
                <Select value={draft.partnerId} onValueChange={(v) => setDraft((d) => ({ ...d, partnerId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o sócio" /></SelectTrigger>
                  <SelectContent>{partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Tipo de movimentação *</Label>
                <Select value={draft.type} onValueChange={(v) => setDraft((d) => ({ ...d, type: v as PartnerMovementType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PARTNER_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {draft.type === "aporte" && "Dinheiro que o sócio coloca na empresa. Não é receita operacional."}
                  {draft.type === "emprestimo_socio" && "Empréstimo do sócio à empresa. Fica registrado como valor a devolver."}
                  {draft.type === "devolucao_emprestimo" && "Empresa devolve (total ou parcialmente) o empréstimo ao sócio."}
                  {draft.type === "retirada" && "Retirada ou adiantamento do sócio. Não é despesa operacional nem, necessariamente, distribuição de lucros."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5"><Label>Valor *</Label><Input inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} /></div>
                <div className="grid gap-1.5"><Label>Data *</Label><Input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} /></div>
              </div>
              <AccountSelect value={draft.accountId} onChange={(v) => setDraft((d) => ({ ...d, accountId: v }))} label={PARTNER_TYPE_SIGN[draft.type] > 0 ? "Conta de destino" : "Conta de origem"} required />
              <div className="grid gap-1.5"><Label>Descrição *</Label><Input value={draft.description} maxLength={200} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Ex.: Aporte para capital de giro" /></div>
              <div className="grid gap-1.5"><Label>Observações</Label><Textarea rows={2} value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} /></div>
              <ReceiptInput file={draft.receipt} onChange={(f) => setDraft((d) => ({ ...d, receipt: f }))} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
                <Button disabled={!formValid} onClick={() => setConfirming(true)}>Revisar e confirmar</Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">{PARTNER_TYPE_LABELS[draft.type]} — {partnerName(draft.partnerId)}</p>
                <p className="mt-1 text-lg font-semibold">{formatBRL(amountCents)}</p>
                <p className="text-xs text-muted-foreground">{formatISODate(draft.date)} · {PARTNER_TYPE_SIGN[draft.type] > 0 ? "Entrada na conta" : "Saída da conta"} {accountName(draft.accountId)}</p>
                <p className="mt-1">{draft.description}</p>
                {draft.notes && <p className="text-xs text-muted-foreground">{draft.notes}</p>}
                {draft.receipt && <p className="text-xs text-muted-foreground">Comprovante: {draft.receipt.name}</p>}
              </div>
              <p className="text-xs text-muted-foreground">Após o registro, a movimentação não pode ser editada nem excluída — correções são feitas por estorno com justificativa.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={saving} onClick={() => setConfirming(false)}>Voltar</Button>
                <Button disabled={saving} onClick={submit}>{saving ? "Registrando…" : "Confirmar registro"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReasonDialog open={Boolean(voiding)} title="Estornar movimentação" description={voiding ? <>Estornar <strong>{voiding.description}</strong> ({formatBRL(voiding.amount_cents)})? O lançamento original fica preservado no histórico.</> : null} action="Estornar" onClose={() => setVoiding(null)}
        onConfirm={async (reason) => { await voidPartnerMovement({ data: { id: voiding!.id, reason } }); toast.success("Movimentação estornada."); await refresh(); }} />

      <DistributionSection partners={partners} period={period} />
    </div>
  );
}

function DistributionSection({ partners, period }: { partners: { id: string; full_name: string }[]; period: ReturnType<typeof usePeriod> }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listDistributions);
  const overviewFn = useServerFn(getFinanceOverview);
  const { data } = useQuery({ queryKey: ["distributions"], queryFn: () => listFn({}) });
  const { data: overview } = useQuery({ queryKey: ["fin-overview", period.range.start, period.range.end], queryFn: () => overviewFn({ data: period.range }) });
  const [approveOpen, setApproveOpen] = useState(false);
  const [total, setTotal] = useState("");
  const [decisionDate, setDecisionDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [validated, setValidated] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState<{ dist: ProfitDistribution; partnerId: string } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayISO());
  const [payAccount, setPayAccount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payReceipt, setPayReceipt] = useState<File | null>(null);
  const [voidingDist, setVoidingDist] = useState<ProfitDistribution | null>(null);
  const [voidingPay, setVoidingPay] = useState<DistributionPayment | null>(null);

  const partnerName = (id: string) => partners.find((p) => p.id === id)?.full_name ?? "Sócio";
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["distributions"] });
    await qc.invalidateQueries({ queryKey: ["fin-overview"] });
  };

  const totals = data?.totals;
  const totalCents = parseBRLToCents(total);
  const approveValid = Boolean(totalCents && totalCents > 0 && decisionDate && validated);

  async function submitApproval() {
    if (!totalCents) return;
    setSaving(true);
    try {
      await createDistribution({ data: { totalCents, decisionDate, notes, validatedDistributable: validated } });
      toast.success("Distribuição aprovada. O caixa só será reduzido quando houver pagamento efetivo.");
      setApproveOpen(false); setConfirming(false); setTotal(""); setNotes(""); setValidated(false);
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível aprovar."); }
    finally { setSaving(false); }
  }

  async function submitPayment() {
    if (!paying) return;
    const amount = parseBRLToCents(payAmount);
    if (!amount || amount <= 0) { toast.error("Informe um valor válido."); return; }
    if (!payAccount) { toast.error("Selecione a conta utilizada."); return; }
    setSaving(true);
    try {
      const receiptPath = payReceipt ? await uploadReceipt(payReceipt) : null;
      await payDistribution({ data: { distributionId: paying.dist.id, partnerId: paying.partnerId, amountCents: amount, paidAt: payDate, accountId: payAccount, notes: payNotes, receiptPath } });
      toast.success("Pagamento registrado.");
      setPaying(null); setPayAmount(""); setPayNotes(""); setPayReceipt(null); setPayAccount("");
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível registrar o pagamento."); }
    finally { setSaving(false); }
  }

  const distributions = data?.distributions ?? [];
  const payments = data?.payments ?? [];

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold">Distribuição eventual de lucros</h2>
          <p className="text-xs text-muted-foreground">Divisão 50/50 entre Enison e Jonathan. A aprovação não movimenta o caixa — somente o pagamento efetivo. Não é despesa operacional.</p>
        </div>
        <Button variant="outline" onClick={() => setApproveOpen(true)}><HandCoins className="mr-1 h-4 w-4" />Distribuir lucros</Button>
      </div>

      {overview && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard label="Lucro apurado no período" cents={overview.indicators.economicResultCents} hint="Resultado econômico (competência)" tone="auto" />
          <StatCard label="Saldo em contas" cents={overview.cash.totals.closingCents} hint="Caixa efetivo — não é tudo distribuível" tone="auto" />
          <StatCard label="Total aprovado p/ distribuição" cents={totals?.approvedCents ?? 0} />
          <StatCard label="Saldo pendente de pagamento" cents={totals?.pendingCents ?? 0} tone="auto" />
        </div>
      )}
      {totals && partners.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:max-w-xl">
          {partners.map((p) => (
            <StatCard key={p.id} label={`Pago a ${p.full_name}`} cents={totals.paidByPartner[p.id] ?? 0} />
          ))}
        </div>
      )}

      {distributions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma distribuição aprovada.</p>}
      <div className="grid gap-2">
        {distributions.map((d) => {
          const st = distributionStatus(d, payments);
          const pays = payments.filter((p) => p.distribution_id === d.id);
          return (
            <Card key={d.id}>
              <CardContent className="grid gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">Distribuição de {formatBRL(d.total_cents)} {d.status === "estornada" && <Badge variant="secondary" className="ml-1">Estornada</Badge>}</p>
                    <p className="text-xs text-muted-foreground">Decisão em {formatISODate(d.decision_date)}{d.notes ? ` · ${d.notes}` : ""}</p>
                    {d.void_reason && <p className="text-xs text-muted-foreground">Estorno: {d.void_reason}</p>}
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold">{formatBRL(st.paidTotalCents)} pagos</p>
                    <p className="text-xs text-muted-foreground">Pendente: {formatBRL(st.pendingCents)}</p>
                  </div>
                </div>
                {d.status === "ativa" && st.pendingCents > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {partners.map((p) => {
                      const pending = st.pendingByPartner(p.id);
                      return (
                        <Button key={p.id} size="sm" variant="outline" disabled={pending <= 0}
                          onClick={() => { setPaying({ dist: d, partnerId: p.id }); setPayAmount((pending / 100).toFixed(2).replace(".", ",")); setPayDate(todayISO()); }}>
                          Pagar {p.full_name} ({formatBRL(pending)})
                        </Button>
                      );
                    })}
                    <Button size="sm" variant="ghost" onClick={() => setVoidingDist(d)}><Ban className="mr-1 h-3.5 w-3.5" />Estornar distribuição</Button>
                  </div>
                )}
                {pays.length > 0 && (
                  <div className="grid gap-1.5">
                    {pays.map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">{partnerName(p.partner_id)} — {formatBRL(p.amount_cents)}</p>
                          <p className="text-xs text-muted-foreground">Pago em {formatISODate(p.paid_at)}{p.notes ? ` · ${p.notes}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.status === "estornado" ? <Badge variant="secondary" title={p.void_reason ?? undefined}>Estornado</Badge> : <Badge>Pago</Badge>}
                          <ReceiptLink path={p.receipt_path} />
                          {p.status === "ativo" && <Button size="sm" variant="ghost" onClick={() => setVoidingPay(p)}><Ban className="h-3.5 w-3.5" /></Button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={approveOpen} onOpenChange={(o) => { if (!o) { setApproveOpen(false); setConfirming(false); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{confirming ? "Confirmar aprovação" : "Distribuir lucros"}</DialogTitle></DialogHeader>
          {!confirming ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5"><Label>Valor total aprovado *</Label><Input inputMode="decimal" placeholder="0,00" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
                <div className="grid gap-1.5"><Label>Data da decisão *</Label><Input type="date" value={decisionDate} onChange={(e) => setDecisionDate(e.target.value)} /></div>
              </div>
              {totalCents != null && totalCents > 0 && (
                <p className="text-xs text-muted-foreground">Divisão 50/50: {formatBRL(Math.ceil(totalCents / 2))} e {formatBRL(Math.floor(totalCents / 2))} para cada sócio. Os pagamentos podem ser feitos em datas e contas diferentes.</p>
              )}
              <div className="grid gap-1.5"><Label>Observações</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={validated} onCheckedChange={(v) => setValidated(v === true)} className="mt-0.5" />
                <span>Confirmo que o valor foi validado como <strong>lucro distribuível</strong>. O saldo do sistema não garante, por si só, disponibilidade jurídica ou contábil.</span>
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancelar</Button>
                <Button disabled={!approveValid} onClick={() => setConfirming(true)}>Revisar e confirmar</Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">Distribuição de lucros — {formatBRL(totalCents)}</p>
                <p className="text-xs text-muted-foreground">Decisão em {formatISODate(decisionDate)} · 50% para cada sócio · validado como lucro distribuível</p>
                {notes && <p className="mt-1">{notes}</p>}
              </div>
              <p className="text-xs text-muted-foreground">A aprovação não reduz o caixa. Cada pagamento será registrado separadamente, com conta e data efetiva.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={saving} onClick={() => setConfirming(false)}>Voltar</Button>
                <Button disabled={saving} onClick={submitApproval}>{saving ? "Aprovando…" : "Confirmar aprovação"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(paying)} onOpenChange={(o) => { if (!o) setPaying(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Pagar distribuição — {paying ? partnerName(paying.partnerId) : ""}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5"><Label>Valor *</Label><Input inputMode="decimal" placeholder="0,00" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Data efetiva *</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
            </div>
            <AccountSelect value={payAccount} onChange={setPayAccount} label="Conta utilizada" required />
            <div className="grid gap-1.5"><Label>Observações</Label><Textarea rows={2} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} /></div>
            <ReceiptInput file={payReceipt} onChange={setPayReceipt} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPaying(null)}>Cancelar</Button>
              <Button disabled={saving} onClick={submitPayment}>{saving ? "Registrando…" : "Registrar pagamento"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ReasonDialog open={Boolean(voidingDist)} title="Estornar distribuição" description={voidingDist ? <>Estornar a distribuição de <strong>{formatBRL(voidingDist.total_cents)}</strong>? Só é possível sem pagamentos ativos. O registro original fica preservado.</> : null} action="Estornar" onClose={() => setVoidingDist(null)}
        onConfirm={async (reason) => { await voidDistribution({ data: { id: voidingDist!.id, reason } }); toast.success("Distribuição estornada."); await refresh(); }} />
      <ReasonDialog open={Boolean(voidingPay)} title="Estornar pagamento" description={voidingPay ? <>Estornar o pagamento de <strong>{formatBRL(voidingPay.amount_cents)}</strong> a {partnerName(voidingPay.partner_id)}? O valor volta ao saldo da conta.</> : null} action="Estornar" onClose={() => setVoidingPay(null)}
        onConfirm={async (reason) => { await voidDistributionPayment({ data: { id: voidingPay!.id, reason } }); toast.success("Pagamento estornado."); await refresh(); }} />
    </section>
  );
}
