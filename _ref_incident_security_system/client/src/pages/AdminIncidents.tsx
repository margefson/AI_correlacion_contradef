import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  List, ChevronLeft, ChevronRight, Search, Filter, ExternalLink, FileDown, Loader2, RefreshCw,
} from "lucide-react";

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const RISK_LABELS: Record<string, string> = {
  critical: "Crítico", high: "Alto", medium: "Médio", low: "Baixo",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  in_progress: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  resolved: "bg-green-500/10 text-green-400 border-green-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  resolved: "Resolvido",
};

const PAGE_SIZE = 20;

export default function AdminIncidents() {
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState<string>("");
  const [riskLevel, setRiskLevel] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [isReclassifying, setIsReclassifying] = useState(false);

  const utils = trpc.useUtils();

  const query = trpc.admin.listIncidents.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    category: category || undefined,
    riskLevel: riskLevel || undefined,
    status: status || undefined,
  });

  const exportPdfMutation = trpc.reports.exportPdf.useMutation({
    onSuccess: (data) => {
      const byteCharacters = atob(data.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`PDF exportado com sucesso — ${data.incidentCount} incidente(s) incluídos.`);
      setIsExporting(false);
    },
    onError: (err) => {
      toast.error(`Erro ao exportar PDF: ${err.message}`);
      setIsExporting(false);
    },
  });

  const reclassifyUnknownMutation = trpc.admin.reclassifyUnknown.useMutation({
    onSuccess: (data) => {
      toast.success(data.message, { duration: 6000 });
      utils.admin.listIncidents.invalidate();
      setIsReclassifying(false);
    },
    onError: (err) => {
      toast.error(`Erro ao reclassificar: ${err.message}`, { duration: 8000 });
      setIsReclassifying(false);
    },
  });

  const incidents = query.data?.incidents ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filteredIncidents = search
    ? incidents.filter((i: Record<string, unknown>) =>
        (i.title as string)?.toLowerCase().includes(search.toLowerCase()) ||
        (i.description as string)?.toLowerCase().includes(search.toLowerCase())
      )
    : incidents;

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  const handleFilterChange = () => {
    setPage(0);
  };

  const handleExportPdf = () => {
    setIsExporting(true);
    exportPdfMutation.mutate({
      category: category || undefined,
      riskLevel: riskLevel || undefined,
      status: status || undefined,
      adminMode: true,
    });
  };

  const handleReclassifyUnknown = () => {
    setIsReclassifying(true);
    reclassifyUnknownMutation.mutate();
  };

  // Label dos filtros ativos para o botão de exportar
  const filterLabel = [
    category ? category.replace("_", " ") : null,
    riskLevel ? RISK_LABELS[riskLevel] : null,
    status ? STATUS_LABELS[status] : null,
  ].filter(Boolean).join(", ");

  // Contar unknowns para exibir no botão
  const unknownCount = incidents.filter((i: Record<string, unknown>) => i.category === "unknown").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-mono font-bold text-foreground flex items-center gap-2">
              <List className="w-5 h-5 text-primary" />
              Todos os Incidentes
            </h1>
            <p className="text-xs font-mono text-muted-foreground mt-1">
              {total} incidentes no total • Página {page + 1} de {Math.max(1, totalPages)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Botão Reclassificar Unknowns */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 font-mono text-xs gap-2 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
              onClick={handleReclassifyUnknown}
              disabled={isReclassifying}
              title="Reclassifica todos os incidentes com categoria 'unknown' usando o modelo ML atual"
            >
              {isReclassifying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {isReclassifying
                ? "Reclassificando..."
                : unknownCount > 0
                ? `Reclassificar Unknowns (${unknownCount})`
                : "Reclassificar Unknowns"}
            </Button>
            {/* Botão Exportar PDF */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 font-mono text-xs gap-2 border-primary/40 text-primary hover:bg-primary/10"
              onClick={handleExportPdf}
              disabled={isExporting || total === 0}
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileDown className="w-3.5 h-3.5" />
              )}
              {isExporting
                ? "Gerando PDF..."
                : filterLabel
                ? `Exportar PDF (${filterLabel})`
                : `Exportar PDF (${total} incidentes)`}
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-mono text-muted-foreground mb-1 block">Buscar</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Título ou descrição..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="font-mono text-xs h-8"
                  />
                  <Button size="sm" variant="outline" className="h-8 px-3" onClick={handleSearch}>
                    <Search className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="min-w-[150px]">
                <label className="text-xs font-mono text-muted-foreground mb-1 block">Categoria</label>
                <Select value={category || "all"} onValueChange={(v) => { setCategory(v === "all" ? "" : v); handleFilterChange(); }}>
                  <SelectTrigger className="h-8 font-mono text-xs">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="phishing">Phishing</SelectItem>
                    <SelectItem value="malware">Malware</SelectItem>
                    <SelectItem value="brute_force">Brute Force</SelectItem>
                    <SelectItem value="ddos">DDoS</SelectItem>
                    <SelectItem value="vazamento_de_dados">Vazamento de Dados</SelectItem>
                    <SelectItem value="unknown">Desconhecido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[130px]">
                <label className="text-xs font-mono text-muted-foreground mb-1 block">Risco</label>
                <Select value={riskLevel || "all"} onValueChange={(v) => { setRiskLevel(v === "all" ? "" : v); handleFilterChange(); }}>
                  <SelectTrigger className="h-8 font-mono text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="critical">Crítico</SelectItem>
                    <SelectItem value="high">Alto</SelectItem>
                    <SelectItem value="medium">Médio</SelectItem>
                    <SelectItem value="low">Baixo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[150px]">
                <label className="text-xs font-mono text-muted-foreground mb-1 block">Status</label>
                <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? "" : v); handleFilterChange(); }}>
                  <SelectTrigger className="h-8 font-mono text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="open">Aberto</SelectItem>
                    <SelectItem value="in_progress">Em Andamento</SelectItem>
                    <SelectItem value="resolved">Resolvido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(category || riskLevel || status || search) && (
                <Button size="sm" variant="ghost" className="h-8 font-mono text-xs gap-1" onClick={() => {
                  setCategory(""); setRiskLevel(""); setStatus(""); setSearch(""); setSearchInput(""); setPage(0);
                }}>
                  <Filter className="w-3 h-3" />
                  Limpar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono font-semibold text-foreground">
              Incidentes {query.isFetching && <span className="text-muted-foreground text-xs">(atualizando...)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {query.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 bg-muted/20 rounded animate-pulse" />
                ))}
              </div>
            ) : filteredIncidents.length === 0 ? (
              <p className="text-center text-sm font-mono text-muted-foreground py-8">
                Nenhum incidente encontrado com os filtros aplicados.
              </p>
            ) : (
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="bg-muted/10 border-b border-border">
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">ID</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Título</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Categoria</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Risco</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Confiança</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Status</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Data</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIncidents.map((incident) => (
                      <tr key={incident.id as number} className="border-t border-border/50 hover:bg-muted/5 transition-colors">
                        <td className="px-3 py-2 text-muted-foreground">#{incident.id as number}</td>
                        <td className="px-3 py-2 text-foreground max-w-[200px] truncate">{incident.title as string}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-xs ${(incident.category as string) === "unknown" ? "border-yellow-500/30 text-yellow-400" : "border-blue-500/30 text-blue-400"}`}>
                            {(incident.category as string)?.replace("_", " ") ?? "—"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {incident.riskLevel ? (
                            <Badge variant="outline" className={`text-xs ${RISK_COLORS[incident.riskLevel as string] ?? ""}`}>
                              {RISK_LABELS[incident.riskLevel as string] ?? incident.riskLevel as string}
                            </Badge>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {(incident as Record<string, unknown>).confidence !== undefined && (incident as Record<string, unknown>).confidence !== null ? (
                            <span className={`font-mono font-semibold text-xs ${
                              Number((incident as Record<string, unknown>).confidence) >= 0.85 ? "text-green-400" :
                              Number((incident as Record<string, unknown>).confidence) >= 0.60 ? "text-yellow-400" :
                              "text-red-400"
                            }`}>
                              {Math.round(Number((incident as Record<string, unknown>).confidence) * 100)}%
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-xs ${STATUS_COLORS[(incident as Record<string, unknown>).status as string] ?? "border-muted-foreground/30 text-muted-foreground"}`}>
                            {STATUS_LABELS[(incident as Record<string, unknown>).status as string] ?? (incident as Record<string, unknown>).status as string ?? "open"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {incident.createdAt
                            ? new Date(incident.createdAt as unknown as string).toLocaleDateString("pt-BR")
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Link href={`/incidents/${incident.id as number}`}>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs font-mono text-muted-foreground">
                  Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm" variant="outline" className="h-7 px-2 font-mono text-xs gap-1"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="w-3 h-3" />
                    Anterior
                  </Button>
                  <span className="text-xs font-mono text-muted-foreground px-2">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    size="sm" variant="outline" className="h-7 px-2 font-mono text-xs gap-1"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Próxima
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
