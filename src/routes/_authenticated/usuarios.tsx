import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { inviteUser } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários e permissões — MaqnoLar Financeiro" },
      { name: "description", content: "Gerencie administradores, técnicos e o histórico de permissões." },
      { property: "og:title", content: "Usuários e permissões — MaqnoLar Financeiro" },
      { property: "og:description", content: "Gerencie administradores, técnicos e permissões." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

type Role = "admin" | "tecnico";
const roleLabel: Record<string, string> = { admin: "Administrador", tecnico: "Técnico" };
const actionLabel: Record<string, string> = {
  role_added: "Perfil atribuído",
  role_removed: "Perfil removido",
  user_activated: "Usuário ativado",
  user_deactivated: "Usuário desativado",
  bootstrap_first_admin: "Administrador inicial configurado",
};

function useUsers() {
  return useQuery({
    queryKey: ["users-admin"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }, { data: audit }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, active").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("permission_audit").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      if (error) throw error;
      const byId = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || ""]));
      return {
        users: (profiles ?? []).map((p) => ({
          ...p,
          role: (roles ?? []).find((r) => r.user_id === p.id)?.role as Role | undefined,
        })),
        audit: (audit ?? []).map((a) => ({
          ...a,
          target: byId.get(a.target_user_id) ?? "—",
          actor: a.actor_user_id ? (byId.get(a.actor_user_id) ?? "—") : "Sistema",
        })),
      };
    },
  });
}

function UsersPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const { data } = useUsers();

  if (!session?.isAdmin) {
    return <p className="text-muted-foreground">Esta área é exclusiva para administradores.</p>;
  }

  async function changeRole(id: string, role: Role) {
    const { error } = await supabase.rpc("set_user_role", { _target: id, _role: role });
    if (error) toast.error(error.message);
    else toast.success("Perfil atualizado.");
    qc.invalidateQueries();
  }

  async function changeActive(id: string, active: boolean) {
    const { error } = await supabase.rpc("set_user_active", { _target: id, _active: active });
    if (error) toast.error(error.message);
    else toast.success(active ? "Usuário ativado." : "Usuário desativado.");
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">Usuários e permissões</h1>
          <p className="mt-1 text-muted-foreground">Somente administradores podem convidar pessoas e alterar perfis.</p>
        </div>
        <InviteDialog onDone={() => qc.invalidateQueries()} />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead className="text-right">Ativo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.full_name}
                    {u.id === session.userId && <Badge variant="secondary" className="ml-2">você</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Select value={u.role ?? ""} onValueChange={(v) => changeRole(u.id, v as Role)}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="Sem perfil" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="tecnico">Técnico</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch checked={u.active} onCheckedChange={(v) => changeActive(u.id, v)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de permissões</CardTitle>
          <CardDescription>Registro permanente de quem alterou o quê.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data?.audit.length === 0 && <p className="text-muted-foreground">Nenhuma alteração registrada.</p>}
          {data?.audit.map((a) => (
            <div key={a.id} className="flex flex-wrap justify-between gap-2 border-b py-2 last:border-0">
              <span>
                <strong>{actionLabel[a.action] ?? a.action}</strong>
                {a.new_value && roleLabel[a.new_value] ? ` (${roleLabel[a.new_value]})` : ""}
                {a.old_value && roleLabel[a.old_value] ? ` (${roleLabel[a.old_value]})` : ""} — {a.target}
              </span>
              <span className="text-muted-foreground">
                por {a.actor} · {new Date(a.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function InviteDialog({ onDone }: { onDone: () => void }) {
  const invite = useServerFn(inviteUser);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", role: "tecnico" as Role });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await invite({ data: { ...form, redirectTo: `${window.location.origin}/reset-password` } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Convite enviado por e-mail.");
      setForm({ fullName: "", email: "", role: "tecnico" });
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao convidar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="mr-2 h-4 w-4" />Convidar usuário</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Convidar usuário</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Perfil</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tecnico">Técnico</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Enviando..." : "Enviar convite"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
