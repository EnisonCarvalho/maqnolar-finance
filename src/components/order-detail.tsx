import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { formatBRL, parseBRLToCents, formatDateBR } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, QUOTE_STATUS_LABELS, EVENT_TYPE_LABELS, type OrderStatus } from "@/lib/order-status";
import { orderDetailQuery, type QuoteRow } from "@/lib/orders-queries";
import { OrderFinancials } from "@/components/order-financials";
import { changeOrderStatus, addOrderNote, createQuote, decideQuote, scheduleOrder } from "@/lib/orders.functions";
import { calcQuoteTotals } from "@/lib/quote-math";

function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

type Props = {
  orderId: string | null;
  onClose: () => void;
  isAdmin: boolean;
};

export function OrderDetailSheet({ orderId, onClose, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ ...orderDetailQuery(orderId ?? ""), enabled: Boolean(orderId) });
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [note, setNote] = useState("");
  const [rejectQuote, setRejectQuote] = useState<QuoteRow | null>(null);
  const [billVisit, setBillVisit] = useState(true);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["service-orders"] });
    if (orderId) await queryClient.invalidateQueries({ queryKey: ["service-order", orderId] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: OrderStatus) => changeOrderStatus({ data: { orderId: orderId!, status } }),
    onSuccess: async () => { toast.success("Status atualizado."); await refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível alterar o status."),
  });

  const noteMutation = useMutation({
    mutationFn: () => addOrderNote({ data: { orderId: orderId!, note } }),
    onSuccess: async () => { setNote(""); toast.success("Observação registrada."); await refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível registrar."),
  });

  const decideMutation = useMutation({
    mutationFn: ({ quoteId, decision, bill }: { quoteId: string; decision: "aprovado" | "recusado"; bill: boolean }) =>
      decideQuote({ data: { quoteId, decision, billVisit: bill } }),
    onSuccess: async (_r, v) => {
      toast.success(v.decision === "aprovado" ? "Orçamento aprovado." : "Orçamento recusado.");
      setRejectQuote(null);
      await refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível decidir o orçamento."),
  });

  const order = data?.order;
  const closed = order?.status === "finalizado" || order?.status === "cancelado";

  return (
    <Sheet open={Boolean(orderId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {!order ? (
          <SheetHeader><SheetTitle>Carregando…</SheetTitle></SheetHeader>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {order.code}
                <Badge className={ORDER_STATUS_COLORS[order.status]} variant="secondary">
                  {ORDER_STATUS_LABELS[order.status]}
                </Badge>
              </SheetTitle>
            </SheetHeader>

            <div className="mt-4 grid gap-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground">Cliente</p><p className="font-medium">{order.customers?.full_name ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Telefone</p><p className="font-medium">{order.customers?.phone ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Equipamento</p><p className="font-medium">{order.equipment_types?.name ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Técnico</p><p className="font-medium">{order.technicians?.full_name ?? "Não atribuído"}</p></div>
                <div><p className="text-muted-foreground">Abertura</p><p className="font-medium">{formatDateTimeBR(order.opened_at)}</p></div>
                <div><p className="text-muted-foreground">Execução</p><p className="font-medium">{order.executed_at ? formatDateTimeBR(order.executed_at) : "—"}</p></div>
                <div><p className="text-muted-foreground">Conclusão</p><p className="font-medium">{order.completed_at ? formatDateTimeBR(order.completed_at) : "—"}</p></div>
                <div>
                  <p className="text-muted-foreground">Agendado para</p>
                  <p className="font-medium">{formatDateTimeBR(order.scheduled_start)} ({order.estimated_minutes} min)</p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">Endereço do atendimento</p>
                <p className="font-medium">
                  {[order.endereco, order.numero].filter(Boolean).join(", ") || "—"}
                  {order.complemento ? ` — ${order.complemento}` : ""}
                  {order.bairro ? ` · ${order.bairro}` : ""}
                  {order.cidade ? ` · ${order.cidade}/${order.estado ?? ""}` : ""}
                </p>
                {order.ponto_referencia && <p className="text-xs text-muted-foreground">Ref.: {order.ponto_referencia}</p>}
              </div>
              <div>
                <p className="text-muted-foreground">Problema relatado</p>
                <p>{order.reported_problem}</p>
              </div>
              {order.notes && (
                <div><p className="text-muted-foreground">Observações</p><p>{order.notes}</p></div>
              )}
              {order.visit_billable && (
                <Badge variant="outline" className="w-fit border-amber-500 text-amber-600 dark:text-amber-400">
                  Visita cobrável (R$ 30,00 — R$ 20,00 técnico / R$ 10,00 MaqnoLar)
                </Badge>
              )}

              {isAdmin && !closed && (
                <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                  <div className="grid min-w-48 flex-1 gap-1.5">
                    <Label>Alterar status</Label>
                    <Select onValueChange={(v) => statusMutation.mutate(v as OrderStatus)}>
                      <SelectTrigger><SelectValue placeholder="Escolher novo status" /></SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.filter((s) => s !== order.status).map((s) => (
                          <SelectItem key={s} value={s}>{ORDER_STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" onClick={() => setScheduleOpen(true)}>Agendar / reagendar</Button>
                </div>
              )}

              <Separator />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-display font-semibold">Orçamentos</h3>
                  {isAdmin && !closed && (
                    <Button size="sm" variant="outline" onClick={() => setQuoteOpen(true)}>
                      <Plus className="mr-1 h-4 w-4" /> Novo orçamento
                    </Button>
                  )}
                </div>
                {data!.quotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum orçamento ainda.</p>
                ) : (
                  <div className="grid gap-3">
                    {data!.quotes.map((q) => (
                      <div key={q.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Versão {q.version}</span>
                          <Badge variant="secondary">{QUOTE_STATUS_LABELS[q.status] ?? q.status}</Badge>
                        </div>
                        <p className="mt-1 text-sm">{q.description}</p>
                        {q.quote_parts.length > 0 && (
                          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                            {q.quote_parts.map((p) => (
                              <li key={p.id}>• {p.description} — {p.quantity} × {formatBRL(p.unit_price_cents)} = {formatBRL(p.total_cents)}</li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                          <div><p className="text-xs text-muted-foreground">Mão de obra</p><p className="font-medium">{formatBRL(q.labor_cents)}</p></div>
                          <div><p className="text-xs text-muted-foreground">Peças</p><p className="font-medium">{formatBRL(q.parts_total_cents)}</p></div>
                          <div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold">{formatBRL(q.total_cents)}</p></div>
                        </div>
                        {q.notes && <p className="mt-1 text-xs text-muted-foreground">{q.notes}</p>}
                        {isAdmin && (q.status === "enviado" || q.status === "rascunho") && (
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" onClick={() => decideMutation.mutate({ quoteId: q.id, decision: "aprovado", bill: false })} disabled={decideMutation.isPending}>
                              Aprovar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setRejectQuote(q); setBillVisit(true); }}>
                              Recusar
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isAdmin && (
                <>
                  <Separator />
                  <OrderFinancials orderId={order.id} technicianId={order.technician_id} technicianName={order.technicians?.full_name ?? null} />
                  <Separator />
                  <OrderOrigin orderId={order.id} />
                </>
              )}

              <Separator />

              <div>
                <h3 className="mb-2 font-display font-semibold">Histórico</h3>
                <ol className="relative space-y-3 border-l pl-4">
                  {data!.events.map((ev) => (
                    <li key={ev.id} className="text-sm">
                      <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
                      <p className="font-medium">{EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}</p>
                      <p>{ev.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTimeBR(ev.created_at)}{ev.actor_name ? ` · ${ev.actor_name}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              {!closed && (
                <div className="grid gap-2">
                  <Label>Adicionar observação</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                  <Button variant="outline" className="w-fit" disabled={!note.trim() || noteMutation.isPending} onClick={() => noteMutation.mutate()}>
                    Registrar observação
                  </Button>
                </div>
              )}
            </div>

            <QuoteDialog orderId={order.id} open={quoteOpen} onOpenChange={setQuoteOpen} onDone={refresh} />
            <ScheduleDialog orderId={order.id} open={scheduleOpen} onOpenChange={setScheduleOpen} onDone={refresh} />

            <AlertDialog open={Boolean(rejectQuote)} onOpenChange={(o) => !o && setRejectQuote(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Recusar orçamento v{rejectQuote?.version}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O orçamento será marcado como recusado e o histórico será preservado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={billVisit} onCheckedChange={(v) => setBillVisit(v === true)} />
                  Cobrar taxa de visita (R$ 30,00)
                </label>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => rejectQuote && decideMutation.mutate({ quoteId: rejectQuote.id, decision: "recusado", bill: billVisit })}
                  >
                    Confirmar recusa
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

type PartRow = { description: string; quantity: string; unitPrice: string };

function QuoteDialog({ orderId, open, onOpenChange, onDone }: { orderId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => Promise<void> }) {
  const [description, setDescription] = useState("");
  const [labor, setLabor] = useState("");
  const [parts, setParts] = useState<PartRow[]>([]);
  const [notes, setNotes] = useState("");

  const laborCents = parseBRLToCents(labor) ?? 0;
  const totals = calcQuoteTotals(
    laborCents,
    parts.map((p) => ({ description: p.description, quantity: Number(p.quantity) || 0, unitPriceCents: parseBRLToCents(p.unitPrice) ?? 0 })),
  );

  const mutation = useMutation({
    mutationFn: () =>
      createQuote({
        data: {
          orderId,
          description,
          laborCents,
          parts: parts.map((p) => ({ description: p.description, quantity: Number(p.quantity) || 0, unitPriceCents: parseBRLToCents(p.unitPrice) ?? 0 })),
          notes,
        },
      }),
    onSuccess: async (r) => {
      toast.success(`Orçamento v${r.version} criado e enviado.`);
      setDescription(""); setLabor(""); setParts([]); setNotes("");
      onOpenChange(false);
      await onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível criar o orçamento."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Novo orçamento</DialogTitle></DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        >
          <div className="grid gap-1.5">
            <Label>Descrição do serviço *</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid gap-1.5">
            <Label>Valor da mão de obra (R$)</Label>
            <Input inputMode="decimal" placeholder="600,00" value={labor} onChange={(e) => setLabor(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Peças necessárias</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setParts([...parts, { description: "", quantity: "1", unitPrice: "" }])}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar peça
              </Button>
            </div>
            {parts.map((p, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="grid flex-1 gap-1">
                  <Label className="text-xs">Peça</Label>
                  <Input value={p.description} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                </div>
                <div className="grid w-20 gap-1">
                  <Label className="text-xs">Qtd.</Label>
                  <Input type="number" min={1} step={1} value={p.quantity} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                </div>
                <div className="grid w-28 gap-1">
                  <Label className="text-xs">Unit. (R$)</Label>
                  <Input inputMode="decimal" value={p.unitPrice} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))} />
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => setParts(parts.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Mão de obra</p><p className="font-medium">{formatBRL(laborCents)}</p></div>
            <div><p className="text-xs text-muted-foreground">Peças</p><p className="font-medium">{formatBRL(totals.partsTotalCents)}</p></div>
            <div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold">{formatBRL(totals.totalCents)}</p></div>
          </div>
          <div className="grid gap-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || !description.trim()}>
              {mutation.isPending ? "Salvando…" : "Criar orçamento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ orderId, open, onOpenChange, onDone }: { orderId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => Promise<void> }) {
  const [when, setWhen] = useState("");
  const [minutes, setMinutes] = useState("60");

  const mutation = useMutation({
    mutationFn: () => scheduleOrder({ data: { orderId, scheduledStart: new Date(when).toISOString(), estimatedMinutes: Number(minutes) || 60 } }),
    onSuccess: async () => {
      toast.success("Visita agendada.");
      onOpenChange(false);
      await onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível agendar."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Agendar visita</DialogTitle></DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        >
          <div className="grid gap-1.5">
            <Label>Data e horário *</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Duração estimada (min)</Label>
            <Input type="number" min={15} step={15} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            O sistema bloqueia automaticamente horários que conflitem com outros atendimentos do mesmo técnico.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || !when}>
              {mutation.isPending ? "Agendando…" : "Confirmar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { formatDateTimeBR };
export { formatDateBR as formatOrderDateBR };
