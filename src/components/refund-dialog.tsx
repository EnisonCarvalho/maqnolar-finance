import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL, parseBRLToCents } from "@/lib/format";

/** Devolução total ou parcial de um pagamento/recebimento ativo, com motivo obrigatório. */
export function RefundDialog({ target, title, onClose, onConfirm }: {
  target: { id: string; amountCents: number; label?: string } | null;
  title: string;
  onClose: () => void;
  onConfirm: (refundCents: number, reason: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);
  if (target && target.id !== loaded) { setLoaded(target.id); setAmount((target.amountCents / 100).toFixed(2).replace(".", ",")); setReason(""); }
  const close = () => { setLoaded(null); onClose(); };
  const cents = parseBRLToCents(amount) ?? 0;
  const valid = target && cents > 0 && cents <= target.amountCents && reason.trim();
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="grid gap-3 text-sm">
          <p>{target?.label ? `${target.label} · ` : ""}Valor pago: <strong>{formatBRL(target?.amountCents ?? 0)}</strong>. O lançamento original fica no histórico como estornado e só o saldo restante continua valendo.</p>
          <div className="grid gap-1.5"><Label>Valor devolvido (R$) *</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          {target && cents > 0 && cents <= target.amountCents && <p className="text-xs text-muted-foreground">{cents === target.amountCents ? "Devolução total." : `Devolução parcial — continua valendo ${formatBRL(target.amountCents - cents)}.`}</p>}
          <div className="grid gap-1.5"><Label>Motivo *</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>Voltar</Button>
            <Button variant="destructive" disabled={!valid || pending} onClick={async () => {
              setPending(true);
              try { await onConfirm(cents, reason); toast.success("Devolução registrada."); close(); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível registrar."); }
              finally { setPending(false); }
            }}>{pending ? "Salvando…" : "Registrar devolução"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
