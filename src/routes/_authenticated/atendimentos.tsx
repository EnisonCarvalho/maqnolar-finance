import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/hooks/use-session";
import { ordersQuery, techniciansQuery, type OrderRow } from "@/lib/orders-queries";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/order-status";
import { OrderFormDialog } from "@/components/order-form";
import { OrderDetailSheet, formatDateTimeBR } from "@/components/order-detail";

export const Route = createFileRoute("/_authenticated/atendimentos")({
  head: () => ({
    meta: [
      { title: "Atendimentos e agenda — MaqnoLar Financeiro" },
      { name: "description", content: "Central de atendimentos, visitas técnicas e orçamentos da MaqnoLar Assistência Técnica." },
      { property: "og:title", content: "Atendimentos e agenda — MaqnoLar Financeiro" },
      { property: "og:description", content: "Central de atendimentos, visitas técnicas e orçamentos da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AtendimentosPage,
});

type Period = "todos" | "dia" | "semana" | "mes" | "ano";

function periodStart(period: Period): Date | null {
  const now = new Date();
  if (period === "dia") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "semana") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - d.getDay());
    return d;
  }
  if (period === "mes") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "ano") return new Date(now.getFullYear(), 0, 1);
  return null;
}

const OPEN_STATUSES = ["novo", "aguardando_agendamento", "visita_agendada", "tecnico_a_caminho", "em_diagnostico", "orcamento_enviado", "aguardando_aprovacao", "orcamento_aprovado", "aguardando_peca", "servico_em_andamento", "aguardando_pagamento"];

function AtendimentosPage() {
  const { data: session } = useSession();
  const { data: orders, isLoading } = useQuery(ordersQuery);
  const { data: technicians } = useQuery(techniciansQuery);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [tech, setTech] = useState("todos");
  const [period, setPeriod] = useState<Period>("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OrderRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const start = periodStart(period);
    const q = search.trim().toLowerCase();
    return (orders ?? []).filter((o) => {
      if (status !== "todos" && o.status !== status) return false;
      if (tech !== "todos" && o.technician_id !== tech) return false;
      if (start && new Date(o.opened_at) < start) return false;
      if (q) {
        const hay = `${o.code} ${o.customers?.full_name ?? ""} ${o.equipment_types?.name ?? ""} ${o.reported_problem}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, status, tech, period]);

  const kpis = useMemo(() => {
    const all = orders ?? [];
    return [
      { label: "Atendimentos abertos", value: all.filter((o) => OPEN_STATUSES.includes(o.status)).length },
      { label: "Visitas agendadas", value: all.filter((o) => o.status === "visita_agendada").length },
      { label: "Orçamentos pendentes", value: all.filter((o) => ["orcamento_enviado", "aguardando_aprovacao"].includes(o.status)).length },
      { label: "Orçamentos aprovados", value: all.filter((o) => o.status === "orcamento_aprovado").length },
      { label: "Serviços concluídos", value: all.filter((o) => ["servico_concluido", "aguardando_pagamento", "finalizado"].includes(o.status)).length },
      { label: "Cancelados", value: all.filter((o) => o.status === "cancelado").length },
    ];
  }, [orders]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Atendimentos e agenda</h1>
          <p className="text-sm text-muted-foreground">Central de atendimentos, visitas técnicas e orçamentos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/agenda"><CalendarDays className="mr-2 h-4 w-4" /> Agenda</Link>
          </Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Novo atendimento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="font-display text-2xl font-semibold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por código, cliente, equipamento ou problema…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{ORDER_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tech} onValueChange={setTech}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Técnico" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os técnicos</SelectItem>
            {(technicians ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo o período</SelectItem>
            <SelectItem value="dia">Hoje</SelectItem>
            <SelectItem value="semana">Esta semana</SelectItem>
            <SelectItem value="mes">Este mês</SelectItem>
            <SelectItem value="ano">Este ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cartões no celular */}
      <div className="grid gap-2 md:hidden">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum atendimento encontrado.</p>
        ) : (
          filtered.map((o) => (
            <button key={o.id} onClick={() => setDetailId(o.id)} className="rounded-lg border bg-card p-3 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display font-semibold">{o.code}</span>
                <Badge className={ORDER_STATUS_COLORS[o.status]} variant="secondary">{ORDER_STATUS_LABELS[o.status]}</Badge>
              </div>
              {!o.financial_confirmed_at && (o.status === "servico_concluido" || o.status === "visita_concluida") && (
                <Badge variant="outline" className="mt-1 w-fit border-amber-500 text-amber-700 dark:text-amber-400">Pendente de confirmação</Badge>
              )}
              <p className="mt-1 font-medium">{o.customers?.full_name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">
                {o.equipment_types?.name ?? "—"} · {o.technicians?.full_name ?? "Sem técnico"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Agendado: {formatDateTimeBR(o.scheduled_start)}</p>
            </button>
          ))
        )}
      </div>

      {/* Tabela em telas maiores */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Equipamento</TableHead>
                <TableHead>Técnico</TableHead>
                <TableHead className="hidden lg:table-cell">Agendado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum atendimento encontrado.</TableCell></TableRow>
              ) : (
                filtered.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => setDetailId(o.id)}>
                    <TableCell className="font-medium">{o.code}</TableCell>
                    <TableCell>{o.customers?.full_name ?? "—"}</TableCell>
                    <TableCell>{o.equipment_types?.name ?? "—"}</TableCell>
                    <TableCell>{o.technicians?.full_name ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{formatDateTimeBR(o.scheduled_start)}</TableCell>
                    <TableCell>
                      <Badge className={ORDER_STATUS_COLORS[o.status]} variant="secondary">{ORDER_STATUS_LABELS[o.status]}</Badge>
                      {!o.financial_confirmed_at && (o.status === "servico_concluido" || o.status === "visita_concluida") && (
                        <Badge variant="outline" className="ml-1 border-amber-500 text-amber-700 dark:text-amber-400">Pendente de confirmação</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); setEditing(o); setFormOpen(true); }}
                        disabled={!session?.isAdmin || o.status === "finalizado" || o.status === "cancelado"}
                      >
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OrderFormDialog open={formOpen} onOpenChange={setFormOpen} order={editing} />
      <OrderDetailSheet orderId={detailId} onClose={() => setDetailId(null)} isAdmin={Boolean(session?.isAdmin)} />
    </div>
  );
}
