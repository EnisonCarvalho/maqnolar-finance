import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSession } from "@/hooks/use-session";
import { ordersQuery, techniciansQuery, type OrderRow } from "@/lib/orders-queries";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/order-status";
import { OrderDetailSheet } from "@/components/order-detail";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda operacional — MaqnoLar Financeiro" },
      { name: "description", content: "Agenda diária, semanal e mensal das visitas técnicas da MaqnoLar." },
      { property: "og:title", content: "Agenda operacional — MaqnoLar Financeiro" },
      { property: "og:description", content: "Agenda diária, semanal e mensal das visitas técnicas da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendaPage,
});

type View = "dia" | "semana" | "mes";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function OrderChip({ order, onClick }: { order: OrderRow; onClick: () => void }) {
  const start = order.scheduled_start ? new Date(order.scheduled_start) : null;
  return (
    <button
      onClick={onClick}
      className={`w-full rounded px-2 py-1 text-left text-xs font-medium ${ORDER_STATUS_COLORS[order.status]}`}
    >
      {start && `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")} · `}
      {order.customers?.full_name ?? order.code}
      {order.technicians ? ` · ${order.technicians.full_name.split(" ")[0]}` : ""}
    </button>
  );
}

function AgendaPage() {
  const { data: session } = useSession();
  const { data: orders } = useQuery(ordersQuery);
  const { data: technicians } = useQuery(techniciansQuery);
  const [view, setView] = useState<View>("semana");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [tech, setTech] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [detailId, setDetailId] = useState<string | null>(null);

  const scheduled = useMemo(() => {
    return (orders ?? []).filter((o) => {
      if (!o.scheduled_start) return false;
      if (o.status === "cancelado") return false;
      if (tech !== "todos" && o.technician_id !== tech) return false;
      if (status !== "todos" && o.status !== status) return false;
      return true;
    });
  }, [orders, tech, status]);

  function move(dir: number) {
    if (view === "dia") setCursor(addDays(cursor, dir));
    else if (view === "semana") setCursor(addDays(cursor, dir * 7));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
  }

  const title = useMemo(() => {
    if (view === "dia") return cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    if (view === "semana") {
      const start = addDays(cursor, -cursor.getDay());
      const end = addDays(start, 6);
      return `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
    }
    return cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }, [view, cursor]);

  const weekDays = useMemo(() => {
    const start = addDays(cursor, -cursor.getDay());
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const ordersOn = (day: Date) =>
    scheduled
      .filter((o) => sameDay(new Date(o.scheduled_start!), day))
      .sort((a, b) => new Date(a.scheduled_start!).getTime() - new Date(b.scheduled_start!).getTime());

  const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7h às 19h

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Agenda operacional</h1>
          <p className="text-sm text-muted-foreground">Visitas agendadas por técnico, com bloqueio de horários conflitantes.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/atendimentos"><ListChecks className="mr-2 h-4 w-4" /> Atendimentos</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as View)}>
          <ToggleGroupItem value="dia">Dia</ToggleGroupItem>
          <ToggleGroupItem value="semana">Semana</ToggleGroupItem>
          <ToggleGroupItem value="mes">Mês</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => setCursor(startOfDay(new Date()))}>Hoje</Button>
          <Button size="icon" variant="outline" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <span className="w-full font-display font-medium first-letter:uppercase sm:w-auto">{title}</span>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Select value={tech} onValueChange={setTech}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Técnico" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os técnicos</SelectItem>
              {(technicians ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {view === "mes" && (
        <Card>
          <CardContent className="p-2">
            <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
              {WEEKDAY_SHORT.map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthCells.map((day) => {
                const dayOrders = ordersOn(day);
                const inMonth = day.getMonth() === cursor.getMonth();
                return (
                  <div key={day.toISOString()} className={`min-h-24 rounded-md border p-1 ${inMonth ? "" : "opacity-40"} ${sameDay(day, new Date()) ? "border-primary" : ""}`}>
                    <p className="px-1 text-xs font-medium">{day.getDate()}</p>
                    <div className="mt-1 grid gap-1">
                      {dayOrders.slice(0, 3).map((o) => (
                        <OrderChip key={o.id} order={o} onClick={() => setDetailId(o.id)} />
                      ))}
                      {dayOrders.length > 3 && <p className="px-1 text-[10px] text-muted-foreground">+{dayOrders.length - 3} mais</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {view === "semana" && (
        <Card>
          <CardContent className="overflow-x-auto p-2">
            <div className="grid min-w-[900px] grid-cols-8">
              <div />
              {weekDays.map((d) => (
                <div key={d.toISOString()} className={`border-b p-2 text-center text-sm font-medium ${sameDay(d, new Date()) ? "text-primary" : ""}`}>
                  {WEEKDAY_SHORT[d.getDay()]} {d.getDate()}
                </div>
              ))}
              {HOURS.map((h) => (
                <div key={h} className="contents">
                  <div className="border-b p-1 text-right text-xs text-muted-foreground">{String(h).padStart(2, "0")}:00</div>
                  {weekDays.map((d) => {
                    const cellOrders = scheduled.filter((o) => {
                      const s = new Date(o.scheduled_start!);
                      return sameDay(s, d) && s.getHours() === h;
                    });
                    return (
                      <div key={d.toISOString()} className="min-h-12 space-y-1 border-b border-l p-1">
                        {cellOrders.map((o) => (
                          <OrderChip key={o.id} order={o} onClick={() => setDetailId(o.id)} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {view === "dia" && (
        <Card>
          <CardContent className="p-4">
            {ordersOn(cursor).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma visita agendada neste dia.</p>
            ) : (
              <div className="grid gap-2">
                {ordersOn(cursor).map((o) => {
                  const s = new Date(o.scheduled_start!);
                  const end = new Date(s.getTime() + o.estimated_minutes * 60000);
                  return (
                    <button
                      key={o.id}
                      onClick={() => setDetailId(o.id)}
                      className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted"
                    >
                      <span className="font-display font-semibold">
                        {s.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — {end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="font-medium">{o.customers?.full_name}</span>
                      <span className="text-sm text-muted-foreground">{o.equipment_types?.name ?? ""}</span>
                      <span className="text-sm text-muted-foreground">{o.technicians?.full_name ?? "Sem técnico"}</span>
                      <Badge className={`ml-auto ${ORDER_STATUS_COLORS[o.status]}`} variant="secondary">{ORDER_STATUS_LABELS[o.status]}</Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <OrderDetailSheet orderId={detailId} onClose={() => setDetailId(null)} isAdmin={Boolean(session?.isAdmin)} />
    </div>
  );
}
