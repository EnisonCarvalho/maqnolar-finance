import { useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, PencilLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_ORIGINS } from "@/lib/lead-math";
import { correctOrigin } from "@/lib/leads.functions";

export type CampaignLite = { id: string; name: string; platform: string; status: string };
const CSTATUS: Record<string, string> = { planejada: "planejada", ativa: "ativa", pausada: "pausada", encerrada: "encerrada" };

export const campaignsLiteQuery = queryOptions({
  queryKey: ["campaigns-lite"],
  queryFn: async (): Promise<CampaignLite[]> => {
    const { data, error } = await supabase.from("campaigns").select("id, name, platform, status").order("start_date", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export function campaignLabel(c: CampaignLite | undefined) {
  return c ? `${c.name}${c.status !== "ativa" ? ` (${CSTATUS[c.status] ?? c.status})` : ""}` : "—";
}

/** Origem + campanha (qualquer status, para registrar a origem histórica) + criativo. */
export function OriginFields({ value, onChange }: { value: { origin: string; campaignId: string; creativeCode: string }; onChange: (v: { origin: string; campaignId: string; creativeCode: string }) => void }) {
  const { data: campaigns } = useQuery(campaignsLiteQuery);
  const noCampaign = value.origin === "indicacao" || value.origin === "organico";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="grid gap-1.5"><Label>Origem *</Label>
        <Select value={value.origin} onValueChange={(o) => onChange({ ...value, origin: o, campaignId: o === "indicacao" || o === "organico" ? "" : value.campaignId })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(LEAD_ORIGINS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select></div>
      <div className="grid gap-1.5"><Label>Campanha</Label>
        <Select value={value.campaignId || "none"} onValueChange={(v) => onChange({ ...value, campaignId: v === "none" ? "" : v })} disabled={noCampaign}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">Sem campanha</SelectItem>{(campaigns ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{campaignLabel(c)}</SelectItem>)}</SelectContent>
        </Select></div>
      <div className="grid gap-1.5"><Label>Código do criativo/anúncio</Label><Input value={value.creativeCode} onChange={(e) => onChange({ ...value, creativeCode: e.target.value })} /></div>
    </div>
  );
}

export function OriginCorrectionDialog({ entityType, id, current, open, onClose, onSaved }: {
  entityType: "lead" | "order"; id: string; current: { origin: string | null; campaign_id: string | null; creative_code: string | null }; open: boolean; onClose: () => void; onSaved: () => Promise<unknown> | void;
}) {
  const [v, setV] = useState({ origin: current.origin ?? "outra", campaignId: current.campaign_id ?? "", creativeCode: current.creative_code ?? "" });
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Corrigir origem</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <OriginFields value={v} onChange={setV} />
          <div className="grid gap-1.5"><Label>Justificativa *</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">A correção fica registrada no histórico com a origem anterior.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button disabled={!reason.trim() || pending} onClick={async () => {
              setPending(true);
              try { await correctOrigin({ data: { entityType, id, origin: v.origin, campaignId: v.campaignId || null, creativeCode: v.creativeCode, reason } }); toast.success("Origem corrigida."); await onSaved(); onClose(); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Erro."); }
              finally { setPending(false); }
            }}>Salvar correção</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function originText(origin: string | null, campaignId: string | null, campaigns: CampaignLite[] | undefined, creative?: string | null) {
  if (!origin) return "Origem não informada";
  const c = campaigns?.find((x) => x.id === campaignId);
  return [LEAD_ORIGINS[origin] ?? origin, c ? campaignLabel(c) : null, creative ? `criativo ${creative}` : null].filter(Boolean).join(" · ");
}

export function CorrectionsList({ entityId }: { entityId: string }) {
  const { data: campaigns } = useQuery(campaignsLiteQuery);
  const { data } = useQuery({
    queryKey: ["origin-corrections", entityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("origin_corrections").select("*").eq("entity_id", entityId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!data?.length) return null;
  return (
    <div className="grid gap-1 text-sm">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><History className="h-3.5 w-3.5" />Correções de origem</p>
      {data.map((c) => (
        <div key={c.id} className="rounded border p-2 text-xs">
          <p>{originText(c.old_origin, c.old_campaign_id, campaigns, c.old_creative_code)} → <strong>{originText(c.new_origin, c.new_campaign_id, campaigns, c.new_creative_code)}</strong></p>
          <p className="text-muted-foreground">{c.reason} · {new Date(c.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
        </div>
      ))}
    </div>
  );
}

/** Bloco de origem no detalhe do atendimento (admin). */
export function OrderOrigin({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { data: campaigns } = useQuery(campaignsLiteQuery);
  const { data } = useQuery({
    queryKey: ["order-origin", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_orders").select("origin, campaign_id, creative_code, lead_id, leads!service_orders_lead_id_fkey(full_name, contacted_at)").eq("id", orderId).single();
      if (error) throw error;
      return data as unknown as { origin: string | null; campaign_id: string | null; creative_code: string | null; lead_id: string | null; leads: { full_name: string; contacted_at: string } | null };
    },
  });
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-semibold">Origem</h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}><PencilLine className="mr-1 h-4 w-4" />Corrigir</Button>
      </div>
      <p className="text-sm">{originText(data.origin, data.campaign_id, campaigns, data.creative_code)}</p>
      {data.leads && <p className="text-xs text-muted-foreground">Lead: {data.leads.full_name} · contato em {new Date(data.leads.contacted_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>}
      <CorrectionsList entityId={orderId} />
      {open && <OriginCorrectionDialog entityType="order" id={orderId} current={data} open onClose={() => setOpen(false)} onSaved={() => Promise.all([qc.invalidateQueries({ queryKey: ["order-origin", orderId] }), qc.invalidateQueries({ queryKey: ["origin-corrections", orderId] }), qc.invalidateQueries({ queryKey: ["service-order", orderId] })])} />}
    </div>
  );
}
