import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { formatBRL, parseBRLToCents, formatDateBR } from "@/lib/format";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/divisao-financeira")({
  head: () => ({
    meta: [
      { title: "Composição financeira — MaqnoLar Financeiro" },
      { name: "description", content: "Regras de divisão entre técnico e MaqnoLar." },
      { property: "og:title", content: "Composição financeira — MaqnoLar Financeiro" },
      { property: "og:description", content: "Regras de divisão entre técnico e MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SplitRulesPage,
});

type SplitRule = Tables<"split_rules">;

function useSplitRules() {
  return useQuery({
    queryKey: ["split-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("split_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function SplitRulesPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const { data } = useSplitRules();

  if (!session?.isAdmin) {
    return <p className="text-muted-foreground">Esta área é exclusiva para administradores.</p>;
  }

  const rules = data ?? [];
  const currentVisita = rules.find((r) => r.kind === "visita" && !r.valid_until);
  const currentMaoObra = rules.find((r) => r.kind === "mao_obra" && !r.valid_until);
  const history = rules.filter((r) => r.valid_until);
  const refresh = () => qc.invalidateQueries({ queryKey: ["split-rules"] });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">Composição financeira</h1>
        <p className="mt-1 text-muted-foreground">
          Regras de divisão entre técnico e MaqnoLar. Mudanças valem apenas para os próximos atendimentos — o histórico
          de cada atendimento preserva a regra aplicada.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <VisitaRuleCard current={currentVisita} onDone={refresh} />
        <MaoObraRuleCard current={currentMaoObra} onDone={refresh} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de regras</CardTitle>
          <CardDescription>Versões anteriores, preservadas para conferência.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {history.length === 0 && <p className="text-muted-foreground">Nenhuma regra substituída ainda.</p>}
          {history.map((r) => (
            <div key={r.id} className="flex flex-wrap justify-between gap-2 border-b py-2 last:border-0">
              <span>
                <strong>{r.kind === "visita" ? "Visita técnica" : "Mão de obra"}</strong> —{" "}
                {r.kind === "visita"
                  ? `técnico ${formatBRL(r.technician_fixed_cents)} / MaqnoLar ${formatBRL(r.company_fixed_cents)}`
                  : `técnico ${r.technician_percent}% / MaqnoLar ${r.company_percent}%`}
              </span>
              <span className="text-muted-foreground">
                vigente de {formatDateBR(r.valid_from)} até {formatDateBR(r.valid_until)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

async function replaceRule(current: SplitRule | undefined, insert: Tables<"split_rules">["Insert"]) {
  if (current) {
    const { error } = await supabase
      .from("split_rules")
      .update({ valid_until: new Date().toISOString() })
      .eq("id", current.id);
    if (error) return error.message;
  }
  const { error } = await supabase.from("split_rules").insert(insert);
  return error?.message ?? null;
}

function VisitaRuleCard({ current, onDone }: { current?: SplitRule; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [tecnico, setTecnico] = useState("");
  const [empresa, setEmpresa] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = parseBRLToCents(tecnico);
    const m = parseBRLToCents(empresa);
    if (t == null || m == null || t < 0 || m < 0) {
      toast.error("Informe valores válidos para técnico e MaqnoLar.");
      return;
    }
    setBusy(true);
    const err = await replaceRule(current, {
      kind: "visita",
      technician_fixed_cents: t,
      company_fixed_cents: m,
    });
    setBusy(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success("Regra de visita atualizada. Vale para os próximos atendimentos.");
    setTecnico("");
    setEmpresa("");
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visita técnica (orçamento não aprovado)</CardTitle>
        <CardDescription>
          Valor fixo pago pelo cliente quando o orçamento não é aprovado. Se o orçamento for aprovado, a visita não é
          cobrada à parte.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          Regra atual: cliente paga{" "}
          <strong>
            {formatBRL((current?.technician_fixed_cents ?? 0) + (current?.company_fixed_cents ?? 0))}
          </strong>{" "}
          — técnico <strong>{formatBRL(current?.technician_fixed_cents)}</strong>, MaqnoLar{" "}
          <strong>{formatBRL(current?.company_fixed_cents)}</strong>.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Parte do técnico (R$)</Label>
              <Input inputMode="decimal" placeholder="20,00" value={tecnico} onChange={(e) => setTecnico(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Parte da MaqnoLar (R$)</Label>
              <Input inputMode="decimal" placeholder="10,00" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
            </div>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando..." : "Salvar nova regra de visita"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MaoObraRuleCard({ current, onDone }: { current?: SplitRule; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [tecnico, setTecnico] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = Number(tecnico.replace(",", "."));
    if (!Number.isFinite(t) || t < 0 || t > 100) {
      toast.error("Informe um percentual entre 0 e 100.");
      return;
    }
    setBusy(true);
    const err = await replaceRule(current, {
      kind: "mao_obra",
      technician_percent: t,
      company_percent: Math.round((100 - t) * 100) / 100,
    });
    setBusy(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success("Regra de mão de obra atualizada. Vale para os próximos atendimentos.");
    setTecnico("");
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mão de obra (serviço aprovado)</CardTitle>
        <CardDescription>
          Divisão percentual da mão de obra. O custo das peças é separado e não entra nessa divisão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          Regra atual: técnico <strong>{current?.technician_percent ?? "—"}%</strong>, MaqnoLar{" "}
          <strong>{current?.company_percent ?? "—"}%</strong>.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Percentual do técnico (%)</Label>
            <Input inputMode="decimal" placeholder="50" value={tecnico} onChange={(e) => setTecnico(e.target.value)} />
            <p className="text-xs text-muted-foreground">A MaqnoLar fica com o restante até completar 100%.</p>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando..." : "Salvar nova regra de mão de obra"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
