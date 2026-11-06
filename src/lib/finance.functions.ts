import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

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

async function logFinancial(ctx: Ctx, orderId: string, description: string) {
  await ctx.supabase.from("service_order_events").insert({
    order_id: orderId,
    event_type: "financeiro",
    description,
    actor_user_id: ctx.userId,
  });
}

export const registerPartPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    orderId: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    buyerType: string;
    buyerTechnicianId?: string | null;
    buyerLabel?: string;
    purchasedAt?: string;
    notes?: string;
  }) => {
    if (!isUuid(input.orderId)) throw new Error("Atendimento inválido.");
    const description = clean(input.description, 200);
    if (!description) throw new Error("Descreva a peça.");
    const quantity = Math.max(Number(input.quantity) || 0, 0);
    if (quantity <= 0) throw new Error("Quantidade inválida.");
    const unitPriceCents = Math.max(Math.round(Number(input.unitPriceCents) || 0), 0);
    if (!["maqnolar", "tecnico", "outro"].includes(input.buyerType)) throw new Error("Responsável pelo pagamento inválido.");
    let purchasedAt = new Date().toISOString();
    if (input.purchasedAt) {
      const d = new Date(input.purchasedAt);
      if (Number.isNaN(d.getTime())) throw new Error("Data da compra inválida.");
      purchasedAt = d.toISOString();
    }
    return {
      orderId: input.orderId,
      description,
      quantity,
      unitPriceCents,
      buyerType: input.buyerType as "maqnolar" | "tecnico" | "outro",
      buyerTechnicianId: isUuid(input.buyerTechnicianId) ? input.buyerTechnicianId : null,
      buyerLabel: clean(input.buyerLabel, 120) || null,
      purchasedAt,
      notes: clean(input.notes, 500) || null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const totalCents = Math.round(data.quantity * data.unitPriceCents);
    const { error } = await context.supabase.from("part_purchases").insert({
      order_id: data.orderId,
      description: data.description,
      quantity: data.quantity,
      unit_price_cents: data.unitPriceCents,
      total_cents: totalCents,
      buyer_type: data.buyerType,
      buyer_technician_id: data.buyerType === "tecnico" ? data.buyerTechnicianId : null,
      buyer_label: data.buyerLabel,
      purchased_at: data.purchasedAt,
      notes: data.notes,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await logFinancial(
      { supabase: context.supabase, userId: context.userId },
      data.orderId,
      `Compra de peça registrada: ${data.description} — R$ ${(totalCents / 100).toFixed(2)} (${data.buyerType === "maqnolar" ? "MaqnoLar" : data.buyerType === "tecnico" ? "técnico" : "outro responsável"})`,
    );
    return { ok: true as const };
  });

export const deletePartPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { purchaseId: string; reason: string }) => {
    if (!isUuid(input.purchaseId)) throw new Error("Registro inválido.");
    const reason = clean(input.reason, 300);
    if (!reason) throw new Error("Informe o motivo da remoção.");
    return { purchaseId: input.purchaseId, reason };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: purchase } = await context.supabase
      .from("part_purchases")
      .select("id, order_id, description, total_cents")
      .eq("id", data.purchaseId)
      .single();
    if (!purchase) throw new Error("Compra não encontrada.");
    const { error } = await context.supabase.from("part_purchases").delete().eq("id", data.purchaseId);
    if (error) throw new Error(error.message);
    await logFinancial(
      { supabase: context.supabase, userId: context.userId },
      purchase.order_id,
      `Compra removida: ${purchase.description} — R$ ${(purchase.total_cents / 100).toFixed(2)}. Motivo: ${data.reason}`,
    );
    return { ok: true as const };
  });

export const setOrderReceiver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; receiverType: string; receiverLabel?: string }) => {
    if (!isUuid(input.orderId)) throw new Error("Atendimento inválido.");
    if (!["maqnolar", "tecnico", "outro"].includes(input.receiverType)) throw new Error("Recebedor inválido.");
    return {
      orderId: input.orderId,
      receiverType: input.receiverType as "maqnolar" | "tecnico" | "outro",
      receiverLabel: clean(input.receiverLabel, 120) || null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: fin } = await context.supabase
      .from("order_financials")
      .select("id")
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (!fin) throw new Error("Este atendimento ainda não possui composição financeira (aprove um orçamento ou marque a visita como cobrável).");
    // O trigger de auditoria registra automaticamente quem alterou, quando e o valor anterior/novo.
    const { error } = await context.supabase
      .from("order_financials")
      .update({ receiver_type: data.receiverType, receiver_label: data.receiverLabel })
      .eq("id", fin.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adjustShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; technicianShareCents: number; companyShareCents: number; reason: string }) => {
    if (!isUuid(input.orderId)) throw new Error("Atendimento inválido.");
    const technicianShareCents = Math.max(Math.round(Number(input.technicianShareCents) || 0), 0);
    const companyShareCents = Math.max(Math.round(Number(input.companyShareCents) || 0), 0);
    const reason = clean(input.reason, 300);
    if (!reason) throw new Error("Informe o motivo do ajuste.");
    return { orderId: input.orderId, technicianShareCents, companyShareCents, reason };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: fin } = await context.supabase
      .from("order_financials")
      .select("id, labor_cents")
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (!fin) throw new Error("Este atendimento ainda não possui composição financeira.");
    if (data.technicianShareCents + data.companyShareCents !== fin.labor_cents && fin.labor_cents > 0) {
      throw new Error("A soma das participações deve ser igual ao valor da mão de obra.");
    }
    const { error } = await context.supabase
      .from("order_financials")
      .update({
        technician_share_cents: data.technicianShareCents,
        company_share_cents: data.companyShareCents,
      })
      .eq("id", fin.id);
    if (error) throw new Error(error.message);
    await logFinancial(
      { supabase: context.supabase, userId: context.userId },
      data.orderId,
      `Participações ajustadas. Motivo: ${data.reason}`,
    );
    return { ok: true as const };
  });
