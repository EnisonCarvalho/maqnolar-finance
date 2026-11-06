import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildEntries,
  summarize,
  closingStatus,
  type LedgerOrder,
  type LedgerPayment,
  type LedgerTransfer,
} from "@/lib/ledger-math";

const METHODS = ["pix", "dinheiro", "credito", "debito", "transferencia", "outro"] as const;

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Acesso negado: somente administradores.");
}
function clean(s: unknown, max = 500): string {
  return String(s ?? "").trim().slice(0, max);
}
function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
}
function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime());
}
function cents(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Informe um valor maior que zero.");
  if (n > 100_000_000) throw new Error("Valor muito alto.");
  return n;
}
function dbError(message: string): Error {
  return new Error(message.replace(/^.*?ERROR:\s*/, ""));
}

async function logEvent(supabase: any, userId: string, orderId: string, description: string) {
  await supabase.from("service_order_events").insert({ order_id: orderId, event_type: "financeiro", description, actor_user_id: userId });
}
const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

/** Carrega os dados financeiros e monta os lançamentos do acerto (sempre no servidor). */
async function loadLedger(supabase: any) {
  const [fin, pays, parts, transfers, techs] = await Promise.all([
    supabase
      .from("order_financials")
      .select("order_id, total_cents, technician_share_cents, company_share_cents, service_orders(code, technician_id, opened_at, completed_at, status, customers(full_name))"),
    supabase
      .from("customer_payments")
      .select("id, order_id, amount_cents, paid_at, created_at, receiver_type, receiver_technician_id")
      .eq("status", "ativo"),
    supabase.from("part_purchases").select("order_id, buyer_type, buyer_technician_id, total_cents"),
    supabase
      .from("technician_transfers")
      .select("id, technician_id, amount_cents, transfer_date, direction")
      .eq("status", "ativo"),
    supabase.from("technicians").select("id, full_name, active").order("full_name"),
  ]);
  for (const r of [fin, pays, parts, transfers, techs]) if (r.error) throw dbError(r.error.message);

  const partsByOrder = new Map<string, { tech: Record<string, number>; company: number }>();
  for (const p of parts.data ?? []) {
    if (!partsByOrder.has(p.order_id)) partsByOrder.set(p.order_id, { tech: {}, company: 0 });
    const e = partsByOrder.get(p.order_id)!;
    if (p.buyer_type === "tecnico" && p.buyer_technician_id) e.tech[p.buyer_technician_id] = (e.tech[p.buyer_technician_id] ?? 0) + p.total_cents;
    else if (p.buyer_type === "maqnolar") e.company += p.total_cents;
  }
  const orders: (LedgerOrder & { openedAt: string; completedAt: string | null; status: string })[] = (fin.data ?? []).map((f: any) => ({
    orderId: f.order_id,
    code: f.service_orders?.code ?? "",
    customerName: f.service_orders?.customers?.full_name ?? "",
    technicianId: f.service_orders?.technician_id ?? null,
    totalCents: f.total_cents,
    technicianShareCents: f.technician_share_cents,
    companyShareCents: f.company_share_cents,
    partsByTechnician: partsByOrder.get(f.order_id)?.tech ?? {},
    partsByCompanyCents: partsByOrder.get(f.order_id)?.company ?? 0,
    openedAt: f.service_orders?.opened_at ?? "",
    completedAt: f.service_orders?.completed_at ?? null,
    status: f.service_orders?.status ?? "",
  }));
  const payments: LedgerPayment[] = (pays.data ?? []).map((p: any) => ({
    id: p.id,
    orderId: p.order_id,
    amountCents: p.amount_cents,
    paidAt: p.paid_at,
    createdAt: p.created_at,
    receiverType: p.receiver_type,
    receiverTechnicianId: p.receiver_technician_id,
  }));
  const ledgerTransfers: LedgerTransfer[] = (transfers.data ?? []).map((t: any) => ({
    id: t.id,
    technicianId: t.technician_id,
    amountCents: t.amount_cents,
    date: t.transfer_date,
    direction: t.direction,
  }));
  return { orders, payments, transfers: ledgerTransfers, technicians: (techs.data ?? []) as { id: string; full_name: string; active: boolean }[] };
}

function clientPendingFor(orders: Awaited<ReturnType<typeof loadLedger>>["orders"], payments: LedgerPayment[], techId: string) {
  const received = new Map<string, number>();
  for (const p of payments) received.set(p.orderId, (received.get(p.orderId) ?? 0) + p.amountCents);
  return orders
    .filter((o) => o.technicianId === techId && o.status !== "cancelado")
    .reduce((s, o) => s + Math.max(o.totalCents - (received.get(o.orderId) ?? 0), 0), 0);
}

export const getSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { start: string | null; end: string | null }) => {
    if (input.start && !isDate(input.start)) throw new Error("Data inicial inválida.");
    if (input.end && !isDate(input.end)) throw new Error("Data final inválida.");
    return { start: input.start || null, end: input.end || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const ledger = await loadLedger(context.supabase);
    const entries = buildEntries(ledger.orders, ledger.payments);
    const period = summarize(entries, ledger.transfers, data.start, data.end);
    const overall = summarize(entries, ledger.transfers, null, null);

    const { data: closings } = await context.supabase
      .from("settlement_closings")
      .select("*")
      .order("closed_at", { ascending: false })
      .limit(100);

    const orderInfo = new Map(ledger.orders.map((o) => [o.orderId, o]));
    const technicians = ledger.technicians.map((t) => {
      const p = period.find((s) => s.technicianId === t.id);
      const o = overall.find((s) => s.technicianId === t.id);
      return {
        id: t.id,
        name: t.full_name,
        active: t.active,
        period: p
          ? {
              ...p,
              orders: p.orders.map((ob) => {
                const info = orderInfo.get(ob.orderId);
                return { ...ob, code: info?.code ?? "", customerName: info?.customerName ?? "", totalCents: info?.totalCents ?? 0, openedAt: info?.openedAt ?? "", completedAt: info?.completedAt ?? null };
              }),
            }
          : null,
        overallPendingCents: o?.pendingCents ?? 0,
        clientPendingCents: clientPendingFor(ledger.orders, ledger.payments, t.id),
      };
    });
    return { technicians, closings: closings ?? [] };
  });

export const registerPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    orderId: string; amountCents: number; paidAt: string; receiverType: string; receiverTechnicianId?: string | null;
    receiverLabel?: string; method: string; destinationAccount?: string; accountId?: string | null; notes?: string; receiptPath?: string | null; authorizedReason?: string;
  }) => {
    if (!isUuid(input.orderId)) throw new Error("Atendimento inválido.");
    if (!isDate(input.paidAt)) throw new Error("Data do pagamento inválida.");
    if (!["maqnolar", "tecnico", "outro"].includes(input.receiverType)) throw new Error("Recebedor inválido.");
    if (input.receiverType === "tecnico" && !isUuid(input.receiverTechnicianId)) throw new Error("Selecione o técnico que recebeu.");
    if (input.receiverType === "outro" && !clean(input.receiverLabel)) throw new Error("Informe o nome do recebedor autorizado.");
    if (!METHODS.includes(input.method as any)) throw new Error("Forma de pagamento inválida.");
    return {
      orderId: input.orderId,
      amountCents: cents(input.amountCents),
      paidAt: input.paidAt,
      receiverType: input.receiverType,
      receiverTechnicianId: input.receiverType === "tecnico" ? input.receiverTechnicianId! : null,
      receiverLabel: clean(input.receiverLabel, 120) || null,
      method: input.method,
      destinationAccount: clean(input.destinationAccount, 120) || null,
      accountId: input.receiverType === "maqnolar" && isUuid(input.accountId) ? input.accountId : null,
      notes: clean(input.notes) || null,
      receiptPath: clean(input.receiptPath, 300) || null,
      authorizedReason: clean(input.authorizedReason, 300) || null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("customer_payments".insert({
      order_id: data.orderId,
      amount_cents: data.amountCents,
      paid_at: data.paidAt,
      receiver_type: data.receiverType,
      receiver_technician_id: data.receiverTechnicianId,
      receiver_label: data.receiverLabel,
      method: data.method,
      destination_account: data.destinationAccount,
      account_id: data.accountId,
      notes: data.notes,
      receipt_path: data.receiptPath,
      authorized_reason: data.authorizedReason,
    });
    if (error) throw dbError(error.message);
    await logEvent(context.supabase, context.userId, data.orderId, `Recebimento registrado: ${brl(data.amountCents)} em ${data.paidAt.split("-").reverse().join("/")}${data.authorizedReason ? ` (ajuste autorizado: ${data.authorizedReason})` : ""}`);
    return { ok: true as const };
  });

export const voidPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { paymentId: string; reason: string }) => {
    if (!isUuid(input.paymentId)) throw new Error("Registro inválido.");
    const reason = clean(input.reason, 300);
    if (!reason) throw new Error("Informe o motivo do estorno.");
    return { paymentId: input.paymentId, reason };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("customer_payments")
      .update({ status: "estornado", void_reason: data.reason })
      .eq("id", data.paymentId)
      .eq("status", "ativo")
      .select("order_id, amount_cents")
      .maybeSingle();
    if (error) throw dbError(error.message);
    if (!row) throw new Error("Recebimento não encontrado ou já estornado.");
    await logEvent(context.supabase, context.userId, row.order_id, `Recebimento estornado: ${brl(row.amount_cents)}. Motivo: ${data.reason}`);
    return { ok: true as const };
  });

export const registerTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    technicianId: string; transferDate: string; amountCents: number; direction: string; method: string;
    sourceAccount?: string; destinationAccount?: string; accountId?: string | null; orderIds?: string[]; notes?: string; receiptPath?: string | null; authorizedReason?: string;
  }) => {
    if (!isUuid(input.technicianId)) throw new Error("Selecione o técnico.");
    if (!isDate(input.transferDate)) throw new Error("Data do repasse inválida.");
    if (!["empresa_para_tecnico", "tecnico_para_empresa"].includes(input.direction)) throw new Error("Sentido do repasse inválido.");
    if (!METHODS.includes(input.method as any)) throw new Error("Forma de pagamento inválida.");
    return {
      technicianId: input.technicianId,
      transferDate: input.transferDate,
      amountCents: cents(input.amountCents),
      direction: input.direction as "empresa_para_tecnico" | "tecnico_para_empresa",
      method: input.method,
      sourceAccount: clean(input.sourceAccount, 120) || null,
      destinationAccount: clean(input.destinationAccount, 120) || null,
      accountId: isUuid(input.accountId) ? input.accountId : null,
      orderIds: (input.orderIds ?? []).filter(isUuid).slice(0, 100),
      notes: clean(input.notes) || null,
      receiptPath: clean(input.receiptPath, 300) || null,
      authorizedReason: clean(input.authorizedReason, 300) || null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: tech } = await context.supabase.from("technicians").select("full_name").eq("id", data.technicianId).single();
    if (!tech) throw new Error("Técnico não encontrado.");
    const toTech = data.direction === "empresa_para_tecnico";
    const { error } = await context.supabase.from("technician_transfers").insert({
      technician_id: data.technicianId,
      transfer_date: data.transferDate,
      amount_cents: data.amountCents,
      direction: data.direction,
      payer_label: toTech ? "MaqnoLar" : tech.full_name,
      receiver_label: toTech ? tech.full_name : "MaqnoLar",
      method: data.method,
      source_account: data.sourceAccount,
      destination_account: data.destinationAccount,
      account_id: data.accountId,
      order_ids: data.orderIds,
      notes: data.notes,
      receipt_path: data.receiptPath,
      authorized_reason: data.authorizedReason,
    });
    if (error) throw dbError(error.message);
    for (const id of data.orderIds) {
      await logEvent(context.supabase, context.userId, id, `Repasse ${toTech ? "da MaqnoLar para" : "de"} ${tech.full_name}${toTech ? "" : " para a MaqnoLar"}: ${brl(data.amountCents)}`);
    }
    return { ok: true as const };
  });

export const voidTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { transferId: string; reason: string }) => {
    if (!isUuid(input.transferId)) throw new Error("Registro inválido.");
    const reason = clean(input.reason, 300);
    if (!reason) throw new Error("Informe o motivo do estorno.");
    return { transferId: input.transferId, reason };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("technician_transfers")
      .update({ status: "estornado", void_reason: data.reason })
      .eq("id", data.transferId)
      .eq("status", "ativo")
      .select("id")
      .maybeSingle();
    if (error) throw dbError(error.message);
    if (!row) throw new Error("Repasse não encontrado ou já estornado.");
    return { ok: true as const };
  });

export const closeSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { technicianId: string; start: string; end: string; notes?: string }) => {
    if (!isUuid(input.technicianId)) throw new Error("Selecione o técnico.");
    if (!isDate(input.start) || !isDate(input.end) || input.end < input.start) throw new Error("Período inválido.");
    return { technicianId: input.technicianId, start: input.start, end: input.end, notes: clean(input.notes) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const ledger = await loadLedger(context.supabase);
    const s = summarize(buildEntries(ledger.orders, ledger.payments), ledger.transfers, data.start, data.end).find(
      (x) => x.technicianId === data.technicianId,
    );
    const pending = s?.pendingCents ?? 0;
    const { data: row, error } = await context.supabase
      .from("settlement_closings")
      .insert({
        technician_id: data.technicianId,
        period_start: data.start,
        period_end: data.end,
        status: closingStatus(pending),
        received_cents: s?.receivedFromClientsCents ?? 0,
        technician_share_cents: s?.technicianShareCents ?? 0,
        reimbursement_cents: s?.reimbursementCents ?? 0,
        company_share_cents: s?.companyShareCents ?? 0,
        to_pay_technician_cents: s?.toPayTechnicianCents ?? 0,
        to_receive_technician_cents: s?.toReceiveFromTechnicianCents ?? 0,
        settled_cents: s?.settledCents ?? 0,
        pending_cents: pending,
        client_pending_cents: clientPendingFor(ledger.orders, ledger.payments, data.technicianId),
        notes: data.notes,
      })
      .select("status, pending_cents")
      .single();
    if (error) throw dbError(error.message);
    return { status: row.status as string, pendingCents: row.pending_cents as number };
  });

export const reopenClosing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { closingId: string; reason: string }) => {
    if (!isUuid(input.closingId)) throw new Error("Fechamento inválido.");
    const reason = clean(input.reason, 300);
    if (!reason) throw new Error("Informe a justificativa da reabertura.");
    return { closingId: input.closingId, reason };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("settlement_closings")
      .update({ status: "reaberto", reopen_reason: data.reason })
      .eq("id", data.closingId)
      .neq("status", "reaberto")
      .select("id")
      .maybeSingle();
    if (error) throw dbError(error.message);
    if (!row) throw new Error("Fechamento não encontrado ou já reaberto.");
    return { ok: true as const };
  });
