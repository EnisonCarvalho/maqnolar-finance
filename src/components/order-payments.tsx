import { useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, parseBRLToCents } from "@/lib/format";
import { techniciansQuery, type FinancialRow, type PurchaseRow } from "@/lib/orders-queries";
import { registerPayment, voidPayment } from "@/lib/settlement.functions";
import { buildEntries, summarize } from "@/lib/ledger-math";
import { METHOD_LABELS, ReceiptInput, ReceiptLink, formatISODate, todayISO, uploadReceipt } from "@/components/finance-shared";

export type PaymentRow = {
  id: string;
  amount_cents: number;
  paid_at: string;
  created_at: string;
  receiver_type: "maqnolar" | "tecnico" | "outro";
  receiver_technician_id: string | null;
  receiver_label: string | null;
  method: string;
  destination_account: string | null;
  notes: string | null;
  receipt_path: string | null;
  authorized_reason: string | null;
  status: "ativo" | "estornado";
  void_reason: string | null;
  technicians: { full_name: string } | null;
};

export const orderPaymentsQuery = (orderId: string) =>
  queryOptions({
    queryKey: ["order-payments", orderId],
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await supabase
        .from("customer_payments")
        .select("id, amount_cents, paid_at, created_at, receiver_type, receiver_technician_id, receiver_label, method, destination_account, notes, receipt_path, authorized_reason, status, void_reason, technicians(full_name)")
        .eq("order_id", orderId)
        .order("paid_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PaymentRow[];
    },
  });

function receiverName(p: PaymentRow) {
  if (p.receiver_type === "maqnolar") return "MaqnoLar";
  if (p.receiver_type === "tecnico") return p.technicians?.full_name ?? "Técnico";
  return p.receiver_label ?? "Outro recebedor";
}

export function OrderPayments({
  orderId, technicianId, technicianName, fin, purchases,
}: {
  orderId: string; technicianId: string | null; technicianName: string | null; fin: FinancialRow; purchases: PurchaseRow[];
}) {
  const queryClient = useQueryClient();
  const { data: payments } = useQuery(orderPaymentsQuery(orderId));
  const [open, setOpen] = useState(false);
  const [voiding, setVoiding] = useState<PaymentRow | null>(null);
  const [reason, setReason] = useState("");

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["order-payments", orderId] }),
      queryClient.invalidateQueries({ queryKey: ["order-financials", orderId] }),
      queryClient.invalidateQueries({ queryKey: ["service-order", orderId] }),
      queryClient.invalidateQueries({ queryKey: ["settlement"] }),
    ]);
  };

  const voidMutation = useMutation({
    mutationFn: () => voidPayment({ data: { paymentId: voiding!.id, reason } }),
    onSuccess: async () => { toast.success("Recebimento estornado."); setVoiding(null); setReason(""); await refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível estornar."),
  });

  const active = (payments ?? []).filter((p) => p.status === "ativo");
  const received = active.reduce((s, p) => s + p.amount_cents, 0);
  const clientBalance = fin.total_cents - received;

  // Acerto real deste atendimento (mesmo motor usado no Acerto diário)
  const partsByTechnician: Record<string, number> = {};
  for (const p of purchases) {
    if (p.buyer_type === "tecnico" && p.buyer_technician_id) partsByTechnician[p.buyer_technician_id] = (partsByTechnician[p.buyer_technician_id] ?? 0) + p.total_cents;
  }
  const entries = buildEntries(
    [{ orderId, code: "", customerName: "", technicianId, totalCents: fin.total_cents, technicianShareCents: fin.technician_share_cents, companyShareCents: fin.company_share_cents, partsByTechnician, partsByCompanyCents: 0 }],
    active.map((p) => ({ id: p.id, orderId, amountCents: p.amount_cents, paidAt: p.paid_at, createdAt: p.created_at, receiverType: p.receiver_type, receiverTechnicianId: p.receiver_technician_id })),
  );
  const mainTech = technicianId ? summarize(entries, [], null, null).find((s) => s.technicianId === technicianId) : undefined;
  const orderBalance = mainTech?.orders.find((o) => o.orderId === orderId)?.balanceCents ?? 0;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display font-semibold">Recebimentos do cliente</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Registrar recebimento
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-md border p-3 text-sm">
        <div><p className="text-xs text-muted-foreground">Valor do serviço</p><p className="font-semibold">{formatBRL(fin.total_cents)}</p></div>
        <div><p className="text-xs text-muted-foreground">Recebido</p><p className="font-semibold text-primary">{formatBRL(received)}</p></div>
        <div><p className="text-xs text-muted-foreground">Saldo do cliente</p><p className={`font-semibold ${clientBalance > 0 ? "text-destructive" : ""}`}>{formatBRL(Math.max(clientBalance, 0))}</p></div>
      </div>

      {(payments ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pagamento recebido ainda. O valor do serviço ainda não é dinheiro em caixa.</p>
      ) : (
        <ul className="grid gap-2">
          {(payments ?? []).map((p) => (
            <li key={p.id} className={`grid gap-1 rounded-md border p-2 text-sm ${p.status === "estornado" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{formatBRL(p.amount_cents)} · {METHOD_LABELS[p.method]}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatISODate(p.paid_at)} · Recebido por {receiverName(p)}{p.destination_account ? ` · ${p.destination_account}` : ""}
                  </p>
                  {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                  {p.authorized_reason && <p className="text-xs text-muted-foreground">Ajuste autorizado: {p.authorized_reason}</p>}
                  {p.status === "estornado" && <p className="text-xs text-destructive">Estornado: {p.void_reason}</p>}
                  <ReceiptLink path={p.receipt_path} />
                </div>
                {p.status === "ativo" ? (
                  <Button size="sm" variant="ghost" onClick={() => setVoiding(p)} aria-label="Estornar recebimento"><Undo2 className="h-4 w-4" /></Button>
                ) : (
                  <Badge variant="secondary">Estornado</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {technicianId && received > 0 && (
        <div className="grid gap-1 rounded-md bg-muted p-3 text-sm">
          <p className="font-medium">Acerto real deste atendimento ({technicianName ?? "técnico"})</p>
          <p>Participação reconhecida: <strong>{formatBRL(mainTech?.technicianShareCents ?? 0)}</strong>{(mainTech?.reimbursementCents ?? 0) > 0 && <> · Reembolso de peças: <strong>{formatBRL(mainTech?.reimbursementCents ?? 0)}</strong></>}</p>
          <p>Recebido pelo técnico: <strong>{formatBRL(mainTech?.receivedByTechnicianCents ?? 0)}</strong></p>
          <p className="font-semibold">
            {orderBalance > 0 && <>MaqnoLar deve repassar ao técnico: {formatBRL(orderBalance)}</>}
            {orderBalance < 0 && <>Técnico deve repassar à MaqnoLar: {formatBRL(-orderBalance)}</>}
            {orderBalance === 0 && <>Sem saldo entre técnico e MaqnoLar neste atendimento.</>}
          </p>
          <p className="text-xs text-muted-foreground">Calculado sobre o que o cliente efetivamente pagou. Repasses e compensações são controlados no Acerto diário.</p>
        </div>
      )}

      <PaymentDialog
        orderId={orderId}
        open={open}
        onOpenChange={setOpen}
        onDone={refresh}
        clientBalance={clientBalance}
        defaultTechnicianId={technicianId}
      />

      <Dialog open={Boolean(voiding)} onOpenChange={(o) => !o && setVoiding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Estornar recebimento</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm">Estornar {formatBRL(voiding?.amount_cents)} de {formatISODate(voiding?.paid_at)}? O registro não é apagado — fica no histórico como estornado.</p>
            <div className="grid gap-1.5"><Label>Motivo *</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setVoiding(null)}>Voltar</Button>
              <Button variant="destructive" disabled={!reason.trim() || voidMutation.isPending} onClick={() => voidMutation.mutate()}>Estornar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentDialog({
  orderId, open, onOpenChange, onDone, clientBalance, defaultTechnicianId,
}: {
  orderId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => Promise<void>; clientBalance: number; defaultTechnicianId: string | null;
}) {
  const { data: technicians } = useQuery(techniciansQuery);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO);
  const [receiver, setReceiver] = useState("maqnolar");
  const [receiverLabel, setReceiverLabel] = useState("");
  const [method, setMethod] = useState("pix");
  const [account, setAccount] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [authorized, setAuthorized] = useState("");
  const [confirming, setConfirming] = useState(false);

  const amountCents = parseBRLToCents(amount) ?? 0;
  const overpay = amountCents > clientBalance;
  const receiverIsTech = receiver.startsWith("tec:");
  const receiverTechnicianId = receiverIsTech ? receiver.slice(4) : null;
  const receiverText = receiver === "maqnolar" ? "MaqnoLar" : receiver === "outro" ? receiverLabel || "outro recebedor" : technicians?.find((t) => t.id === receiverTechnicianId)?.full_name ?? "técnico";

  const reset = () => {
    setAmount(""); setPaidAt(todayISO()); setReceiver("maqnolar"); setReceiverLabel(""); setMethod("pix"); setAccount(""); setNotes(""); setFile(null); setAuthorized(""); setConfirming(false);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const receiptPath = file ? await uploadReceipt(file) : null;
      return registerPayment({
        data: {
          orderId, amountCents, paidAt,
          receiverType: receiverIsTech ? "tecnico" : receiver,
          receiverTechnicianId,
          receiverLabel,
          method, destinationAccount: account, notes, receiptPath, authorizedReason: authorized,
        },
      });
    },
    onSuccess: async () => { toast.success("Recebimento registrado."); reset(); onOpenChange(false); await onDone(); },
    onError: (e) => { setConfirming(false); toast.error(e instanceof Error ? e.message : "Não foi possível registrar."); },
  });

  const valid = amountCents > 0 && paidAt && (receiver !== "outro" || receiverLabel.trim()) && (!overpay || authorized.trim());

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o && defaultTechnicianId === null) setReceiver("maqnolar"); if (!o) setConfirming(false); onOpenChange(o); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Registrar recebimento</DialogTitle></DialogHeader>
        {confirming ? (
          <div className="grid gap-3">
            <p className="text-sm">Confirmar recebimento de <strong>{formatBRL(amountCents)}</strong> em <strong>{formatISODate(paidAt)}</strong>, via {METHOD_LABELS[method]}, recebido por <strong>{receiverText}</strong>?</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirming(false)}>Voltar</Button>
              <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Salvando…" : "Confirmar"}</Button>
            </div>
          </div>
        ) : (
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (valid) setConfirming(true); }}>
            <p className="text-sm text-muted-foreground">Saldo do cliente: <strong>{formatBRL(Math.max(clientBalance, 0))}</strong></p>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label>Valor recebido (R$) *</Label>
                <Input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Data do pagamento *</Label>
                <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Quem recebeu *</Label>
              <Select value={receiver} onValueChange={setReceiver}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="maqnolar">MaqnoLar</SelectItem>
                  {(technicians ?? []).filter((t) => t.active).map((t) => (
                    <SelectItem key={t.id} value={`tec:${t.id}`}>{t.full_name}{t.id === defaultTechnicianId ? " (responsável)" : ""}</SelectItem>
                  ))}
                  <SelectItem value="outro">Outro recebedor autorizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {receiver === "outro" && (
              <div className="grid gap-1.5"><Label>Nome do recebedor *</Label><Input value={receiverLabel} onChange={(e) => setReceiverLabel(e.target.value)} /></div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label>Forma *</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Conta de destino</Label>
                <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
            {overpay && amountCents > 0 && (
              <div className="grid gap-1.5 rounded-md border border-destructive/40 p-2">
                <Label className="text-destructive">Valor acima do saldo do cliente. Justifique o ajuste autorizado *</Label>
                <Textarea value={authorized} onChange={(e) => setAuthorized(e.target.value)} rows={2} />
              </div>
            )}
            <div className="grid gap-1.5"><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
            <ReceiptInput file={file} onChange={setFile} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={!valid}>Continuar</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
