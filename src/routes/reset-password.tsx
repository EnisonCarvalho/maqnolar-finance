import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { normalizeEmail, isValidEmail } from "@/lib/user-email";
import {
  classifyPasswordUpdateError,
  classifyResetRequestError,
  parseRecoveryUrl,
} from "@/lib/password-recovery";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha — MaqnoLar Financeiro" },
      { name: "description", content: "Defina uma nova senha de acesso ao MaqnoLar Financeiro." },
      { property: "og:title", content: "Nova senha — MaqnoLar Financeiro" },
      { property: "og:description", content: "Defina uma nova senha de acesso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "expired">("checking");
  const [expiredMessage, setExpiredMessage] = useState(
    "Este link de recuperação expirou ou já foi utilizado. Solicite um novo link abaixo.",
  );
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let active = true;
    const parsed = parseRecoveryUrl(window.location.search, window.location.hash);

    if (parsed.kind === "error") {
      setExpiredMessage(parsed.message);
      setStatus("expired");
      return;
    }

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (parsed.kind === "session_url" && event === "SIGNED_IN" && session)) {
        setStatus("ready");
      }
    });

    async function resolveSession() {
      if (parsed.kind === "token_hash") {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: parsed.tokenHash,
          type: "recovery",
        });
        if (!active) return;
        window.history.replaceState({}, document.title, window.location.pathname);
        if (error) {
          setExpiredMessage("Este link de recuperação expirou ou já foi utilizado. Solicite um novo link abaixo.");
          setStatus("expired");
          return;
        }
        setStatus("ready");
        return;
      }

      // GoTrueClient already processes #access_token and ?code once via detectSessionInUrl.
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (!error && data.session) {
        setStatus("ready");
        return;
      }

      if (parsed.kind === "session_url") {
        // Give the auth client one short tick if the URL callback is still settling.
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (!active) return;
        const retry = await supabase.auth.getSession();
        if (!active) return;
        if (!retry.error && retry.data.session) {
          setStatus("ready");
          return;
        }
      }

      setExpiredMessage("Este link de recuperação expirou ou já foi utilizado. Solicite um novo link abaixo.");
      setStatus("expired");
    }

    void resolveSession();
    return () => {
      active = false;
      authSub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      const classified = classifyPasswordUpdateError(error);
      toast.error(classified.message);
      if (classified.expired) {
        setExpiredMessage(classified.message);
        setStatus("expired");
      }
      return;
    }
    toast.success("Senha atualizada.");
    navigate({ to: "/dashboard", replace: true });
  }

  async function onRequestNewLink(e: FormEvent) {
    e.preventDefault();
    const cleanEmail = normalizeEmail(resendEmail);
    if (!isValidEmail(cleanEmail)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResending(false);
    if (error) {
      toast.error(classifyResetRequestError(error));
      return;
    }
    setResent(true);
    toast.success("Enviamos um novo link para o seu e-mail.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      {status === "checking" ? (
        <div className="w-full max-w-sm space-y-2 text-center">
          <h1 className="text-xl font-semibold">Validando link de recuperação</h1>
          <p className="text-sm text-muted-foreground">Aguarde um instante…</p>
        </div>
      ) : status === "ready" ? (
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Definir nova senha</h1>
            <p className="mt-1 text-sm text-muted-foreground">Escolha uma nova senha com pelo menos 8 caracteres.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw">Nova senha</Label>
            <PasswordInput id="pw" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Salvando..." : "Salvar nova senha"}</Button>
        </form>
      ) : (
        <div className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Link expirado ou inválido</h1>
            <p className="mt-1 text-sm text-muted-foreground">{expiredMessage}</p>
          </div>
          {resent ? (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-foreground">
              Enviamos um novo link de recuperação para <strong>{normalizeEmail(resendEmail)}</strong>. Abra o e-mail mais recente para definir sua nova senha.
            </div>
          ) : (
            <form onSubmit={onRequestNewLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resend-email">E-mail de acesso</Label>
                <Input
                  id="resend-email"
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full" disabled={resending}>
                {resending ? "Enviando..." : "Solicitar novo link"}
              </Button>
            </form>
          )}
          <div className="text-center">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
              Voltar para o login
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
