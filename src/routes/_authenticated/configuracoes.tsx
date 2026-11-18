import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { OperationResetCard } from "@/components/operation-reset-card";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — MaqnoLar Financeiro" },
      { name: "description", content: "Preferências de conta e aparência." },
      { property: "og:title", content: "Configurações — MaqnoLar Financeiro" },
      { property: "og:description", content: "Preferências de conta e aparência." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

const options: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Automático", icon: Monitor },
];

function Settings() {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold md:text-3xl">Configurações</h1>
      <Card>
        <CardHeader>
          <CardTitle>Aparência</CardTitle>
          <CardDescription>Sua escolha fica salva na sua conta.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={async () => {
                await setTheme(o.value);
                toast.success("Aparência salva.");
              }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors hover:bg-muted",
                theme === o.value && "border-primary bg-primary/10 text-primary",
              )}
            >
              <o.icon className="h-5 w-5" />
              {o.label}
            </button>
          ))}
        </CardContent>
      </Card>
      {session?.isAdmin && <OperationResetCard />}
    </div>
  );
}
