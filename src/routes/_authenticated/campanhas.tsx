import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Link2, Pause, Pencil, Play, Plus, Square, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, parseBRLToCents } from "@/lib/format";
import { campaignTotals, expenseAvailable, expensePaid, allocationPaid, overlapsPeriod } from "@/lib/campaign-math";
import { saveCampaign, setCampaignStatus, allocateExpense, removeAllocation } from "@/lib/campaigns.functions";
import { PeriodFilter, ReasonDialog, StatCard, usePeriod } from "@/components/finance-ui";
import { formatISODate, todayISO } from "@/components/finance-shared";
import { campaignLeadStats } from "@/lib/lead-math";
import { CampaignPerformance } from "@/components/campaign-performance";
import { useSession } from "@/hooks/use-session";
import { NoAccess } from "@/components/no-access";

export const Route = createFileRoute("/_authenticated/campanhas")({
  head: () => ({
    meta: [
      { title: "Campanhas — MaqnoLar Financeiro" },
      { name: "description", content: "Cadastro e acompanhamento das campanhas publicitárias da MaqnoLar, com orçamento e investimento." },
      { property: "og:title", content: "Campanhas — MaqnoLar Financeiro" },
      { property: "og:description", content: "Cadastro e acompanhamento das campanhas publicitárias da MaqnoLar, com orçamento e investimento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const PLATFORM: Record<string, string> = { meta_ads: "Meta Ads", google_ads: "Google Ads", outra: "Outra" };
const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  planejada: { label: "Planejada", variant: "outline" },
  ativa: { label: "Ativa", variant: "default" },
  pausada: { label: "Pausada", variant: "destructive" },
  encerrada: { label: "Encerrada", variant: "secondary" },
};

type ExpLite = { id: string; description: string; amount_cents: number; status: string; due_date: string; competence_date: string; expense_payments: { amount_cents: number; status: string }[] };
type AllocRow = { id: string; campaign_id: string; expense_id: string; amount_cents: number; notes: string | null; status: string; remove_reason: string | null; created_at: string; expenses: ExpLite | null };
type Campaign = {
  id: string; name: string; platform: string; platform_label: string | null; external_code: string | null; service_id: string | null; service_label: string | null;
  start_date: string; end_date: string | null; status: string; planned_budget_cents: number; notes: string | null; created_at: string;
  campaign_expense_allocations: AllocRow[];
};

const st = (s: string) => STATUS[s] ?? { label: s, variant: "outline" as const };
const toAlloc = (a: AllocRow) => ({ amount_cents: a.amount_cents, status: a.status, expense: a.expenses ? { amount_cents: a.expenses.amount_cents, status: a.expenses.status, payments: a.expenses.expense_payments } : null });
const platformName = (c: Campaign) => (c.platform === "outra" && c.platform_label ? c.platform_label : PLATFORM[c.platform]);

function Page() {
  const { data: session } = useSession();
  if (session && !session.isAdmin) return <NoAccess />;
  return <Content />;
}

function Content() {
  const qc = useQueryClient();
  const period = usePeriod("mes");
  const { start, end } = period.range;
  const { data: services } = useQuery({
    queryKey: ["services-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name, active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*, campaign_expense_allocations(id, campaign_id, expense_id, amount_cents, notes, status, remove_reason, created_at, expenses(id, description, amount_cents, status, due_date, competence_date, expense_payments(amount_cents, status)))")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Campaign[];
    },
  });
  const { data: attribution } = useQuery({
    queryKey: ["campaign-leads", start, end],
    queryFn: async () => {
      const [l, o] = await Promise.all([
        supabase.from("leads").select("id, campaign_id, status, order_id").not("campaign_id", "is", null).gte("contacted_at", `${start}T00:00:00-03:00`).lte("contacted_at", `${end}T23:59:59.999-03:00`),
        supabase.from("service_orders").select("id, campaign_id").not("campaign_id", "is", null).gte("opened_at", `${start}T00:00:00-03:00`).lte("opened_at", `${end}T23:59:59.999-03:00`),
      ]);
      if (l.error) throw l.error;
      if (o.error) throw o.error;
      return { leads: l.data ?? [], orders: o.data ?? [] };
    },
  });
  const leadStats = (id: string) => campaignLeadStats(id, attribution?.leads ?? [], attribution?.orders ?? []);
  const [platform, setPlatform] = useState("todas");
  const [status, setStatus] = useState("todos");
  const [service, setService] = useState("todos");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const refresh = () => Promise.all(["campaigns", "campaign-expenses", "campaign-performance"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const serviceName = (c: Campaign) => services?.find((s) => s.id === c.service_id)?.name ?? c.service_label ?? "—";
  const list = (campaigns ?? []).filter((c) =>
    overlapsPeriod(c.start_date, c.end_date, start, end) &&
    (platform === "todas" || c.platform === platform) && (status === "todos" || c.status === status) &&
    (service === "todos" || c.service_id === service) &&
    (!search.trim() || `${c.name} ${c.external_code ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())));
  const totals = list.reduce((acc, c) => {
    const t = campaignTotals(c.planned_budget_cents, c.campaign_expense_allocations.map(toAlloc));
    return { planned: acc.planned + t.planned, registered: acc.registered + t.registered, paid: acc.paid + t.paid, balance: acc.balance + t.balance };
  }, { planned: 0, registered: 0, paid: 0, balance: 0 });

  const changeStatus = async (c: Campaign, s: string) => {
    try { await setCampaignStatus({ data: { id: c.id, status: s } }); toast.success(`Campanha ${st(s).label.toLowerCase()}.`); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro."); }
  };
  const detail = campaigns?.find((c) => c.id === detailId) ?? null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold md:text-3xl">Campanhas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Campanhas publicitárias com orçamento e investimento vinculado às despesas já lançadas.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" />Nova campanha</Button>
      </div>

      <PeriodFilter period={period} />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="Orçamento planejado" cents={totals.planned} />
        <StatCard label="Investimento registrado" cents={totals.registered} hint="Total das campanhas, sem filtro de data" />
        <StatCard label="Efetivamente pago" cents={totals.paid} hint="Pagamentos dessas despesas" />
        <StatCard label="Saldo do orçamento" cents={totals.balance} tone="auto" />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Input className="col-span-2 lg:col-span-1" placeholder="Buscar campanha ou código" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Campanha" />
        <Select value={platform} onValueChange={setPlatform}><SelectTrigger aria-label="Plataforma"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas as plataformas</SelectItem>{Object.entries(PLATFORM).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os status</SelectItem>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
        <Select value={service} onValueChange={setService}><SelectTrigger aria-label="Serviço"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os serviços</SelectItem>{(services ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
      </div>

      {list.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhuma campanha no período e filtros selecionados.</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-2 md:hidden">
            {list.map((c) => {
              const t = campaignTotals(c.planned_budget_cents, c.campaign_expense_allocations.map(toAlloc));
              return (
                <button key={c.id} type="button" onClick={() => setDetailId(c.id)} className="rounded-lg border bg-card p-3 text-left active:bg-muted">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{platformName(c)} · {serviceName(c)}</p></div>
                    <Badge variant={st(c.status).variant}>{st(c.status).label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{formatISODate(c.start_date)} a {c.end_date ? formatISODate(c.end_date) : "em aberto"}</p>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                    <div><p className="text-muted-foreground">Orçamento</p><p className="font-medium">{formatBRL(t.planned)}</p></div>
                    <div><p className="text-muted-foreground">Registrado</p><p className="font-medium">{formatBRL(t.registered)}</p></div>
                    <div><p className="text-muted-foreground">Pago</p><p className="font-medium">{formatBRL(t.paid)}</p></div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr><th className="p-2">Campanha</th><th className="p-2">Plataforma</th><th className="p-2">Serviço</th><th className="p-2">Período</th><th className="p-2">Status</th><th className="p-2 text-right">Orçamento</th><th className="p-2 text-right">Registrado</th><th className="p-2 text-right">Pago</th><th className="p-2 text-right">Saldo</th><th className="p-2" /></tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const t = campaignTotals(c.planned_budget_cents, c.campaign_expense_allocations.map(toAlloc));
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="p-2"><p className="font-medium">{c.name}</p>{c.external_code && <p className="text-xs text-muted-foreground">{c.external_code}</p>}</td>
                      <td className="p-2">{platformName(c)}</td>
                      <td className="p-2">{serviceName(c)}</td>
                      <td className="p-2 whitespace-nowrap">{formatISODate(c.start_date)} – {c.end_date ? formatISODate(c.end_date) : "aberto"}</td>
                      <td className="p-2"><Badge variant={st(c.status).variant}>{st(c.status).label}</Badge></td>
                      <td className="p-2 text-right">{formatBRL(t.planned)}</td>
                      <td className="p-2 text-right">{formatBRL(t.registered)}</td>
                      <td className="p-2 text-right">{formatBRL(t.paid)}</td>
                      <td className={`p-2 text-right ${t.balance < 0 ? "text-destructive" : ""}`}>{formatBRL(t.balance)}</td>
                      <td className="p-2 text-right"><Button size="sm" variant="outline" onClick={() => setDetailId(c.id)}>Detalhes</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <CampaignPerformance start={start} end={end} campaigns={list.map((c) => ({ id: c.id, name: c.name, platformName: platformName(c) ?? "", campaign_expense_allocations: c.campaign_expense_allocations.map((a) => ({ amount_cents: a.amount_cents, status: a.status, expenses: a.expenses })) }))} />

      {editing && <CampaignForm initial={editing === "new" ? null : editing} services={services ?? []} onClose={() => setEditing(null)} onSaved={refresh} />}
      {detail && (
        <CampaignDetail campaign={detail} leadStats={leadStats(detail.id)} periodLabel={`${formatISODate(start)} a ${formatISODate(end)}`} serviceName={serviceName(detail)} onClose={() => setDetailId(null)} onEdit={() => setEditing(detail)} onStatus={(s) => changeStatus(detail, s)} onChanged={refresh} />
      )}
    </div>
  );
}

function CampaignForm({ initial, services, onClose, onSaved }: { initial: Campaign | null; services: { id: string; name: string; active: boolean }[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [f, setF] = useState({
    name: initial?.name ?? "", platform: initial?.platform ?? "meta_ads", platformLabel: initial?.platform_label ?? "", externalCode: initial?.external_code ?? "",
    serviceId: initial?.service_id ?? "", serviceLabel: initial?.service_label ?? "", startDate: initial?.start_date ?? todayISO(), endDate: initial?.end_date ?? "",
    status: initial?.status ?? "planejada", budget: initial ? (initial.planned_budget_cents / 100).toFixed(2).replace(".", ",") : "", notes: initial?.notes ?? "",
  });
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const submit = async () => {
    const budget = f.budget.trim() ? parseBRLToCents(f.budget) : 0;
    if (budget === null) { toast.error("Orçamento inválido."); return; }
    setPending(true);
    try {
      await saveCampaign({ data: { id: initial?.id ?? null, name: f.name, platform: f.platform, platformLabel: f.platformLabel, externalCode: f.externalCode, serviceId: f.serviceId || null, serviceLabel: f.serviceId ? "" : f.serviceLabel, startDate: f.startDate, endDate: f.endDate || null, status: f.status, plannedBudgetCents: budget, notes: f.notes } });
      toast.success(initial ? "Campanha atualizada." : "Campanha cadastrada.");
      await onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setPending(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Editar campanha" : "Nova campanha"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>Nome da campanha *</Label><Input value={f.name} onChange={(e) => set("name")(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5"><Label>Plataforma *</Label>
              <Select value={f.platform} onValueChange={set("platform")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PLATFORM).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-1.5"><Label>Código / ID</Label><Input value={f.externalCode} onChange={(e) => set("externalCode")(e.target.value)} /></div>
          </div>
          {f.platform === "outra" && <div className="grid gap-1.5"><Label>Qual plataforma?</Label><Input value={f.platformLabel} onChange={(e) => set("platformLabel")(e.target.value)} placeholder="Ex.: Instagram orgânico, panfleto" /></div>}
          <div className="grid gap-1.5"><Label>Serviço anunciado</Label>
            <Select value={f.serviceId || "outro"} onValueChange={(v) => set("serviceId")(v === "outro" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="outro">Outro / geral</SelectItem>{services.filter((s) => s.active || s.id === f.serviceId).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          {!f.serviceId && <div className="grid gap-1.5"><Label>Descrição do serviço</Label><Input value={f.serviceLabel} onChange={(e) => set("serviceLabel")(e.target.value)} placeholder="Ex.: Manutenção em geral" /></div>}
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5"><Label>Início *</Label><Input type="date" value={f.startDate} onChange={(e) => set("startDate")(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Término</Label><Input type="date" value={f.endDate} onChange={(e) => set("endDate")(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5"><Label>Status</Label>
              <Select value={f.status} onValueChange={set("status")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-1.5"><Label>Orçamento planejado</Label><Input inputMode="decimal" placeholder="0,00" value={f.budget} onChange={(e) => set("budget")(e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5"><Label>Observações</Label><Textarea rows={2} value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={pending} onClick={submit}>Salvar</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeadCounters({ t }: { t: { leads: number; converted: number; orders: number; lost: number } }) {
  const items = [["Leads vinculados", t.leads], ["Leads convertidos", t.converted], ["Atendimentos originados", t.orders], ["Leads perdidos", t.lost]] as const;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map(([label, n]) => <Card key={label}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-lg font-semibold sm:text-xl">{n}</p></CardContent></Card>)}
    </div>
  );
}

function CampaignDetail({ leadStats, periodLabel, campaign: c, serviceName, onClose, onEdit, onStatus, onChanged }: { leadStats: { leads: number; converted: number; orders: number; lost: number }; periodLabel: string; campaign: Campaign; serviceName: string; onClose: () => void; onEdit: () => void; onStatus: (s: string) => void; onChanged: () => Promise<unknown> }) {
  const t = campaignTotals(c.planned_budget_cents, c.campaign_expense_allocations.map(toAlloc));
  const [linking, setLinking] = useState(false);
  const [removing, setRemoving] = useState<AllocRow | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const allocs = [...c.campaign_expense_allocations].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle className="pr-6">{c.name}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={st(c.status).variant}>{st(c.status).label}</Badge>
            <span className="text-muted-foreground">{platformName(c)}{c.external_code ? ` · ${c.external_code}` : ""} · {serviceName}</span>
          </div>
          <p className="text-sm text-muted-foreground">{formatISODate(c.start_date)} a {c.end_date ? formatISODate(c.end_date) : "em aberto"}</p>
          {c.notes && <p className="whitespace-pre-wrap text-sm">{c.notes}</p>}
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Orçamento planejado" cents={t.planned} />
            <StatCard label="Investimento registrado" cents={t.registered} />
            <StatCard label="Efetivamente pago" cents={t.paid} />
            <StatCard label="Saldo do orçamento" cents={t.balance} tone="auto" />
          </div>
          <p className="text-xs text-muted-foreground">Leads e atendimentos no período {periodLabel}:</p>
          <LeadCounters t={leadStats} />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="outline" onClick={onEdit}><Pencil className="mr-1 h-4 w-4" />Editar</Button>
            {c.status !== "ativa" && c.status !== "encerrada" && <Button variant="outline" onClick={() => onStatus("ativa")}><Play className="mr-1 h-4 w-4" />Ativar</Button>}
            {c.status === "ativa" && <Button variant="outline" onClick={() => onStatus("pausada")}><Pause className="mr-1 h-4 w-4" />Pausar</Button>}
            {c.status !== "encerrada" && <Button variant="outline" onClick={() => onStatus("encerrada")}><Square className="mr-1 h-4 w-4" />Encerrar</Button>}
            {c.status === "encerrada" && <Button variant="outline" onClick={() => onStatus("ativa")}><Play className="mr-1 h-4 w-4" />Reativar</Button>}
            <Button variant="outline" onClick={() => setShowHistory((v) => !v)}><History className="mr-1 h-4 w-4" />Histórico</Button>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display font-semibold">Despesas vinculadas</h3>
              <Button size="sm" onClick={() => setLinking(true)}><Link2 className="mr-1 h-4 w-4" />Vincular despesa</Button>
            </div>
            <p className="text-xs text-muted-foreground">O investimento vem das despesas já lançadas no financeiro — nenhuma despesa nova é criada aqui.</p>
            {allocs.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma despesa vinculada.</p>}
            {allocs.map((a) => {
              const e = a.expenses;
              const paid = allocationPaid(toAlloc(a));
              return (
                <div key={a.id} className={`rounded-md border p-2 text-sm ${a.status !== "ativo" ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e?.description ?? "Despesa"}</p>
                      <p className="text-xs text-muted-foreground">Despesa de {formatBRL(e?.amount_cents ?? 0)} · venc. {formatISODate(e?.due_date)}{e?.status === "cancelada" ? " · cancelada" : ""}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-medium">{formatBRL(a.amount_cents)}</p>
                      <p className="text-xs text-muted-foreground">pago {formatBRL(paid)}</p>
                    </div>
                  </div>
                  {a.status === "ativo" ? (
                    <div className="mt-1 flex justify-end"><Button size="sm" variant="ghost" onClick={() => setRemoving(a)}><Unlink className="mr-1 h-3.5 w-3.5" />Remover vínculo</Button></div>
                  ) : <p className="mt-1 text-xs text-destructive">Removido: {a.remove_reason}</p>}
                </div>
              );
            })}
          </div>
          {showHistory && <CampaignHistory campaign={c} />}
        </div>
        {linking && <LinkExpense campaign={c} onClose={() => setLinking(false)} onSaved={onChanged} />}
        <ReasonDialog open={!!removing} title="Remover vínculo" action="Remover" onClose={() => setRemoving(null)}
          description={<>A despesa continua no financeiro; apenas deixa de contar como investimento desta campanha.</>}
          onConfirm={async (reason) => { await removeAllocation({ data: { id: removing!.id, reason } }); toast.success("Vínculo removido."); await onChanged(); }} />
      </DialogContent>
    </Dialog>
  );
}

function LinkExpense({ campaign, onClose, onSaved }: { campaign: Campaign; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { data: expenses } = useQuery({
    queryKey: ["campaign-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses")
        .select("id, description, amount_cents, status, due_date, competence_date, expense_payments(amount_cents, status), campaign_expense_allocations(amount_cents, status, campaign_id)")
        .neq("status", "cancelada").order("due_date", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [search, setSearch] = useState("");
  const [expenseId, setExpenseId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const options = useMemo(() => (expenses ?? []).map((e: any) => {
    const active = (e.campaign_expense_allocations ?? []).filter((a: any) => a.status === "ativo");
    return { ...e, available: expenseAvailable(e.amount_cents, active.map((a: any) => a.amount_cents)), alreadyHere: active.some((a: any) => a.campaign_id === campaign.id), paid: expensePaid({ amount_cents: e.amount_cents, status: e.status, payments: e.expense_payments ?? [] }) };
  }).filter((e) => !search.trim() || e.description.toLowerCase().includes(search.trim().toLowerCase())), [expenses, search, campaign.id]);
  const selected = options.find((e) => e.id === expenseId);
  const submit = async () => {
    const cents = parseBRLToCents(amount);
    if (!selected || !cents) { toast.error("Selecione a despesa e informe o valor."); return; }
    if (cents > selected.available) { toast.error(`Valor acima do disponível (${formatBRL(selected.available)}).`); return; }
    setPending(true);
    try { await allocateExpense({ data: { campaignId: campaign.id, expenseId, amountCents: cents, notes } }); toast.success("Despesa vinculada."); await onSaved(); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao vincular."); }
    finally { setPending(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Vincular despesa existente</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Input placeholder="Buscar despesa" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="grid max-h-64 gap-1 overflow-y-auto rounded-md border p-1">
            {options.length === 0 && <p className="p-2 text-sm text-muted-foreground">Nenhuma despesa encontrada. Lance a despesa em Despesas primeiro.</p>}
            {options.map((e) => {
              const disabled = e.available <= 0 || e.alreadyHere;
              return (
                <button key={e.id} type="button" disabled={disabled}
                  onClick={() => { setExpenseId(e.id); setAmount((e.available / 100).toFixed(2).replace(".", ",")); }}
                  className={`rounded p-2 text-left text-sm disabled:opacity-50 ${expenseId === e.id ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"}`}>
                  <p className="font-medium">{e.description}</p>
                  <p className="text-xs text-muted-foreground">{formatBRL(e.amount_cents)} · pago {formatBRL(e.paid)} · venc. {formatISODate(e.due_date)}</p>
                  <p className="text-xs">{e.alreadyHere ? "Já vinculada a esta campanha" : `Disponível para distribuir: ${formatBRL(e.available)}`}</p>
                </button>
              );
            })}
          </div>
          {selected && (
            <>
              <div className="grid gap-1.5"><Label>Valor atribuído a esta campanha *</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <p className="text-xs text-muted-foreground">Máximo {formatBRL(selected.available)}. O restante pode ir para outras campanhas.</p></div>
              <div className="grid gap-1.5"><Label>Observação</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </>
          )}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={pending || !selected} onClick={submit}>Vincular</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const FIELD_LABELS: Record<string, string> = { name: "Nome", platform: "Plataforma", status: "Status", planned_budget_cents: "Orçamento", start_date: "Início", end_date: "Término", external_code: "Código", service_id: "Serviço", service_label: "Serviço", notes: "Observações", platform_label: "Plataforma" };

function CampaignHistory({ campaign }: { campaign: Campaign }) {
  const ids = [campaign.id, ...campaign.campaign_expense_allocations.map((a) => a.id)];
  const { data } = useQuery({
    queryKey: ["campaign-history", campaign.id, ids.length, campaign.campaign_expense_allocations.filter((a) => a.status !== "ativo").length, campaign.status, campaign.name, campaign.planned_budget_cents],
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_audit").select("id, table_name, record_id, action, old_data, new_data, created_at").in("record_id", ids).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const describe = (h: any): string => {
    if (h.table_name === "campaign_expense_allocations") {
      const amt = formatBRL(h.new_data?.amount_cents);
      return String(h.action).toLowerCase() === "insert" ? `Despesa vinculada (${amt})` : h.new_data?.status === "removido" ? `Vínculo removido (${amt}): ${h.new_data?.remove_reason ?? ""}` : "Vínculo alterado";
    }
    if (String(h.action).toLowerCase() === "insert") return "Campanha cadastrada";
    const changed = Object.keys(FIELD_LABELS).filter((k) => JSON.stringify(h.old_data?.[k]) !== JSON.stringify(h.new_data?.[k]));
    if (changed.includes("status") && changed.length <= 2) return `Status: ${STATUS[h.old_data?.status]?.label ?? "—"} → ${STATUS[h.new_data?.status]?.label ?? "—"}`;
    return changed.length ? `Alterado: ${[...new Set(changed.map((k) => FIELD_LABELS[k]))].join(", ")}` : "Atualizada";
  };
  return (
    <div className="grid gap-1">
      <h3 className="font-display font-semibold">Histórico</h3>
      {(data ?? []).map((h: any) => (
        <div key={h.id} className="flex justify-between gap-2 border-b py-1 text-sm last:border-0">
          <span className="min-w-0">{describe(h)}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
        </div>
      ))}
      {data && data.length === 0 && <p className="text-sm text-muted-foreground">Sem registros.</p>}
    </div>
  );
}
