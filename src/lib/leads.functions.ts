import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LEAD_ORIGINS, LEAD_STATUSES, phoneDigits, samePhone } from "@/lib/lead-math";

const clean = (s: unknown, max = 500) => String(s ?? "").trim().slice(0, max);
const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const optUuid = (s: unknown) => (isUuid(s) ? s : null);

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Acesso negado: somente administradores.");
}
function dbErr(e: { message: string } | null) {
  if (e) throw new Error(e.message.replace(/^.*?ERROR:\s*/, ""));
}
function originFields(i: { origin: string; campaignId?: string | null; creativeCode?: string }) {
  if (!(i.origin in LEAD_ORIGINS)) throw new Error("Origem inválida.");
  return { origin: i.origin, campaignId: optUuid(i.campaignId), creativeCode: clean(i.creativeCode, 120) || null };
}
async function assertCampaign(supabase: any, id: string | null) {
  if (!id) return;
  const { data } = await supabase.from("campaigns").select("id").eq("id", id).maybeSingle();
  if (!data) throw new Error("Campanha não encontrada.");
}

type LeadInput = {
  id?: string | null; fullName: string; phone?: string; contactedAt: string; serviceId?: string | null; equipmentTypeId?: string | null; interestLabel?: string;
  origin: string; campaignId?: string | null; creativeCode?: string; bairro?: string; cidade?: string; notes?: string; status: string; lostReasonId?: string | null; lostNotes?: string;
};

export const saveLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: LeadInput) => {
    const fullName = clean(i.fullName, 160);
    if (!fullName) throw new Error("Informe o nome do interessado.");
    const d = new Date(i.contactedAt);
    if (Number.isNaN(d.getTime())) throw new Error("Data do contato inválida.");
    if (!(i.status in LEAD_STATUSES)) throw new Error("Status inválido.");
    if (i.status === "convertido") throw new Error("Use “Converter em atendimento” para marcar como convertido.");
    if (i.status === "perdido" && !isUuid(i.lostReasonId)) throw new Error("Informe o motivo da perda.");
    return {
      id: optUuid(i.id), fullName, phone: clean(i.phone, 40) || null, contactedAt: d.toISOString(), serviceId: optUuid(i.serviceId), equipmentTypeId: optUuid(i.equipmentTypeId),
      interestLabel: clean(i.interestLabel, 160) || null, ...originFields(i), bairro: clean(i.bairro, 100) || null, cidade: clean(i.cidade, 100) || null,
      notes: clean(i.notes, 1000) || null, status: i.status, lostReasonId: i.status === "perdido" ? i.lostReasonId! : null, lostNotes: i.status === "perdido" ? clean(i.lostNotes, 300) || null : null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const base = {
      full_name: data.fullName, phone: data.phone, phone_digits: phoneDigits(data.phone), contacted_at: data.contactedAt, service_id: data.serviceId,
      equipment_type_id: data.equipmentTypeId, interest_label: data.interestLabel, bairro: data.bairro, cidade: data.cidade, notes: data.notes,
      status: data.status, lost_reason_id: data.lostReasonId, lost_notes: data.lostNotes,
    };
    if (data.id) {
      // Na edição a origem não muda: isso só via correção com justificativa.
      const { data: cur } = await context.supabase.from("leads").select("status, order_id").eq("id", data.id).maybeSingle();
      if (!cur) throw new Error("Lead não encontrado.");
      if (cur.order_id) throw new Error("Lead já convertido: edite pelo atendimento ou corrija a origem.");
      const { error } = await context.supabase.from("leads").update(base).eq("id", data.id);
      dbErr(error);
      return { ok: true as const };
    }
    await assertCampaign(context.supabase, data.campaignId);
    const { error } = await context.supabase.from("leads").insert({ ...base, origin: data.origin, campaign_id: data.campaignId, creative_code: data.creativeCode });
    dbErr(error);
    return { ok: true as const };
  });

/** Clientes existentes com o mesmo telefone ou nome (para evitar duplicidade). */
export const findCustomerMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { leadId: string }) => {
    if (!isUuid(i.leadId)) throw new Error("Lead inválido.");
    return i;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: lead } = await context.supabase.from("leads").select("full_name, phone").eq("id", data.leadId).maybeSingle();
    if (!lead) throw new Error("Lead não encontrado.");
    const { data: customers, error } = await context.supabase.from("customers").select("id, full_name, phone, bairro, cidade").eq("active", true);
    dbErr(error);
    const name = lead.full_name.trim().toLowerCase();
    return (customers ?? [])
      .map((c) => ({ ...c, byPhone: samePhone(c.phone, lead.phone), byName: c.full_name.trim().toLowerCase() === name }))
      .filter((c) => c.byPhone || c.byName)
      .sort((a, b) => Number(b.byPhone) - Number(a.byPhone));
  });

export const convertLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { leadId: string; customerId?: string | null; reportedProblem: string; equipmentTypeId?: string | null; technicianId?: string | null; scheduledStart?: string | null; estimatedMinutes?: number }) => {
    if (!isUuid(i.leadId)) throw new Error("Lead inválido.");
    const reportedProblem = clean(i.reportedProblem, 1000);
    if (!reportedProblem) throw new Error("Informe o problema relatado.");
    let scheduledStart: string | null = null;
    if (i.scheduledStart) {
      const d = new Date(i.scheduledStart);
      if (Number.isNaN(d.getTime())) throw new Error("Data de agendamento inválida.");
      scheduledStart = d.toISOString();
    }
    return { leadId: i.leadId, customerId: optUuid(i.customerId), reportedProblem, equipmentTypeId: optUuid(i.equipmentTypeId), technicianId: optUuid(i.technicianId), scheduledStart, estimatedMinutes: Math.min(Math.max(Number(i.estimatedMinutes) || 60, 15), 1440) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;
    const { data: lead } = await sb.from("leads").select("*").eq("id", data.leadId).maybeSingle();
    if (!lead) throw new Error("Lead não encontrado.");
    const { data: existing } = await sb.from("service_orders").select("id, code").eq("lead_id", lead.id).maybeSingle();
    if (lead.order_id || existing) throw new Error(`Este lead já foi convertido no atendimento ${existing?.code ?? ""}.`.trim());
    if (data.technicianId) {
      const { data: t } = await sb.from("technicians").select("active").eq("id", data.technicianId).maybeSingle();
      if (!t?.active) throw new Error("Técnico inválido ou inativo.");
    }

    // Cliente: usa o escolhido; senão reaproveita por telefone; senão cadastra.
    let customerId = data.customerId;
    let customer: any = null;
    let createdCustomer = false;
    if (customerId) {
      const { data: c } = await sb.from("customers").select("*").eq("id", customerId).maybeSingle();
      if (!c) throw new Error("Cliente não encontrado.");
      customer = c;
    } else if (lead.phone) {
      const { data: all } = await sb.from("customers").select("*").eq("active", true);
      customer = (all ?? []).find((c) => samePhone(c.phone, lead.phone)) ?? null;
      customerId = customer?.id ?? null;
    }
    if (!customerId) {
      const { data: c, error } = await sb.from("customers").insert({ full_name: lead.full_name, phone: lead.phone, bairro: lead.bairro, cidade: lead.cidade }).select("*").single();
      dbErr(error);
      customer = c;
      customerId = c!.id;
      createdCustomer = true;
    }

    const { data: order, error: oErr } = await sb.from("service_orders").insert({
      customer_id: customerId, equipment_type_id: data.equipmentTypeId ?? lead.equipment_type_id, reported_problem: data.reportedProblem,
      technician_id: data.technicianId, scheduled_start: data.scheduledStart, estimated_minutes: data.estimatedMinutes,
      status: data.scheduledStart ? "visita_agendada" : "novo", created_by: context.userId,
      endereco: customer?.endereco ?? null, numero: customer?.numero ?? null, complemento: customer?.complemento ?? null,
      bairro: customer?.bairro ?? lead.bairro, cidade: customer?.cidade ?? lead.cidade, estado: customer?.estado ?? null, cep: customer?.cep ?? null, ponto_referencia: customer?.ponto_referencia ?? null,
      notes: lead.notes, lead_id: lead.id, origin: lead.origin, campaign_id: lead.campaign_id, creative_code: lead.creative_code,
    }).select("id, code").single();
    if (oErr?.message.includes("service_orders_lead_unique")) throw new Error("Este lead já foi convertido em outro atendimento.");
    dbErr(oErr);

    const { error: lErr } = await sb.from("leads").update({ status: "convertido", order_id: order!.id, customer_id: customerId, converted_at: new Date().toISOString(), lost_reason_id: null, lost_notes: null }).eq("id", lead.id).is("order_id", null);
    dbErr(lErr);
    return { ok: true as const, orderId: order!.id, code: order!.code, reusedCustomer: !createdCustomer };
  });

export const correctOrigin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { entityType: "lead" | "order"; id: string; origin: string; campaignId?: string | null; creativeCode?: string; reason: string }) => {
    if (!isUuid(i.id) || (i.entityType !== "lead" && i.entityType !== "order")) throw new Error("Registro inválido.");
    const reason = clean(i.reason, 300);
    if (!reason) throw new Error("Informe a justificativa.");
    return { entityType: i.entityType, id: i.id, ...originFields(i), reason };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;
    await assertCampaign(sb, data.campaignId);
    const table = data.entityType === "lead" ? "leads" : "service_orders";
    const { data: cur } = await sb.from(table).select("origin, campaign_id, creative_code").eq("id", data.id).maybeSingle();
    if (!cur) throw new Error("Registro não encontrado.");
    if (cur.origin === data.origin && cur.campaign_id === data.campaignId && (cur.creative_code ?? null) === data.creativeCode) throw new Error("Nada foi alterado.");
    const { error: aErr } = await sb.from("origin_corrections").insert({
      entity_type: data.entityType, entity_id: data.id, old_origin: cur.origin, new_origin: data.origin, old_campaign_id: cur.campaign_id, new_campaign_id: data.campaignId,
      old_creative_code: cur.creative_code, new_creative_code: data.creativeCode, reason: data.reason,
    });
    dbErr(aErr);
    const { error } = await sb.from(table).update({ origin: data.origin, campaign_id: data.campaignId, creative_code: data.creativeCode }).eq("id", data.id);
    dbErr(error);
    if (data.entityType === "order") {
      await sb.from("service_order_events").insert({ order_id: data.id, event_type: "origem_corrigida", description: `Origem corrigida: ${data.reason}`, actor_user_id: context.userId });
    }
    return { ok: true as const };
  });

export const saveLostReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id?: string | null; name: string; active: boolean }) => {
    const name = clean(i.name, 80);
    if (!name) throw new Error("Informe o motivo.");
    return { id: optUuid(i.id), name, active: Boolean(i.active) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const row = { name: data.name, active: data.active };
    const { error } = data.id ? await context.supabase.from("lead_lost_reasons").update(row).eq("id", data.id) : await context.supabase.from("lead_lost_reasons").insert(row);
    if (error?.message.includes("duplicate")) throw new Error("Esse motivo já existe.");
    dbErr(error);
    return { ok: true as const };
  });
