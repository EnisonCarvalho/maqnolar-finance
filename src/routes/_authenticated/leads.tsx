import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightCircle, Pencil, PencilLine, Plus, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_ORIGINS, LEAD_STATUSES } from "@/lib/lead-math";
import { saveLead, convertLead, findCustomerMatches, saveLostReason } from "@/lib/leads.functions";
import { equipmentTypesQuery, techniciansQuery } from "@/lib/orders-queries";
import { PeriodFilter, usePeriod } from "@/components/finance-ui";
import { OriginFields, OriginCorrectionDialog, CorrectionsList, campaignsLiteQuery, campaignLabel, originText } from "@/components/lead-ui";
import { useSession } from "@/hooks/use-session";
import { NoAccess } from "@/components/no-access";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({
    meta: [
      { title: "Leads — MaqnoLar Financeiro" },
      { name: "description", content: "Registro de leads, origem por campanha e conversão em atendimentos da MaqnoLar." },
      { property: "og:title", content: "Leads — MaqnoLar Financeiro" },
      { property: "og:description", content: "Registro de leads, origem por campanha e conversão em atendimentos da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { novo: "outline", em_contato: "outline", agendado: "default", convertido: "secondary", perdido: "destructive" };

type Lead = {
  id: string; full_name: string; phone: string | null; contacted_at: string; service_id: string | null; equipment_type_id: string | null; interest_label: string | null;
  origin: string; campaign_id: string | null; creative_code: string | null; bairro: string | null; cidade: string | null; notes: string | null; status: string;
  lost_reason_id: string | null; lost_notes: string | null; customer_id: string | null; order_id: string | null; converted_at: string | null;
  service_orders: { code: string } | null;
};
type Reason = { id: string; name: string; sort_order: number; active: boolean };

const reasonsQuery = { queryKey: ["lead-lost-reasons"], queryFn: async (): Promise<Reason[]> => {
  const { data, error } = await supabase.from("lead_lost_reasons").select("*").order("sort_order").order("name");
  if (error) throw error;
  return data ?? [];
} };
const servicesQuery = { queryKey: ["services-lite"], queryFn: async () => {
  const { data, error } = await supabase.from("services").select("id, name, active").order("name");
  if (error) throw error;
  return data ?? [];
} };
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
function toLocalInput(iso: string) {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Page() {
  const { data: session } = useSession();
  if (session && !session.isAdmin) return <NoAccess />;
  return <Content />;
}

function Content() {
  const qc = useQueryClient();
  const period = usePeriod("mes");
  const { start, end } = period.range;
  const { data: campaigns } = useQuery(campaignsLiteQuery);
  const { data: services } = useQuery(servicesQuery);
  const { data: equipment } = useQuery(equipmentTypesQuery);
  const { data: reasons } = useQuery(reasonsQuery);
  const { data: leads } = useQuery({
    queryKey: ["leads", start, end],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase.from("leads").select("*, service_orders!leads_order_id_fkey(code)")
        .gte("contacted_at", `${start}T00:00:00-03:00`).lte("contacted_at", `${end}T23:59:59.999-03:00`).order("contacted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Lead[];
    },
  });
  const [origin, setOrigin] = useState("todas");
  const [campaign, setCampaign] = useState("todas");
  const [status, setStatus] = useState("todos");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Lead | "new" | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const refresh = () => Promise.all(["leads", "campaign-leads", "service-orders", "customers"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const interest = (l: Lead) => services?.find((s) => s.id === l.service_id)?.name ?? equipment?.find((e) => e.id === l.equipment_type_id)?.name ?? l.interest_label ?? "—";
  const list = (leads ?? []).filter((l) =>
    (origin === "todas" || l.origin === origin) && (campaign === "todas" || (campaign === "none" ? !l.campaign_id : l.campaign_id === campaign)) &&
    (status === "todos" || l.status === status) &&
    (!search.trim() || `${l.full_name} ${l.phone ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())));
  const detail = leads?.find((l) => l.id === detailId) ?? null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold md:text-3xl">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Interessados e a campanha que os trouxe, do primeiro contato até o atendimento.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" />Novo lead</Button>
      </div>
      <Tabs defaultValue="leads" className="grid gap-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="motivos">Motivos de perda</TabsTrigger>
        </TabsList>
        <TabsContent value="leads" className="grid gap-4">
          <PeriodFilter period={period} />
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            {Object.entries(LEAD_STATUSES).map(([k, v]) => (
              <Card key={k} className={k === "perdido" ? "col-span-2 lg:col-span-1" : ""}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{v}</p>
                <p className="font-display text-xl font-semibold">{(leads ?? []).filter((l) => l.status === k).length}</p></CardContent></Card>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Input className="col-span-2 lg:col-span-1" placeholder="Buscar nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={origin} onValueChange={setOrigin}><SelectTrigger aria-label="Origem"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todas">Todas as origens</SelectItem>{Object.entries(LEAD_ORIGINS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos os status</SelectItem>{Object.entries(LEAD_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            <Select value={campaign} onValueChange={setCampaign}><SelectTrigger aria-label="Campanha" className="col-span-2 lg:col-span-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todas">Todas as campanhas</SelectItem><SelectItem value="none">Sem campanha</SelectItem>{(campaigns ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{campaignLabel(c)}</SelectItem>)}</SelectContent></Select>
          </div>
          {list.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhum lead no período e filtros selecionados.</CardContent></Card>
          ) : (
            <>
              <div className="grid gap-2 md:hidden">
                {list.map((l) => (
                  <button key={l.id} type="button" onClick={() => setDetailId(l.id)} className="rounded-lg border bg-card p-3 text-left active:bg-muted">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate font-medium">{l.full_name}</p><p className="text-xs text-muted-foreground">{l.phone ?? "sem telefone"} · {interest(l)}</p></div>
                      <Badge variant={VARIANT[l.status]}>{LEAD_STATUSES[l.status]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{dt(l.contacted_at)} · {originText(l.origin, l.campaign_id, campaigns)}</p>
                    {l.service_orders && <p className="mt-1 text-xs font-medium text-primary">Atendimento {l.service_orders.code}</p>}
                  </button>
                ))}
              </div>
              <div className="hidden overflow-x-auto rounded-lg border md:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr><th className="p-2">Contato</th><th className="p-2">Interessado</th><th className="p-2">Interesse</th><th className="p-2">Origem</th><th className="p-2">Status</th><th className="p-2">Atendimento</th><th className="p-2" /></tr>
                  </thead>
                  <tbody>
                    {list.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="p-2 whitespace-nowrap">{dt(l.contacted_at)}</td>
                        <td className="p-2"><p className="font-medium">{l.full_name}</p><p className="text-xs text-muted-foreground">{l.phone ?? "—"}</p></td>
                        <td className="p-2">{interest(l)}</td>
                        <td className="p-2">{originText(l.origin, l.campaign_id, campaigns)}</td>
                        <td className="p-2"><Badge variant={VARIANT[l.status]}>{LEAD_STATUSES[l.status]}</Badge></td>
                        <td className="p-2">{l.service_orders?.code ?? "—"}</td>
                        <td className="p-2 text-right"><Button size="sm" variant="outline" onClick={() => setDetailId(l.id)}>Detalhes</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="motivos"><ReasonsTab reasons={reasons ?? []} onSaved={() => qc.invalidateQueries({ queryKey: ["lead-lost-reasons"] })} /></TabsContent>
      </Tabs>
      {editing && <LeadForm initial={editing === "new" ? null : editing} reasons={reasons ?? []} services={services ?? []} equipment={equipment ?? []} onClose={() => setEditing(null)} onSaved={refresh} />}
      {detail && <LeadDetail lead={detail} interest={interest(detail)} reasons={reasons ?? []} onClose={() => setDetailId(null)} onEdit={() => setEditing(detail)} onChanged={refresh} />}
    </div>
  );
}

function LeadForm({ initial, reasons, services, equipment, onClose, onSaved }: { initial: Lead | null; reasons: Reason[]; services: { id: string; name: string; active: boolean }[]; equipment: { id: string; name: string }[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [f, setF] = useState({
    fullName: initial?.full_name ?? "", phone: initial?.phone ?? "", contactedAt: toLocalInput(initial?.contacted_at ?? new Date().toISOString()),
    interest: initial?.service_id ? `s:${initial.service_id}` : initial?.equipment_type_id ? `e:${initial.equipment_type_id}` : "none", interestLabel: initial?.interest_label ?? "",
    bairro: initial?.bairro ?? "", cidade: initial?.cidade ?? "", notes: initial?.notes ?? "", status: initial?.status ?? "novo", lostReasonId: initial?.lost_reason_id ?? "", lostNotes: initial?.lost_notes ?? "",
  });
  const [origin, setOrigin] = useState({ origin: initial?.origin ?? "meta_ads", campaignId: initial?.campaign_id ?? "", creativeCode: initial?.creative_code ?? "" });
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const submit = async () => {
    setPending(true);
    try {
      await saveLead({ data: {
        id: initial?.id ?? null, fullName: f.fullName, phone: f.phone, contactedAt: new Date(f.contactedAt).toISOString(),
        serviceId: f.interest.startsWith("s:") ? f.interest.slice(2) : null, equipmentTypeId: f.interest.startsWith("e:") ? f.interest.slice(2) : null, interestLabel: f.interestLabel,
        origin: origin.origin, campaignId: origin.campaignId || null, creativeCode: origin.creativeCode, bairro: f.bairro, cidade: f.cidade, notes: f.notes,
        status: f.status, lostReasonId: f.lostReasonId || null, lostNotes: f.lostNotes,
      } });
      toast.success(initial ? "Lead atualizado." : "Lead cadastrado.");
      await onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setPending(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{initial ? "Editar lead" : "Novo lead"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Nome do interessado *</Label><Input value={f.fullName} onChange={(e) => set("fullName")(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Telefone/WhatsApp</Label><Input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="(85) 9…" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Data e hora do contato *</Label><Input type="datetime-local" value={f.contactedAt} onChange={(e) => set("contactedAt")(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Serviço ou equipamento</Label>
              <Select value={f.interest} onValueChange={set("interest")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Não informado / outro</SelectItem>
                  {services.filter((s) => s.active).map((s) => <SelectItem key={s.id} value={`s:${s.id}`}>{s.name}</SelectItem>)}
                  {equipment.map((e) => <SelectItem key={e.id} value={`e:${e.id}`}>Equipamento: {e.name}</SelectItem>)}
                </SelectContent></Select></div>
          </div>
          {f.interest === "none" && <div className="grid gap-1.5"><Label>Interesse (texto livre)</Label><Input value={f.interestLabel} onChange={(e) => set("interestLabel")(e.target.value)} /></div>}
          {initial ? (
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">Origem: use “Corrigir origem” nos detalhes do lead (fica registrado com justificativa).</p>
          ) : <OriginFields value={origin} onChange={setOrigin} />}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Bairro</Label><Input value={f.bairro} onChange={(e) => set("bairro")(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Cidade</Label><Input value={f.cidade} onChange={(e) => set("cidade")(e.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Status</Label>
              <Select value={f.status} onValueChange={set("status")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(LEAD_STATUSES).filter(([k]) => k !== "convertido").map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
            {f.status === "perdido" && (
              <div className="grid gap-1.5"><Label>Motivo da perda *</Label>
                <Select value={f.lostReasonId} onValueChange={set("lostReasonId")}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{reasons.filter((r) => r.active || r.id === f.lostReasonId).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select></div>
            )}
          </div>
          {f.status === "perdido" && <div className="grid gap-1.5"><Label>Detalhe da perda</Label><Input value={f.lostNotes} onChange={(e) => set("lostNotes")(e.target.value)} /></div>}
          <div className="grid gap-1.5"><Label>Observações</Label><Textarea rows={2} value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={pending} onClick={submit}>Salvar</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeadDetail({ lead: l, interest, reasons, onClose, onEdit, onChanged }: { lead: Lead; interest: string; reasons: Reason[]; onClose: () => void; onEdit: () => void; onChanged: () => Promise<unknown> }) {
  const qc = useQueryClient();
  const { data: campaigns } = useQuery(campaignsLiteQuery);
  const [converting, setConverting] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const { data: history } = useQuery({
    queryKey: ["lead-history", l.id, l.status, l.origin, l.campaign_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_audit").select("id, action, old_data, new_data, created_at").eq("record_id", l.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const describe = (h: any) => {
    if (String(h.action).toLowerCase() === "insert") return "Lead cadastrado";
    const o = h.old_data ?? {}, n = h.new_data ?? {};
    if (o.status !== n.status) return n.status === "convertido" ? "Convertido em atendimento" : `Status: ${LEAD_STATUSES[o.status] ?? o.status} → ${LEAD_STATUSES[n.status] ?? n.status}`;
    if (o.origin !== n.origin || o.campaign_id !== n.campaign_id || o.creative_code !== n.creative_code) return "Origem corrigida";
    return "Dados atualizados";
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle className="pr-6">{l.full_name}</DialogTitle></DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><Badge variant={VARIANT[l.status]}>{LEAD_STATUSES[l.status]}</Badge>
            {l.phone && <a className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline" href={`tel:${l.phone}`}><Phone className="h-3.5 w-3.5" />{l.phone}</a>}</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Contato</dt><dd>{dt(l.contacted_at)}</dd>
            <dt className="text-muted-foreground">Interesse</dt><dd>{interest}</dd>
            <dt className="text-muted-foreground">Origem</dt><dd>{originText(l.origin, l.campaign_id, campaigns, l.creative_code)}</dd>
            {(l.bairro || l.cidade) && <><dt className="text-muted-foreground">Local</dt><dd>{[l.bairro, l.cidade].filter(Boolean).join(", ")}</dd></>}
            {l.status === "perdido" && <><dt className="text-muted-foreground">Motivo</dt><dd>{reasons.find((r) => r.id === l.lost_reason_id)?.name}{l.lost_notes ? ` — ${l.lost_notes}` : ""}</dd></>}
            {l.service_orders && <><dt className="text-muted-foreground">Atendimento</dt><dd className="font-medium">{l.service_orders.code} (convertido em {dt(l.converted_at)})</dd></>}
          </dl>
          {l.notes && <p className="whitespace-pre-wrap">{l.notes}</p>}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {!l.order_id && <Button className="col-span-2" onClick={() => setConverting(true)}><ArrowRightCircle className="mr-1 h-4 w-4" />Converter em atendimento</Button>}
            {!l.order_id && <Button variant="outline" onClick={onEdit}><Pencil className="mr-1 h-4 w-4" />Editar</Button>}
            <Button variant="outline" onClick={() => setCorrecting(true)}><PencilLine className="mr-1 h-4 w-4" />Corrigir origem</Button>
          </div>
          <CorrectionsList entityId={l.id} />
          <div className="grid gap-1">
            <h3 className="font-display font-semibold">Histórico</h3>
            {(history ?? []).map((h) => (
              <div key={h.id} className="flex justify-between gap-2 border-b py-1 last:border-0"><span>{describe(h)}</span><span className="shrink-0 text-xs text-muted-foreground">{dt(h.created_at)}</span></div>
            ))}
          </div>
        </div>
        {converting && <ConvertDialog lead={l} onClose={() => setConverting(false)} onDone={onChanged} />}
        {correcting && <OriginCorrectionDialog entityType="lead" id={l.id} current={l} open onClose={() => setCorrecting(false)}
          onSaved={() => Promise.all([onChanged(), qc.invalidateQueries({ queryKey: ["origin-corrections", l.id] })])} />}
      </DialogContent>
    </Dialog>
  );
}

function ConvertDialog({ lead, onClose, onDone }: { lead: Lead; onClose: () => void; onDone: () => Promise<unknown> }) {
  const { data: equipment } = useQuery(equipmentTypesQuery);
  const { data: technicians } = useQuery(techniciansQuery);
  const [matches, setMatches] = useState<{ id: string; full_name: string; phone: string | null; byPhone: boolean; bairro: string | null }[] | null>(null);
  const [customerId, setCustomerId] = useState<string>("new");
  const [problem, setProblem] = useState(lead.interest_label ?? "");
  const [equipmentTypeId, setEquipmentTypeId] = useState(lead.equipment_type_id ?? "");
  const [technicianId, setTechnicianId] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    findCustomerMatches({ data: { leadId: lead.id } }).then((m) => { setMatches(m); if (m[0]?.byPhone) setCustomerId(m[0].id); }).catch(() => setMatches([]));
  }, [lead.id]);
  const submit = async () => {
    setPending(true);
    try {
      const r = await convertLead({ data: { leadId: lead.id, customerId: customerId === "new" ? null : customerId, reportedProblem: problem, equipmentTypeId: equipmentTypeId || null, technicianId: technicianId || null, scheduledStart: scheduled ? new Date(scheduled).toISOString() : null } });
      toast.success(`Atendimento ${r.code} criado${r.reusedCustomer ? " para cliente existente" : " com novo cliente"}.`);
      await onDone(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao converter."); }
    finally { setPending(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Converter em atendimento</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>Cliente</Label>
            {matches === null ? <p className="text-sm text-muted-foreground">Procurando clientes parecidos…</p> : (
              <Select value={customerId} onValueChange={setCustomerId}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Cadastrar novo cliente: {lead.full_name}</SelectItem>
                  {matches.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}{m.phone ? ` · ${m.phone}` : ""}{m.byPhone ? " (mesmo telefone)" : " (mesmo nome)"}</SelectItem>)}
                </SelectContent></Select>
            )}
            {matches && matches.length > 0 && <p className="text-xs text-muted-foreground">Encontramos {matches.length} cliente(s) parecido(s) — use o existente para evitar duplicidade.</p>}
          </div>
          <div className="grid gap-1.5"><Label>Problema relatado *</Label><Textarea rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Equipamento</Label>
              <Select value={equipmentTypeId || "none"} onValueChange={(v) => setEquipmentTypeId(v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Não informado</SelectItem>{(equipment ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-1.5"><Label>Técnico</Label>
              <Select value={technicianId || "none"} onValueChange={(v) => setTechnicianId(v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Sem técnico</SelectItem>{(technicians ?? []).filter((t) => t.active).map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid gap-1.5"><Label>Agendar visita (opcional)</Label><Input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">A origem, a campanha e o criativo do lead ficam gravados no atendimento.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={pending || matches === null} onClick={submit}>Criar atendimento</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReasonsTab({ reasons, onSaved }: { reasons: Reason[]; onSaved: () => Promise<unknown> }) {
  const [name, setName] = useState("");
  const save = async (r: { id?: string; name: string; active: boolean }) => {
    try { await saveLostReason({ data: { id: r.id ?? null, name: r.name, active: r.active } }); await onSaved(); toast.success("Motivo salvo."); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro."); return false; }
  };
  return (
    <div className="grid gap-3 sm:max-w-lg">
      <div className="flex gap-2"><Input placeholder="Novo motivo" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={!name.trim()} onClick={async () => { if (await save({ name, active: true })) setName(""); }}>Adicionar</Button></div>
      {reasons.map((r) => <ReasonRow key={r.id} r={r} onSave={save} />)}
    </div>
  );
}
function ReasonRow({ r, onSave }: { r: Reason; onSave: (r: { id?: string; name: string; active: boolean }) => Promise<boolean> }) {
  const [name, setName] = useState(r.name);
  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== r.name && onSave({ id: r.id, name, active: r.active })} />
      <Switch checked={r.active} onCheckedChange={(v) => onSave({ id: r.id, name: r.name, active: v })} aria-label="Ativo" />
    </div>
  );
}
