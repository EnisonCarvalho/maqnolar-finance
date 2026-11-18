import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getResetPreview, resetOperation } from "@/lib/operation-reset.functions";

const LABELS: [string, string][] = [
  ["customers", "Clientes ativos"],
  ["orders", "Atendimentos (OS)"],
  ["financial_compositions", "Apurações de OS"],
  ["customer_payments", "Recebimentos de clientes"],
  ["technician_transfers", "Repasses a técnicos"],
  ["other_revenues", "Receitas manuais"],
  ["expenses", "Despesas"],
  ["expense_payments", "Pagamentos de despesas"],
  ["account_transfers", "Transferências entre contas"],
  ["partner_movements", "Movimentos de sócios"],
  ["distributions", "Distribuições de lucro"],
  ["distribution_payments", "Pagamentos de distribuição"],
  ["campaign_allocations", "Rateios de campanha"],
];

/** Reiniciar operação: somente admin; mostra contagens e exige motivo + digitar REINICIAR. */
export function OperationResetCard() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const qc = useQueryClient();
  const previewFn = useServerFn(getResetPreview);
  const resetFn = useServerFn(resetOperation);
  const { data, isFetching, refetch } = useQuery({ queryKey: ["reset-preview"], queryFn: () => previewFn(), enabled: open, staleTime: 0 });
  const closed = (data?.["closed_months"] ?? 0) > 0;
  const close = () => { setOpen(false); setReason(""); setConfirmation(""); };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reiniciar operação</CardTitle>
        <CardDescription>Tira clientes e OS das listas ativas e zera saldos, indicadores e pendências da operação atual. Usuários, técnicos, permissões, catálogo, regras de divisão e auditoria são preservados. Nada é apagado.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" className="w-full sm:w-auto" onClick={() => { setOpen(true); void refetch(); }}><RotateCcw className="mr-2 h-4 w-4" />Reiniciar operação</Button>
      </CardContent>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>Reiniciar operação</DialogTitle></DialogHeader>
          {isFetching || !data ? <p className="text-sm text-muted-foreground">Contando registros…</p> : (
            <div className="grid gap-3 text-sm">
              <p>Serão afetados:</p>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-md border p-3">
                {LABELS.map(([k, l]) => <div key={k} className="contents"><dt>{l}</dt><dd className="text-right font-semibold">{data[k] ?? 0}</dd></div>)}
              </dl>
              {closed && <p role="alert" className="text-destructive">Há {data["closed_months"]} mês(es) fechado(s). Reabra-os em Fluxo de caixa antes de reiniciar.</p>}
              <div className="grid gap-1.5"><Label htmlFor="reset-reason">Motivo *</Label><Textarea id="reset-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label htmlFor="reset-confirm">Digite REINICIAR para confirmar *</Label><Input id="reset-confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={close}>Voltar</Button>
                <Button variant="destructive" disabled={pending || closed || reason.trim().length < 3 || confirmation.trim().toUpperCase() !== "REINICIAR"} onClick={async () => {
                  setPending(true);
                  try { await resetFn({ data: { reason, confirmation } }); toast.success("Operação reiniciada. O financeiro começa em R$ 0,00."); close(); await qc.invalidateQueries(); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível reiniciar."); }
                  finally { setPending(false); }
                }}>{pending ? "Reiniciando…" : "Confirmar reinício"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
