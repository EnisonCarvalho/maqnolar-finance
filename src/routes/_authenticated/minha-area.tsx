import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, HandCoins, ArrowDownCircle, ArrowUpCircle, Scale, ReceiptText } from "lucide-react";
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
  const { data, isLoading } = useQuery({
    queryKey: ["my-settlement"],
    queryFn: () => getMySettlement({ data: {} }),
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

  const s = data.overall;
  const pending = data.overallPendingCents;
  const cards = [
    { label: "Minha participação nos serviços", value: s?.technicianShareCents ?? 0, icon: Wallet },
    { label: "Reembolsos de peças devidos a mim", value: s?.reimbursementCents ?? 0, icon: ReceiptText },
    { label: "Repasses recebidos da MaqnoLar", value: s?.transfersToTechnicianCents ?? 0, icon: ArrowDownCircle },
    { label: "Valores que devo à MaqnoLar", value: s?.toReceiveFromTechnicianCents ?? 0, icon: ArrowUpCircle },
  ];

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-display font-semibold">Meu financeiro</h2>
        <p className="text-sm text-muted-foreground">Somente os valores dos seus próprios atendimentos e acertos.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="grid gap-1 p-4">
              <c.icon className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="font-display text-lg font-semibold">{formatBRL(c.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Scale className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Saldo pendente dos meus acertos</p>
            <p className="font-display text-xl font-semibold">{formatBRL(Math.abs(pending))}</p>
          </div>
          <Badge variant="secondary" className="ml-auto">
            {pending === 0 ? "Tudo acertado" : pending > 0 ? "A receber da MaqnoLar" : "A devolver à MaqnoLar"}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        <h3 className="font-display text-sm font-semibold">Repasses</h3>
        {data.transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum repasse registrado ainda.</p>
        ) : (
          data.transfers.map((t) => (
            <Card key={t.id} className={t.status !== "ativo" ? "opacity-60" : ""}>
              <CardContent className="flex flex-wrap items-center gap-2 p-3 text-sm">
                {t.direction === "empresa_para_tecnico" ? (
                  <ArrowDownCircle className="h-4 w-4 text-primary" />
                ) : (
                  <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">{formatBRL(t.amount_cents)}</span>
                <span className="text-muted-foreground">
                  {t.direction === "empresa_para_tecnico" ? "MaqnoLar → você" : "Você → MaqnoLar"}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{formatDateBR(t.transfer_date)}</span>
                {t.status !== "ativo" && <Badge variant="secondary">estornado</Badge>}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="grid gap-3">
        <h3 className="font-display text-sm font-semibold">Fechamentos de acerto</h3>
        {data.closings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum fechamento registrado ainda.</p>
        ) : (
          data.closings.map((c) => (
            <Card key={c.id} className={c.status === "reaberto" ? "opacity-60" : ""}>
              <CardContent className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <HandCoins className="h-4 w-4 text-muted-foreground" />
                <span>
                  {formatDateBR(c.period_start)} a {formatDateBR(c.period_end)}
                </span>
                <span className="text-muted-foreground">Pendente: {formatBRL(Math.abs(c.pending_cents))}</span>
                <Badge variant="secondary" className="ml-auto">
                  {c.status === "fechado" ? "Acertado" : c.status === "fechado_com_pendencia" ? "Com pendência" : "Reaberto"}
                </Badge>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
