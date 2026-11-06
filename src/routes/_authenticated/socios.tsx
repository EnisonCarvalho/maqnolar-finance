import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Ban, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, parseBRLToCents } from "@/lib/format";
import { createPartnerMovement, listPartnerMovements, listPartners, voidPartnerMovement } from "@/lib/partners.functions";
import { PARTNER_TYPE_LABELS, PARTNER_TYPE_SIGN, type PartnerMovement, type PartnerMovementType } from "@/lib/partner-math";
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
    </div>
  );
}
