import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { PeriodFilter, usePeriod } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { ordersQuery } from "@/lib/orders-queries";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/order-status";
import { OrderDetailSheet, formatDateTimeBR } from "@/components/order-detail";
import { getMySettlement } from "@/lib/settlement.functions";
import { formatBRL, formatDateBR } from "@/lib/format";
import { TechnicianStepActions } from "@/components/technician-step-actions";

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

function MinhaAreaPage() {
  const { data: session } = useSession();
  const { data: orders, isLoading } = useQuery(ordersQuery);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { today, upcoming, done } = useMemo(() => {
    const all = (orders ?? []).filter((o) => o.status !== "cancelado");
    const now = new Date();
    const isToday = (iso: string | null) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    };
    return {
      today: all.filter((o) => isToday(o.scheduled_start) && !["finalizado", "servico_concluido", "visita_concluida", "aguardando_pagamento"].includes(o.status)),
      upcoming: all.filter((o) => !isToday(o.scheduled_start) && !["finalizado", "servico_concluido", "visita_concluida", "aguardando_pagamento"].includes(o.status)),
      done: all.filter((o) => ["servico_concluido", "visita_concluida", "aguardando_pagamento", "finalizado"].includes(o.status)),
    };
  }, [orders]);

  if (session && !session.isTecnico && !session.isAdmin) {
    return <p className="text-sm text-muted-foreground">Área disponível somente para técnicos.</p>;
  }

  function renderOrder(o: NonNullable<typeof orders>[number]) {
    return (
      <Card key={o.id}>
        <CardContent className="grid gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="link" className="h-auto p-0 font-display font-semibold" onClick={() => setDetailId(o.id)}>{o.code}</Button>
            <Badge className={ORDER_STATUS_COLORS[o.status]} variant="secondary">{ORDER_STATUS_LABELS[o.status]}</Badge>
            <span className="ml-auto text-sm text-muted-foreground">{formatDateTimeBR(o.scheduled_start)}</span>
          </div>
          <div className="grid min-w-0 gap-2 border-b pb-3">
            <p className="text-sm font-medium">Valor informado pelo técnico</p>
            <p className="font-display font-semibold">{o.technician_reported_cents == null ? "Não informado" : formatBRL(o.technician_reported_cents)}</p>
            {o.technician_reported_at && <p className="text-xs text-muted-foreground">{formatDateTimeBR(o.technician_reported_at)} · {o.technician_reported_name}</p>}
            <Badge variant="outline" className="w-fit whitespace-normal">{o.financial_confirmed_at ? "Apuração financeira confirmada" : "Apuração financeira pendente"}</Badge>
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
          <TechnicianStepActions order={o} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
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

      <MyFinanceSection enabled={Boolean(session?.isTecnico)} />

      <OrderDetailSheet orderId={detailId} onClose={() => setDetailId(null)} isAdmin={Boolean(session?.isAdmin)} />
    </div>
  );
}

/** Financeiro do próprio técnico (Passo 11A): somente dados do próprio cadastro, calculados no servidor. */
function MyFinanceSection({ enabled }: { enabled: boolean }) {
  const period = usePeriod("mes");
  const { data, isLoading } = useQuery({
    queryKey: ["my-settlement", period.range.start, period.range.end],
    queryFn: () => getMySettlement({ data: period.range }),
    enabled,
  });

  if (!enabled) return null;
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando seu financeiro…</p>;
  if (!data || !data.linked) {
    return (
      <section className="grid gap-2">
        <h2 className="font-display font-semibold">Meu financeiro</h2>
        <p className="text-sm text-muted-foreground">
          Sua conta ainda não está vinculada a um cadastro de técnico. Peça a um administrador para fazer o vínculo na página de Técnicos.
        </p>
      </section>
    );
  }
  if (data.inactive) {
    return (
      <section className="grid gap-2">
        <h2 className="font-display font-semibold">Meu financeiro</h2>
        <p className="text-sm text-muted-foreground">Seu cadastro de técnico está inativo. Fale com um administrador.</p>
      </section>
    );
  }

  const services = data.services;
  const totalShare = services.reduce((sum, o) => sum + o.technicianShareCents, 0);
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-display font-semibold">Meu financeiro</h2>
        <p className="text-sm text-muted-foreground">Um serviço ou visita por linha, depois da confirmação dos valores pelo administrador.</p>
      </div>
      <PeriodFilter period={period} />
      <Card>
        <CardContent className="grid gap-1 p-4">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Minha participação no período</p>
          <p className="font-display text-xl font-semibold">{formatBRL(totalShare)}</p>
        </CardContent>
      </Card>
      {services.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum serviço confirmado no período.</p>
      ) : (
        <div className="grid gap-2">
          <div className="hidden grid-cols-3 gap-2 px-3 text-xs text-muted-foreground sm:grid"><span>Nº da OS</span><span className="text-right">Total cobrado</span><span className="text-right">Minha participação</span></div>
          {services.map((o) => (
            <div key={o.orderId} className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-md border p-3 text-sm sm:grid-cols-3">
              <span className="col-span-2 font-medium sm:col-span-1">{o.code} <span className="text-xs text-muted-foreground">{formatDateBR(o.date)}</span></span>
              <span className="sm:text-right"><span className="text-xs text-muted-foreground sm:hidden">Total cobrado </span>{formatBRL(o.totalCents)}</span>
              <span className="text-right font-semibold"><span className="text-xs font-normal text-muted-foreground sm:hidden">Participação </span>{formatBRL(o.technicianShareCents)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
