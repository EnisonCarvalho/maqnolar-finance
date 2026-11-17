import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Plus, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, parseBRLToCents } from "@/lib/format";
import { createRevenue, receiveRevenue, voidRevenue, getFinanceOverview } from "@/lib/finance-ops.functions";
import { accountsQuery, categoriesQuery, AccountSelect, CategorySelect, PeriodFilter, ReasonDialog, StatCard, usePeriod } from "@/components/finance-ui";
import { METHOD_LABELS, ReceiptInput, ReceiptLink, formatISODate, todayISO, uploadReceipt } from "@/components/finance-shared";
import { useSession } from "@/hooks/use-session";
import { NoAccess } from "@/components/no-access";

export const Route = createFileRoute("/_authenticated/receitas")({
  head: () => ({
    meta: [
      { title: "Receitas — MaqnoLar Financeiro" },
      { name: "description", content: "Receitas de atendimentos e avulsas, recebidas e pendentes." },
      { property: "og:title", content: "Receitas — MaqnoLar Financeiro" },
      { property: "og:description", content: "Receitas de atendimentos e avulsas, recebidas e pendentes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { data: session } = useSession();
  if (session && !session.isAdmin) return <NoAccess />;
  return <Content />;
}

type Row = { id: string; source: "atendimento" | "avulsa"; description: string; date: string; competence: string | null; amount: number; received: boolean; receiver: string; accountId: string | null; categoryId: string | null; method: string | null; status: string; voidReason: string | null; receiptPath: string | null; origin: string | null; raw?: any };

function Content() {
  const qc = useQueryClient();
  const period = usePeriod("mes");
  const { start, end } = period.range;
  const overviewFn = useServerFn(getFinanceOverview);
  const { data: overview } = useQuery({ queryKey: ["fin-overview", start, end], queryFn: () => overviewFn({ data: { start, end } }) });
  const { data: accounts } = useQuery(accountsQuery);
  const { data: categories } = useQuery(categoriesQuery);
  const { data: rows } = useQuery({
    queryKey: ["fin-revenues", start, end],
    queryFn: async (): Promise<Row[]> => {
      const [cp, or] = await Promise.all([
        supabase.from("customer_payments").select("id, amount_cents, paid_at, receiver_type, receiver_label, account_id, method, status, void_reason, receipt_path, technicians(full_name), service_orders(code, customers(full_name))").gte("paid_at", start).lte("paid_at", end),
        supabase.from("other_revenues").select("*").or(`and(competence_date.gte.${start},competence_date.lte.${end}),and(received_at.gte.${start},received_at.lte.${end}),received_at.is.null`),
      ]);
      if (cp.error) throw cp.error;
      if (or.error) throw or.error;
      const a: Row[] = (cp.data ?? []).map((p: any) => ({
        id: p.id, source: "atendimento", description: `${p.service_orders?.code ?? "Atendimento"} · ${p.service_orders?.customers?.full_name ?? ""}`, date: p.paid_at, competence: null, amount: p.amount_cents, received: true,
        receiver: p.receiver_type === "maqnolar" ? "MaqnoLar" : p.receiver_type === "tecnico" ? p.technicians?.full_name ?? "Técnico" : p.receiver_label ?? "Outro",
        accountId: p.account_id, categoryId: null, method: p.method, status: p.status, voidReason: p.void_reason, receiptPath: p.receipt_path, origin: "Atendimento",
      }));
      const b: Row[] = (or.data ?? []).map((r: any) => ({
        id: r.id, source: "avulsa", description: r.description, date: r.received_at ?? r.competence_date, competence: r.competence_date, amount: r.amount_cents, received: Boolean(r.received_at),
        receiver: "MaqnoLar", accountId: r.account_id, categoryId: r.category_id, method: r.method, status: r.status, voidReason: r.void_reason, receiptPath: r.receipt_path, origin: r.origin, raw: r,
      }));
      return [...a, ...b].sort((x, y) => y.date.localeCompare(x.date));
    },
  });
  const [newOpen, setNewOpen] = useState(false);
  const [receiving, setReceiving] = useState<Row | null>(null);
  const [voiding, setVoiding] = useState<Row | null>(null);
  const [source, setSource] = useState("todas");
  const [status, setStatus] = useState("todos");
  const [category, setCategory] = useState("todas");
  const [account, setAccount] = useState("todas");
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["fin-revenues"] }), qc.invalidateQueries({ queryKey: ["fin-overview"] })]);

  const i = overview?.indicators;
  const accName = (id: string | null) => accounts?.find((a) => a.id === id)?.name;
  const catName = (id: string | null) => categories?.find((c) => c.id === id)?.name;
  const list = (rows ?? []).filter((r) =>
    (source === "todas" || r.source === source) &&
    (status === "todos" || (status === "recebida" ? r.received && r.status === "ativo" : status === "pendente" ? !r.received && r.status === "ativo" : r.status === "estornado")) &&
    (category === "todas" || r.categoryId === category) &&
    (account === "todas" || r.accountId === account));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold md:text-3xl">Receitas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Recebimentos de atendimentos vêm automaticamente do atendimento (sem lançamento duplicado). Aqui você lança receitas avulsas.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setNewOpen(true)}><Plus className="mr-1 h-4 w-4" />Nova receita</Button>
      </div>
      <PeriodFilter period={period} />
      {i && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Faturamento bruto" cents={i.grossBillingCents} hint="Atendimentos concluídos" />
          <StatCard label="Receita econômica MaqnoLar" cents={i.companyEconomicRevenueCents} tone="pos" hint="Parte confirmada + avulsas" />
          <StatCard label="Recebido pela empresa" cents={i.receivedByCompanyCents} />
          <StatCard label="Recebido pelos técnicos" cents={i.receivedByTechniciansCents} />
          <StatCard label="Receitas avulsas" cents={i.otherRevenueCents} />
          <StatCard label="Receitas pendentes" cents={i.receivablesCents} hint="Clientes + avulsas a receber" />
        </div>
      )}

      {overview && (
        <section className="grid gap-2">
          <div>
            <h2 className="font-display font-semibold">Faturamento confirmado por atendimento</h2>
            <p className="text-xs text-muted-foreground">Cada OS conta uma vez. O total cobrado é só referência: entra no faturamento apenas a parte confirmada da MaqnoLar. Confirmação não significa dinheiro recebido.</p>
          </div>
          {overview.confirmedOrders.length === 0 && <p className="text-sm text-muted-foreground">Nenhum atendimento confirmado no período.</p>}
          {overview.confirmedOrders.map((o) => (
            <div key={o.orderId} className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{o.code} · {o.customerName}</p>
                <p className="text-xs text-muted-foreground">{formatISODate(o.date)} · Total cobrado {formatBRL(o.totalCents)}{o.partsCents ? ` · peças ${formatBRL(o.partsCents)}` : ""}</p>
                <Badge variant="outline" className="mt-1">{o.kind}</Badge>
              </div>
              <div className="shrink-0 text-right"><p className="text-xs text-muted-foreground">Receita MaqnoLar</p><p className="font-semibold">{formatBRL(o.companyShareCents)}</p></div>
            </div>
          ))}
          <p className="text-right text-sm">Total receita MaqnoLar (atendimentos): <b>{formatBRL(overview.confirmedOrders.reduce((s, o) => s + o.companyShareCents, 0))}</b></p>
        </section>
      )}

      <h2 className="font-display font-semibold">Recebimentos e receitas avulsas (caixa)</h2>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:max-w-4xl">
        <Select value={source} onValueChange={setSource}><SelectTrigger aria-label="Origem"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas as origens</SelectItem><SelectItem value="atendimento">Atendimentos</SelectItem><SelectItem value="avulsa">Avulsas</SelectItem></SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os status</SelectItem><SelectItem value="recebida">Recebidas</SelectItem><SelectItem value="pendente">Pendentes</SelectItem><SelectItem value="estornado">Estornadas</SelectItem></SelectContent></Select>
        <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Categoria"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas as categorias</SelectItem>{(categories ?? []).filter((c) => c.kind === "receita").map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
        <Select value={account} onValueChange={setAccount}><SelectTrigger aria-label="Conta"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas as contas</SelectItem>{(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
      </div>

      {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma receita para os filtros escolhidos.</p>}
      <div className="grid gap-2">
        {list.map((r) => (
          <div key={`${r.source}-${r.id}`} className={`flex items-start justify-between gap-2 rounded-md border p-3 text-sm ${r.status === "estornado" ? "opacity-60" : ""}`}>
            <div className="min-w-0">
              <p className="font-medium">{r.description}</p>
              <p className="text-xs text-muted-foreground">
                {r.received ? `Recebido ${formatISODate(r.date)}` : `Competência ${formatISODate(r.competence)} · a receber`}
                {r.competence && r.received ? ` · competência ${formatISODate(r.competence)}` : ""} · {r.receiver}
                {r.method ? ` · ${METHOD_LABELS[r.method]}` : ""}{accName(r.accountId) ? ` · ${accName(r.accountId)}` : ""}{catName(r.categoryId) ? ` · ${catName(r.categoryId)}` : ""}{r.origin && r.source === "avulsa" ? ` · ${r.origin}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge variant="outline">{r.source === "atendimento" ? "Atendimento" : "Avulsa"}</Badge>
                {r.status === "estornado" ? <Badge variant="secondary">Estornada</Badge> : r.received ? <Badge variant="secondary">Recebida</Badge> : <Badge variant="destructive">Pendente</Badge>}
                <ReceiptLink path={r.receiptPath} />
              </div>
              {r.voidReason && <p className="text-xs text-destructive">Estorno: {r.voidReason}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <p className="font-semibold">{formatBRL(r.amount)}</p>
              {r.source === "avulsa" && r.status === "ativo" && (
                <div className="flex">
                  {!r.received && <Button size="icon" variant="ghost" aria-label="Marcar como recebida" onClick={() => setReceiving(r)}><CheckCircle2 className="h-4 w-4" /></Button>}
                  <Button size="icon" variant="ghost" aria-label="Estornar receita" onClick={() => setVoiding(r)}><Undo2 className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Repasses de técnicos não aparecem aqui: não são receita de serviço. Estornos de recebimentos de atendimento são feitos no próprio atendimento.</p>

      <RevenueDialog open={newOpen} onClose={() => setNewOpen(false)} onDone={refresh} />
      <ReceiveDialog row={receiving} onClose={() => setReceiving(null)} onDone={refresh} />
      <ReasonDialog open={Boolean(voiding)} title="Estornar receita" description={`Estornar ${formatBRL(voiding?.amount)}? O lançamento fica no histórico.`} action="Estornar" onClose={() => setVoiding(null)}
        onConfirm={async (reason) => { await voidRevenue({ data: { id: voiding!.id, reason } }); toast.success("Receita estornada."); await refresh(); }} />
    </div>
  );
}

function RevenueDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [f, setF] = useState({ description: "", categoryId: "", amount: "", competence: todayISO(), received: true, receivedAt: todayISO(), method: "pix", accountId: "", origin: "", notes: "" });
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const cents = parseBRLToCents(f.amount) ?? 0;
  const m = useMutation({
    mutationFn: async () => {
      const receiptPath = file ? await uploadReceipt(file) : null;
      return createRevenue({ data: { description: f.description, categoryId: f.categoryId || null, amountCents: cents, competenceDate: f.competence, receivedAt: f.received ? f.receivedAt : null, method: f.received ? f.method : null, accountId: f.accountId || null, origin: f.origin, notes: f.notes, receiptPath } });
    },
    onSuccess: async () => { toast.success("Receita registrada."); setF((x) => ({ ...x, description: "", amount: "", notes: "", origin: "" })); setFile(null); setConfirming(false); onClose(); await onDone(); },
    onError: (e) => { setConfirming(false); toast.error(e instanceof Error ? e.message : "Não foi possível registrar."); },
  });
  const valid = f.description.trim() && cents > 0 && f.competence && (!f.received || (f.accountId && f.receivedAt));
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setConfirming(false); onClose(); } }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Nova receita avulsa</DialogTitle></DialogHeader>
        {confirming ? (
          <div className="grid gap-3 text-sm">
            <p>Confirmar receita de <strong>{formatBRL(cents)}</strong> ({f.description}), competência {formatISODate(f.competence)}{f.received ? `, recebida em ${formatISODate(f.receivedAt)}` : ", a receber"}?</p>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirming(false)}>Voltar</Button><Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Salvando…" : "Confirmar"}</Button></div>
          </div>
        ) : (
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (valid) setConfirming(true); }}>
            <p className="text-xs text-muted-foreground">Para pagamentos de atendimentos, registre no próprio atendimento.</p>
            <div className="grid gap-1.5"><Label>Descrição *</Label><Input value={f.description} onChange={(e) => set("description")(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <CategorySelect kind="receita" value={f.categoryId} onChange={set("categoryId")} />
              <div className="grid gap-1.5"><Label>Valor (R$) *</Label><Input inputMode="decimal" placeholder="0,00" value={f.amount} onChange={(e) => set("amount")(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5"><Label>Competência *</Label><Input type="date" value={f.competence} onChange={(e) => set("competence")(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Origem</Label><Input value={f.origin} onChange={(e) => set("origin")(e.target.value)} placeholder="Ex.: indicação" /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.received} onCheckedChange={set("received")} />Já recebida</label>
            {f.received && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5"><Label>Data do recebimento *</Label><Input type="date" value={f.receivedAt} onChange={(e) => set("receivedAt")(e.target.value)} /></div>
                  <div className="grid gap-1.5"><Label>Forma *</Label>
                    <Select value={f.method} onValueChange={set("method")}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
                  </div>
                </div>
                <AccountSelect value={f.accountId} onChange={set("accountId")} required />
              </>
            )}
            <div className="grid gap-1.5"><Label>Observações</Label><Textarea rows={2} value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
            <ReceiptInput file={file} onChange={setFile} />
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={!valid}>Continuar</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ row, onClose, onDone }: { row: Row | null; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [date, setDate] = useState(todayISO);
  const [method, setMethod] = useState("pix");
  const [accountId, setAccountId] = useState("");
  const m = useMutation({
    mutationFn: () => receiveRevenue({ data: { id: row!.id, receivedAt: date, method, accountId } }),
    onSuccess: async () => { toast.success("Receita marcada como recebida."); onClose(); await onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível registrar."),
  });
  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Registrar recebimento</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm">{row?.description} — {formatBRL(row?.amount)}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5"><Label>Data *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Forma *</Label>
              <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <AccountSelect value={accountId} onChange={setAccountId} required />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!accountId || m.isPending} onClick={() => m.mutate()}>Confirmar recebimento</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
