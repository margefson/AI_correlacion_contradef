import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileDown, Filter } from "lucide-react";

interface ExportPdfWithFiltersProps {
  adminMode?: boolean;
  buttonLabel?: string;
  buttonSize?: "sm" | "default" | "lg";
}

export default function ExportPdfWithFilters({
  adminMode = false,
  buttonLabel = "Exportar PDF",
  buttonSize = "sm",
}: ExportPdfWithFiltersProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [riskLevel, setRiskLevel] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const exportMutation = trpc.reports.exportPdf.useMutation({
    onSuccess: (data) => {
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${data.base64}`;
      link.download = data.filename ?? "relatorio.pdf";
      link.click();
      toast.success(`PDF gerado com ${data.incidentCount} incidente(s)`);
      setOpen(false);
    },
    onError: (err) => {
      toast.error(`Erro ao gerar PDF: ${err.message}`);
    },
  });

  const handleExport = () => {
    exportMutation.mutate({
      category: category || undefined,
      riskLevel: riskLevel || undefined,
      adminMode,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  };

  const handleClear = () => {
    setCategory("");
    setRiskLevel("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <>
      <Button
        size={buttonSize}
        variant="outline"
        className="font-mono text-xs gap-1.5"
        onClick={() => setOpen(true)}
      >
        <FileDown className="w-3.5 h-3.5" />
        {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md font-mono">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              Exportar PDF com Filtros
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Selecione os filtros para o relatório. Deixe em branco para incluir todos os incidentes.
            </p>

            {/* Período */}
            <div className="space-y-2">
              <Label className="text-xs font-mono text-muted-foreground">Período</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-mono text-muted-foreground mb-1 block">De</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-mono text-muted-foreground mb-1 block">Até</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Categoria */}
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">Categoria</Label>
              <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
                <SelectTrigger className="h-8 font-mono text-xs">
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  <SelectItem value="phishing">Phishing</SelectItem>
                  <SelectItem value="malware">Malware</SelectItem>
                  <SelectItem value="brute_force">Brute Force</SelectItem>
                  <SelectItem value="ddos">DDoS</SelectItem>
                  <SelectItem value="vazamento_de_dados">Vazamento de Dados</SelectItem>
                  <SelectItem value="unknown">Desconhecido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Nível de Risco */}
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">Nível de Risco</Label>
              <Select value={riskLevel || "all"} onValueChange={(v) => setRiskLevel(v === "all" ? "" : v)}>
                <SelectTrigger className="h-8 font-mono text-xs">
                  <SelectValue placeholder="Todos os níveis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os níveis</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                  <SelectItem value="high">Alto</SelectItem>
                  <SelectItem value="medium">Médio</SelectItem>
                  <SelectItem value="low">Baixo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Resumo dos filtros */}
            {(category || riskLevel || dateFrom || dateTo) && (
              <div className="bg-muted/10 border border-border rounded p-2 space-y-1">
                <p className="text-xs font-mono text-muted-foreground font-semibold">Filtros ativos:</p>
                {dateFrom && <p className="text-xs font-mono text-foreground">• De: {new Date(dateFrom).toLocaleDateString("pt-BR")}</p>}
                {dateTo && <p className="text-xs font-mono text-foreground">• Até: {new Date(dateTo).toLocaleDateString("pt-BR")}</p>}
                {category && <p className="text-xs font-mono text-foreground">• Categoria: {category.replace("_", " ")}</p>}
                {riskLevel && <p className="text-xs font-mono text-foreground">• Risco: {riskLevel}</p>}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="font-mono text-xs" onClick={handleClear}>
              Limpar Filtros
            </Button>
            <Button variant="outline" size="sm" className="font-mono text-xs" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="font-mono text-xs gap-1.5"
              onClick={handleExport}
              disabled={exportMutation.isPending}
            >
              <FileDown className="w-3.5 h-3.5" />
              {exportMutation.isPending ? "Gerando..." : "Gerar PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
