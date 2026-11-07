import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import { canEditTechnicianValue } from "@/lib/technician-service";
import { reportTechnicianValue } from "@/lib/technician-service.functions";
import type { OrderRow } from "@/lib/orders-queries";

export function TechnicianValueButton({ order }: { order: OrderRow }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const save = useServerFn(reportTechnicianValue);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => save({ data: { orderId: order.id, valueReais: value } }),
    onSuccess: async () => {
      setOpen(false);
      toast.success("Valor informado registrado.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["service-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["service-order", order.id] }),
      ]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível informar o valor."),
  });
  if (!session?.isTecnico) return null;
  const editable = canEditTechnicianValue(order.status, order.financial_confirmed_at);
  return <>
    <Button className="w-full min-h-11 sm:w-fit" disabled={!editable} onClick={() => {
      setValue(order.technician_reported_cents == null ? "" : (order.technician_reported_cents / 100).toFixed(2).replace(".", ","));
      setOpen(true);
    }}><HandCoins className="mr-2 h-4 w-4" />Informar valor cobrado</Button>
    <Dialog open={open && editable} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Informar valor cobrado · {order.code}</DialogTitle></DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
          <div className="grid gap-1.5">
            <Label htmlFor={`reported-value-${order.id}`}>Total cobrado do cliente (R$)</Label>
            <Input id={`reported-value-${order.id}`} autoFocus inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || !value.trim()}>{mutation.isPending ? "Salvando…" : "Salvar valor informado"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}