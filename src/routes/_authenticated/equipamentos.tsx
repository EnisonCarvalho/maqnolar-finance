import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { formatBRL, parseBRLToCents } from "@/lib/format";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/equipamentos")({
  head: () => ({
    meta: [
      { title: "Equipamentos e serviços — MaqnoLar Financeiro" },
      { name: "description", content: "Catálogo geral de equipamentos atendidos e serviços da MaqnoLar." },
      { property: "og:title", content: "Equipamentos e serviços — MaqnoLar Financeiro" },
      { property: "og:description", content: "Catálogo geral de equipamentos e serviços da MaqnoLar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogPage,
});

type EquipmentType = Tables<"equipment_types">;
type Service = Tables<"services">;

function useCatalog() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: async () => {
      const [{ data: equipment, error: e1 }, { data: services, error: e2 }] = await Promise.all([
        supabase.from("equipment_types").select("*").order("name"),
        supabase.from("services").select("*").order("name"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { equipment: equipment ?? [], services: services ?? [] };
    },
  });
}

function CatalogPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const { data } = useCatalog();
  const [editingEquipment, setEditingEquipment] = useState<EquipmentType | null>(null);
  const [addingEquipment, setAddingEquipment] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [addingService, setAddingService] = useState(false);

  if (!session?.isAdmin) {
    return <p className="text-muted-foreground">Esta área é exclusiva para administradores.</p>;
  }

  const equipmentById = new Map((data?.equipment ?? []).map((e) => [e.id, e.name]));
  const refresh = () => qc.invalidateQueries({ queryKey: ["catalog"] });

  async function toggleEquipment(e: EquipmentType, active: boolean) {
    const { error } = await supabase.from("equipment_types").update({ active }).eq("id", e.id);
    if (error) toast.error(error.message);
    else toast.success(active ? `${e.name} ativado.` : `${e.name} desativado.`);
    refresh();
  }

  async function toggleService(s: Service, active: boolean) {
    const { error } = await supabase.from("services").update({ active }).eq("id", s.id);
    if (error) toast.error(error.message);
    else toast.success(active ? `${s.name} ativado.` : `${s.name} desativado.`);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">Equipamentos e serviços</h1>
        <p className="mt-1 text-muted-foreground">
          Catálogo geral da empresa. Todos os técnicos parceiros atendem estes equipamentos e serviços.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Equipamentos atendidos</CardTitle>
            <CardDescription>Tipos de equipamento que a MaqnoLar atende.</CardDescription>
          </div>
          <Button onClick={() => setAddingEquipment(true)}>
            <Plus className="mr-2 h-4 w-4" />Adicionar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipamento</TableHead>
                <TableHead className="text-right">Ativo</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.equipment ?? []).map((e) => (
                <TableRow key={e.id} className={e.active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell className="text-right">
                    <Switch checked={e.active} onCheckedChange={(v) => toggleEquipment(e, v)} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setEditingEquipment(e)} aria-label={`Editar ${e.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Catálogo de serviços</CardTitle>
            <CardDescription>
              Serviços oferecidos pela MaqnoLar. Cada atendimento poderá ter descrição e orçamento próprios.
            </CardDescription>
          </div>
          <Button onClick={() => setAddingService(true)}>
            <Plus className="mr-2 h-4 w-4" />Adicionar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead>Equipamento</TableHead>
                <TableHead>Preço sugerido</TableHead>
                <TableHead className="text-right">Ativo</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.services ?? []).map((s) => (
                <TableRow key={s.id} className={s.active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.equipment_type_id ? equipmentById.get(s.equipment_type_id) ?? "—" : "Todos"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatBRL(s.suggested_price_cents)}</TableCell>
                  <TableCell className="text-right">
                    <Switch checked={s.active} onCheckedChange={(v) => toggleService(s, v)} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setEditingService(s)} aria-label={`Editar ${s.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EquipmentDialog open={addingEquipment} onOpenChange={setAddingEquipment} onDone={refresh} />
      <EquipmentDialog
        open={editingEquipment !== null}
        onOpenChange={(o) => !o && setEditingEquipment(null)}
        equipment={editingEquipment ?? undefined}
        onDone={refresh}
      />
      <ServiceDialog
        open={addingService}
        onOpenChange={setAddingService}
        equipment={data?.equipment ?? []}
        onDone={refresh}
      />
      <ServiceDialog
        open={editingService !== null}
        onOpenChange={(o) => !o && setEditingService(null)}
        service={editingService ?? undefined}
        equipment={data?.equipment ?? []}
        onDone={refresh}
      />
    </div>
  );
}

function EquipmentDialog({
  open,
  onOpenChange,
  equipment,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  equipment?: EquipmentType;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = equipment
      ? await supabase.from("equipment_types").update({ name: name.trim() }).eq("id", equipment.id)
      : await supabase.from("equipment_types").insert({ name: name.trim() });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(equipment ? "Equipamento atualizado." : "Equipamento adicionado.");
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setName(equipment?.name ?? "");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{equipment ? `Editar ${equipment.name}` : "Adicionar equipamento"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do equipamento *</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ServiceDialog({
  open,
  onOpenChange,
  service,
  equipment,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  service?: Service;
  equipment: EquipmentType[];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", equipment_type_id: "", price: "" });

  function reset() {
    setForm(
      service
        ? {
            name: service.name,
            equipment_type_id: service.equipment_type_id ?? "",
            price: service.suggested_price_cents != null ? (service.suggested_price_cents / 100).toFixed(2).replace(".", ",") : "",
          }
        : { name: "", equipment_type_id: "", price: "" },
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cents = form.price.trim() ? parseBRLToCents(form.price) : null;
    if (form.price.trim() && cents == null) {
      toast.error("Preço sugerido inválido.");
      return;
    }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      equipment_type_id: form.equipment_type_id || null,
      suggested_price_cents: cents,
    };
    const { error } = service
      ? await supabase.from("services").update(payload).eq("id", service.id)
      : await supabase.from("services").insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(service ? "Serviço atualizado." : "Serviço adicionado.");
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
          <DialogTitle>{service ? `Editar ${service.name}` : "Adicionar serviço"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do serviço *</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Equipamento (opcional — deixe em "Todos" se vale para qualquer equipamento)</Label>
            <Select value={form.equipment_type_id} onValueChange={(v) => setForm({ ...form, equipment_type_id: v === "all" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {equipment.filter((e) => e.active).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Preço sugerido (opcional, ex.: 150,00)</Label>
            <Input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
