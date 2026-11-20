import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/hooks/use-session";
import { NoAccess } from "@/components/no-access";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { formatISODate } from "@/components/finance-shared";
import { WarrantyNoteActions, canIssueWarranty, type EligibleOrder } from "@/components/warranty-note-dialog";

export const Route = createFileRoute("/_authenticated/notas-garantia")({
  head: () => ({
    meta: [
      { title: "Notas de garantia — MaqnoLar Financeiro" },
      { name: "description", content: "Emissão de notas de serviço com termos de garantia da MaqnoLar." },
      { property: "og:title", content: "Notas de garantia — MaqnoLar Financeiro" },
      { property: "og:description", content: "Emissão de notas de serviço com termos de garantia da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Row = EligibleOrder & { customer: string | null; total: number | null; note: { number: string } | null };

function Page() {
  const { data: session } = useSession();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["warranty-notes"],
    enabled: Boolean(session?.isAdmin),
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("service_orders")
        .select("id, code, status, financial_confirmed_at, reported_problem, completed_at, offered_warranty_days, customers(full_name), order_financials(kind, total_cents), warranty_notes(number)")
        .eq("status", "finalizado").is("archived_at", null).order("completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((o: any) => {
        const f = Array.isArray(o.order_financials) ? o.order_financials[0] : o.order_financials;
        const n = Array.isArray(o.warranty_notes) ? o.warranty_notes[0] : o.warranty_notes;
        return { ...o, customer: o.customers?.full_name ?? null, kind: f?.kind ?? null, total: f?.total_cents ?? null, note: n ?? null };
      }).filter((o) => o.note || canIssueWarranty(o));
    },
  });
  if (session && !session.isAdmin) return <NoAccess />;
  return (
    <div className="mx-auto grid max-w-4xl gap-4 p-4 pb-24 md:p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Notas de garantia</h1>
        <p className="text-sm text-muted-foreground">Serviços finalizados pelo admin. Visitas não geram nota.</p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : rows.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Nenhum serviço finalizado disponível para nota.</CardContent></Card>
      ) : rows.map((r) => (
        <Card key={r.id}><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.code}</span>
              {r.note ? <Badge>Nota {r.note.number}</Badge> : <Badge variant="secondary">Sem nota</Badge>}
            </div>
            <p className="truncate text-sm">{r.customer ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{formatISODate(r.completed_at)} · {formatBRL(r.total)}</p>
          </div>
          <WarrantyNoteActions order={r} />
        </CardContent></Card>
      ))}
    </div>
  );
}
