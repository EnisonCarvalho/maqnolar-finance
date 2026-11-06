import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Pencil, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { formatDateBR } from "@/lib/format";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/tecnicos")({
  head: () => ({
    meta: [
      { title: "Técnicos — MaqnoLar Financeiro" },
      { name: "description", content: "Cadastro e gestão dos técnicos parceiros da MaqnoLar." },
      { property: "og:title", content: "Técnicos — MaqnoLar Financeiro" },
      { property: "og:description", content: "Cadastro e gestão dos técnicos parceiros da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TechniciansPage,
});

type Technician = Tables<"technicians">;
const emptyForm = { full_name: "", phone: "", email: "", bairro: "", cidade: "" };

function useTechnicians() {
  return useQuery({
    queryKey: ["technicians"],
    queryFn: async () => {
      const { data, error } = await supabase.from("technicians").select("*").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function TechniciansPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const { data } = useTechnicians();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Technician | null>(null);
  const [adding, setAdding] = useState(false);

  if (!session?.isAdmin) {
    return <p className="text-muted-foreground">Esta área é exclusiva para administradores.</p>;
  }

  const term = search.trim().toLowerCase();
  const filtered = (data ?? []).filter(
    (t) =>
      !term ||
      t.full_name.toLowerCase().includes(term) ||
      (t.phone ?? "").toLowerCase().includes(term),
  );

  async function toggleActive(t: Technician, active: boolean) {
    const { error } = await supabase.from("technicians").update({ active }).eq("id", t.id);
    if (error) toast.error(error.message);
    else toast.success(active ? `${t.full_name} ativado.` : `${t.full_name} desativado.`);
    qc.invalidateQueries({ queryKey: ["technicians"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">Técnicos</h1>
          <p className="mt-1 text-muted-foreground">
            Técnicos parceiros da MaqnoLar. Todos atendem os mesmos equipamentos e serviços do catálogo geral.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <UserPlus className="mr-2 h-4 w-4" />Adicionar técnico
        </Button>
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="Pesquisar por nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone / WhatsApp</TableHead>
                <TableHead>Bairro</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Cadastrado em</TableHead>
                <TableHead className="text-right">Ativo</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhum técnico encontrado.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((t) => (
                <TableRow key={t.id} className={t.active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">
                    {t.full_name}
                    {!t.active && <Badge variant="secondary" className="ml-2">inativo</Badge>}
                    {(!t.phone || !t.bairro || !t.cidade) && (
                      <Badge variant="outline" className="ml-2">cadastro incompleto</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{t.bairro ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{t.cidade ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateBR(t.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Switch checked={t.active} onCheckedChange={(v) => toggleActive(t, v)} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(t)} aria-label={`Editar ${t.full_name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TechnicianDialog
        open={adding}
        onOpenChange={setAdding}
        onDone={() => qc.invalidateQueries({ queryKey: ["technicians"] })}
      />
      <TechnicianDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        technician={editing ?? undefined}
        onDone={() => qc.invalidateQueries({ queryKey: ["technicians"] })}
      />
    </div>
  );
}

function TechnicianDialog({
  open,
  onOpenChange,
  technician,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  technician?: Technician | undefined;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function reset() {
    setForm(
      technician
        ? {
            full_name: technician.full_name,
            phone: technician.phone ?? "",
            email: technician.email ?? "",
            bairro: technician.bairro ?? "",
            cidade: technician.cidade ?? "",
          }
        : emptyForm,
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      bairro: form.bairro.trim(),
      cidade: form.cidade.trim(),
    };
    const { error } = technician
      ? await supabase.from("technicians").update(payload).eq("id", technician.id)
      : await supabase.from("technicians").insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(technician ? "Cadastro atualizado." : "Técnico cadastrado.");
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{technician ? `Editar ${technician.full_name}` : "Adicionar técnico"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome completo *</Label>
            <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Telefone / WhatsApp *</Label>
            <Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>E-mail (opcional)</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Bairro *</Label>
              <Input required value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Cidade *</Label>
              <Input required value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
