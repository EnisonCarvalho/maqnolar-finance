import { useState } from "react";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deliverFile, exportReportPdf, exportReportXlsx, reportFilename, type ReportData } from "@/lib/report-export";

/** Botões de exportação PDF/Excel. Respeitam a categoria, o período e os filtros já aplicados na tela. */
export function ExportButtons({ data }: { data: ReportData }) {
  const [pending, setPending] = useState<"pdf" | "xlsx" | null>(null);

  const run = async (kind: "pdf" | "xlsx") => {
    const empty = data.rows.length === 0 && data.indicators.every((i) => !i.cents);
    if (empty) {
      toast.error("Não há registros para exportar no período e filtros selecionados.");
      return;
    }
    setPending(kind);
    try {
      const blob = kind === "pdf" ? await exportReportPdf(data) : await exportReportXlsx(data);
      deliverFile(blob, reportFilename(data, kind));
      toast.success(kind === "pdf" ? "PDF gerado." : "Planilha Excel gerada.");
    } catch {
      toast.error("Não foi possível gerar o arquivo.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => run("pdf")}>
        <FileDown className="mr-1 h-4 w-4" />{pending === "pdf" ? "Gerando…" : "Exportar PDF"}
      </Button>
      <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => run("xlsx")}>
        <FileSpreadsheet className="mr-1 h-4 w-4" />{pending === "xlsx" ? "Gerando…" : "Exportar Excel"}
      </Button>
    </div>
  );
}
