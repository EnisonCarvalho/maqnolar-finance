import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, parseBRLToCents, formatDateBR } from "@/lib/format";
import { orderFinancialsQuery, techniciansQuery, type PurchaseRow } from "@/lib/orders-queries";
import { registerPartPurchase, deletePartPurchase, setOrderReceiver, adjustShares } from "@/lib/finance.functions";
import { computeSettlement } from "@/lib/settlement-math";
import { OrderPayments } from "@/components/order-payments";
import { AccountSelect } from "@/components/finance-ui";

const BUYER_LABELS: Record<string, string> = { maqnolar: "MaqnoLar", tecnico: "Técnico", outro: "Outro" };
const STATUS_LABELS: Record<string, string> = { previsto: "Previsto", parcial: "Parcialmente realizado", realizado: "Realizado" };
const STATUS_COLORS: Record<string, string> = {
  previsto: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  parcial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  realizado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};

function buyerName(p: PurchaseRow): string {
  if (p.buyer_type === "maqnolar") return "MaqnoLar";
  if (p.buyer_type === "tecnico") return p.technicians?.full_name ?? p.buyer_label ?? "Técnico";
  return p.buyer_label ?? "Outro responsável";
}

export function OrderFinancials({ orderId, technicianId = null, technicianName = null }: { orderId: string; technicianId?: string | null; technicianName?: string | null }) {
  const queryClient = useQueryClient();
  const { data } = useQuery(orderFinancialsQuery(orderId));
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [removing, setRemoving] = useState<PurchaseRow | null>(null);
  const [removeReason, setRemoveReason] = useState("");

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["order-financials", orderId] });
    await queryClient.invalidateQueries({ queryKey: ["service-order", orderId] });
  };

  const receiverMutation = useMutation({
    mutationFn: (v: { receiverType: string; receiverLabel?: string }) =>
      setOrderReceiver({ data: { orderId, ...v } }),
    onSuccess: async () => { toast.success("Recebedor atualizado."); await refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar."),
  });

  const removeMutation = useMutation({
    mutationFn: () => deletePartPurchase({ data: { purchaseId: removing!.id, reason: removeReason } }),
    onSuccess: async () => {
      toast.success("Compra removida.");
      setRemoving(null);
      setRemoveReason("");
      await refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível remover."),
  });

  if (!data) return null;
  const fin = data.financial;

  if (!fin) {
    return (
      <p className="text-sm text-muted-foreground">
        A composição financeira é gerada quando um orçamento é aprovado ou quando uma visita recusada é marcada como cobrável.
      </p>
    );
  }

  const settlement = computeSettlement({
    totalCents: fin.total_cents,
    technicianShareCents: fin.technician_share_cents,
    companyShareCents: fin.company_share_cents,
    purchases: data.purchases.map((p) => ({ buyerType: p.buyer_type, totalCents: p.total_cents })),
    receiverType: fin.receiver_type,
  });
  const partsPurchased = data.purchases.reduce((s, p) => s + p.total_cents, 0);

  const ruleText =
    fin.rule_technician_fixed_cents != null
      ? `Regra aplicada: valores fixos — técnico ${formatBRL(fin.rule_technician_fixed_cents)}, MaqnoLar ${formatBRL(fin.rule_company_fixed_cents)}`
      : `Regra aplicada: ${fin.rule_technician_percent ?? "—"}% técnico / ${fin.rule_company_percent ?? "—"}% MaqnoLar`;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Composição financeira</h3>
        <Badge className={STATUS_COLORS[fin.status]} variant="secondary">{STATUS_LABELS[fin.status]}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">{fin.kind === "visita" ? "Total da visita" : "Total aprovado"}</p><p className="font-semibold">{formatBRL(fin.total_cents)}</p></div>
        {fin.kind === "servico" && (
          <>
            <div><p className="text-xs text-muted-foreground">Mão de obra</p><p className="font-medium">{formatBRL(fin.labor_cents)}</p></div>
            <div><p className="text-xs text-muted-foreground">Peças previstas</p><p className="font-medium">{formatBRL(fin.parts_estimated_cents)}</p></div>
          </>
        )}
        <div><p className="text-xs text-muted-foreground">Peças compradas</p><p className="font-medium">{formatBRL(partsPurchased)}</p></div>
        <div><p className="text-xs text-muted-foreground">Participação do técnico</p><p className="font-medium">{formatBRL(fin.technician_share_cents)}</p></div>
        <div><p className="text-xs text-muted-foreground">Participação da MaqnoLar</p><p className="font-medium">{formatBRL(fin.company_share_cents)}</p></div>
      </div>
      <p className="text-xs text-muted-foreground">{ruleText} (cópia preservada no atendimento)</p>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">Peças compradas</p>
          <Button size="sm" variant="outline" onClick={() => setPurchaseOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Registrar compra
          </Button>
        </div>
        {data.purchases.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma compra registrada. As peças previstas no orçamento não são tratadas como despesa paga automaticamente.</p>
        ) : (
          <ul className="grid gap-2">
            {data.purchases.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <div className="flex-1">
                  <p className="font-medium">{p.description} — {p.quantity} × {formatBRL(p.unit_price_cents)} = {formatBRL(p.total_cents)}</p>
                  <p className="text-xs text-muted-foreground">
                    Pago por: {buyerName(p)} · {formatDateBR(p.purchased_at)}{p.notes ? ` · ${p.notes}` : ""}
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setRemoving(p)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-2 rounded-md border p-3">
        <Label>Responsável previsto pelo recebimento do cliente</Label>
        <Select
          value={fin.receiver_type ?? ""}
          onValueChange={(v) => receiverMutation.mutate({ receiverType: v })}
        >
          <SelectTrigger><SelectValue placeholder="Definir recebedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="maqnolar">MaqnoLar</SelectItem>
            <SelectItem value="tecnico">Técnico responsável</SelectItem>
            <SelectItem value="outro">Outro recebedor autorizado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1 rounded-md bg-muted p-3 text-sm">
        <p className="font-medium">Acerto previsto (antes dos recebimentos)</p>
        {fin.receiver_type === "maqnolar" && (
          <p>A MaqnoLar recebe e repassa ao técnico: <strong>{formatBRL(settlement.transferToTechnicianCents)}</strong>
            {settlement.partsPaidByTechnicianCents > 0 && ` (${formatBRL(settlement.partsPaidByTechnicianCents)} de reembolso de peças + ${formatBRL(fin.technician_share_cents)} de participação)`}.
            Parte econômica da MaqnoLar: <strong>{formatBRL(settlement.companyEconomicShareCents)}</strong>.</p>
        )}
        {fin.receiver_type === "tecnico" && (
          <p>O técnico recebeu e deve repassar à MaqnoLar: <strong>{formatBRL(settlement.transferToCompanyCents)}</strong>
            {settlement.partsPaidByCompanyCents > 0 && ` (${formatBRL(settlement.partsPaidByCompanyCents)} de peças + ${formatBRL(fin.company_share_cents)} de participação)`}.
            Participação do técnico: <strong>{formatBRL(settlement.technicianEconomicShareCents)}</strong>.</p>
        )}
        {!fin.receiver_type && <p className="text-muted-foreground">Defina quem receberá o pagamento do cliente para calcular o acerto previsto.</p>}
        {fin.receiver_type === "outro" && <p className="text-muted-foreground">Recebedor externo — acerto calculado na etapa de recebimentos.</p>}
        <p className="text-xs text-muted-foreground">Estimativa. O acerto real usa os recebimentos registrados abaixo.</p>
      </div>

      <OrderPayments orderId={orderId} technicianId={technicianId} technicianName={technicianName} fin={fin} purchases={data.purchases} />

      <Button variant="outline" size="sm" className="w-fit" onClick={() => setAdjustOpen(true)}>
        Ajustar participações (com registro)
      </Button>

      <PurchaseDialog orderId={orderId} open={purchaseOpen} onOpenChange={setPurchaseOpen} onDone={refresh} />
      <AdjustDialog orderId={orderId} open={adjustOpen} onOpenChange={setAdjustOpen} onDone={refresh} laborCents={fin.labor_cents} techCents={fin.technician_share_cents} companyCents={fin.company_share_cents} />

      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Remover compra</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm">Remover "{removing?.description}" ({formatBRL(removing?.total_cents)})? A remoção ficará registrada no histórico.</p>
            <div className="grid gap-1.5">
              <Label>Motivo *</Label>
              <Textarea value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRemoving(null)}>Voltar</Button>
              <Button variant="destructive" disabled={!removeReason.trim() || removeMutation.isPending} onClick={() => removeMutation.mutate()}>
                Remover
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PurchaseDialog({ orderId, open, onOpenChange, onDone }: { orderId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => Promise<void> }) {
  const { data: technicians } = useQuery(techniciansQuery);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [buyerType, setBuyerType] = useState("maqnolar");
  const [buyerTechnicianId, setBuyerTechnicianId] = useState("");
  const [buyerLabel, setBuyerLabel] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      registerPartPurchase({
        data: {
          orderId,
          description,
          quantity: Number(quantity) || 0,
          unitPriceCents: parseBRLToCents(unitPrice) ?? 0,
          buyerType,
          buyerTechnicianId: buyerTechnicianId || null,
          buyerLabel,
          purchasedAt: new Date(`${purchasedAt}T12:00:00`).toISOString(),
          notes,
          accountId: buyerType === "maqnolar" ? accountId || null : null,
        },
      }),
    onSuccess: async () => {
      toast.success("Compra registrada.");
      setDescription(""); setQuantity("1"); setUnitPrice(""); setBuyerType("maqnolar"); setBuyerTechnicianId(""); setBuyerLabel(""); setNotes("");
      onOpenChange(false);
      await onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível registrar."),
  });

  const total = Math.round((Number(quantity) || 0) * (parseBRLToCents(unitPrice) ?? 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Registrar compra de peça</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
          <div className="grid gap-1.5">
            <Label>Descrição da peça *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1.5">
              <Label>Qtd.</Label>
              <Input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Unit. (R$)</Label>
              <Input inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Total</Label>
              <Input value={formatBRL(total)} disabled />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Quem pagou *</Label>
            <Select value={buyerType} onValueChange={setBuyerType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="maqnolar">MaqnoLar</SelectItem>
                <SelectItem value="tecnico">Técnico parceiro</SelectItem>
                <SelectItem value="outro">Outro responsável</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {buyerType === "maqnolar" && <AccountSelect label="Conta da MaqnoLar usada" value={accountId} onChange={setAccountId} allowNone />}
          {buyerType === "tecnico" && (
            <div className="grid gap-1.5">
              <Label>Técnico *</Label>
              <Select value={buyerTechnicianId} onValueChange={setBuyerTechnicianId}>
                <SelectTrigger><SelectValue placeholder="Selecione o técnico" /></SelectTrigger>
                <SelectContent>
                  {(technicians ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {buyerType === "outro" && (
            <div className="grid gap-1.5">
              <Label>Nome do responsável *</Label>
              <Input value={buyerLabel} onChange={(e) => setBuyerLabel(e.target.value)} />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Data da compra</Label>
            <Input type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || !description.trim() || (buyerType === "tecnico" && !buyerTechnicianId) || (buyerType === "outro" && !buyerLabel.trim())}>
              {mutation.isPending ? "Salvando…" : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ orderId, open, onOpenChange, onDone, laborCents, techCents, companyCents }: {
  orderId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => Promise<void>;
  laborCents: number; techCents: number; companyCents: number;
}) {
  const [tech, setTech] = useState("");
  const [company, setCompany] = useState("");
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      adjustShares({
        data: {
          orderId,
          technicianShareCents: parseBRLToCents(tech) ?? 0,
          companyShareCents: parseBRLToCents(company) ?? 0,
          reason,
        },
      }),
    onSuccess: async () => {
      toast.success("Participações ajustadas.");
      setTech(""); setCompany(""); setReason("");
      onOpenChange(false);
      await onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível ajustar."),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) { setTech((techCents / 100).toFixed(2).replace(".", ",")); setCompany((companyCents / 100).toFixed(2).replace(".", ",")); } onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Ajustar participações</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
          <p className="text-sm text-muted-foreground">Mão de obra: {formatBRL(laborCents)}. A soma das participações deve ser igual a esse valor. O ajuste fica registrado no histórico com valores anterior e novo.</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Técnico (R$)</Label>
              <Input inputMode="decimal" value={tech} onChange={(e) => setTech(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>MaqnoLar (R$)</Label>
              <Input inputMode="decimal" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Motivo *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || !reason.trim()}>
              {mutation.isPending ? "Salvando…" : "Ajustar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
