import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createOrder, updateOrder } from "@/lib/orders.functions";
import { customersQuery, equipmentTypesQuery, techniciansQuery, type OrderRow } from "@/lib/orders-queries";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: OrderRow | null;
};

export function OrderFormDialog({ open, onOpenChange, order }: Props) {
  const queryClient = useQueryClient();
  const { data: customers } = useQuery(customersQuery);
  const { data: technicians } = useQuery(techniciansQuery);
  const { data: equipmentTypes } = useQuery(equipmentTypesQuery);

  const [customerId, setCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [equipmentTypeId, setEquipmentTypeId] = useState("");
  const [problem, setProblem] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [notes, setNotes] = useState("");
  const [addr, setAddr] = useState({ endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "", ponto_referencia: "" });

  useEffect(() => {
    if (!open) return;
    if (order) {
      setCustomerId(order.customer_id);
      setEquipmentTypeId(order.equipment_type_id ?? "");
      setProblem(order.reported_problem);
      setTechnicianId(order.technician_id ?? "");
      setScheduled(toLocalInput(order.scheduled_start));
      setMinutes(String(order.estimated_minutes));
      setNotes(order.notes ?? "");
      setAddr({
        endereco: order.endereco ?? "", numero: order.numero ?? "", complemento: order.complemento ?? "",
        bairro: order.bairro ?? "", cidade: order.cidade ?? "", estado: order.estado ?? "",
        cep: order.cep ?? "", ponto_referencia: order.ponto_referencia ?? "",
      });
    } else {
      setCustomerId(""); setNewCustomer(false); setNewName(""); setNewPhone(""); setEquipmentTypeId(""); setProblem(""); setTechnicianId("");
      setScheduled(""); setMinutes("60"); setNotes("");
      setAddr({ endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "", ponto_referencia: "" });
    }
  }, [open, order]);

  function fillAddressFromCustomer(id: string) {
    setCustomerId(id);
    const c = customers?.find((x) => x.id === id);
    if (c) {
      setAddr({
        endereco: c.endereco ?? "", numero: c.numero ?? "", complemento: c.complemento ?? "",
        bairro: c.bairro ?? "", cidade: c.cidade ?? "", estado: c.estado ?? "",
        cep: c.cep ?? "", ponto_referencia: c.ponto_referencia ?? "",
      });
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        customerId: !order && newCustomer ? "" : customerId,
        equipmentTypeId: equipmentTypeId || null,
        reportedProblem: problem,
        technicianId: technicianId || null,
        scheduledStart: scheduled ? new Date(scheduled).toISOString() : null,
        estimatedMinutes: Number(minutes) || 60,
        notes,
        ...addr,
      };
      if (order) return updateOrder({ data: { orderId: order.id, ...payload } });
      return createOrder({ data: { ...payload, ...(newCustomer ? { newCustomerName: newName, newCustomerPhone: newPhone } : {}) } });
    },
    onSuccess: async (res) => {
      toast.success(order ? "Atendimento atualizado." : `Atendimento ${"code" in res ? res.code : ""} criado.`);
      await queryClient.invalidateQueries({ queryKey: ["service-orders"] });
      if (order) await queryClient.invalidateQueries({ queryKey: ["service-order", order.id] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const activeTechs = (technicians ?? []).filter((t) => t.active || t.id === technicianId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{order ? `Editar ${order.code}` : "Novo atendimento"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Cliente *</Label>
                {!order && (
                  <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => { setNewCustomer(!newCustomer); setCustomerId(""); }}>
                    {newCustomer ? "Escolher cliente cadastrado" : "Cliente novo? Digitar nome"}
                  </Button>
                )}
              </div>
              {!order && newCustomer ? (
                <div className="grid gap-2">
                  <Input aria-label="Nome do cliente" placeholder="Nome do cliente" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <Input aria-label="Telefone do cliente" placeholder="Telefone (opcional)" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                </div>
              ) : (
              <Select value={customerId} onValueChange={fillAddressFromCustomer}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {(customers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Equipamento</Label>
              <Select value={equipmentTypeId} onValueChange={setEquipmentTypeId}>
                <SelectTrigger><SelectValue placeholder="Selecione o equipamento" /></SelectTrigger>
                <SelectContent>
                  {(equipmentTypes ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Problema relatado *</Label>
            <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={2} placeholder="Ex.: Lavadora não centrifuga" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Técnico responsável</Label>
              <Select value={technicianId} onValueChange={setTechnicianId}>
                <SelectTrigger><SelectValue placeholder="Sem técnico" /></SelectTrigger>
                <SelectContent>
                  {activeTechs.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Data e horário agendados</Label>
              <Input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Duração estimada (min)</Label>
              <Input type="number" inputMode="numeric" min={15} step={15} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          </div>
          <fieldset className="grid gap-3 rounded-md border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">Endereço do atendimento (preenchido com o cadastro do cliente; pode ser ajustado só para este atendimento)</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Endereço</Label>
                <Input value={addr.endereco} onChange={(e) => setAddr({ ...addr, endereco: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Número</Label>
                <Input value={addr.numero} onChange={(e) => setAddr({ ...addr, numero: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Complemento</Label>
                <Input value={addr.complemento} onChange={(e) => setAddr({ ...addr, complemento: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Bairro</Label>
                <Input value={addr.bairro} onChange={(e) => setAddr({ ...addr, bairro: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Cidade</Label>
                <Input value={addr.cidade} onChange={(e) => setAddr({ ...addr, cidade: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Estado</Label>
                <Input maxLength={2} value={addr.estado} onChange={(e) => setAddr({ ...addr, estado: e.target.value.toUpperCase() })} />
              </div>
              <div className="grid gap-1.5">
                <Label>CEP</Label>
                <Input value={addr.cep} onChange={(e) => setAddr({ ...addr, cep: e.target.value })} />
              </div>
              <div className="grid gap-1.5 sm:col-span-3">
                <Label>Ponto de referência</Label>
                <Input value={addr.ponto_referencia} onChange={(e) => setAddr({ ...addr, ponto_referencia: e.target.value })} />
              </div>
            </div>
          </fieldset>
          <div className="grid gap-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || (newCustomer && !order ? !newName.trim() : !customerId) || !problem.trim()}>
              {mutation.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
