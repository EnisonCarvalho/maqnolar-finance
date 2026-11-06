import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wrench } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — MaqnoLar Financeiro" },
      { name: "description", content: "Acesso à gestão operacional e financeira da MaqnoLar Assistência Técnica." },
      { property: "og:title", content: "Entrar — MaqnoLar Financeiro" },
      { property: "og:description", content: "Acesso à gestão operacional e financeira da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setLoading(false);
      if (error) { toast.error("Não foi possível enviar o e-mail."); return; }
      toast.success("Enviamos um link para redefinir sua senha.");
      setMode("login");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error("E-mail ou senha inválidos."); return; }
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Wrench className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-semibold">MaqnoLar Financeiro</span>
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight text-sidebar-accent-foreground">
            Atendimentos, acertos e caixa
            <br />
            <span className="text-sidebar-primary">em um só lugar.</span>
          </h1>
          <p className="mt-4 max-w-md text-sidebar-foreground/70">
            Gestão operacional e financeira da MaqnoLar Assistência Técnica.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">© MaqnoLar Assistência Técnica</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-semibold">{mode === "login" ? "Entrar" : "Recuperar senha"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login" ? "Use o acesso fornecido pela administração." : "Informe seu e-mail cadastrado."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode === "login" && (
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Enviar link"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setMode(mode === "login" ? "reset" : "login")}
          >
            {mode === "login" ? "Esqueci minha senha" : "Voltar para o login"}
          </button>
        </form>
      </div>
    </div>
  );
}
