import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Lock, RotateCcw, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, parseBRLToCents } from "@/lib/format";
import { getSettlement, registerTransfer, voidTransfer, closeSettlement, reopenClosing } from "@/lib/settlement.functions";
import { METHOD_LABELS, ReceiptInput, ReceiptLink, formatISODate, todayISO, uploadReceipt } from "@/components/finance-shared";
import { useSession } from "@/hooks/use-session";
import { AccountSelect } from "@/components/finance-ui";
import { NoAccess } from "@/components/no-access";

export const Route = createFileRoute("/_authenticated/acerto-diario")({
  head: () => ({
    meta: [
      { title: "Acerto diário — MaqnoLar Financeiro" },
      { name: "description", content: "Recebimentos, repasses e fechamento do acerto entre a MaqnoLar e os técnicos." },
      { property: "og:title", content: "Acerto diário — MaqnoLar Financeiro" },
      { property: "og:description", content: "Recebimentos, repasses e fechamento do acerto entre a MaqnoLar e os técnicos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AcertoPage,
});

type Preset = "hoje" | "ontem" | "semana" | "mes" | "ano" | "personalizado";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
  { key: "ano", label: "Ano" },
  { key: "personalizado", label: "Período" },
];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function rangeFor(p: Preset, custom: { start: string; end: string }): { start: string; end: string } {
  const now = new Date();
  if (p === "hoje") return { start: iso(now), end: iso(now) };
  if (p === "ontem") { const d = new Date(now); d.setDate(d.getDate() - 1); return { start: iso(d), end: iso(d) }; }
  if (p === "semana") { const d = new Date(now); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); const e = new Date(d); e.setDate(e.getDate() + 6); return { start: iso(d), end: iso(e) }; }
  if (p === "mes") return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  if (p === "ano") return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
  return custom;
}

const CLOSING_LABELS: Record<string, string> = { fechado: "Acertado", fechado_com_pendencia: "Fechado com pendência", reaberto: "Reaberto" };

function BalanceText({ cents }: { cents: number }) {
  if (cents > 0) return <span className="text-primary">MaqnoLar paga {formatBRL(cents)}</span>;
  if (cents < 0) return <span className="text-accent-foreground">Técnico repassa {formatBRL(-cents)}</span>;
  return <span className="text-muted-foreground">Sem saldo</span>;
}

function AcertoPage() {
  const { data: session } = useSession();
  if (session && !session.isAdmin) return <NoAccess />;
  return <AcertoContent />;
}

function AcertoContent() {
  const queryClient = useQueryClient();
  const fetchSettlement = useServerFn(getSettlement);
  const [preset, setPreset] = useState<Preset>("hoje");
  const [custom, setCustom] = useState({ start: todayISO(), end: todayISO() });
  const [techFilter, setTechFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const range = rangeFor(preset, custom);

  const { data, isLoading, error } = useQuery({
    queryKey: ["settlement", range.start, range.end],
    queryFn: () => fetchSettlement({ data: range }),
  });
  const { data: transfers } = useQuery({
    queryKey: ["settlement", "transfers", range.start, range.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("technician_transfers")
        .select("*")
        .gte("transfer_date", range.start)
        .lte("transfer_date", range.end)
        .order("transfer_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [transferFor, setTransferFor] = useState<{ id: string; name: string; suggested: number; orderIds: string[] } | null>(null);
  const [closingFor, setClosingFor] = useState<{ id: string; name: string; pending: number } | null>(null);
  const [reopening, setReopening] = useState<{ id: string } | null>(null);
  const [voidingTransfer, setVoidingTransfer] = useState<{ id: string; amount: number } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["settlement"] });

  const closingsByTech = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const c of data?.closings ?? []) {
      if (!m.has(c.technician_id)) m.set(c.technician_id, []);
      m.get(c.technician_id)!.push(c);
    }
    return m;
  }, [data]);

  const activeClosingFor = (techId: string) =>
    (closingsByTech.get(techId) ?? []).find((c) => c.status !== "reaberto" && c.period_start <= range.end && c.period_end >= range.start);

  const techs = (data?.technicians ?? [])
    .filter((t) => techFilter === "todos" || t.id === techFilter)
    .filter((t) => t.active || t.period || t.overallPendingCents !== 0)
    .filter((t) => {
      if (statusFilter === "todos") return true;
      const closing = activeClosingFor(t.id);
      const pending = t.period?.pendingCents ?? 0;
      if (statusFilter === "pendente") return pending !== 0 && !closing;
      if (statusFilter === "acertado") return pending === 0 && Boolean(t.period);
      if (statusFilter === "fechado") return Boolean(closing);
      return true;
    });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold md:text-3xl">Acerto diário</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Calculado sobre o que os clientes efetivamente pagaram, pela data do pagamento. Repasses não contam como receita nem despesa.
        </p>
      </div>

      <div className="grid gap-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {PRESETS.map((p) => (
            <Button key={p.key} size="sm" variant={preset === p.key ? "default" : "outline"} className="shrink-0" onClick={() => setPreset(p.key)}>
              {p.label}
            </Button>
          ))}
        </div>
        {preset === "personalizado" && (
          <div className="grid grid-cols-2 gap-2 sm:max-w-md">
            <div className="grid gap-1"><Label className="text-xs">De</Label><Input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} /></div>
            <div className="grid gap-1"><Label className="text-xs">Até</Label><Input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} /></div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <Select value={techFilter} onValueChange={setTechFilter}>
            <SelectTrigger aria-label="Técnico"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os técnicos</SelectItem>
              {(data?.technicians ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="Situação"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as situações</SelectItem>
              <SelectItem value="pendente">Com saldo pendente</SelectItem>
              <SelectItem value="acertado">Sem saldo</SelectItem>
              <SelectItem value="fechado">Fechados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">Período: {formatISODate(range.start)} a {formatISODate(range.end)}</p>
      </div>

      <CompletedDaily groups={(data?.completedDaily ?? []).filter((g) => techFilter === "todos" || g.technicianId === techFilter)} />

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Erro ao carregar."}</p>}
      {!isLoading && techs.length === 0 && <p className="text-sm text-muted-foreground">Nenhum técnico com movimentação para os filtros escolhidos.</p>}

      {techs.map((t) => {
        const s = t.period;
        const closing = activeClosingFor(t.id);
        const pending = s?.pendingCents ?? 0;
        const techTransfers = (transfers ?? []).filter((x) => x.technician_id === t.id);
        return (
          <Card key={t.id}>
            <CardHeader className="gap-2 pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <CardTitle className="font-display text-lg">{t.name}</CardTitle>
                {closing ? (
                  <Badge variant={closing.status === "fechado" ? "default" : "secondary"}><Lock className="mr-1 h-3 w-3" />{CLOSING_LABELS[closing.status]}</Badge>
                ) : s ? (
                  <Badge variant="outline">{pending === 0 ? "Sem saldo" : "Em aberto"}</Badge>
                ) : null}
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Saldo líquido pendente no período</p>
                <p className="font-display text-xl font-semibold"><BalanceText cents={pending} /></p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saldo acumulado geral: <BalanceText cents={t.overallPendingCents} /> · Clientes ainda devem: {formatBRL(t.clientPendingCents)}
                </p>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              {s ? (
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
                  <Metric label="Recebido dos clientes" value={s.receivedFromClientsCents} />
                  <Metric label="Recebido pelo técnico" value={s.receivedByTechnicianCents} />
                  <Metric label="Participação do técnico" value={s.technicianShareCents} />
                  <Metric label="Reembolso de peças" value={s.reimbursementCents} />
                  <Metric label="Pertence à MaqnoLar" value={s.companyShareCents} />
                  <Metric label="A pagar ao técnico" value={s.toPayTechnicianCents} />
                  <Metric label="A receber do técnico" value={s.toReceiveFromTechnicianCents} />
                  <Metric label="Compensado entre atendimentos" value={s.compensatedCents} />
                  <Metric label="Já acertado (repasses)" value={s.settledCents} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem recebimentos ou repasses neste período.</p>
              )}

              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  size="sm"
                  onClick={() => setTransferFor({ id: t.id, name: t.name, suggested: pending, orderIds: (s?.orders ?? []).filter((o) => o.balanceCents !== 0).map((o) => o.orderId) })}
                >
                  Registrar repasse
                </Button>
                <Button size="sm" variant="outline" disabled={Boolean(closing) || !s} onClick={() => setClosingFor({ id: t.id, name: t.name, pending })}>
                  Fechar acerto
                </Button>
              </div>

              {s && s.orders.length > 0 && (
                <div className="grid gap-2">
                  <p className="text-sm font-medium">Atendimentos com pagamento no período</p>
                  <div className="grid gap-2 lg:hidden">
                    {s.orders.map((o) => (
                      <div key={o.orderId} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{o.code || "Outro atendimento"}</p>
                          <p className="font-semibold"><BalanceText cents={o.balanceCents} /></p>
                        </div>
                        <p className="text-xs text-muted-foreground">{o.customerName} · aberto {formatISODate(o.openedAt)}{o.completedAt ? ` · concluído ${formatISODate(o.completedAt)}` : ""}</p>
                        <p className="mt-1 text-xs">Pago no período {formatBRL(o.clientPaidCents)} · técnico recebeu {formatBRL(o.receivedByTechnicianCents)} · direito do técnico {formatBRL(o.shareEarnedCents + o.reimbursementEarnedCents)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr className="border-b">
                          <th className="py-2 pr-2">Atendimento</th><th className="pr-2">Cliente</th><th className="pr-2">Abertura</th><th className="pr-2">Conclusão</th>
                          <th className="pr-2 text-right">Valor total</th><th className="pr-2 text-right">Pago no período</th><th className="pr-2 text-right">Recebido pelo técnico</th>
                          <th className="pr-2 text-right">Participação</th><th className="pr-2 text-right">Reembolso</th><th className="text-right">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.orders.map((o) => (
                          <tr key={o.orderId} className="border-b last:border-0">
                            <td className="py-2 pr-2 font-medium">{o.code || "—"}</td>
                            <td className="pr-2">{o.customerName}</td>
                            <td className="pr-2">{formatISODate(o.openedAt)}</td>
                            <td className="pr-2">{formatISODate(o.completedAt)}</td>
                            <td className="pr-2 text-right">{formatBRL(o.totalCents)}</td>
                            <td className="pr-2 text-right">{formatBRL(o.clientPaidCents)}</td>
                            <td className="pr-2 text-right">{formatBRL(o.receivedByTechnicianCents)}</td>
                            <td className="pr-2 text-right">{formatBRL(o.shareEarnedCents)}</td>
                            <td className="pr-2 text-right">{formatBRL(o.reimbursementEarnedCents)}</td>
                            <td className="text-right font-medium"><BalanceText cents={o.balanceCents} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {techTransfers.length > 0 && (
                <div className="grid gap-2">
                  <p className="text-sm font-medium">Repasses no período</p>
                  {techTransfers.map((x) => (
                    <div key={x.id} className={`flex items-start justify-between gap-2 rounded-md border p-2 text-sm ${x.status === "estornado" ? "opacity-60" : ""}`}>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 font-medium">
                          {x.direction === "empresa_para_tecnico" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                          {formatBRL(x.amount_cents)} · {x.payer_label} → {x.receiver_label}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatISODate(x.transfer_date)} · {METHOD_LABELS[x.method]}{x.notes ? ` · ${x.notes}` : ""}</p>
                        {x.status === "estornado" && <p className="text-xs text-destructive">Estornado: {x.void_reason}</p>}
                        <ReceiptLink path={x.receipt_path} />
                      </div>
                      {x.status === "ativo" && (
                        <Button size="sm" variant="ghost" aria-label="Estornar repasse" onClick={() => setVoidingTransfer({ id: x.id, amount: x.amount_cents })}><Undo2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(closingsByTech.get(t.id) ?? []).length > 0 && (
                <details className="rounded-md border p-2 text-sm">
                  <summary className="cursor-pointer font-medium">Fechamentos anteriores</summary>
                  <div className="mt-2 grid gap-2">
                    {(closingsByTech.get(t.id) ?? []).map((c) => (
                      <div key={c.id} className="flex items-start justify-between gap-2 rounded-md bg-muted/50 p-2">
                        <div className="min-w-0">
                          <p className="font-medium">{formatISODate(c.period_start)}{c.period_end !== c.period_start ? ` a ${formatISODate(c.period_end)}` : ""} · {CLOSING_LABELS[c.status]}</p>
                          <p className="text-xs text-muted-foreground">Saldo no fechamento: <BalanceText cents={c.pending_cents} /> · acertado {formatBRL(c.settled_cents)}</p>
                          {c.reopen_reason && <p className="text-xs text-muted-foreground">Reaberto: {c.reopen_reason}</p>}
                        </div>
                        {c.status !== "reaberto" && (
                          <Button size="sm" variant="ghost" onClick={() => setReopening({ id: c.id })}><RotateCcw className="mr-1 h-4 w-4" />Reabrir</Button>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })}

      <TransferDialog target={transferFor} onClose={() => setTransferFor(null)} onDone={refresh} />
      <CloseDialog target={closingFor} range={range} onClose={() => setClosingFor(null)} onDone={refresh} />
      <ReasonDialog
        open={Boolean(reopening)}
        title="Reabrir fechamento"
        description="O fechamento original fica preservado no histórico como reaberto."
        action="Reabrir"
        onClose={() => setReopening(null)}
        onConfirm={async (reason) => { await reopenClosing({ data: { closingId: reopening!.id, reason } }); toast.success("Fechamento reaberto."); await refresh(); }}
      />
      <ReasonDialog
        open={Boolean(voidingTransfer)}
        title="Estornar repasse"
        description={`Estornar ${formatBRL(voidingTransfer?.amount)}? O registro fica no histórico como estornado.`}
        action="Estornar"
        onClose={() => setVoidingTransfer(null)}
        onConfirm={async (reason) => { await voidTransfer({ data: { transferId: voidingTransfer!.id, reason } }); toast.success("Repasse estornado."); await refresh(); }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{formatBRL(value)}</p>
    </div>
  );
}

function TransferDialog({ target, onClose, onDone }: { target: { id: string; name: string; suggested: number; orderIds: string[] } | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [direction, setDirection] = useState("empresa_para_tecnico");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO);
  const [method, setMethod] = useState("pix");
  const [source, setSource] = useState("");
  const [dest, setDest] = useState("");
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [lastTarget, setLastTarget] = useState<string | null>(null);

  if (target && target.id !== lastTarget) {
    setLastTarget(target.id);
    setDirection(target.suggested < 0 ? "tecnico_para_empresa" : "empresa_para_tecnico");
    setAmount(target.suggested !== 0 ? (Math.abs(target.suggested) / 100).toFixed(2).replace(".", ",") : "");
    setDate(todayISO()); setMethod("pix"); setSource(""); setDest(""); setNotes(""); setFile(null); setConfirming(false);
  }

  const amountCents = parseBRLToCents(amount) ?? 0;
  const mutation = useMutation({
    mutationFn: async () => {
      const receiptPath = file ? await uploadReceipt(file) : null;
      return registerTransfer({
        data: { technicianId: target!.id, transferDate: date, amountCents, direction, method, sourceAccount: source, destinationAccount: dest, accountId: accountId || null, orderIds: target!.orderIds, notes, receiptPath },
      });
    },
    onSuccess: async () => { toast.success("Repasse registrado."); setLastTarget(null); onClose(); await onDone(); },
    onError: (e) => { setConfirming(false); toast.error(e instanceof Error ? e.message : "Não foi possível registrar."); },
  });
  const close = () => { setLastTarget(null); onClose(); };
  const toTech = direction === "empresa_para_tecnico";

  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Registrar repasse — {target?.name}</DialogTitle></DialogHeader>
        {confirming ? (
          <div className="grid gap-3">
            <p className="text-sm">Confirmar repasse de <strong>{formatBRL(amountCents)}</strong> {toTech ? `da MaqnoLar para ${target?.name}` : `de ${target?.name} para a MaqnoLar`} em <strong>{formatISODate(date)}</strong> via {METHOD_LABELS[method]}?</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirming(false)}>Voltar</Button>
              <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Salvando…" : "Confirmar"}</Button>
            </div>
          </div>
        ) : (
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (amountCents > 0) setConfirming(true); }}>
            {target && target.suggested !== 0 && (
              <p className="text-sm text-muted-foreground">Saldo do período: <BalanceText cents={target.suggested} />. Repasses parciais são permitidos.</p>
            )}
            <div className="grid gap-1.5">
              <Label>Sentido *</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa_para_tecnico">MaqnoLar paga ao técnico</SelectItem>
                  <SelectItem value="tecnico_para_empresa">Técnico repassa à MaqnoLar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5"><Label>Valor (R$) *</Label><Input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Data *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
            <div className="grid gap-1.5">
              <Label>Forma *</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5"><Label>Conta de origem</Label><Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Opcional" /></div>
              <div className="grid gap-1.5"><Label>Conta de destino</Label><Input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Opcional" /></div>
            </div>
            <AccountSelect label="Conta da MaqnoLar usada" value={accountId} onChange={setAccountId} allowNone />
            {target && target.orderIds.length > 0 && <p className="text-xs text-muted-foreground">Vinculado a {target.orderIds.length} atendimento(s) com saldo no período.</p>}
            <div className="grid gap-1.5"><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
            <ReceiptInput file={file} onChange={setFile} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close}>Cancelar</Button>
              <Button type="submit" disabled={amountCents <= 0}>Continuar</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ target, range, onClose, onDone }: { target: { id: string; name: string; pending: number } | null; range: { start: string; end: string }; onClose: () => void; onDone: () => Promise<void> }) {
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => closeSettlement({ data: { technicianId: target!.id, start: range.start, end: range.end, notes } }),
    onSuccess: async (r) => {
      toast.success(r.status === "fechado" ? "Acerto fechado sem pendências." : "Acerto fechado com saldo pendente registrado.");
      setNotes(""); onClose(); await onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível fechar."),
  });
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Fechar acerto — {target?.name}</DialogTitle></DialogHeader>
        <div className="grid gap-3 text-sm">
          <p>Período: {formatISODate(range.start)} a {formatISODate(range.end)}</p>
          <p>Saldo pendente: <strong><BalanceText cents={target?.pending ?? 0} /></strong></p>
          {target && target.pending !== 0 && (
            <p className="rounded-md border border-destructive/40 p-2 text-destructive">Há saldo pendente. O fechamento ficará como "Fechado com pendência", não como acertado.</p>
          )}
          <div className="grid gap-1.5"><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Fechando…" : "Confirmar fechamento"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({ open, title, description, action, onClose, onConfirm }: { open: boolean; title: string; description: string; action: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setReason(""); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm">{description}</p>
          <div className="grid gap-1.5"><Label>Justificativa *</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || pending}
              onClick={async () => {
                setPending(true);
                try { await onConfirm(reason); setReason(""); onClose(); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível concluir."); }
                finally { setPending(false); }
              }}
            >
              {action}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type DailyGroup = NonNullable<Awaited<ReturnType<typeof getSettlement>>["completedDaily"]>[number];
function CompletedDaily({ groups }: { groups: DailyGroup[] }) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold">Atendimentos concluídos no período</h2>
        <p className="text-xs text-muted-foreground">Por data de conclusão, mesmo sem pagamento do cliente. Realizado ≠ recebido ≠ repassado.</p>
      </div>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">Nenhum atendimento concluído no período.</p>}
      {groups.map((g) => (
        <Card key={g.technicianId ?? "none"}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{g.technicianName}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              {g.orders.map((o) => (
                <div key={o.orderId} className="grid gap-1 rounded-md border p-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{o.code}</span>
                    <Badge variant="outline">{o.kind === "visita" ? "Visita" : "Serviço"}</Badge>
                    {!o.confirmed && <Badge variant="secondary">Pendente de confirmação</Badge>}
                    <span className="min-w-0 truncate text-muted-foreground">{o.customerName}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 text-xs sm:grid-cols-4">
                    <span>Total: <b>{formatBRL(o.totalCents)}</b></span>
                    <span>Peças: {formatBRL(o.partsCents)}</span>
                    <span>Técnico: {o.technicianShareCents == null ? "a confirmar" : formatBRL(o.technicianShareCents)}</span>
                    <span>MaqnoLar: {o.companyShareCents == null ? "a confirmar" : formatBRL(o.companyShareCents)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t pt-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <div><p className="text-xs text-muted-foreground">Realizado</p><p className="font-semibold">{formatBRL(g.realizadoCents)}</p></div>
              <div><p className="text-xs text-muted-foreground">Peças</p><p className="font-semibold">{formatBRL(g.partsCents)}</p></div>
              <div><p className="text-xs text-muted-foreground">Parte do técnico</p><p className="font-semibold">{formatBRL(g.technicianShareCents)}</p></div>
              <div><p className="text-xs text-muted-foreground">Parte MaqnoLar</p><p className="font-semibold">{formatBRL(g.companyShareCents)}</p></div>
              <div><p className="text-xs text-muted-foreground">Recebido do cliente</p><p className="font-semibold">{formatBRL(g.recebidoCents)}</p></div>
              <div><p className="text-xs text-muted-foreground">Repassado (líquido)</p><p className="font-semibold">{formatBRL(g.repassadoCents)}</p></div>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
