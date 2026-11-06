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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — MaqnoLar Financeiro" },
      { name: "description", content: "Cadastro e gestão dos clientes da MaqnoLar." },
      { property: "og:title", content: "Clientes — MaqnoLar Financeiro" },
      { property: "og:description", content: "Cadastro e gestão dos clientes da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomersPage,
});

type Customer = Tables<"customers">;
const emptyForm = {
  full_name: "", phone: "", email: "", endereco: "", numero: "", complemento: "",
  bairro: "", cidade: "", estado: "", cep: "", ponto_referencia: "",
};

function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function CustomersPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const { data } = useCustomers();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [adding, setAdding] = useState(false);

  if (!session?.isAdmin) {
    return <p className="text-muted-foreground">Esta área é exclusiva para administradores.</p>;
  }

  const term = search.trim().toLowerCase();
  const filtered = (data ?? []).filter(
    (c) =>
      !term ||
      c.full_name.toLowerCase().includes(term) ||
      (c.phone ?? "").toLowerCase().includes(term) ||
      (c.bairro ?? "").toLowerCase().includes(term) ||
      (c.cidade ?? "").toLowerCase().includes(term),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">Clientes</h1>
          <p className="mt-1 text-muted-foreground">
            Cadastro de clientes. Cada cliente poderá ser vinculado aos seus atendimentos.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <UserPlus className="mr-2 h-4 w-4" />Adicionar cliente
        </Button>
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="Pesquisar por nome, telefone, bairro ou cidade..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Cartões no celular */}
      <div className="grid gap-2 lg:hidden">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
        ) : (
          filtered.map((c) => (
            <button key={c.id} onClick={() => setEditing(c)} className="rounded-lg border bg-card p-3 text-left">
              <p className="font-medium">{c.full_name}</p>
              <p className="text-sm text-muted-foreground">{c.phone ?? "Sem telefone"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {[c.endereco, c.numero].filter(Boolean).join(", ") || "—"}
                {c.bairro ? ` · ${c.bairro}` : ""}
                {c.cidade ? ` · ${c.cidade}/${c.estado ?? ""}` : ""}
              </p>
            </button>
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
                <TableHead>Endereço</TableHead>
                <TableHead>Bairro</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead>Cadastrado em</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhum cliente encontrado.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[c.endereco, c.numero].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.bairro ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[c.cidade, c.estado].filter(Boolean).join("/") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateBR(c.created_at)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(c)} aria-label={`Editar ${c.full_name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CustomerDialog
        open={adding}
        onOpenChange={setAdding}
        onDone={() => qc.invalidateQueries({ queryKey: ["customers"] })}
      />
      <CustomerDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        customer={editing ?? undefined}
        onDone={() => qc.invalidateQueries({ queryKey: ["customers"] })}
      />
    </div>
  );
}

function CustomerDialog({
  open,
  onOpenChange,
  customer,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer?: Customer | undefined;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function reset() {
    setForm(
      customer
        ? {
            full_name: customer.full_name,
            phone: customer.phone ?? "",
            email: customer.email ?? "",
            endereco: customer.endereco ?? "",
            numero: customer.numero ?? "",
            complemento: customer.complemento ?? "",
            bairro: customer.bairro ?? "",
            cidade: customer.cidade ?? "",
            estado: customer.estado ?? "",
            cep: customer.cep ?? "",
            ponto_referencia: customer.ponto_referencia ?? "",
          }
        : emptyForm,
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      endereco: form.endereco.trim() || null,
      numero: form.numero.trim() || null,
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim() || null,
      cidade: form.cidade.trim() || null,
      estado: form.estado.trim().toUpperCase() || null,
      cep: form.cep.trim() || null,
      ponto_referencia: form.ponto_referencia.trim() || null,
    };
    const { error } = customer
      ? await supabase.from("customers").update(payload).eq("id", customer.id)
      : await supabase.from("customers").insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(customer ? "Cadastro atualizado." : "Cliente cadastrado.");
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer ? `Editar ${customer.full_name}` : "Adicionar cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Telefone / WhatsApp</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>E-mail (opcional)</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label>Endereço</Label>
              <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Número</Label>
              <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Complemento (opcional)</Label>
              <Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Bairro</Label>
              <Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Estado (UF)</Label>
              <Input maxLength={2} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>CEP (opcional)</Label>
              <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Ponto de referência (opcional)</Label>
            <Input value={form.ponto_referencia} onChange={(e) => setForm({ ...form, ponto_referencia: e.target.value })} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
