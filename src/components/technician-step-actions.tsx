import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Navigation, Plus, SearchCheck, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import { changeOrderStatus } from "@/lib/orders.functions";
import { completeServiceWithValues } from "@/lib/technician-service.functions";
import { completionPreview, technicianStep } from "@/lib/technician-service";
import { formatBRL } from "@/lib/format";
import type { OrderRow } from "@/lib/orders-queries";
import type { OrderStatus } from "@/lib/order-status";

/** Ações do técnico: somente a etapa atual. Usado no cartão e no detalhe do atendimento. */
export function TechnicianStepActions({ order }: { order: Pick<OrderRow, "id" | "code" | "status"> }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const updateStatus = useServerFn(changeOrderStatus);
  const [completeOpen, setCompleteOpen] = useState(false);
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["service-orders"] }),
    queryClient.invalidateQueries({ queryKey: ["service-order", order.id] }),
  ]);
  const statusMutation = useMutation({
    mutationFn: (status: OrderStatus) => updateStatus({ data: { orderId: order.id, status } }),
    onSuccess: async () => { toast.success("Atualização registrada."); await refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar."),
  });
  if (!session?.isTecnico || session.isAdmin) return null;
  const step = technicianStep(order.status);
  if (!step) return null;
  const busy = statusMutation.isPending;
  return (
    <div className="flex flex-wrap gap-2">
      {step === "a_caminho" && (
        <Button className="min-h-11" disabled={busy} onClick={() => statusMutation.mutate("tecnico_a_caminho")}><Navigation className="mr-1 h-4 w-4" />Estou a caminho</Button>
      )}
      {step === "iniciar" && (
        <Button className="min-h-11" disabled={busy} onClick={() => statusMutation.mutate("servico_em_andamento")}><Wrench className="mr-1 h-4 w-4" />Serviço iniciado</Button>
      )}
      {step === "concluir" && (
        <>
          <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => statusMutation.mutate("visita_concluida")}><SearchCheck className="mr-1 h-4 w-4" />Somente visita realizada</Button>
          <Button className="min-h-11" disabled={busy} onClick={() => setCompleteOpen(true)}><CheckCircle2 className="mr-1 h-4 w-4" />Serviço concluído</Button>
          <CompleteServiceDialog order={order} open={completeOpen} onOpenChange={setCompleteOpen} onDone={refresh} />
        </>
      )}
    </div>
  );
}

function CompleteServiceDialog({ order, open, onOpenChange, onDone }: { order: Pick<OrderRow, "id" | "code">; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => Promise<unknown> }) {
  const [total, setTotal] = useState("");
  const [parts, setParts] = useState<{ description: string; valueReais: string }[]>([]);
  const complete = useServerFn(completeServiceWithValues);
  let preview: ReturnType<typeof completionPreview> | null = null;
  let previewError = "";
  try { if (total.trim()) preview = completionPreview(total, parts.filter((p) => p.description.trim() || p.valueReais.trim())); } catch (e) { previewError = e instanceof Error ? e.message : "Valores inválidos."; }
  const mutation = useMutation({
    mutationFn: () => complete({ data: { orderId: order.id, totalReais: total, parts } }),
    onSuccess: async () => { toast.success("Serviço concluído e valores enviados para conferência."); onOpenChange(false); setTotal(""); setParts([]); await onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível concluir. O serviço continua iniciado."),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!mutation.isPending) onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Concluir serviço · {order.code}</DialogTitle>
          <DialogDescription>O total cobrado já inclui as peças. Nenhum pagamento ou repasse é gerado; o administrador confere os valores.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
          <div className="grid gap-1.5">
            <Label htmlFor={`complete-total-${order.id}`}>Valor total cobrado do cliente (R$)</Label>
            <Input id={`complete-total-${order.id}`} autoFocus inputMode="decimal" placeholder="150,00" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <p className="text-sm font-medium">Peças trocadas (opcional)</p>
            {parts.map((p, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-center gap-2">
                <Input aria-label={`Descrição da peça ${i + 1}`} placeholder="Nome da peça" value={p.description} onChange={(e) => setParts(parts.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                <Input aria-label={`Valor da peça ${i + 1}`} inputMode="decimal" placeholder="0,00" value={p.valueReais} onChange={(e) => setParts(parts.map((x, j) => j === i ? { ...x, valueReais: e.target.value } : x))} />
                <Button type="button" size="icon" variant="ghost" aria-label="Remover peça" onClick={() => setParts(parts.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" className="w-fit" onClick={() => setParts([...parts, { description: "", valueReais: "" }])}><Plus className="mr-1 h-4 w-4" />Adicionar peça</Button>
          </div>
          <div className="rounded-md border p-3 text-sm">
            {preview ? (
              <>
                <p className="flex justify-between"><span>Soma das peças</span><span className="font-medium">{formatBRL(preview.partsCents)}</span></p>
                <p className="flex justify-between"><span>Total cobrado</span><span className="font-semibold">{formatBRL(preview.totalCents)}</span></p>
              </>
            ) : <p className={previewError ? "text-destructive" : "text-muted-foreground"}>{previewError || "Informe o valor total cobrado."}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || !preview}>{mutation.isPending ? "Salvando…" : "Confirmar conclusão"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
