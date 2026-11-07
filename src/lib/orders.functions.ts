import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcQuoteTotals, type QuotePartInput } from "@/lib/quote-math";
import { splitLabor, type SplitRuleSnapshot } from "@/lib/settlement-math";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/order-status";
import type { Database } from "@/integrations/supabase/types";

type OrderUpdate = Database["public"]["Tables"]["service_orders"]["Update"];

type AddressInput = {
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  ponto_referencia?: string;
};

type OrderInput = AddressInput & {
  customerId: string;
  equipmentTypeId?: string | null;
  reportedProblem: string;
  technicianId?: string | null;
  scheduledStart?: string | null;
  estimatedMinutes?: number;
  notes?: string;
};

const TECHNICIAN_TRANSITIONS: OrderStatus[] = [
  "tecnico_a_caminho",
  "em_diagnostico",
  "servico_em_andamento",
  "servico_concluido",
  "visita_concluida",
];

function clean(s: unknown, max = 500): string {
  return String(s ?? "").trim().slice(0, max);
}

function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
}

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Acesso negado: somente administradores.");
}

async function assertActiveTechnician(supabase: any, technicianId: string) {
  const { data: tech } = await supabase
    .from("technicians")
    .select("id, active")
    .eq("id", technicianId)
    .maybeSingle();
  if (!tech) throw new Error("Técnico não encontrado.");
  if (!tech.active) throw new Error("Não é possível agendar para um técnico inativo.");
}

async function myTechnicianId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("technicians")
    .select("id")
    .eq("profile_id", userId)
    .eq("active", true)
    .maybeSingle();
  return data?.id ?? null;
}

function throwIfError(error: { message?: string } | null) {
  if (error) throw new Error(error.message ?? "Operação não concluída.");
}

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: OrderInput) => {
    if (!isUuid(input.customerId)) throw new Error("Selecione um cliente.");
    const reportedProblem = clean(input.reportedProblem, 1000);
    if (!reportedProblem) throw new Error("Informe o problema relatado.");
    const estimatedMinutes = Math.min(Math.max(Number(input.estimatedMinutes) || 60, 15), 24 * 60);
    let scheduledStart: string | null = null;
    if (input.scheduledStart) {
      const d = new Date(input.scheduledStart);
      if (Number.isNaN(d.getTime())) throw new Error("Data de agendamento inválida.");
      scheduledStart = d.toISOString();
    }
    return {
      customerId: input.customerId,
      equipmentTypeId: isUuid(input.equipmentTypeId) ? input.equipmentTypeId : null,
      reportedProblem,
      technicianId: isUuid(input.technicianId) ? input.technicianId : null,
      scheduledStart,
      estimatedMinutes,
      notes: clean(input.notes, 1000) || null,
      address: {
        endereco: clean(input.endereco, 200) || null,
        numero: clean(input.numero, 20) || null,
        complemento: clean(input.complemento, 100) || null,
        bairro: clean(input.bairro, 100) || null,
        cidade: clean(input.cidade, 100) || null,
        estado: clean(input.estado, 2) || null,
        cep: clean(input.cep, 9) || null,
        ponto_referencia: clean(input.ponto_referencia, 200) || null,
      },
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.technicianId) await assertActiveTechnician(context.supabase, data.technicianId);
    const { data: inserted, error } = await context.supabase
      .from("service_orders")
      .insert({
        customer_id: data.customerId,
        equipment_type_id: data.equipmentTypeId,
        reported_problem: data.reportedProblem,
        technician_id: data.technicianId,
        scheduled_start: data.scheduledStart,
        estimated_minutes: data.estimatedMinutes,
        notes: data.notes,
        status: data.scheduledStart ? "visita_agendada" : "novo",
        created_by: context.userId,
        ...data.address,
      })
      .select("id, code")
      .single();
    throwIfError(error);
    if (!inserted) throw new Error("Não foi possível criar o atendimento.");
    return { ok: true as const, id: inserted.id, code: inserted.code };
  });

export const updateOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: OrderInput & { orderId: string }) => {
    if (!isUuid(input.orderId)) throw new Error("Atendimento inválido.");
    if (!isUuid(input.customerId)) throw new Error("Selecione um cliente.");
    const reportedProblem = clean(input.reportedProblem, 1000);
    if (!reportedProblem) throw new Error("Informe o problema relatado.");
    const estimatedMinutes = Math.min(Math.max(Number(input.estimatedMinutes) || 60, 15), 24 * 60);
    let scheduledStart: string | null = null;
    if (input.scheduledStart) {
      const d = new Date(input.scheduledStart);
      if (Number.isNaN(d.getTime())) throw new Error("Data de agendamento inválida.");
      scheduledStart = d.toISOString();
    }
    return {
      orderId: input.orderId,
      customerId: input.customerId,
      equipmentTypeId: isUuid(input.equipmentTypeId) ? input.equipmentTypeId : null,
      reportedProblem,
      technicianId: isUuid(input.technicianId) ? input.technicianId : null,
      scheduledStart,
      estimatedMinutes,
      notes: clean(input.notes, 1000) || null,
      address: {
        endereco: clean(input.endereco, 200) || null,
        numero: clean(input.numero, 20) || null,
        complemento: clean(input.complemento, 100) || null,
        bairro: clean(input.bairro, 100) || null,
        cidade: clean(input.cidade, 100) || null,
        estado: clean(input.estado, 2) || null,
        cep: clean(input.cep, 9) || null,
        ponto_referencia: clean(input.ponto_referencia, 200) || null,
      },
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.technicianId) await assertActiveTechnician(context.supabase, data.technicianId);
    const { data: current } = await context.supabase
      .from("service_orders")
      .select("status")
      .eq("id", data.orderId)
      .single();
    if (!current) throw new Error("Atendimento não encontrado.");
    if (current.status === "finalizado" || current.status === "cancelado") {
      throw new Error("Atendimentos finalizados ou cancelados não podem ser editados.");
    }
    const { error } = await context.supabase
      .from("service_orders")
      .update({
        customer_id: data.customerId,
        equipment_type_id: data.equipmentTypeId,
        reported_problem: data.reportedProblem,
        technician_id: data.technicianId,
        scheduled_start: data.scheduledStart,
        estimated_minutes: data.estimatedMinutes,
        notes: data.notes,
        ...data.address,
      })
      .eq("id", data.orderId);
    throwIfError(error);
    return { ok: true as const };
  });

export const scheduleOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; scheduledStart: string; estimatedMinutes?: number; technicianId?: string | null }) => {
    if (!isUuid(input.orderId)) throw new Error("Atendimento inválido.");
    const d = new Date(input.scheduledStart);
    if (Number.isNaN(d.getTime())) throw new Error("Data de agendamento inválida.");
    return {
      orderId: input.orderId,
      scheduledStart: d.toISOString(),
      estimatedMinutes: Math.min(Math.max(Number(input.estimatedMinutes) || 60, 15), 24 * 60),
      technicianId: isUuid(input.technicianId) ? input.technicianId : null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.technicianId) await assertActiveTechnician(context.supabase, data.technicianId);
    const { data: current } = await context.supabase
      .from("service_orders")
      .select("status, technician_id")
      .eq("id", data.orderId)
      .single();
    if (!current) throw new Error("Atendimento não encontrado.");
    if (current.status === "finalizado" || current.status === "cancelado") {
      throw new Error("Atendimentos finalizados ou cancelados não podem ser agendados.");
    }
    const technicianId = data.technicianId ?? current.technician_id;
    if (!technicianId) throw new Error("Atribua um técnico antes de agendar.");
    const { error } = await context.supabase
      .from("service_orders")
      .update({
        scheduled_start: data.scheduledStart,
        estimated_minutes: data.estimatedMinutes,
        technician_id: technicianId,
        status: "visita_agendada",
      })
      .eq("id", data.orderId);
    throwIfError(error);
    return { ok: true as const };
  });

export const changeOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; status: string; note?: string | undefined }) => {
    if (!isUuid(input.orderId)) throw new Error("Atendimento inválido.");
    if (!(ORDER_STATUSES as readonly string[]).includes(input.status)) throw new Error("Status inválido.");
    return { orderId: input.orderId, status: input.status as OrderStatus, note: clean(input.note, 500) || null };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) {
      const techId = await myTechnicianId(context.supabase, context.userId);
      if (!techId) throw new Error("Acesso negado.");
      if (!TECHNICIAN_TRANSITIONS.includes(data.status)) {
        throw new Error("Técnicos só podem informar: a caminho, diagnóstico, serviço em andamento, conclusão ou somente visita.");
      }
      const { data: order } = await context.supabase
        .from("service_orders")
        .select("technician_id, status")
        .eq("id", data.orderId)
        .single();
      if (!order || order.technician_id !== techId) throw new Error("Este atendimento não é seu.");
      if (order.status === "finalizado" || order.status === "cancelado") {
        throw new Error("Atendimento já encerrado.");
      }
    }
    const patch: OrderUpdate = { status: data.status };
    if (data.status === "cancelado") patch.scheduled_start = null;
    const { error } = await context.supabase.from("service_orders").update(patch).eq("id", data.orderId);
    throwIfError(error);
    if (data.note) {
      await context.supabase.from("service_order_events").insert({
        order_id: data.orderId,
        event_type: data.status === "em_diagnostico" ? "diagnostico" : data.status === "servico_concluido" || data.status === "visita_concluida" ? "conclusao" : "observacao",
        description: data.note,
        actor_user_id: context.userId,
      });
    }
    return { ok: true as const };
  });

export const addOrderNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; note: string; eventType?: string }) => {
    if (!isUuid(input.orderId)) throw new Error("Atendimento inválido.");
    const note = clean(input.note, 1000);
    if (!note) throw new Error("Escreva a observação.");
    const eventType = ["observacao", "diagnostico"].includes(String(input.eventType)) ? String(input.eventType) : "observacao";
    return { orderId: input.orderId, note, eventType };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) {
      const techId = await myTechnicianId(context.supabase, context.userId);
      const { data: order } = await context.supabase
        .from("service_orders")
        .select("technician_id")
        .eq("id", data.orderId)
        .single();
      if (!techId || !order || order.technician_id !== techId) throw new Error("Este atendimento não é seu.");
    }
    const { error } = await context.supabase.from("service_order_events").insert({
      order_id: data.orderId,
      event_type: data.eventType,
      description: data.note,
      actor_user_id: context.userId,
    });
    throwIfError(error);
    return { ok: true as const };
  });

export const createQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; description: string; laborCents: number; parts: QuotePartInput[]; notes?: string }) => {
    if (!isUuid(input.orderId)) throw new Error("Atendimento inválido.");
    const description = clean(input.description, 1000);
    if (!description) throw new Error("Descreva o serviço.");
    const laborCents = Math.max(Math.round(Number(input.laborCents) || 0), 0);
    const parts = (Array.isArray(input.parts) ? input.parts : [])
      .map((p) => ({
        description: clean(p.description, 200),
        quantity: Math.max(Number(p.quantity) || 0, 0),
        unitPriceCents: Math.max(Math.round(Number(p.unitPriceCents) || 0), 0),
      }))
      .filter((p) => p.description && p.quantity > 0);
    return { orderId: input.orderId, description, laborCents, parts, notes: clean(input.notes, 1000) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: order } = await context.supabase
      .from("service_orders")
      .select("status")
      .eq("id", data.orderId)
      .single();
    if (!order) throw new Error("Atendimento não encontrado.");
    if (order.status === "finalizado" || order.status === "cancelado") {
      throw new Error("Não é possível orçar um atendimento encerrado.");
    }
    const totals = calcQuoteTotals(data.laborCents, data.parts);
    const { data: existing } = await context.supabase
      .from("quotes")
      .select("id, version, status")
      .eq("order_id", data.orderId)
      .order("version", { ascending: false });
    const approved = (existing ?? []).find((q) => q.status === "aprovado");
    if (approved) {
      // Aprovado nunca é alterado silenciosamente: nova versão substitui e fica registrado.
      await context.supabase.from("quotes").update({ status: "substituido" }).eq("id", approved.id);
      await context.supabase.from("service_order_events").insert({
        order_id: data.orderId,
        event_type: "orcamento",
        description: `Orçamento aprovado (v${approved.version}) substituído por nova versão`,
        actor_user_id: context.userId,
      });
    }
    for (const q of (existing ?? []).filter((q) => q.status === "enviado" || q.status === "rascunho")) {
      await context.supabase.from("quotes").update({ status: "substituido" }).eq("id", q.id);
    }
    const version = ((existing ?? [])[0]?.version ?? 0) + 1;
    const { data: quote, error } = await context.supabase
      .from("quotes")
      .insert({
        order_id: data.orderId,
        version,
        description: data.description,
        labor_cents: data.laborCents,
        parts_total_cents: totals.partsTotalCents,
        total_cents: totals.totalCents,
        status: "enviado",
        notes: data.notes,
        created_by: context.userId,
      })
      .select("id")
      .single();
    throwIfError(error);
    if (!quote) throw new Error("Não foi possível criar o orçamento.");
    if (totals.parts.length) {
      const { error: partsErr } = await context.supabase.from("quote_parts").insert(
        totals.parts.map((p) => ({
          quote_id: quote.id,
          description: p.description,
          quantity: p.quantity,
          unit_price_cents: p.unitPriceCents,
          total_cents: p.totalCents,
        })),
      );
      throwIfError(partsErr);
    }
    await context.supabase.from("service_orders").update({ status: "orcamento_enviado" }).eq("id", data.orderId);
    await context.supabase.from("service_order_events").insert({
      order_id: data.orderId,
      event_type: "orcamento",
      description: `Orçamento v${version} criado: mão de obra R$ ${(data.laborCents / 100).toFixed(2)} + peças R$ ${(totals.partsTotalCents / 100).toFixed(2)} = R$ ${(totals.totalCents / 100).toFixed(2)}`,
      actor_user_id: context.userId,
    });
    return { ok: true as const, version };
  });

export const decideQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { quoteId: string; decision: string; billVisit?: boolean }) => {
    if (!isUuid(input.quoteId)) throw new Error("Orçamento inválido.");
    if (input.decision !== "aprovado" && input.decision !== "recusado") throw new Error("Decisão inválida.");
    return { quoteId: input.quoteId, decision: input.decision as "aprovado" | "recusado", billVisit: Boolean(input.billVisit) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: quote } = await context.supabase
      .from("quotes")
      .select("id, order_id, version, status, total_cents, labor_cents, parts_total_cents")
      .eq("id", data.quoteId)
      .single();
    if (!quote) throw new Error("Orçamento não encontrado.");
    if (quote.status !== "enviado" && quote.status !== "rascunho") {
      throw new Error("Este orçamento já foi decidido ou substituído.");
    }
    const { error } = await context.supabase
      .from("quotes")
      .update({ status: data.decision })
      .eq("id", data.quoteId);
    throwIfError(error);
    const orderPatch: OrderUpdate = {
      status: data.decision === "aprovado" ? "orcamento_aprovado" : "orcamento_recusado",
    };
    // Orçamento recusado: visita pode ser marcada como cobrável (R$ 30: R$ 20 técnico / R$ 10 MaqnoLar).
    // Orçamento aprovado: taxa de visita não é somada ao valor do orçamento.
    if (data.decision === "recusado") orderPatch.visit_billable = data.billVisit;
    if (data.decision === "aprovado") orderPatch.visit_billable = false;
    await context.supabase.from("service_orders").update(orderPatch).eq("id", quote.order_id);

    // Composição financeira com cópia da regra vigente (histórico preservado).
    const { data: rule } = await context.supabase
      .from("split_rules")
      .select("kind, technician_percent, company_percent, technician_fixed_cents, company_fixed_cents")
      .eq("kind", data.decision === "aprovado" ? "mao_obra" : "visita")
      .lte("valid_from", new Date().toISOString())
      .order("valid_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data.decision === "aprovado") {
      // Orçamento aprovado: a visita não é cobrada novamente — remove composição de visita existente.
      await context.supabase.from("order_financials").delete().eq("order_id", quote.order_id).eq("kind", "visita");
      const snapshot: SplitRuleSnapshot = {
        technicianPercent: rule?.technician_percent ?? null,
        companyPercent: rule?.company_percent ?? null,
        technicianFixedCents: rule?.technician_fixed_cents ?? null,
        companyFixedCents: rule?.company_fixed_cents ?? null,
      };
      const shares = splitLabor(quote.labor_cents, snapshot);
      const { error: finErr } = await context.supabase.from("order_financials").upsert(
        {
          order_id: quote.order_id,
          quote_id: quote.id,
          kind: "servico",
          total_cents: quote.total_cents,
          labor_cents: quote.labor_cents,
          parts_estimated_cents: quote.parts_total_cents,
          rule_technician_percent: snapshot.technicianPercent,
          rule_company_percent: snapshot.companyPercent,
          rule_technician_fixed_cents: snapshot.technicianFixedCents,
          rule_company_fixed_cents: snapshot.companyFixedCents,
          technician_share_cents: shares.technicianShareCents,
          company_share_cents: shares.companyShareCents,
          status: "previsto",
          created_by: context.userId,
        },
        { onConflict: "order_id" },
      );
      throwIfError(finErr);
    } else if (data.billVisit) {
      const snapshot: SplitRuleSnapshot = {
        technicianPercent: rule?.technician_percent ?? null,
        companyPercent: rule?.company_percent ?? null,
        technicianFixedCents: rule?.technician_fixed_cents ?? null,
        companyFixedCents: rule?.company_fixed_cents ?? null,
      };
      const shares = splitLabor(0, snapshot);
      const visitTotal = shares.technicianShareCents + shares.companyShareCents;
      const { error: finErr } = await context.supabase.from("order_financials").upsert(
        {
          order_id: quote.order_id,
          quote_id: null,
          kind: "visita",
          total_cents: visitTotal,
          labor_cents: 0,
          parts_estimated_cents: 0,
          rule_technician_percent: snapshot.technicianPercent,
          rule_company_percent: snapshot.companyPercent,
          rule_technician_fixed_cents: snapshot.technicianFixedCents,
          rule_company_fixed_cents: snapshot.companyFixedCents,
          technician_share_cents: shares.technicianShareCents,
          company_share_cents: shares.companyShareCents,
          status: "previsto",
          created_by: context.userId,
        },
        { onConflict: "order_id" },
      );
      throwIfError(finErr);
    } else {
      // Visita dispensada: não gera valor a receber.
      await context.supabase.from("order_financials").delete().eq("order_id", quote.order_id).eq("kind", "visita");
    }
    await context.supabase.from("service_order_events").insert({
      order_id: quote.order_id,
      event_type: "orcamento",
      description:
        data.decision === "aprovado"
          ? `Orçamento v${quote.version} aprovado (R$ ${(quote.total_cents / 100).toFixed(2)})`
          : `Orçamento v${quote.version} recusado${data.billVisit ? " — visita marcada como cobrável" : ""}`,
      actor_user_id: context.userId,
    });
    return { ok: true as const };
  });
