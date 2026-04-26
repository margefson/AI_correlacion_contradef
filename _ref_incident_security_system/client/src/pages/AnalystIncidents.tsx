/**
 * AnalystIncidents.tsx — Todos os Incidentes (Perfil Analista)
 *
 * Analistas de segurança podem visualizar todos os incidentes cadastrados
 * no sistema para possível atendimento e conclusão.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  List, RefreshCw, Search, Filter, Shield, AlertTriangle,
  CheckCircle2, Clock, ChevronLeft, ChevronRight, User, FileDown, Loader2,
} from "lucide-react";
import { useLocation } from "wouter";

// ── Tipos ────────────────────────────────────────────────────────────────────
type RiskLevel = "critical" | "high" | "medium" | "low";
type IncidentStatus = "open" | "in_progress" | "resolved";

const RISK_COLORS: Record<RiskLevel, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low:      "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  critical: "Crítico",
  high:     "Alto",
  medium:   "Médio",
  low:      "Baixo",
};

const CATEGORY_LABELS: Record<string, string> = {
  phishing:          "Phishing",
  malware:           "Malware",
  brute_force:       "Força Bruta",
  ddos:              "DDoS",
  vazamento_de_dados:"Vazamento de Dados",
  unknown:           "Desconhecido",
};

const STATUS_COLORS: Record<IncidentStatus, string> = {
  open:        "bg-red-500/10 text-red-400 border-red-500/20",
  in_progress: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  resolved:    "bg-green-500/10 text-green-400 border-green-500/20",
};

const STATUS_LABELS: Record<IncidentStatus, string> = {
  open:        "Aberto",
  in_progress: "Em Andamento",
  resolved:    "Resolvido",
};

const PAGE_SIZE = 20;

export default function AnalystIncidents() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(0);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [isExporting, setIsExporting] = useState(false);

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
      toast.success(`PDF exportado com sucesso \u2014 ${data.incidentCount} incidente(s) incluídos.`);
      setIsExporting(false);
    },
    onError: (err) => {
      toast.error(`Erro ao exportar PDF: ${err.message}`);
      setIsExporting(false);
    },
  });

  const handleExportPdf = () => {
    setIsExporting(true);
    exportPdfMutation.mutate({
      category: filterCategory !== "all" ? filterCategory : undefined,
      riskLevel: filterRisk !== "all" ? filterRisk : undefined,
      status: filterStatus !== "all" ? filterStatus : undefined,
      adminMode: false,
    });
  };

  const listQuery = trpc.incidents.listAll.useQuery({
    category: filterCategory !== "all" ? filterCategory : undefined,
    riskLevel: filterRisk !== "all" ? filterRisk : undefined,
    status: filterStatus !== "all" ? (filterStatus as IncidentStatus) : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const updateStatusMutation = trpc.incidents.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado com sucesso!");
      void listQuery.refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const incidents = listQuery.data?.incidents ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Filtro local por texto
  const filtered = search.trim()
    ? incidents.filter(
        (i) =>
          i.title.toLowerCase().includes(search.toLowerCase()) ||
          i.description.toLowerCase().includes(search.toLowerCase()) ||
          (i.userName ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : incidents;

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  const handleClearFilters = () => {
    setFilterCategory("all");
    setFilterRisk("all");
    setFilterStatus("all");
    setSearch("");
    setSearchInput("");
    setPage(0);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="soc-page-title flex items-center gap-2">
            <List className="w-5 h-5 text-primary" />
            Todos os Incidentes
          </h1>
          <p className="soc-page-sub">
            Visualize e gerencie todos os incidentes do sistema para atendimento e conclusão.
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex gap-2 flex-1 min-w-[200px]">
            <Input
              placeholder="Buscar por título, descrição ou usuário..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="font-mono text-xs h-8"
            />
            <Button size="sm" variant="outline" onClick={handleSearch} className="h-8 px-3">
              <Search className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setPage(0); }}>
            <SelectTrigger className="w-40 h-8 font-mono text-xs">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterRisk} onValueChange={(v) => { setFilterRisk(v); setPage(0); }}>
            <SelectTrigger className="w-32 h-8 font-mono text-xs">
              <SelectValue placeholder="Risco" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos riscos</SelectItem>
              {Object.entries(RISK_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
            <SelectTrigger className="w-36 h-8 font-mono text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={handleClearFilters} className="h-8 font-mono text-xs">
            <Filter className="w-3.5 h-3.5 mr-1" /> Limpar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void listQuery.refetch()} className="h-8 font-mono text-xs">
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${listQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>

        {/* Contador + Exportar PDF */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono text-muted-foreground">
            {total} incidente(s) encontrado(s)
            {search && ` — filtrando por "${search}"`}
          </p>
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
            {isExporting ? "Gerando PDF..." : `Exportar PDF (${total})`}
          </Button>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="ghost"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs font-mono text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                size="sm" variant="ghost"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Tabela */}
        {listQuery.isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground font-mono text-sm">
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Carregando incidentes...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Shield className="w-8 h-8 mb-2 opacity-30" />
            <p className="font-mono text-sm">Nenhum incidente encontrado</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">ID</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Título</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Usuário</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Categoria</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Risco</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Confiança</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Data</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inc, idx) => {
                  const incStatus = ((inc as { status?: string }).status ?? "open") as IncidentStatus;
                  const confidence = (inc as { confidence?: number }).confidence;
                  return (
                    <tr
                      key={inc.id}
                      className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/5"}`}
                    >
                      <td className="px-4 py-2.5 text-muted-foreground">#{inc.id}</td>
                      <td className="px-4 py-2.5 max-w-[200px]">
                        <button
                          onClick={() => setLocation(`/incidents/${inc.id}`)}
                          className="text-foreground hover:text-primary transition-colors truncate block max-w-full text-left"
                          title={inc.title}
                        >
                          {inc.title}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span className="truncate max-w-[100px]" title={inc.userName ?? "—"}>
                            {inc.userName ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="font-mono text-xs">
                          {CATEGORY_LABELS[inc.category] ?? inc.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`font-mono text-xs ${RISK_COLORS[inc.riskLevel as RiskLevel] ?? ""}`}>
                          {RISK_LABELS[inc.riskLevel as RiskLevel] ?? inc.riskLevel}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {confidence !== undefined && confidence !== null ? (
                          <span className={`font-mono font-semibold ${
                            confidence >= 0.85 ? "text-green-400" :
                            confidence >= 0.60 ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {Math.round(confidence * 100)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`font-mono text-xs ${STATUS_COLORS[incStatus]}`}>
                          {incStatus === "open" && <AlertTriangle className="w-3 h-3 mr-1" />}
                          {incStatus === "in_progress" && <Clock className="w-3 h-3 mr-1" />}
                          {incStatus === "resolved" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                          {STATUS_LABELS[incStatus]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {new Date(inc.createdAt).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          {incStatus === "open" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs font-mono"
                              onClick={() => updateStatusMutation.mutate({ id: inc.id, status: "in_progress" })}
                              disabled={updateStatusMutation.isPending}
                            >
                              Atender
                            </Button>
                          )}
                          {incStatus === "in_progress" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs font-mono text-green-400 border-green-500/30 hover:bg-green-500/10"
                              onClick={() => updateStatusMutation.mutate({ id: inc.id, status: "resolved" })}
                              disabled={updateStatusMutation.isPending}
                            >
                              Concluir
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs font-mono"
                            onClick={() => setLocation(`/incidents/${inc.id}`)}
                          >
                            Ver
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
