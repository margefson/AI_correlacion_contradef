/**
 * Incidents.tsx — Listagem de incidentes com busca, filtros, Status, editar e excluir
 *
 * Perfis:
 *  - Usuário comum: pode criar, ver e excluir seus próprios incidentes
 *  - security-analyst / admin: pode alterar status de qualquer incidente
 *  - admin: pode excluir qualquer incidente (via painel admin)
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import {
  PlusCircle, Search, AlertTriangle, Filter, Download, X, Loader2,
  Pencil, Trash2, CheckCircle2, Clock, Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/** Destaca as ocorrências de `term` dentro de `text` */
function HighlightText({ text, term }: { text: string; term: string }) {
  if (!term.trim()) return <span>{text}</span>;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === term.toLowerCase() ? (
          <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded px-0.5 not-italic font-semibold">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

const SEV: Record<string, string> = {
  critical: "text-red-400 bg-red-400/10 border-red-400/30",
  high:     "text-orange-400 bg-orange-400/10 border-orange-400/30",
  medium:   "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  low:      "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
};

const SEV_LABELS: Record<string, string> = {
  critical: "Crítico", high: "Alto", medium: "Médio", low: "Baixo",
};

const CAT_LABELS: Record<string, string> = {
  phishing: "Phishing",
  malware: "Malware",
  brute_force: "Força Bruta",
  ddos: "DDoS",
  vazamento_de_dados: "Vazamento",
  engenharia_social: "Eng. Social",
  unknown: "Desconhecido",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  resolved: "Resolvido",
};

const STATUS_STYLES: Record<string, string> = {
  open:        "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  in_progress: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  resolved:    "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "resolved") return <CheckCircle2 className="w-3 h-3" />;
  if (status === "in_progress") return <Clock className="w-3 h-3" />;
  return <Circle className="w-3 h-3" />;
}

export default function Incidents() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [statusChangingId, setStatusChangingId] = useState<number | null>(null);

  const isAnalyst = user?.role === "security-analyst" || user?.role === "admin";

  // Debounce the search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const utils = trpc.useUtils();

  // Load all incidents
  const { data: allIncidents, isLoading: loadingAll } = trpc.incidents.list.useQuery();

  // Backend full-text search
  const searchEnabled = debouncedSearch.trim().length >= 2;
  const { data: searchResults, isFetching: searchFetching } = trpc.incidents.search.useQuery(
    { query: debouncedSearch, category: categoryFilter || undefined, riskLevel: riskFilter || undefined, limit: 100 },
    { enabled: searchEnabled }
  );

  const isLoading = loadingAll || (searchEnabled && searchFetching);

  const baseData = useMemo(() => {
    if (searchEnabled && searchResults) return searchResults;
    return allIncidents ?? [];
  }, [searchEnabled, searchResults, allIncidents]);

  const filtered = useMemo(() => {
    return baseData.filter((inc) => {
      const matchCat = searchEnabled ? true : (!categoryFilter || inc.category === categoryFilter);
      const matchRisk = searchEnabled ? true : (!riskFilter || inc.riskLevel === riskFilter);
      const incDate = new Date(inc.createdAt);
      const matchFrom = !dateFrom || incDate >= new Date(dateFrom);
      const matchTo = !dateTo || incDate <= new Date(dateTo + "T23:59:59");
      const matchLocalSearch = searchEnabled
        ? true
        : (!search || inc.title.toLowerCase().includes(search.toLowerCase()) || (inc.description ?? "").toLowerCase().includes(search.toLowerCase()));
      return matchCat && matchRisk && matchFrom && matchTo && matchLocalSearch;
    });
  }, [baseData, search, searchEnabled, categoryFilter, riskFilter, dateFrom, dateTo]);

  const categories = useMemo(
    () => Array.from(new Set((allIncidents?.map((i) => i.category).filter(Boolean) ?? []) as string[])),
    [allIncidents]
  );

  const activeFilters = [categoryFilter, riskFilter, dateFrom, dateTo].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setCategoryFilter(""); setRiskFilter(""); setDateFrom(""); setDateTo("");
  }, []);

  const clearAll = useCallback(() => {
    setSearch(""); setDebouncedSearch(""); clearFilters();
  }, [clearFilters]);

  // Delete mutation
  const deleteMutation = trpc.incidents.delete.useMutation({
    onSuccess: () => {
      utils.incidents.list.invalidate();
      toast.success("Incidente excluído com sucesso");
      setDeletingId(null);
    },
    onError: (err) => {
      toast.error(`Erro ao excluir: ${err.message}`);
      setDeletingId(null);
    },
  });

  // Update status mutation (analyst/admin only)
  const updateStatusMutation = trpc.incidents.updateStatus.useMutation({
    onSuccess: () => {
      utils.incidents.list.invalidate();
      toast.success("Status atualizado com sucesso");
      setStatusChangingId(null);
    },
    onError: (err) => {
      toast.error(`Erro ao atualizar status: ${err.message}`);
      setStatusChangingId(null);
    },
  });

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja excluir este incidente?")) return;
    setDeletingId(id);
    deleteMutation.mutate({ id });
  };

  const handleStatusChange = (e: React.MouseEvent, id: number, newStatus: string) => {
    e.stopPropagation();
    setStatusChangingId(id);
    updateStatusMutation.mutate({ id, status: newStatus as "open" | "in_progress" | "resolved" });
  };

  const exportCSV = () => {
    if (!filtered.length) { toast.error("Nenhum incidente para exportar"); return; }
    const header = ["ID", "Título", "Descrição", "Categoria", "Risco", "Confiança (%)", "Status", "Data"];
    const rows = filtered.map((inc) => [
      inc.id,
      `"${inc.title.replace(/"/g, '""')}"`,
      `"${(inc.description ?? "").replace(/"/g, '""')}"`,
      CAT_LABELS[inc.category ?? ""] ?? inc.category ?? "—",
      SEV_LABELS[inc.riskLevel ?? ""] ?? inc.riskLevel ?? "—",
      inc.confidence != null ? Math.round(inc.confidence * 100) : "—",
      STATUS_LABELS[(inc as Record<string, unknown>).status as string ?? "open"] ?? "Aberto",
      new Date(inc.createdAt).toLocaleDateString("pt-BR"),
    ]);
    const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `incidentes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`${filtered.length} incidente(s) exportado(s) para CSV`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="soc-page-title">Incidentes</h1>
            <p className="soc-page-sub">
              {isLoading ? "Carregando..." : (
                <>
                  {filtered.length} incidente(s)
                  {searchEnabled && ` encontrado(s) para "${debouncedSearch}"`}
                  {!searchEnabled && allIncidents && ` de ${allIncidents.length} total`}
                  {activeFilters > 0 && ` · ${activeFilters} filtro(s) ativo(s)`}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2 font-mono text-xs border-border">
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </Button>
            <Button onClick={() => navigate("/incidents/new")} size="sm" className="gap-2 font-mono text-xs">
              <PlusCircle className="w-3.5 h-3.5" /> Novo Incidente
            </Button>
          </div>
        </div>

        {/* Barra de busca e filtros */}
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-md">
              {isLoading && searchEnabled ? (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
              ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              )}
              <Input
                placeholder="Buscar em título e descrição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8 bg-input border-border font-mono text-sm"
              />
              {search && (
                <button onClick={() => { setSearch(""); setDebouncedSearch(""); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}
              className={`gap-2 font-mono text-xs border-border relative ${showFilters ? "border-primary/50 text-primary" : ""}`}>
              <Filter className="w-3.5 h-3.5" /> Filtros
              {activeFilters > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center font-mono">
                  {activeFilters}
                </span>
              )}
            </Button>
            {(search || activeFilters > 0) && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="gap-2 font-mono text-xs text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" /> Limpar
              </Button>
            )}
          </div>

          {searchEnabled && (
            <div className="flex items-center gap-2 text-xs font-mono text-primary bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
              <Search className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                Busca de texto completo ativa: <strong className="text-primary">"{debouncedSearch}"</strong>
                {searchFetching && " — buscando..."}
                {!searchFetching && searchResults && ` — ${searchResults.length} resultado(s)`}
              </span>
            </div>
          )}

          {showFilters && (
            <div className="bg-card border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground mb-1.5 block">Categoria</label>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm font-mono cursor-pointer">
                  <option value="">Todas</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{CAT_LABELS[c] ?? c?.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-mono text-muted-foreground mb-1.5 block">Nível de Risco</label>
                <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}
                  className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm font-mono cursor-pointer">
                  <option value="">Todos</option>
                  <option value="critical">Crítico</option>
                  <option value="high">Alto</option>
                  <option value="medium">Médio</option>
                  <option value="low">Baixo</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-mono text-muted-foreground mb-1.5 block">Data Inicial</label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-input border-border font-mono text-sm" />
              </div>
              <div>
                <label className="text-xs font-mono text-muted-foreground mb-1.5 block">Data Final</label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-input border-border font-mono text-sm" />
              </div>
            </div>
          )}
        </div>

        {/* Nota de permissão para usuários comuns */}
        {!isAnalyst && (
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-muted/20 border border-border/50 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
            <span>Alterações de status requerem perfil <strong className="text-yellow-400">Analista de Segurança</strong> ou superior.</span>
          </div>
        )}

        {/* Tabela */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="soc-table w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Título</th>
                  <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Categoria</th>
                  <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Risco</th>
                  <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Confiança</th>
                  <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground font-mono text-sm">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                      {searchEnabled ? `Buscando "${debouncedSearch}"...` : "Carregando..."}
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12">
                      <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm font-mono">
                        {searchEnabled ? `Nenhum resultado para "${debouncedSearch}"` : activeFilters > 0 ? "Nenhum incidente encontrado com os filtros aplicados" : "Nenhum incidente registrado"}
                      </p>
                      {(search || activeFilters > 0) && (
                        <Button variant="ghost" size="sm" onClick={clearAll} className="mt-2 font-mono text-xs text-primary">
                          Limpar busca e filtros
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map((inc) => {
                    const incStatus = (inc as Record<string, unknown>).status as string ?? "open";
                    const isOwner = inc.userId === user?.id;
                    const canDelete = isOwner || user?.role === "admin";
                    const isDeleting = deletingId === inc.id;
                    const isChangingStatus = statusChangingId === inc.id;

                    return (
                      <tr
                        key={inc.id}
                        className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => navigate(`/incidents/${inc.id}`)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground text-sm truncate max-w-xs">
                            <HighlightText text={inc.title} term={debouncedSearch} />
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">
                            <HighlightText text={inc.description ?? ""} term={debouncedSearch} />
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded border font-mono capitalize text-primary bg-primary/10 border-primary/30">
                            {CAT_LABELS[inc.category ?? ""] ?? inc.category?.replace("_", " ") ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded border font-mono ${SEV[inc.riskLevel ?? "low"] ?? SEV.low}`}>
                            {SEV_LABELS[inc.riskLevel ?? "low"] ?? inc.riskLevel ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {isAnalyst ? (
                            <div className="flex items-center gap-1">
                              {isChangingStatus ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                              ) : (
                                <select
                                  value={incStatus}
                                  onChange={(e) => handleStatusChange(e as unknown as React.MouseEvent, inc.id, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className={`text-xs px-2 py-0.5 rounded border font-mono cursor-pointer bg-transparent ${STATUS_STYLES[incStatus] ?? STATUS_STYLES.open}`}
                                >
                                  <option value="open">Aberto</option>
                                  <option value="in_progress">Em Andamento</option>
                                  <option value="resolved">Resolvido</option>
                                </select>
                              )}
                            </div>
                          ) : (
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-mono ${STATUS_STYLES[incStatus] ?? STATUS_STYLES.open}`}>
                              <StatusIcon status={incStatus} />
                              {STATUS_LABELS[incStatus] ?? "Aberto"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-muted-foreground">
                            {inc.confidence != null ? `${Math.round(inc.confidence * 100)}%` : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-muted-foreground">
                            {new Date(inc.createdAt).toLocaleDateString("pt-BR")}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/incidents/${inc.id}`); }}
                              title="Ver / Editar detalhes"
                              className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {canDelete && (
                              <button
                                onClick={(e) => handleDelete(e, inc.id)}
                                disabled={isDeleting}
                                title="Excluir incidente"
                                className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
                              >
                                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
