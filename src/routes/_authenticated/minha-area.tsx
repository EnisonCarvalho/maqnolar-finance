import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Navigation, SearchCheck, Wrench, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { ordersQuery } from "@/lib/orders-queries";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, type OrderStatus } from "@/lib/order-status";
import { OrderDetailSheet, formatDateTimeBR } from "@/components/order-detail";
import { changeOrderStatus } from "@/lib/orders.functions";

export const Route = createFileRoute("/_authenticated/minha-area")({
  head: () => ({
    meta: [
      { title: "Minha área — MaqnoLar Financeiro" },
      { name: "description", content: "Área do técnico: meus atendimentos e agenda." },
      { property: "og:title", content: "Minha área — MaqnoLar Financeiro" },
      { property: "og:description", content: "Área do técnico: meus atendimentos e agenda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinhaAreaPage,
});

const NEXT_ACTIONS: Partial<Record<OrderStatus, { label: string; status: OrderStatus; icon: typeof Navigation }[]>> = {
  visita_agendada: [{ label: "Estou a caminho", status: "tecnico_a_caminho", icon: Navigation }],
  tecnico_a_caminho: [{ label: "Iniciar diagnóstico", status: "em_diagnostico", icon: SearchCheck }],
  em_diagnostico: [{ label: "Iniciar serviço", status: "servico_em_andamento", icon: Wrench }],
  orcamento_aprovado: [{ label: "Iniciar serviço", status: "servico_em_andamento", icon: Wrench }],
  aguardando_peca: [{ label: "Iniciar serviço", status: "servico_em_andamento", icon: Wrench }],
  servico_em_andamento: [{ label: "Concluir serviço", status: "servico_concluido", icon: CheckCircle2 }],
};

function MinhaAreaPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useQuery(ordersQuery);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [conclusionNote, setConclusionNote] = useState<Record<string, string>>({});

  const statusMutation = useMutation({
    mutationFn: ({ orderId, status, note }: { orderId: string; status: OrderStatus; note?: string | undefined }) =>
      changeOrderStatus({ data: { orderId, status, note } }),
    onSuccess: async () => {
      toast.success("Atualização registrada.");
      await queryClient.invalidateQueries({ queryKey: ["service-orders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar."),
  });

  const { today, upcoming, done } = useMemo(() => {
    const all = (orders ?? []).filter((o) => o.status !== "cancelado");
    const now = new Date();
    const isToday = (iso: string | null) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    };
    return {
      today: all.filter((o) => isToday(o.scheduled_start) && o.status !== "finalizado"),
      upcoming: all.filter((o) => !isToday(o.scheduled_start) && !["finalizado", "servico_concluido", "aguardando_pagamento"].includes(o.status)),
      done: all.filter((o) => ["servico_concluido", "aguardando_pagamento", "finalizado"].includes(o.status)),
    };
  }, [orders]);

  if (session && !session.isTecnico && !session.isAdmin) {
    return <p className="text-sm text-muted-foreground">Área disponível somente para técnicos.</p>;
  }

  function renderOrder(o: NonNullable<typeof orders>[number]) {
    const actions = NEXT_ACTIONS[o.status] ?? [];
    return (
      <Card key={o.id}>
        <CardContent className="grid gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button className="font-display font-semibold hover:underline" onClick={() => setDetailId(o.id)}>{o.code}</button>
            <Badge className={ORDER_STATUS_COLORS[o.status]} variant="secondary">{ORDER_STATUS_LABELS[o.status]}</Badge>
            <span className="ml-auto text-sm text-muted-foreground">{formatDateTimeBR(o.scheduled_start)}</span>
          </div>
          <div className="text-sm">
            <p className="font-medium">{o.customers?.full_name} {o.customers?.phone ? `· ${o.customers.phone}` : ""}</p>
            <p className="text-muted-foreground">
              {[o.endereco, o.numero].filter(Boolean).join(", ")}
              {o.bairro ? ` · ${o.bairro}` : ""}{o.cidade ? ` · ${o.cidade}` : ""}
            </p>
            {o.ponto_referencia && <p className="text-xs text-muted-foreground">Ref.: {o.ponto_referencia}</p>}
            <p className="mt-1">{o.equipment_types?.name ? `${o.equipment_types.name}: ` : ""}{o.reported_problem}</p>
          </div>
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button
                  key={a.status}
                  size="sm"
                  disabled={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({
                      orderId: o.id,
                      status: a.status,
                      note: a.status === "servico_concluido" ? conclusionNote[o.id] || undefined : undefined,
                    })
                  }
                >
                  <a.icon className="mr-1 h-4 w-4" /> {a.label}
                </Button>
              ))}
            </div>
          )}
          {o.status === "servico_em_andamento" && (
            <Textarea
              rows={2}
              placeholder="Observação da conclusão (opcional)"
              value={conclusionNote[o.id] ?? ""}
              onChange={(e) => setConclusionNote({ ...conclusionNote, [o.id]: e.target.value })}
            />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Minha área</h1>
        <p className="text-sm text-muted-foreground">Seus atendimentos e sua agenda. Somente os serviços atribuídos a você aparecem aqui.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <section className="grid gap-3">
            <h2 className="font-display font-semibold">Hoje</h2>
            {today.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma visita agendada para hoje.</p>
            ) : today.map(renderOrder)}
          </section>
          <section className="grid gap-3">
            <h2 className="font-display font-semibold">Próximos atendimentos</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum atendimento pendente.</p>
            ) : upcoming.map(renderOrder)}
          </section>
          <section className="grid gap-3">
            <h2 className="font-display font-semibold">Concluídos</h2>
            {done.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum serviço concluído ainda.</p>
            ) : done.map(renderOrder)}
          </section>
        </>
      )}

      <OrderDetailSheet orderId={detailId} onClose={() => setDetailId(null)} isAdmin={Boolean(session?.isAdmin)} />
    </div>
  );
}
