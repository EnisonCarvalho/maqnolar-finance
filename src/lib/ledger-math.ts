/**
 * Motor do acerto real entre MaqnoLar e técnicos, baseado em recebimentos EFETIVOS.
 *
 * Convenção de sinal do saldo: positivo = MaqnoLar deve ao técnico; negativo = técnico deve à MaqnoLar.
 *
 * Para cada atendimento, o técnico tem direito a (participação + reembolso das peças que pagou).
 * Esse direito é reconhecido na proporção do que o cliente já pagou (cumulativo, com arredondamento
 * sobre o acumulado, para que a soma das parcelas seja exata). Quem recebeu o dinheiro do cliente
 * passa a "dever" esse valor: se foi o técnico, ele deve; se foi a MaqnoLar ou outro recebedor, ela guarda.
 * Repasses reduzem o saldo no sentido em que foram feitos. Repasses NÃO são receita nem despesa.
 */

export type LedgerOrder = {
  orderId: string;
  code: string;
  customerName: string;
  technicianId: string | null;
  totalCents: number;
  technicianShareCents: number;
  companyShareCents: number;
  /** Reembolso de peças por técnico comprador (id do técnico → centavos). */
  partsByTechnician: Record<string, number>;
  partsByCompanyCents: number;
};

export type LedgerPayment = {
  id: string;
  orderId: string;
  amountCents: number;
  /** Data do pagamento (YYYY-MM-DD). */
  paidAt: string;
  createdAt: string;
  receiverType: "maqnolar" | "tecnico" | "outro";
  receiverTechnicianId: string | null;
};

export type LedgerTransfer = {
  id: string;
  technicianId: string;
  amountCents: number;
  /** Data do repasse (YYYY-MM-DD). */
  date: string;
  direction: "empresa_para_tecnico" | "tecnico_para_empresa";
};

export type LedgerEntry = {
  technicianId: string;
  orderId: string;
  paymentId: string;
  date: string;
  /** Valor pago pelo cliente (atribuído só ao técnico responsável pelo atendimento). */
  clientPaidCents: number;
  shareEarnedCents: number;
  reimbursementEarnedCents: number;
  receivedByTechnicianCents: number;
};

function proportional(entitled: number, cum: number, total: number): number {
  if (entitled <= 0) return 0;
  if (total <= 0) return cum > 0 ? entitled : 0;
  const c = Math.min(cum, total);
  return Math.round((entitled * c) / total);
}

/** Gera os lançamentos por técnico a partir dos recebimentos efetivos. */
export function buildEntries(orders: LedgerOrder[], payments: LedgerPayment[]): LedgerEntry[] {
  const byOrder = new Map(orders.map((o) => [o.orderId, o]));
  const grouped = new Map<string, LedgerPayment[]>();
  for (const p of payments) {
    if (!grouped.has(p.orderId)) grouped.set(p.orderId, []);
    grouped.get(p.orderId)!.push(p);
  }
  const entries: LedgerEntry[] = [];
  for (const [orderId, list] of grouped) {
    const order = byOrder.get(orderId);
    if (!order) continue;
    list.sort((a, b) => (a.paidAt === b.paidAt ? a.createdAt.localeCompare(b.createdAt) : a.paidAt.localeCompare(b.paidAt)));
    const techs = new Set<string>(Object.keys(order.partsByTechnician));
    if (order.technicianId) techs.add(order.technicianId);
    let cum = 0;
    for (const p of list) {
      const before = cum;
      cum += p.amountCents;
      const involved = new Set(techs);
      if (p.receiverType === "tecnico" && p.receiverTechnicianId) involved.add(p.receiverTechnicianId);
      for (const t of involved) {
        const share = t === order.technicianId ? order.technicianShareCents : 0;
        const parts = order.partsByTechnician[t] ?? 0;
        entries.push({
          technicianId: t,
          orderId,
          paymentId: p.id,
          date: p.paidAt,
          clientPaidCents: t === order.technicianId ? p.amountCents : 0,
          shareEarnedCents: proportional(share, cum, order.totalCents) - proportional(share, before, order.totalCents),
          reimbursementEarnedCents: proportional(parts, cum, order.totalCents) - proportional(parts, before, order.totalCents),
          receivedByTechnicianCents: p.receiverType === "tecnico" && p.receiverTechnicianId === t ? p.amountCents : 0,
        });
      }
    }
  }
  return entries;
}

export type OrderBalance = {
  orderId: string;
  clientPaidCents: number;
  shareEarnedCents: number;
  reimbursementEarnedCents: number;
  receivedByTechnicianCents: number;
  /** Positivo: MaqnoLar deve ao técnico; negativo: técnico deve à MaqnoLar. */
  balanceCents: number;
};

export type TechnicianSummary = {
  technicianId: string;
  receivedFromClientsCents: number;
  receivedByTechnicianCents: number;
  technicianShareCents: number;
  reimbursementCents: number;
  companyShareCents: number;
  toPayTechnicianCents: number;
  toReceiveFromTechnicianCents: number;
  compensatedCents: number;
  transfersToTechnicianCents: number;
  transfersFromTechnicianCents: number;
  settledCents: number;
  /** Saldo líquido pendente. Positivo: MaqnoLar deve; negativo: técnico deve. */
  pendingCents: number;
  orders: OrderBalance[];
};

export function inRange(date: string, start: string | null, end: string | null): boolean {
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

/** Resumo consolidado por técnico no período (datas inclusivas, YYYY-MM-DD; null = sem limite). */
export function summarize(
  entries: LedgerEntry[],
  transfers: LedgerTransfer[],
  start: string | null,
  end: string | null,
): TechnicianSummary[] {
  const map = new Map<string, TechnicianSummary>();
  const get = (id: string) => {
    if (!map.has(id)) {
      map.set(id, {
        technicianId: id,
        receivedFromClientsCents: 0,
        receivedByTechnicianCents: 0,
        technicianShareCents: 0,
        reimbursementCents: 0,
        companyShareCents: 0,
        toPayTechnicianCents: 0,
        toReceiveFromTechnicianCents: 0,
        compensatedCents: 0,
        transfersToTechnicianCents: 0,
        transfersFromTechnicianCents: 0,
        settledCents: 0,
        pendingCents: 0,
        orders: [],
      });
    }
    return map.get(id)!;
  };
  const orderMaps = new Map<string, Map<string, OrderBalance>>();
  for (const e of entries) {
    if (!inRange(e.date, start, end)) continue;
    const s = get(e.technicianId);
    if (!orderMaps.has(e.technicianId)) orderMaps.set(e.technicianId, new Map());
    const om = orderMaps.get(e.technicianId)!;
    if (!om.has(e.orderId)) {
      om.set(e.orderId, { orderId: e.orderId, clientPaidCents: 0, shareEarnedCents: 0, reimbursementEarnedCents: 0, receivedByTechnicianCents: 0, balanceCents: 0 });
    }
    const ob = om.get(e.orderId)!;
    ob.clientPaidCents += e.clientPaidCents;
    ob.shareEarnedCents += e.shareEarnedCents;
    ob.reimbursementEarnedCents += e.reimbursementEarnedCents;
    ob.receivedByTechnicianCents += e.receivedByTechnicianCents;
    s.receivedFromClientsCents += e.clientPaidCents;
    s.receivedByTechnicianCents += e.receivedByTechnicianCents;
    s.technicianShareCents += e.shareEarnedCents;
    s.reimbursementCents += e.reimbursementEarnedCents;
  }
  for (const t of transfers) {
    if (!inRange(t.date, start, end)) continue;
    const s = get(t.technicianId);
    if (t.direction === "empresa_para_tecnico") s.transfersToTechnicianCents += t.amountCents;
    else s.transfersFromTechnicianCents += t.amountCents;
  }
  for (const s of map.values()) {
    const om = orderMaps.get(s.technicianId);
    s.orders = om ? [...om.values()] : [];
    for (const ob of s.orders) {
      ob.balanceCents = ob.shareEarnedCents + ob.reimbursementEarnedCents - ob.receivedByTechnicianCents;
      if (ob.balanceCents > 0) s.toPayTechnicianCents += ob.balanceCents;
      else s.toReceiveFromTechnicianCents += -ob.balanceCents;
    }
    s.companyShareCents = s.receivedFromClientsCents - s.technicianShareCents - s.reimbursementCents;
    s.compensatedCents = Math.min(s.toPayTechnicianCents, s.toReceiveFromTechnicianCents);
    s.settledCents = s.transfersToTechnicianCents + s.transfersFromTechnicianCents;
    s.pendingCents =
      s.toPayTechnicianCents - s.toReceiveFromTechnicianCents - s.transfersToTechnicianCents + s.transfersFromTechnicianCents;
  }
  return [...map.values()];
}

export type ClosingStatus = "fechado" | "fechado_com_pendencia";
/** Nunca marca como totalmente acertado se houver saldo pendente. */
export function closingStatus(pendingCents: number): ClosingStatus {
  return pendingCents === 0 ? "fechado" : "fechado_com_pendencia";
}
