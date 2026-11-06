import { useState } from "react";
import { toast } from "sonner";
import { FileText, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  credito: "Crédito",
  debito: "Débito",
  transferencia: "Transferência",
  outro: "Outro",
};

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatISODate(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Envia um comprovante para o armazenamento privado e devolve o caminho salvo. */
export async function uploadReceipt(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("comprovantes").upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error("Não foi possível enviar o comprovante.");
  return path;
}

export function ReceiptInput({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label className="flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> Comprovante (opcional)</Label>
      <Input
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f && f.size > 10 * 1024 * 1024) {
            toast.error("O comprovante deve ter no máximo 10 MB.");
            e.target.value = "";
            onChange(null);
            return;
          }
          onChange(f);
        }}
      />
      {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
    </div>
  );
}

export function ReceiptLink({ path }: { path: string | null }) {
  const [loading, setLoading] = useState(false);
  if (!path) return null;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(path, 300);
        setLoading(false);
        if (error || !data) {
          toast.error("Não foi possível abrir o comprovante.");
          return;
        }
        window.open(data.signedUrl, "_blank", "noopener");
      }}
    >
      <FileText className="h-3.5 w-3.5" /> Comprovante
    </button>
  );
}
