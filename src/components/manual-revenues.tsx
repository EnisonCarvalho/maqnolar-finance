import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, parseBRLToCents } from "@/lib/format";
import { createRevenue, receiveRevenue, updateRevenue, voidRevenue } from "@/lib/finance-ops.functions";
import { ReasonDialog } from "@/components/finance-ui";
import { METHOD_LABELS, formatISODate, todayISO } from "@/components/finance-shared";

type Rev = { id: string; description: string; amount_cents: number; competence_date: string; received_at: string | null; notes: string | null; status: string };

async function companyAccount(): Promise<string> {
  const { data } = await supabase.from("financial_accounts").select("id").eq("active", true).eq("ownership", "empresa").order("created_at").limit(1).maybeSingle();
  if (!data) throw new Error("Não há conta interna ativa da empresa.");
  return data.id;
}

/** Receitas manuais (fora das OS): adicionar, editar, receber e remover (estorno com motivo). */
export function ManualRevenues({ start, end }: { start: string; end: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["manual-revenues", start, end],
    queryFn: async (): Promise<Rev[]> => {
      const { data, error } = await supabase.from("other_revenues").select("id, description, amount_cents, competence_date, received_at, notes, status").eq("status", "ativo").gte("competence_date", start).lte("competence_date", end).order("competence_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Rev[];
    },
  });
  const [editing, setEditing] = useState<Rev | "new" | null>(null);
  const [removing, setRemoving] = useState<Rev | null>(null);
  const refresh = () => qc.invalidateQueries();
  const receive = useMutation({
    mutationFn: async (r: Rev) => receiveRevenue({ data: { id: r.id, receivedAt: todayISO(), method: "pix", accountId: await companyAccount() } }),
    onSuccess: async () => { toast.success("Recebimento registrado."); await refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível registrar."),
  });
  const rows = data ?? [];
  return (
    <section className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">Receitas manuais</h2>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" />Adicionar receita</Button>
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma receita manual no período.</p>}
      {rows.map((r) => (
        <div key={r.id} className="grid gap-2 rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><p className="font-medium">{r.description}</p><p className="text-xs text-muted-foreground">Competência {formatISODate(r.competence_date)}</p></div>
            <div className="text-right"><p className="font-semibold">{formatBRL(r.amount_cents)}</p><Badge variant="outline">{r.received_at ? `Recebida ${formatISODate(r.received_at)}` : "A receber"}</Badge></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!r.received_at && <Button size="sm" variant="outline" disabled={receive.isPending} onClick={() => receive.mutate(r)}><Wallet className="mr-1 h-4 w-4" />Recebida hoje</Button>}
            {!r.received_at && <Button size="sm" variant="outline" onClick={() => setEditing(r)}><Pencil className="mr-1 h-4 w-4" />Editar</Button>}
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemoving(r)}><Trash2 className="mr-1 h-4 w-4" />Remover</Button>
          </div>
        </div>
      ))}
      <RevenueDialog target={editing} onClose={() => setEditing(null)} onDone={refresh} />
      <ReasonDialog open={Boolean(removing)} title="Remover receita" description={`Remover "${removing?.description}"? ${removing?.received_at ? "O recebimento é estornado (sai do caixa) e a" : "A"} receita fica no histórico como estornada.`} action="Remover" onClose={() => setRemoving(null)}
        onConfirm={async (reason) => { await voidRevenue({ data: { id: removing!.id, reason } }); toast.success("Receita removida."); await refresh(); }} />
    </section>
  );
}

function RevenueDialog({ target, onClose, onDone }: { target: Rev | "new" | null; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [f, setF] = useState({ description: "", amount: "", competence: todayISO(), notes: "", received: false, method: "pix" });
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = target === "new" ? "new" : target?.id ?? null;
  if (key && key !== loaded) {
    setLoaded(key);
    setF(target && target !== "new" ? { description: target.description, amount: (target.amount_cents / 100).toFixed(2).replace(".", ","), competence: target.competence_date, notes: target.notes ?? "", received: false, method: "pix" } : { description: "", amount: "", competence: todayISO(), notes: "", received: false, method: "pix" });
  }
  const close = () => { setLoaded(null); onClose(); };
  const cents = parseBRLToCents(f.amount) ?? 0;
  const isNew = target === "new";
  const m = useMutation({
    mutationFn: async () => isNew
      ? createRevenue({ data: { description: f.description, amountCents: cents, competenceDate: f.competence, notes: f.notes, ...(f.received ? { receivedAt: f.competence, method: f.method, accountId: await companyAccount() } : {}) } })
      : updateRevenue({ data: { id: (target as Rev).id, description: f.description, amountCents: cents, competenceDate: f.competence, notes: f.notes } }),
    onSuccess: async () => { toast.success(isNew ? "Receita adicionada." : "Receita atualizada."); close(); await onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{isNew ? "Adicionar receita manual" : "Editar receita"}</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (f.description.trim() && cents > 0) m.mutate(); }}>
          <div className="grid gap-1.5"><Label>Descrição *</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5"><Label>Valor (R$) *</Label><Input inputMode="decimal" placeholder="0,00" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Data *</Label><Input type="date" value={f.competence} onChange={(e) => setF({ ...f, competence: e.target.value })} /></div>
          </div>
          {isNew && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.received} onChange={(e) => setF({ ...f, received: e.target.checked })} />Já foi recebida</label>}
          {isNew && f.received && <Select value={f.method} onValueChange={(v) => setF({ ...f, method: v })}><SelectTrigger aria-label="Forma"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>}
          <div className="grid gap-1.5"><Label>Observações</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>Cancelar</Button><Button type="submit" disabled={m.isPending || !f.description.trim() || cents <= 0}>{m.isPending ? "Salvando…" : "Salvar"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
