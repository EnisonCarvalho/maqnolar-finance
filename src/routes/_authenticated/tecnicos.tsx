import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Link2, Pencil, Trash2, Unlink, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { formatDateBR } from "@/lib/format";
import { linkTechnicianAccount, listLinkableUsers, unlinkTechnicianAccount } from "@/lib/technician-area.functions";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

      {/* Cartões no celular */}
      <div className="grid gap-2 lg:hidden">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum técnico encontrado.</p>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className={`rounded-lg border bg-card p-3 ${t.active ? "" : "opacity-60"}`}>
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setEditing(t)} className="min-w-0 text-left font-medium">
                  <span className="truncate">{t.full_name}</span>
                  {!t.active && <Badge variant="secondary" className="ml-2">inativo</Badge>}
                  {(!t.phone || !t.bairro || !t.cidade) && (
                    <Badge variant="outline" className="ml-2">cadastro incompleto</Badge>
                  )}
                </button>
                <Switch checked={t.active} onCheckedChange={(v) => toggleActive(t, v)} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t.phone ?? "Sem telefone"}</p>
              <p className="text-xs text-muted-foreground">
                {[t.bairro, t.cidade].filter(Boolean).join(" · ") || "Endereço não informado"}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(t)}><Pencil className="mr-1 h-4 w-4" />Editar</Button>
                {t.active && <Button size="sm" variant="outline" className="flex-1 text-destructive" onClick={() => { if (window.confirm(`Remover ${t.full_name}? O técnico será desativado e o histórico fica preservado.`)) void toggleActive(t, false); }}><Trash2 className="mr-1 h-4 w-4" />Remover</Button>}
              </div>
            </div>
          ))
        )}
      </div>

      <Card className="hidden lg:block">
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
                    {t.active && (
                      <Button variant="ghost" size="icon" aria-label={`Remover ${t.full_name}`} onClick={() => { if (window.confirm(`Remover ${t.full_name}? O técnico será desativado e o histórico das OS e acertos fica preservado.`)) void toggleActive(t, false); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
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

  // Preenche o formulário sempre que o diálogo abre (o onOpenChange controlado
  // não dispara quando a abertura vem do estado externo).
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, technician?.id]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
        {technician && <AccountLinkSection technician={technician} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

/** Vínculo conta de usuário ↔ técnico (Passo 11A). Somente administradores; validado no backend. */
function AccountLinkSection({ technician, onDone }: { technician: Technician; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");
  const { data, refetch } = useQuery({
    queryKey: ["linkable-users"],
    queryFn: () => listLinkableUsers(),
  });

  const link = data?.links.find((l) => l.technicianId === technician.id);
  const available = (data?.users ?? []).filter((u) => !u.linkedTechnicianName);

  async function linkAccount() {
    if (!selectedUser) return;
    setBusy(true);
    try {
      await linkTechnicianAccount({ data: { technicianId: technician.id, userId: selectedUser } });
      toast.success("Conta vinculada ao técnico.");
      setSelectedUser("");
      await refetch();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível vincular.");
    } finally {
      setBusy(false);
    }
  }

  async function unlinkAccount() {
    setBusy(true);
    try {
      await unlinkTechnicianAccount({ data: { technicianId: technician.id } });
      toast.success("Vínculo removido.");
      await refetch();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível desvincular.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">Conta de acesso à área do técnico</p>
      {link ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            <Link2 className="mr-1 h-3 w-3" /> {link.userName}
          </Badge>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={unlinkAccount}>
            <Unlink className="mr-1 h-4 w-4" /> Desvincular
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione uma conta de usuário..." />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <SelectItem value="__none" disabled>
                  Nenhuma conta disponível
                </SelectItem>
              ) : (
                available.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName} {u.email ? `(${u.email})` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" disabled={busy || !selectedUser} onClick={linkAccount}>
            <Link2 className="mr-1 h-4 w-4" /> Vincular
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        O vínculo é feito somente por administradores e libera o acesso do técnico aos próprios atendimentos e ao próprio financeiro.
      </p>
    </div>
  );
}
