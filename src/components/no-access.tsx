import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function NoAccess() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: adminExists } = useQuery({
    queryKey: ["admin-exists"],
    queryFn: async () => {
      const { data } = await supabase.rpc("admin_exists");
      return Boolean(data);
    },
  });

  async function claim() {
    setBusy(true);
    const { error } = await supabase.rpc("bootstrap_first_admin");
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Você agora é o administrador inicial.");
    await qc.invalidateQueries();
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
          <ShieldAlert className="h-6 w-6" />
        </div>
        {adminExists === false ? (
          <>
            <h1 className="text-2xl font-semibold">Configuração inicial</h1>
            <p className="text-muted-foreground">
              Ainda não existe nenhum administrador. Se você é sócio da MaqnoLar, confirme abaixo para se
              tornar o administrador inicial. Esta opção desaparece assim que houver um administrador.
            </p>
            <Button onClick={claim} disabled={busy} className="w-full">
              Tornar-me administrador inicial
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Acesso pendente</h1>
            <p className="text-muted-foreground">
              Sua conta ainda não tem um perfil liberado ou foi desativada. Fale com um administrador.
            </p>
          </>
        )}
        <Button variant="ghost" onClick={signOut}>Sair</Button>
      </div>
    </div>
  );
}
