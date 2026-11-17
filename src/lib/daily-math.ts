/** Acerto diário: OS concluídas no dia, agrupadas por técnico (com ou sem pagamento do cliente). */
export type DailyOrder = {
  orderId: string;
  code: string;
  customerName: string;
  technicianId: string | null;
  kind: "visita" | "servico";
  confirmed: boolean;
  totalCents: number;
  partsCents: number;
  technicianShareCents: number | null;
  companyShareCents: number | null;
  receivedCents: number;
};
export type DailyTechTotals = {
  technicianId: string | null;
  orders: DailyOrder[];
  realizadoCents: number;
  partsCents: number;
  technicianShareCents: number;
  companyShareCents: number;
  pendingConfirmation: number;
  recebidoCents: number;
  repassadoCents: number;
};

export function groupDailyByTechnician(orders: DailyOrder[], transfers: { technicianId: string; amountCents: number; direction: string }[]): DailyTechTotals[] {
  const map = new Map<string, DailyTechTotals>();
  const get = (id: string | null) => {
    const k = id ?? "";
    if (!map.has(k)) map.set(k, { technicianId: id, orders: [], realizadoCents: 0, partsCents: 0, technicianShareCents: 0, companyShareCents: 0, pendingConfirmation: 0, recebidoCents: 0, repassadoCents: 0 });
    return map.get(k)!;
  };
  for (const o of orders) {
    const g = get(o.technicianId);
    g.orders.push(o);
    g.realizadoCents += o.totalCents;
    g.partsCents += o.partsCents;
    g.technicianShareCents += o.technicianShareCents ?? 0;
    g.companyShareCents += o.companyShareCents ?? 0;
    if (!o.confirmed) g.pendingConfirmation += 1;
    g.recebidoCents += o.receivedCents;
  }
  for (const t of transfers) {
    const g = get(t.technicianId);
    g.repassadoCents += t.direction === "empresa_para_tecnico" ? t.amountCents : -t.amountCents;
  }
  return [...map.values()];
}
