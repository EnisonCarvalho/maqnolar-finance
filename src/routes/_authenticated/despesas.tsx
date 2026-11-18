import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, CalendarPlus, Pencil, Plus, Undo2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, parseBRLToCents } from "@/lib/format";
import { getFinanceOverview, saveExpense, payExpense, voidExpensePayment, cancelExpense, saveRecurring, generateRecurring, saveCategory } from "@/lib/finance-ops.functions";
import { accountsQuery, categoriesQuery, AccountSelect, CategorySelect, PeriodFilter, ReasonDialog, StatCard, usePeriod, type FinCategory } from "@/components/finance-ui";
import { METHOD_LABELS, ReceiptInput, ReceiptLink, formatISODate, todayISO, uploadReceipt } from "@/components/finance-shared";
import { useSession } from "@/hooks/use-session";
import { useServerFn } from "@tanstack/react-start";
import { NoAccess } from "@/components/no-access";

export const Route = createFileRoute("/_authenticated/despesas")({
  head: () => ({
    meta: [
      { title: "Despesas — MaqnoLar Financeiro" },
      { name: "description", content: "Despesas operacionais, contas a pagar, recorrências e categorias da MaqnoLar." },
      { property: "og:title", content: "Despesas — MaqnoLar Financeiro" },
      { property: "og:description", content: "Despesas operacionais, contas a pagar, recorrências e categorias da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "destructive" },
  parcial: { label: "Parcialmente paga", variant: "outline" },
  paga: { label: "Paga", variant: "secondary" },
  cancelada: { label: "Cancelada", variant: "secondary" },
};
const FREQ: Record<string, string> = { semanal: "Semanal", mensal: "Mensal", anual: "Anual" };

type ExpenseRow = {
  id: string; description: string; category_id: string | null; amount_cents: number; competence_date: string; due_date: string; status: string;
  planned_account_id: string | null; responsible: string | null; notes: string | null; receipt_path: string | null; recurring_id: string | null; cancel_reason: string | null;
  expense_payments: { id: string; amount_cents: number; paid_at: string; method: string; account_id: string; status: string; void_reason: string | null; receipt_path: string | null }[];
};

function Page() {
  const { data: session } = useSession();
  if (session && !session.isAdmin) return <NoAccess />;
  return <Content />;
}

function Content() {
  const qc = useQueryClient();
  const period = usePeriod("mes");
  const { start, end } = period.range;
  const { data: accounts } = useQuery(accountsQuery);
  const { data: categories } = useQuery(categoriesQuery);
  const overviewFn = useServerFn(getFinanceOverview);
  const { data: overview } = useQuery({ queryKey: ["fin-overview", start, end], queryFn: () => overviewFn({ data: { start, end } }) });
  const [dateBy, setDateBy] = useState<"competence_date" | "due_date">("competence_date");
  const { data: expenses } = useQuery({
    queryKey: ["fin-expenses", start, end, dateBy],
    queryFn: async (): Promise<ExpenseRow[]> => {
      const { data, error } = await supabase.from("expenses").select("*, expense_payments(id, amount_cents, paid_at, method, account_id, status, void_reason, receipt_path)").gte(dateBy, start).lte(dateBy, end).order("due_date");
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
  });
  const { data: openAll } = useQuery({
    queryKey: ["fin-expenses-open"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("id, amount_cents, due_date, status, expense_payments(amount_cents, status)").in("status", ["pendente", "parcial"]);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [status, setStatus] = useState("todos");
  const [category, setCategory] = useState("todas");
  const [account, setAccount] = useState("todas");
  const [responsible, setResponsible] = useState("");
  const [editing, setEditing] = useState<ExpenseRow | "new" | null>(null);
  const [paying, setPaying] = useState<ExpenseRow | null>(null);
  const [cancelling, setCancelling] = useState<ExpenseRow | null>(null);
  const [voiding, setVoiding] = useState<{ id: string; amount: number } | null>(null);
  const refresh = () => Promise.all(["fin-expenses", "fin-expenses-open", "fin-overview", "fin-recurring"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const paid = (e: ExpenseRow) => e.expense_payments.filter((p) => p.status === "ativo").reduce((s, p) => s + p.amount_cents, 0);
  const catName = (id: string | null) => categories?.find((c) => c.id === id)?.name ?? "Sem categoria";
  const accName = (id: string | null) => accounts?.find((a) => a.id === id)?.name ?? "—";
  const today = todayISO();
  const openRemaining = (openAll ?? []).map((e: any) => ({ due: e.due_date, rest: e.amount_cents - (e.expense_payments ?? []).filter((p: any) => p.status === "ativo").reduce((s: number, p: any) => s + p.amount_cents, 0) }));
  const all = expenses ?? [];
  const stats = {
    total: all.filter((e) => e.status !== "cancelada").reduce((s, e) => s + e.amount_cents, 0),
    paidInPeriod: all.reduce((s, e) => s + e.expense_payments.filter((p) => p.status === "ativo").reduce((x, p) => x + p.amount_cents, 0), 0),
    payable: openRemaining.reduce((s, e) => s + e.rest, 0),
    overdue: openRemaining.filter((e) => e.due < today).reduce((s, e) => s + e.rest, 0),
  };
  const list = all.filter((e) =>
    (status === "todos" || e.status === status) && (category === "todas" || e.category_id === category) &&
    (account === "todas" || e.planned_account_id === account || e.expense_payments.some((p) => p.account_id === account)) &&
    (!responsible.trim() || (e.responsible ?? "").toLowerCase().includes(responsible.trim().toLowerCase())));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold md:text-3xl">Despesas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Despesas operacionais da empresa. Peças de atendimentos, repasses e transferências não entram aqui.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" />Nova despesa</Button>
      </div>

      <Tabs defaultValue="despesas" className="grid gap-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="despesas">Despesas</TabsTrigger>
          <TabsTrigger value="recorrentes">Recorrentes</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
        </TabsList>

        <TabsContent value="despesas" className="grid gap-4">
          <PeriodFilter period={period} />
          {overview && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatCard label="Receita da MaqnoLar" cents={overview.indicators.companyEconomicRevenueCents} tone="pos" hint="Parte confirmada (peças já abatidas) + avulsas" />
              <StatCard label="Despesas (competência)" cents={overview.indicators.operationalExpensesCents} tone="neg" />
              <StatCard label="Resultado após despesas" cents={overview.indicators.economicResultCents} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatCard label={dateBy === "due_date" ? "Despesas com vencimento no período" : "Despesas por competência"} cents={stats.total} />
            <StatCard label="Pago dessas despesas" cents={stats.paidInPeriod} />
            <StatCard label="Contas a pagar (total)" cents={stats.payable} tone="neg" />
            <StatCard label="Vencidas" cents={stats.overdue} tone="neg" />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <Select value={dateBy} onValueChange={(v) => setDateBy(v as typeof dateBy)}><SelectTrigger aria-label="Data"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="due_date">Por vencimento</SelectItem><SelectItem value="competence_date">Por competência</SelectItem></SelectContent></Select>
            <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos os status</SelectItem>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
            <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Categoria"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todas">Todas as categorias</SelectItem>{(categories ?? []).filter((c) => c.kind === "despesa").map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
            <Select value={account} onValueChange={setAccount}><SelectTrigger aria-label="Conta"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todas">Todas as contas</SelectItem>{(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
            <Input placeholder="Responsável" value={responsible} onChange={(e) => setResponsible(e.target.value)} className="col-span-2 lg:col-span-1" />
          </div>

          {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma despesa para os filtros escolhidos.</p>}
          <div className="grid gap-2">
            {list.map((e) => {
              const p = paid(e);
              const overdue = e.status !== "paga" && e.status !== "cancelada" && e.due_date < today;
              return (
                <div key={e.id} className={`grid gap-2 rounded-md border p-3 text-sm ${e.status === "cancelada" ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{e.description}</p>
                      <p className="text-xs text-muted-foreground">{catName(e.category_id)} · vence {formatISODate(e.due_date)} · competência {formatISODate(e.competence_date)}{e.responsible ? ` · ${e.responsible}` : ""}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge variant={STATUS[e.status]?.variant}>{STATUS[e.status]?.label}</Badge>
                        {overdue && <Badge variant="destructive">Vencida</Badge>}
                        {e.recurring_id && <Badge variant="outline">Recorrente</Badge>}
                        <ReceiptLink path={e.receipt_path} />
                      </div>
                      {e.cancel_reason && <p className="text-xs text-muted-foreground">Cancelada: {e.cancel_reason}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{formatBRL(e.amount_cents)}</p>
                      {p > 0 && p < e.amount_cents && <p className="text-xs text-muted-foreground">Pago {formatBRL(p)}</p>}
                    </div>
                  </div>
                  {e.expense_payments.length > 0 && (
                    <ul className="grid gap-1 border-t pt-2">
                      {e.expense_payments.map((x) => (
                        <li key={x.id} className={`flex items-center justify-between gap-2 text-xs ${x.status === "estornado" ? "opacity-60" : ""}`}>
                          <span className="min-w-0">{formatISODate(x.paid_at)} · {formatBRL(x.amount_cents)} · {METHOD_LABELS[x.method]} · {accName(x.account_id)}{x.status === "estornado" ? ` · estornado: ${x.void_reason}` : ""} <ReceiptLink path={x.receipt_path} /></span>
                          {x.status === "ativo" && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Estornar pagamento" onClick={() => setVoiding({ id: x.id, amount: x.amount_cents })}><Undo2 className="h-3.5 w-3.5" /></Button>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {e.status !== "cancelada" && (
                    <div className="flex flex-wrap gap-2">
                      {e.status !== "paga" && <Button size="sm" onClick={() => setPaying(e)}><Wallet className="mr-1 h-4 w-4" />Pagar</Button>}
                      <Button size="sm" variant="outline" onClick={() => setEditing(e)}><Pencil className="mr-1 h-4 w-4" />Editar</Button>
                      {p === 0 && <Button size="sm" variant="ghost" onClick={() => setCancelling(e)}><Ban className="mr-1 h-4 w-4" />Cancelar</Button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="recorrentes"><RecurringTab onChanged={refresh} /></TabsContent>
        <TabsContent value="categorias"><CategoriesTab /></TabsContent>
      </Tabs>

      <ExpenseDialog target={editing} onClose={() => setEditing(null)} onDone={refresh} />
      <PayDialog expense={paying} remaining={paying ? paying.amount_cents - paid(paying) : 0} onClose={() => setPaying(null)} onDone={refresh} />
      <ReasonDialog open={Boolean(cancelling)} title="Cancelar despesa" description={`Cancelar "${cancelling?.description}"? Ela fica no histórico como cancelada.`} action="Cancelar despesa" onClose={() => setCancelling(null)}
        onConfirm={async (reason) => { await cancelExpense({ data: { id: cancelling!.id, reason } }); toast.success("Despesa cancelada."); await refresh(); }} />
      <ReasonDialog open={Boolean(voiding)} title="Estornar pagamento" description={`Estornar ${formatBRL(voiding?.amount)}? A despesa volta a ficar em aberto.`} action="Estornar" onClose={() => setVoiding(null)}
        onConfirm={async (reason) => { await voidExpensePayment({ data: { id: voiding!.id, reason } }); toast.success("Pagamento estornado."); await refresh(); }} />
    </div>
  );
}

function ExpenseDialog({ target, onClose, onDone }: { target: ExpenseRow | "new" | null; onClose: () => void; onDone: () => Promise<unknown> }) {
  const blank = { description: "", categoryId: "", amount: "", competence: todayISO(), due: todayISO(), plannedAccountId: "", responsible: "", notes: "", payNow: false, paidAt: todayISO(), method: "pix", payAccountId: "" };
  const [f, setF] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const key = target === "new" ? "new" : target?.id ?? null;
  if (key && key !== loaded) {
    setLoaded(key); setFile(null); setConfirming(false);
    setF(target && target !== "new" ? { ...blank, description: target.description, categoryId: target.category_id ?? "", amount: (target.amount_cents / 100).toFixed(2).replace(".", ","), competence: target.competence_date, due: target.due_date, plannedAccountId: target.planned_account_id ?? "", responsible: target.responsible ?? "", notes: target.notes ?? "" } : blank);
  }
  const close = () => { setLoaded(null); onClose(); };
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const cents = parseBRLToCents(f.amount) ?? 0;
  const isNew = target === "new";
  const m = useMutation({
    mutationFn: async () => {
      const receiptPath = file ? await uploadReceipt(file) : null;
      return saveExpense({ data: { id: isNew ? null : (target as ExpenseRow).id, description: f.description, categoryId: f.categoryId || null, amountCents: cents, competenceDate: f.competence, dueDate: f.due, plannedAccountId: f.plannedAccountId || null, responsible: f.responsible, notes: f.notes, receiptPath, payNow: isNew && f.payNow ? { paidAt: f.paidAt, method: f.method, accountId: null } : null } });
    },
    onSuccess: async () => { toast.success(isNew ? "Despesa registrada." : "Despesa atualizada."); close(); await onDone(); },
    onError: (e) => { setConfirming(false); toast.error(e instanceof Error ? e.message : "Não foi possível salvar."); },
  });
  const valid = f.description.trim() && cents > 0 && f.competence && f.due && (!f.payNow || f.paidAt);
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{isNew ? "Nova despesa" : "Editar despesa"}</DialogTitle></DialogHeader>
        {confirming ? (
          <div className="grid gap-3 text-sm">
            <p>Confirmar despesa de <strong>{formatBRL(cents)}</strong> ({f.description}), vencimento {formatISODate(f.due)}{f.payNow ? `, paga em ${formatISODate(f.paidAt)}` : ""}?</p>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirming(false)}>Voltar</Button><Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Salvando…" : "Confirmar"}</Button></div>
          </div>
        ) : (
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (valid) setConfirming(true); }}>
            <div className="grid gap-1.5"><Label>Descrição *</Label><Input value={f.description} onChange={(e) => set("description")(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <CategorySelect kind="despesa" value={f.categoryId} onChange={set("categoryId")} />
              <div className="grid gap-1.5"><Label>Valor (R$) *</Label><Input inputMode="decimal" placeholder="0,00" value={f.amount} onChange={(e) => set("amount")(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5"><Label>Competência *</Label><Input type="date" value={f.competence} onChange={(e) => set("competence")(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Vencimento *</Label><Input type="date" value={f.due} onChange={(e) => set("due")(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5"><Label>Responsável</Label><Input value={f.responsible} onChange={(e) => set("responsible")(e.target.value)} placeholder="Ex.: Enison" /></div>
            </div>
            {isNew && <label className="flex items-center gap-2 text-sm"><Switch checked={f.payNow} onCheckedChange={set("payNow")} />Já foi paga</label>}
            {isNew && f.payNow && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5"><Label>Data do pagamento *</Label><Input type="date" value={f.paidAt} onChange={(e) => set("paidAt")(e.target.value)} /></div>
                  <div className="grid gap-1.5"><Label>Forma *</Label>
                    <Select value={f.method} onValueChange={set("method")}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
                  </div>
                </div>
              </>
            )}
            <div className="grid gap-1.5"><Label>Observações</Label><Textarea rows={2} value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
            <ReceiptInput file={file} onChange={setFile} />
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>Cancelar</Button><Button type="submit" disabled={!valid}>Continuar</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ expense, remaining, onClose, onDone }: { expense: ExpenseRow | null; remaining: number; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO);
  const [method, setMethod] = useState("pix");
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  if (expense && expense.id !== loaded) { setLoaded(expense.id); setAmount((remaining / 100).toFixed(2).replace(".", ",")); setAccountId(expense.planned_account_id ?? ""); setFile(null); }
  const close = () => { setLoaded(null); onClose(); };
  const cents = parseBRLToCents(amount) ?? 0;
  const m = useMutation({
    mutationFn: async () => {
      const receiptPath = file ? await uploadReceipt(file) : null;
      return payExpense({ data: { expenseId: expense!.id, amountCents: cents, paidAt, method, accountId: null, receiptPath } });
    },
    onSuccess: async () => { toast.success("Pagamento registrado."); close(); await onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível registrar."),
  });
  return (
    <Dialog open={Boolean(expense)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Pagar despesa</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <p className="text-sm">{expense?.description} — restam <strong>{formatBRL(remaining)}</strong>. Pagamentos parciais são permitidos.</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5"><Label>Valor (R$) *</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Data *</Label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5"><Label>Forma *</Label>
            <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <ReceiptInput file={file} onChange={setFile} />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>Cancelar</Button><Button type="submit" disabled={cents <= 0 || cents > remaining || m.isPending}>Confirmar pagamento</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Recurring = { id: string; description: string; category_id: string | null; amount_cents: number; frequency: string; next_due_date: string; account_id: string | null; responsible: string | null; status: string; notes: string | null };

function RecurringTab({ onChanged }: { onChanged: () => Promise<unknown> }) {
  const qc = useQueryClient();
  const { data: categories } = useQuery(categoriesQuery);
  const { data: accounts } = useQuery(accountsQuery);
  const { data: recs } = useQuery({
    queryKey: ["fin-recurring"],
    queryFn: async (): Promise<Recurring[]> => {
      const { data, error } = await supabase.from("recurring_expenses").select("*").order("next_due_date");
      if (error) throw error;
      return (data ?? []) as Recurring[];
    },
  });
  const [editing, setEditing] = useState<Recurring | "new" | null>(null);
  const [until, setUntil] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); });
  const gen = useMutation({
    mutationFn: () => generateRecurring({ data: { untilDate: until } }),
    onSuccess: async (r) => { toast.success(r.created ? `${r.created} obrigação(ões) gerada(s) como pendentes.` : "Nenhuma obrigação nova a gerar."); await qc.invalidateQueries({ queryKey: ["fin-recurring"] }); await onChanged(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível gerar."),
  });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Button onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" />Nova recorrência</Button>
        <div className="grid gap-1"><Label className="text-xs">Gerar vencimentos até</Label><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="w-44" /></div>
        <Button variant="outline" disabled={gen.isPending} onClick={() => gen.mutate()}><CalendarPlus className="mr-1 h-4 w-4" />Gerar obrigações</Button>
      </div>
      <p className="text-xs text-muted-foreground">As obrigações geradas ficam pendentes. Nenhum pagamento é registrado antes de acontecer, e o mesmo vencimento nunca é gerado duas vezes.</p>
      {(recs ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma recorrência cadastrada (ex.: Hostinger, ChatGPT, Lovable, telefone).</p>}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(recs ?? []).map((r) => (
          <div key={r.id} className={`grid gap-1 rounded-md border p-3 text-sm ${r.status !== "ativa" ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{r.description}</p>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Editar recorrência" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
            </div>
            <p className="font-semibold">{formatBRL(r.amount_cents)} · {FREQ[r.frequency]}</p>
            <p className="text-xs text-muted-foreground">Próximo vencimento {formatISODate(r.next_due_date)} · {categories?.find((c) => c.id === r.category_id)?.name ?? "Sem categoria"}{r.account_id ? ` · ${accounts?.find((a) => a.id === r.account_id)?.name}` : ""}</p>
            <Badge variant={r.status === "ativa" ? "secondary" : "outline"} className="w-fit">{r.status === "ativa" ? "Ativa" : r.status === "pausada" ? "Pausada" : "Encerrada"}</Badge>
          </div>
        ))}
      </div>
      <RecurringDialog target={editing} onClose={() => setEditing(null)} onDone={async () => { await qc.invalidateQueries({ queryKey: ["fin-recurring"] }); }} />
    </div>
  );
}

function RecurringDialog({ target, onClose, onDone }: { target: Recurring | "new" | null; onClose: () => void; onDone: () => Promise<unknown> }) {
  const blank = { description: "", categoryId: "", amount: "", frequency: "mensal", next: todayISO(), accountId: "", responsible: "", status: "ativa", notes: "" };
  const [f, setF] = useState(blank);
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = target === "new" ? "new" : target?.id ?? null;
  if (key && key !== loaded) {
    setLoaded(key);
    setF(target && target !== "new" ? { description: target.description, categoryId: target.category_id ?? "", amount: (target.amount_cents / 100).toFixed(2).replace(".", ","), frequency: target.frequency, next: target.next_due_date, accountId: target.account_id ?? "", responsible: target.responsible ?? "", status: target.status, notes: target.notes ?? "" } : blank);
  }
  const close = () => { setLoaded(null); onClose(); };
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const cents = parseBRLToCents(f.amount) ?? 0;
  const m = useMutation({
    mutationFn: () => saveRecurring({ data: { id: target !== "new" ? target?.id ?? null : null, description: f.description, categoryId: f.categoryId || null, amountCents: cents, frequency: f.frequency, nextDueDate: f.next, accountId: f.accountId || null, responsible: f.responsible, status: f.status, notes: f.notes } }),
    onSuccess: async () => { toast.success("Recorrência salva."); close(); await onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{target === "new" ? "Nova recorrência" : "Editar recorrência"}</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="grid gap-1.5"><Label>Descrição *</Label><Input value={f.description} onChange={(e) => set("description")(e.target.value)} placeholder="Ex.: Hospedagem Hostinger" /></div>
          <div className="grid grid-cols-2 gap-2">
            <CategorySelect kind="despesa" value={f.categoryId} onChange={set("categoryId")} />
            <div className="grid gap-1.5"><Label>Valor (R$) *</Label><Input inputMode="decimal" placeholder="0,00" value={f.amount} onChange={(e) => set("amount")(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5"><Label>Frequência *</Label>
              <Select value={f.frequency} onValueChange={set("frequency")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(FREQ).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid gap-1.5"><Label>Próximo vencimento *</Label><Input type="date" value={f.next} onChange={(e) => set("next")(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <AccountSelect label="Conta prevista" value={f.accountId} onChange={set("accountId")} allowNone />
            <div className="grid gap-1.5"><Label>Status</Label>
              <Select value={f.status} onValueChange={set("status")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ativa">Ativa</SelectItem><SelectItem value="pausada">Pausada</SelectItem><SelectItem value="encerrada">Encerrada</SelectItem></SelectContent></Select>
            </div>
          </div>
          <div className="grid gap-1.5"><Label>Responsável</Label><Input value={f.responsible} onChange={(e) => set("responsible")(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>Cancelar</Button><Button type="submit" disabled={!f.description.trim() || cents <= 0 || m.isPending}>Salvar</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoriesTab() {
  const qc = useQueryClient();
  const { data } = useQuery(categoriesQuery);
  const [kind, setKind] = useState<"despesa" | "receita">("despesa");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; sort: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["fin-categories"] });
  const save = async (c: Partial<FinCategory> & { name: string; kind: string; active: boolean }) => {
    try { await saveCategory({ data: { id: c.id ?? null, name: c.name, kind: c.kind, sortOrder: c.sort_order ?? 100, active: c.active } }); toast.success("Categoria salva."); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar."); }
  };
  const list = (data ?? []).filter((c) => c.kind === kind);
  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <Button size="sm" variant={kind === "despesa" ? "default" : "outline"} onClick={() => setKind("despesa")}>Despesas</Button>
        <Button size="sm" variant={kind === "receita" ? "default" : "outline"} onClick={() => setKind("receita")}>Receitas</Button>
      </div>
      <form className="flex gap-2 sm:max-w-md" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await save({ name, kind, active: true, sort_order: 500 }); setName(""); }}>
        <Input placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!name.trim()}>Adicionar</Button>
      </form>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => (
          <div key={c.id} className={`flex items-center justify-between gap-2 rounded-md border p-2 text-sm ${c.active ? "" : "opacity-60"}`}>
            {editing?.id === c.id ? (
              <form className="flex flex-1 gap-1" onSubmit={async (e) => { e.preventDefault(); await save({ ...c, name: editing.name, sort_order: Number(editing.sort) || 100 }); setEditing(null); }}>
                <Input className="h-8" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                <Input className="h-8 w-16" inputMode="numeric" aria-label="Ordem" value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: e.target.value })} />
                <Button size="sm" type="submit">OK</Button>
              </form>
            ) : (
              <>
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setEditing({ id: c.id, name: c.name, sort: String(c.sort_order) })}>{c.name}</button>
                <label className="flex items-center gap-1 text-xs text-muted-foreground"><Switch checked={c.active} onCheckedChange={(v) => save({ ...c, active: v })} />{c.active ? "Ativa" : "Inativa"}</label>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Toque no nome para renomear ou mudar a ordem. Categorias são desativadas, nunca excluídas, para preservar o histórico.</p>
    </div>
  );
}
