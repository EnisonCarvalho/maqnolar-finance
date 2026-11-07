import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reportedReaisToCents } from "@/lib/technician-service";

function orderId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("Atendimento inválido.");
  return value;
}

export const reportTechnicianValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; valueReais: string }) => ({ orderId: orderId(input.orderId), cents: reportedReaisToCents(input.valueReais) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("report_technician_value", { _order: data.orderId, _cents: data.cents });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const confirmVisitComposition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; reason?: string }) => ({ orderId: orderId(input.orderId), reason: (input.reason ?? "").trim().slice(0, 1000) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("confirm_visit_composition", { _order: data.orderId, _reason: data.reason });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const confirmServiceComposition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; totalReais: string; partsReais: string; reason?: string }) => ({
    orderId: orderId(input.orderId), total: reportedReaisToCents(input.totalReais),
    parts: reportedReaisToCents(input.partsReais), reason: (input.reason ?? "").trim().slice(0, 1000),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("confirm_service_composition", { _order: data.orderId, _total: data.total, _parts: data.parts, _reason: data.reason });
    if (error) throw new Error(error.message);
    return { ok: true };
  });