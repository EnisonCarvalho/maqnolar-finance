import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createOrder, updateOrder, correctConfirmedOrder } from "@/lib/orders.functions";
import { customersQuery, equipmentTypesQuery, techniciansQuery, orderFinancialsQuery, type OrderRow } from "@/lib/orders-queries";
import { completionPreview } from "@/lib/technician-service";
import { splitLabor } from "@/lib/settlement-math";
import { formatBRL } from "@/lib/format";
import { warrantyNoteQuery } from "@/components/warranty-note-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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
  const confirmedEdit = Boolean(order?.financial_confirmed_at && ["finalizado", "visita_concluida"].includes(order.status));
  const saveCorrection = useServerFn(correctConfirmedOrder);
  const { data: financialData } = useQuery({ ...orderFinancialsQuery(order?.id ?? ""), enabled: open && confirmedEdit });
  const { data: warrantyNote } = useQuery({ ...warrantyNoteQuery(order?.id ?? ""), enabled: open && confirmedEdit });
  const [totalReais, setTotalReais] = useState("");
  const [parts, setParts] = useState<{ description: string; valueReais: string }[]>([]);
  const [serviceDescription, setServiceDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [warrantyDays, setWarrantyDays] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

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
      setNewCustomer(false);
      setCustomerName(order.customers?.full_name ?? "");
      setCustomerPhone(order.customers?.phone ?? "");
      setServiceDescription(order.service_description ?? order.reported_problem);
      setWarrantyDays(order.offered_warranty_days == null ? "" : String(order.offered_warranty_days));
      setReason(""); setConfirmOpen(false);
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

  useEffect(() => {
    if (!open || !confirmedEdit || !order || !financialData?.financial) return;
    const f = financialData.financial;
    setTotalReais((f.total_cents / 100).toFixed(2).replace(".", ","));
    const raw = order.corrected_parts ?? order.technician_reported_parts;
    const saved = Array.isArray(raw) ? raw as { description: string; cents: number }[] : [];
    const source = saved.reduce((s, p) => s + p.cents, 0) === f.parts_estimated_cents ? saved :
      f.parts_estimated_cents > 0 ? [{ description: "Peças do serviço", cents: f.parts_estimated_cents }] : [];
    setParts(source.map((p) => ({ description: p.description, valueReais: (p.cents / 100).toFixed(2).replace(".", ",") })));
  }, [open, confirmedEdit, order, financialData]);

  useEffect(() => {
    if (open && confirmedEdit && !order?.service_description && warrantyNote) setServiceDescription(warrantyNote.service_description);
  }, [open, confirmedEdit, order?.service_description, warrantyNote]);

  function fillAddressFromCustomer(id: string) {
    setCustomerId(id);
    const c = customers?.find((x) => x.id === id);
    if (c) {
      setCustomerName(c.full_name); setCustomerPhone(c.phone ?? "");
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
      if (order && confirmedEdit) return saveCorrection({ data: {
        ...payload, orderId: order.id, expectedUpdatedAt: order.updated_at,
        customerName, customerPhone, serviceDescription, totalReais, parts, warrantyDays, reason,
      } });
      if (order) return updateOrder({ data: { orderId: order.id, ...payload } });
      return createOrder({ data: { ...payload, ...(newCustomer ? { newCustomerName: newName, newCustomerPhone: newPhone } : {}) } });
    },
    onSuccess: async (res) => {
      toast.success(order ? "Atendimento atualizado." : `Atendimento ${"code" in res ? res.code : ""} criado.`);
      await queryClient.invalidateQueries();
      setConfirmOpen(false);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const activeTechs = (technicians ?? []).filter((t) => t.active || t.id === technicianId);
  let preview: ReturnType<typeof completionPreview> | null = null;
  let previewError = "";
  if (confirmedEdit) {
    try { preview = completionPreview(totalReais, parts, warrantyDays); }
    catch (e) { previewError = e instanceof Error ? e.message : "Valores inválidos."; }
  }
  const f = financialData?.financial;
  const shares = preview && f ? splitLabor(preview.totalCents - preview.partsCents, {
    technicianPercent: f.rule_technician_percent, companyPercent: f.rule_company_percent,
    technicianFixedCents: f.kind === "visita" ? f.rule_technician_fixed_cents : null,
    companyFixedCents: f.kind === "visita" ? f.rule_company_fixed_cents : null,
  }) : null;

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
            if (confirmedEdit) setConfirmOpen(true); else mutation.mutate();
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
              {confirmedEdit && <>
                <Label htmlFor="correct-customer-name">Nome do cliente</Label>
                <Input id="correct-customer-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                <Label htmlFor="correct-customer-phone">Telefone do cliente</Label>
                <Input id="correct-customer-phone" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </>}
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
          {!confirmedEdit && <div className="grid gap-4 sm:grid-cols-3">
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
          </div>}
          {confirmedEdit && <section className="grid gap-3 border-t pt-3">
            <div className="grid gap-1.5"><Label htmlFor="correct-service">Descrição do serviço</Label><Textarea id="correct-service" value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="correct-total">Valor total cobrado (R$)</Label><Input id="correct-total" inputMode="decimal" value={totalReais} onChange={(e) => setTotalReais(e.target.value)} /></div>
            <div className="flex items-center justify-between"><Label>Peças e valores</Label><Button type="button" size="icon" variant="outline" aria-label="Adicionar peça" onClick={() => setParts([...parts, { description: "", valueReais: "" }])}><Plus className="h-4 w-4" /></Button></div>
            {parts.map((part, i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] gap-2">
              <Input aria-label={`Descrição da peça ${i + 1}`} value={part.description} onChange={(e) => setParts(parts.map((p, j) => j === i ? { ...p, description: e.target.value } : p))} />
              <Input aria-label={`Valor da peça ${i + 1}`} inputMode="decimal" value={part.valueReais} onChange={(e) => setParts(parts.map((p, j) => j === i ? { ...p, valueReais: e.target.value } : p))} />
              <Button type="button" size="icon" variant="outline" aria-label={`Remover peça ${i + 1}`} onClick={() => setParts(parts.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>)}
            {preview && shares && <div className="grid gap-1 text-sm"><p>Mão de obra: {formatBRL(preview.totalCents - preview.partsCents)}</p><p>Técnico: {formatBRL(shares.technicianShareCents)} · MAQNOLAR: {formatBRL(shares.companyShareCents)}</p></div>}
            {previewError && <p role="alert" className="text-sm text-destructive">{previewError}</p>}
            {f?.kind !== "visita" && <div className="grid gap-1.5"><Label htmlFor="correct-warranty">Garantia oferecida ao cliente (em dias)</Label><Input id="correct-warranty" type="number" inputMode="numeric" min={1} step={1} placeholder="90 dias" value={warrantyDays} onChange={(e) => setWarrantyDays(e.target.value)} /></div>}
            <div className="grid gap-1.5"><Label htmlFor="correct-reason">Motivo da correção *</Label><Textarea id="correct-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </section>}
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
            <Button type="submit" disabled={mutation.isPending || (newCustomer && !order ? !newName.trim() : !customerId) || !problem.trim() || (confirmedEdit && (!f || !preview || reason.trim().length < 3 || !customerName.trim() || !serviceDescription.trim()))}>
              {mutation.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Confirmar correção de {order?.code}?</AlertDialogTitle><AlertDialogDescription>
              A OS continuará finalizada. Os valores anteriores serão substituídos, sem novos recebimentos ou repasses. O motivo ficará no histórico. Nome e telefone também serão corrigidos no cadastro do cliente.
              {warrantyNote && " A nota manterá o número e terá uma nova versão, preservando a anterior."}
            </AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction disabled={mutation.isPending} onClick={() => mutation.mutate()}>Confirmar correção</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
