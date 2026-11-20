import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Download, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
import { formatISODate } from "@/components/finance-shared";
import { deliverFile } from "@/lib/report-export";
import { PAYMENT_METHODS, buildWarrantyPdf, warrantyEnd, type WarrantyNote } from "@/lib/warranty-note";
import { initialWarrantyNoteDays } from "@/lib/technician-service";

export const warrantyNoteQuery = (orderId: string) => ({
  queryKey: ["warranty-note", orderId],
  queryFn: async () => {
    const { data, error } = await supabase.from("warranty_notes").select("*").eq("order_id", orderId).maybeSingle();
    if (error) throw error;
    return (data as WarrantyNote | null) ?? null;
  },
});

export type EligibleOrder = { id: string; code: string; status: string; financial_confirmed_at: string | null; reported_problem: string | null; completed_at: string | null; kind: string | null; offered_warranty_days?: number | null };
/** Somente serviço finalizado pelo admin (nunca "somente visita"). */
export const canIssueWarranty = (o: Pick<EligibleOrder, "status" | "financial_confirmed_at" | "kind">) =>
  o.status === "finalizado" && Boolean(o.financial_confirmed_at) && o.kind === "servico";

async function openPdf(n: WarrantyNote, download: boolean) {
  const blob = await buildWarrantyPdf(n);
  if (download) deliverFile(blob, `nota-de-servico-${n.number}.pdf`);
  else window.open(URL.createObjectURL(blob), "_blank");
}

export function WarrantyNoteActions({ order, size = "sm" }: { order: EligibleOrder; size?: "sm" | "default" }) {
  const { data: note } = useQuery(warrantyNoteQuery(order.id));
  const [open, setOpen] = useState(false);
  if (note) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size={size} variant="outline" onClick={() => openPdf(note, false)}><FileText className="mr-1 h-4 w-4" />Ver nota</Button>
        <Button size={size} variant="outline" onClick={() => openPdf(note, true)}><Download className="mr-1 h-4 w-4" />Baixar PDF</Button>
      </div>
    );
  }
  if (!canIssueWarranty(order)) return null;
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}><ShieldCheck className="mr-1 h-4 w-4" />Emitir nota de garantia</Button>
      <IssueDialog key={`${order.id}-${open}`} order={order} open={open} onOpenChange={setOpen} />
    </>
  );
}

function IssueDialog({ order, open, onOpenChange }: { order: EligibleOrder; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
  const [desc, setDesc] = useState(order.reported_problem ?? "");
  const [method, setMethod] = useState("Pix");
  const [inst, setInst] = useState("1");
  const [days, setDays] = useState(() => initialWarrantyNoteDays(order.offered_warranty_days));
  const [start, setStart] = useState(order.completed_at ? order.completed_at.slice(0, 10) : today);
  const [obs, setObs] = useState("");
  const d = Number(days);
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("issue_warranty_note", {
        _order: order.id, _description: desc, _payment_method: method,
        _installments: method === "Cartão de crédito" ? Number(inst) || 1 : 1,
        _warranty_days: d, _warranty_start: start, _observations: obs,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Nota de garantia emitida.");
      await qc.invalidateQueries({ queryKey: ["warranty-note", order.id] });
      await qc.invalidateQueries({ queryKey: ["warranty-notes"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Nota de garantia — {order.code}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">Cliente, endereço, equipamento, peças, técnico e total cobrado vêm da OS. O único valor no PDF é o total cobrado.</p>
          <div className="grid gap-1.5"><Label>Descrição do serviço</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Forma de pagamento</Label>
              <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
            </div>
            {method === "Cartão de crédito" && (
              <div className="grid gap-1.5"><Label>Parcelas</Label><Input type="number" inputMode="numeric" min={1} max={36} value={inst} onChange={(e) => setInst(e.target.value)} /></div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Garantia (dias)</Label><Input type="number" inputMode="numeric" min={1} value={days} onChange={(e) => setDays(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Início</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          </div>
          <p className="text-sm">Válida até: <strong>{d > 0 && start ? formatISODate(warrantyEnd(start, d)) : "—"}</strong></p>
          <div className="grid gap-1.5"><Label>Observações</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
          <p className="text-xs text-muted-foreground">Depois de emitida, a nota não pode ser alterada.</p>
          <Button disabled={mut.isPending || !desc.trim() || !(d > 0) || !start} onClick={() => mut.mutate()}>Emitir nota</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { formatBRL };
