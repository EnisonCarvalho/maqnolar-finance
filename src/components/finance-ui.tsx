import { useState, type ReactNode } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { periodRange, type PeriodPreset } from "@/lib/cashflow-math";
import { formatBRL } from "@/lib/format";
import { formatISODate, todayISO } from "@/components/finance-shared";

export type FinAccount = { id: string; name: string; institution: string | null; holder: string | null; account_type: string; ownership: string; opening_balance_cents: number; opening_date: string; active: boolean };
export type FinCategory = { id: string; name: string; kind: "receita" | "despesa"; sort_order: number; active: boolean };

export const accountsQuery = queryOptions({
  queryKey: ["fin-accounts"],
  queryFn: async (): Promise<FinAccount[]> => {
    const { data, error } = await supabase.from("financial_accounts").select("*").order("name");
    if (error) throw error;
    return (data ?? []) as FinAccount[];
  },
});

export const categoriesQuery = queryOptions({
  queryKey: ["fin-categories"],
  queryFn: async (): Promise<FinCategory[]> => {
    const { data, error } = await supabase.from("finance_categories").select("*").order("sort_order").order("name");
    if (error) throw error;
    return (data ?? []) as FinCategory[];
  },
});

/** Seletor de conta da empresa (contas de sócio e inativas não aparecem). */
export function AccountSelect({ value, onChange, label = "Conta", required, allowNone }: { value: string; onChange: (v: string) => void; label?: string; required?: boolean; allowNone?: boolean }) {
  const { data } = useQuery(accountsQuery);
  const list = (data ?? []).filter((a) => a.active && a.ownership === "empresa");
  return (
    <div className="grid gap-1.5">
      <Label>{label}{required ? " *" : ""}</Label>
      <Select value={value || (allowNone ? "none" : "")} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger><SelectValue placeholder={list.length ? "Selecione a conta" : "Cadastre uma conta"} /></SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="none">Não informar agora</SelectItem>}
          {list.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CategorySelect({ kind, value, onChange }: { kind: "receita" | "despesa"; value: string; onChange: (v: string) => void }) {
  const { data } = useQuery(categoriesQuery);
  const list = (data ?? []).filter((c) => c.kind === kind && (c.active || c.id === value));
  return (
    <div className="grid gap-1.5">
      <Label>Categoria</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>{list.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
  { key: "trimestre", label: "Trimestre" },
  { key: "semestre", label: "Semestre" },
  { key: "ano", label: "Ano" },
  { key: "personalizado", label: "Período" },
];

export function usePeriod(initial: PeriodPreset = "mes") {
  const [preset, setPreset] = useState<PeriodPreset>(initial);
  const [custom, setCustom] = useState({ start: todayISO(), end: todayISO() });
  const range = periodRange(preset, custom);
  return { preset, setPreset, custom, setCustom, range };
}

export function PeriodFilter({ period }: { period: ReturnType<typeof usePeriod> }) {
  return (
    <div className="grid gap-2">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {PRESETS.map((p) => (
          <Button key={p.key} size="sm" variant={period.preset === p.key ? "default" : "outline"} className="shrink-0" onClick={() => period.setPreset(p.key)}>
            {p.label}
          </Button>
        ))}
      </div>
      {period.preset === "personalizado" && (
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <div className="grid gap-1"><Label className="text-xs">De</Label><Input type="date" value={period.custom.start} onChange={(e) => period.setCustom((c) => ({ ...c, start: e.target.value }))} /></div>
          <div className="grid gap-1"><Label className="text-xs">Até</Label><Input type="date" value={period.custom.end} onChange={(e) => period.setCustom((c) => ({ ...c, end: e.target.value }))} /></div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Período: {formatISODate(period.range.start)} a {formatISODate(period.range.end)}</p>
    </div>
  );
}

export function StatCard({ label, cents, hint, tone }: { label: string; cents: number; hint?: string; tone?: "pos" | "neg" | "auto" }) {
  const color = tone === "auto" ? (cents < 0 ? "text-destructive" : "text-primary") : tone === "neg" ? "text-destructive" : tone === "pos" ? "text-primary" : "";
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-display text-lg font-semibold sm:text-xl ${color}`}>{formatBRL(cents)}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ReasonDialog({ open, title, description, action, onClose, onConfirm }: { open: boolean; title: string; description: ReactNode; action: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setReason(""); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="text-sm">{description}</div>
          <div className="grid gap-1.5"><Label>Motivo *</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || pending}
              onClick={async () => {
                setPending(true);
                try { await onConfirm(reason); setReason(""); onClose(); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível concluir."); }
                finally { setPending(false); }
              }}
            >{action}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
