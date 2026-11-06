import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeftRight, Pencil, Plus, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, parseBRLToCents } from "@/lib/format";
import { saveAccount, createAccountTransfer, voidAccountTransfer, getFinanceOverview } from "@/lib/finance-ops.functions";
import { accountsQuery, AccountSelect, ReasonDialog, type FinAccount } from "@/components/finance-ui";
import { formatISODate, todayISO } from "@/components/finance-shared";
import { useSession } from "@/hooks/use-session";
import { NoAccess } from "@/components/no-access";

export const Route = createFileRoute("/_authenticated/contas")({
  head: () => ({
    meta: [
      { title: "Contas bancárias e financeiras — MaqnoLar Financeiro" },
      { name: "description", content: "Contas da MaqnoLar, saldos e transferências entre contas." },
      { property: "og:title", content: "Contas bancárias e financeiras — MaqnoLar Financeiro" },
      { property: "og:description", content: "Contas da MaqnoLar, saldos e transferências entre contas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const TYPE_LABELS: Record<string, string> = { banco: "Conta bancária", carteira_digital: "Carteira digital", caixa: "Dinheiro em caixa", outro: "Outra" };

function Page() {
  const { data: session } = useSession();
  if (session && !session.isAdmin) return <NoAccess />;
  return <Content />;
}

function Content() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getFinanceOverview);
  const today = todayISO();
  const { data: accounts } = useQuery(accountsQuery);
  const { data: overview } = useQuery({ queryKey: ["fin-overview", today, today], queryFn: () => overviewFn({ data: { start: today, end: today } }) });
  const { data: transfers } = useQuery({
    queryKey: ["fin-account-transfers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_transfers").select("*").order("transfer_date", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [editing, setEditing] = useState<FinAccount | "new" | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["fin-accounts"] }), qc.invalidateQueries({ queryKey: ["fin-overview"] }), qc.invalidateQueries({ queryKey: ["fin-account-transfers"] })]);
  const balance = (id: string) => overview?.cash.flows.find((f) => f.accountId === id)?.closingCents;
  const name = (id: string) => accounts?.find((a) => a.id === id)?.name ?? "—";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold md:text-3xl">Contas bancárias e financeiras</h1>
          <p className="mt-1 text-sm text-muted-foreground">Saldo atual considera só movimentações efetivas. Transferências entre contas não são receita nem despesa.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button variant="outline" onClick={() => setTransferOpen(true)}><ArrowLeftRight className="mr-1 h-4 w-4" />Transferir</Button>
          <Button onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" />Nova conta</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Saldo total nas contas da empresa (hoje)</p>
          <p className="font-display text-2xl font-semibold text-primary">{formatBRL(overview?.cash.totals.closingCents ?? 0)}</p>
          {(overview?.unassignedCount ?? 0) > 0 && <p className="mt-1 text-xs text-muted-foreground">{overview?.unassignedCount} movimentação(ões) sem conta definida aparecem em "Sem conta definida".</p>}
        </CardContent>
      </Card>

      {(accounts ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada. Cadastre a conta bancária, Mercado Pago, Nubank ou o dinheiro em caixa.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(accounts ?? []).map((a) => (
          <Card key={a.id} className={a.active ? "" : "opacity-60"}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="min-w-0">
                <CardTitle className="font-display text-base">{a.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{TYPE_LABELS[a.account_type]}{a.institution ? ` · ${a.institution}` : ""}{a.holder ? ` · ${a.holder}` : ""}</p>
              </div>
              <Button size="icon" variant="ghost" aria-label="Editar conta" onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="grid gap-1">
              {a.ownership === "socio" ? (
                <p className="text-sm text-muted-foreground">Conta pessoal de sócio — fora do caixa da empresa</p>
              ) : (
                <p className="font-display text-xl font-semibold">{formatBRL(balance(a.id) ?? a.opening_balance_cents)}</p>
              )}
              <p className="text-xs text-muted-foreground">Saldo inicial {formatBRL(a.opening_balance_cents)} em {formatISODate(a.opening_date)}</p>
              <div className="flex gap-1">
                {!a.active && <Badge variant="secondary">Inativa</Badge>}
                {a.ownership === "socio" && <Badge variant="outline">Sócio</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
        {(overview?.cash.flows ?? []).filter((f) => !f.accountId).map((f) => (
          <Card key="none" className="border-dashed">
            <CardHeader className="pb-2"><CardTitle className="font-display text-base">Sem conta definida</CardTitle></CardHeader>
            <CardContent><p className="font-display text-xl font-semibold">{formatBRL(f.closingCents)}</p><p className="text-xs text-muted-foreground">Movimentações registradas sem indicar a conta.</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-2">
        <h2 className="font-display text-lg font-semibold">Transferências entre contas</h2>
        {(transfers ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma transferência registrada.</p>}
        {(transfers ?? []).map((t) => (
          <div key={t.id} className={`flex items-start justify-between gap-2 rounded-md border p-3 text-sm ${t.status === "estornado" ? "opacity-60" : ""}`}>
            <div className="min-w-0">
              <p className="font-medium">{formatBRL(t.amount_cents)} · {name(t.from_account_id)} → {name(t.to_account_id)}</p>
              <p className="text-xs text-muted-foreground">{formatISODate(t.transfer_date)}{t.notes ? ` · ${t.notes}` : ""}</p>
              {t.status === "estornado" && <p className="text-xs text-destructive">Estornada: {t.void_reason}</p>}
            </div>
            {t.status === "ativo" && <Button size="icon" variant="ghost" aria-label="Estornar transferência" onClick={() => setVoiding(t.id)}><Undo2 className="h-4 w-4" /></Button>}
          </div>
        ))}
      </div>

      <AccountDialog target={editing} onClose={() => setEditing(null)} onDone={refresh} />
      <TransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} onDone={refresh} />
      <ReasonDialog open={Boolean(voiding)} title="Estornar transferência" description="A transferência fica no histórico como estornada." action="Estornar" onClose={() => setVoiding(null)}
        onConfirm={async (reason) => { await voidAccountTransfer({ data: { id: voiding!, reason } }); toast.success("Transferência estornada."); await refresh(); }} />
    </div>
  );
}

function AccountDialog({ target, onClose, onDone }: { target: FinAccount | "new" | null; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [form, setForm] = useState({ name: "", institution: "", holder: "", accountType: "banco", ownership: "empresa", opening: "0,00", openingDate: todayISO(), active: true });
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = target === "new" ? "new" : target?.id ?? null;
  if (key && key !== loaded) {
    setLoaded(key);
    if (target && target !== "new") setForm({ name: target.name, institution: target.institution ?? "", holder: target.holder ?? "", accountType: target.account_type, ownership: target.ownership, opening: (target.opening_balance_cents / 100).toFixed(2).replace(".", ","), openingDate: target.opening_date, active: target.active });
    else setForm({ name: "", institution: "", holder: "", accountType: "banco", ownership: "empresa", opening: "0,00", openingDate: todayISO(), active: true });
  }
  const close = () => { setLoaded(null); onClose(); };
  const m = useMutation({
    mutationFn: () => saveAccount({ data: { id: target !== "new" ? target?.id : null, name: form.name, institution: form.institution, holder: form.holder, accountType: form.accountType, ownership: form.ownership, openingBalanceCents: parseBRLToCents(form.opening) ?? 0, openingDate: form.openingDate, active: form.active } }),
    onSuccess: async () => { toast.success("Conta salva."); close(); await onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });
  const set = (k: keyof typeof form) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{target === "new" ? "Nova conta" : "Editar conta"}</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="grid gap-1.5"><Label>Nome *</Label><Input value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Ex.: Nubank MaqnoLar" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5"><Label>Instituição</Label><Input value={form.institution} onChange={(e) => set("institution")(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Titular</Label><Input value={form.holder} onChange={(e) => set("holder")(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5"><Label>Tipo</Label>
              <Select value={form.accountType} onValueChange={set("accountType")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid gap-1.5"><Label>Classificação</Label>
              <Select value={form.ownership} onValueChange={set("ownership")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="empresa">Da empresa</SelectItem><SelectItem value="socio">Pessoal de sócio</SelectItem></SelectContent></Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5"><Label>Saldo inicial (R$)</Label><Input inputMode="decimal" value={form.opening} onChange={(e) => set("opening")(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Data do saldo</Label><Input type="date" value={form.openingDate} onChange={(e) => set("openingDate")(e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.active} onCheckedChange={set("active")} />Conta ativa</label>
          <p className="text-xs text-muted-foreground">Não é necessário informar agência, número ou dados sensíveis.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>Cancelar</Button><Button type="submit" disabled={!form.name.trim() || m.isPending}>Salvar</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO);
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const cents = parseBRLToCents(amount) ?? 0;
  const m = useMutation({
    mutationFn: () => createAccountTransfer({ data: { fromAccountId: from, toAccountId: to, amountCents: cents, date, notes } }),
    onSuccess: async () => { toast.success("Transferência registrada."); setAmount(""); setNotes(""); setConfirming(false); onClose(); await onDone(); },
    onError: (e) => { setConfirming(false); toast.error(e instanceof Error ? e.message : "Não foi possível registrar."); },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setConfirming(false); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Transferência entre contas</DialogTitle></DialogHeader>
        {confirming ? (
          <div className="grid gap-3 text-sm">
            <p>Confirmar transferência de <strong>{formatBRL(cents)}</strong> em {formatISODate(date)}? Não gera receita nem despesa.</p>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirming(false)}>Voltar</Button><Button disabled={m.isPending} onClick={() => m.mutate()}>Confirmar</Button></div>
          </div>
        ) : (
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); setConfirming(true); }}>
            <AccountSelect label="De" value={from} onChange={setFrom} required />
            <AccountSelect label="Para" value={to} onChange={setTo} required />
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5"><Label>Valor (R$) *</Label><Input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Data *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
            <div className="grid gap-1.5"><Label>Observações</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={!from || !to || from === to || cents <= 0}>Continuar</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
