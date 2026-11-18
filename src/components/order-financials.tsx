import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
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
import { useServerFn } from "@tanstack/react-start";
import { confirmServiceComposition, confirmVisitComposition } from "@/lib/technician-service.functions";
import { canConfirmServiceValues, canConfirmVisit, serviceCompositionPreview, visitCompositionPreview } from "@/lib/technician-service";
import { supabase } from "@/integrations/supabase/client";

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

export function OrderFinancials({ orderId, technicianId = null, technicianName = null, reportedCents = null, reportedPartsCents = 0, reportedParts = [], orderStatus, confirmedAt }: { orderId: string; technicianId?: string | null; technicianName?: string | null; reportedCents?: number | null; reportedPartsCents?: number; reportedParts?: { description: string; cents: number }[]; orderStatus: string; confirmedAt: string | null }) {
  const queryClient = useQueryClient();
  const { data } = useQuery(orderFinancialsQuery(orderId));
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [removing, setRemoving] = useState<PurchaseRow | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

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
    if (canConfirmVisit(orderStatus, confirmedAt)) {
      return (
        <>
          <Button className="w-full" onClick={() => setConfirmOpen(true)}><CheckCircle2 className="mr-2 h-4 w-4" />Confirmar visita</Button>
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
              <DialogHeader><DialogTitle>Confirmar visita</DialogTitle></DialogHeader>
              <VisitConfirmForm orderId={orderId} onDone={async () => { setConfirmOpen(false); await refresh(); }} />
            </DialogContent>
          </Dialog>
        </>
      );
    }
    return (
      canConfirmServiceValues(orderStatus, confirmedAt) ? <>
        <Button className="w-full" onClick={() => setConfirmOpen(true)}><CheckCircle2 className="mr-2 h-4 w-4" />Confirmar valores do serviço</Button>
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
            <DialogHeader><DialogTitle>Confirmar valores do serviço</DialogTitle></DialogHeader>
            <CompositionForm orderId={orderId} totalCents={reportedCents} partsCents={reportedPartsCents} reportedParts={reportedParts} onDone={async () => { setConfirmOpen(false); await refresh(); }} />
          </DialogContent>
        </Dialog>
      </> : <p className="text-sm text-muted-foreground">Apuração financeira pendente.</p>
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


      <Button variant="outline" size="sm" className="w-fit" onClick={() => setAdjustOpen(true)}>
        Ajustar participações (com registro)
      </Button>
      {fin.kind === "servico" && <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Corrigir apuração financeira</summary><div className="pt-3"><CompositionForm orderId={orderId} totalCents={fin.total_cents} partsCents={fin.parts_estimated_cents} correction onDone={refresh} /></div></details>}

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

export function CompositionForm({ orderId, totalCents, partsCents, reportedParts = [], correction = false, onDone }: { orderId: string; totalCents: number | null; partsCents: number; reportedParts?: { description: string; cents: number }[]; correction?: boolean; onDone: () => Promise<void> }) {
  const [total, setTotal] = useState(totalCents == null ? "" : (totalCents / 100).toFixed(2).replace(".", ","));
  const [parts, setParts] = useState((partsCents / 100).toFixed(2).replace(".", ","));
  const [reason, setReason] = useState("");
  const confirm = useServerFn(confirmServiceComposition);
  const queryClient = useQueryClient();
  const { data: rule, isPending: rulePending, isError: ruleError } = useQuery({
    queryKey: ["composition-split-rule"],
    staleTime: 0,
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase.from("split_rules").select("technician_percent, company_percent").eq("kind", "mao_obra").lte("valid_from", now).or(`valid_until.is.null,valid_until.gt.${now}`).order("valid_from", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return { technicianPercent: data?.technician_percent ?? 50, companyPercent: data?.company_percent ?? 50, technicianFixedCents: null, companyFixedCents: null };
    },
  });
  let preview: ReturnType<typeof serviceCompositionPreview> | null = null;
  let validationError = "";
  if (rule && total.trim()) {
    try { preview = serviceCompositionPreview(total, parts, rule); }
    catch (error) { validationError = error instanceof Error ? error.message : "Valores inválidos."; }
  }
  const mutation = useMutation({
    mutationFn: () => confirm({ data: { orderId, totalReais: total, partsReais: parts, ...(correction ? { reason } : {}) } }),
    onSuccess: async () => { toast.success("Valores confirmados e OS finalizada."); await onDone(); await queryClient.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível confirmar."),
  });
  const canSubmit = Boolean(preview) && !rulePending && !ruleError && (!correction || reason.trim().length >= 3);
  return <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (canSubmit && !mutation.isPending) mutation.mutate(); }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5"><Label htmlFor={`total-${orderId}`}>Valor total cobrado (R$)</Label><Input id={`total-${orderId}`} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
      <div className="grid gap-1.5"><Label htmlFor={`parts-${orderId}`}>Valor total das peças (R$)</Label><Input id={`parts-${orderId}`} inputMode="decimal" value={parts} onChange={(e) => setParts(e.target.value)} /></div>
    </div>
    {reportedParts.length > 0 && (
      <div className="rounded-md border p-2 text-sm">
        <p className="mb-1 text-xs text-muted-foreground">Peças informadas pelo técnico</p>
        <ul className="grid gap-0.5">{reportedParts.map((p, i) => <li key={i} className="flex justify-between gap-2"><span className="min-w-0 break-words">{p.description}</span><span>{formatBRL(p.cents)}</span></li>)}</ul>
      </div>
    )}
    <dl className="grid gap-2 border-y py-3 text-sm">
      <div className="flex justify-between gap-2"><dt>Total cobrado (referência)</dt><dd className="font-semibold">{preview ? formatBRL(preview.totalCents) : "—"}</dd></div>
      <div className="flex justify-between gap-2"><dt>− Peças</dt><dd className="font-semibold">{preview ? formatBRL(preview.partsCents) : "—"}</dd></div>
      <div className="flex justify-between gap-2"><dt>= Mão de obra</dt><dd className="font-semibold">{preview ? formatBRL(preview.laborCents) : "—"}</dd></div>
      <div className="flex justify-between gap-2"><dt>Técnico ({rule?.technicianPercent ?? 50}%)</dt><dd className="font-semibold">{preview ? formatBRL(preview.technicianShareCents) : "—"}</dd></div>
      <div className="flex justify-between gap-2"><dt>MaqnoLar ({rule?.companyPercent ?? 50}%) — entra em Receitas</dt><dd className="font-semibold">{preview ? formatBRL(preview.companyShareCents) : "—"}</dd></div>
    </dl>
    <p className="text-xs text-muted-foreground">Ao confirmar, a OS é finalizada como serviço. Somente a parte da MaqnoLar vira receita; nenhum recebimento ou repasse é registrado.</p>
    {validationError && <p role="alert" className="text-sm text-destructive">{validationError}</p>}
    {ruleError && <p role="alert" className="text-sm text-destructive">Não foi possível consultar a regra de divisão.</p>}
    {correction && <div className="grid gap-1.5"><Label htmlFor={`reason-${orderId}`}>Justificativa da correção</Label><Textarea id={`reason-${orderId}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>}
    <Button type="submit" disabled={mutation.isPending || !canSubmit}>{mutation.isPending ? "Confirmando…" : correction ? "Confirmar correção" : "Confirmar e finalizar"}</Button>
  </form>;
}

/** Confirmação de "somente visita": usa a regra fixa vigente (padrão R$ 30 = R$ 20 técnico / R$ 10 MaqnoLar). */
function VisitConfirmForm({ orderId, onDone }: { orderId: string; onDone: () => Promise<void> }) {
  const confirm = useServerFn(confirmVisitComposition);
  const queryClient = useQueryClient();
  const { data: rule, isPending: rulePending, isError: ruleError } = useQuery({
    queryKey: ["visit-split-rule"],
    staleTime: 0,
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase.from("split_rules").select("technician_fixed_cents, company_fixed_cents").eq("kind", "visita").lte("valid_from", now).or(`valid_until.is.null,valid_until.gt.${now}`).order("valid_from", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return { technicianFixedCents: data?.technician_fixed_cents ?? null, companyFixedCents: data?.company_fixed_cents ?? null };
    },
  });
  const preview = visitCompositionPreview(rule);
  const mutation = useMutation({
    mutationFn: () => confirm({ data: { orderId } }),
    onSuccess: async () => { toast.success("Visita confirmada."); await onDone(); await queryClient.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível confirmar."),
  });
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">O técnico marcou somente visita realizada. A confirmação aplica a regra de visita vigente e finaliza o atendimento, sem gerar recebimentos ou repasses automáticos.</p>
      <dl className="grid gap-2 border-y py-3 text-sm">
        <div className="flex justify-between gap-2"><dt>Valor da visita</dt><dd className="font-semibold">{formatBRL(preview.totalCents)}</dd></div>
        <div className="flex justify-between gap-2"><dt>Técnico</dt><dd className="font-semibold">{formatBRL(preview.technicianShareCents)}</dd></div>
        <div className="flex justify-between gap-2"><dt>MaqnoLar</dt><dd className="font-semibold">{formatBRL(preview.companyShareCents)}</dd></div>
      </dl>
      {ruleError && <p role="alert" className="text-sm text-destructive">Não foi possível consultar a regra de visita.</p>}
      <Button disabled={mutation.isPending || rulePending || ruleError} onClick={() => mutation.mutate()}>{mutation.isPending ? "Confirmando…" : "Confirmar"}</Button>
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
