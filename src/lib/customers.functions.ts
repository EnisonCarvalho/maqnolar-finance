import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Remove cliente sem vínculos; com OS/leads vinculados, apenas desativa (decisão no banco). */
export const removeCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(input?.id))) throw new Error("Cliente inválido.");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Somente administradores removem clientes.");
    const { data: result, error } = await context.supabase.rpc("remove_customer", { _id: data.id });
    if (error) throw new Error(error.message);
    return { result: result as "removido" | "desativado" };
  });
