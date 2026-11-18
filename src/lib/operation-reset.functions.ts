import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ResetCounts = Record<string, number>;

export const getResetPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("operation_reset_preview");
    if (error) throw new Error(error.message);
    return data as ResetCounts;
  });

export const resetOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { reason: string; confirmation: string }) => {
    const reason = String(i?.reason ?? "").trim().slice(0, 300);
    if (reason.length < 3) throw new Error("Informe o motivo.");
    if (String(i?.confirmation ?? "").trim().toUpperCase() !== "REINICIAR") throw new Error("Digite REINICIAR para confirmar.");
    return { reason };
  })
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("reset_operation", { _reason: data.reason });
    if (error) throw new Error(error.message.replace(/^.*?ERROR:\s*/, ""));
    return res as ResetCounts & { batch: string };
  });
