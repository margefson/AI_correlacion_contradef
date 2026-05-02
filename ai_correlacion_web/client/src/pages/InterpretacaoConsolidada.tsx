import DashboardLayout, { useDashboardShell } from "@/components/DashboardLayout";
import FlowCorrelationGraph from "@/components/FlowCorrelationGraph";
import FlowJourneyDiagram from "@/components/FlowJourneyDiagram";
import { MetricCard } from "@/components/MetricCard";
import { LogEvidenceCorrelatedIcons } from "@/components/LogEvidenceCorrelatedIcons";
import { LogEvidenceShellContext } from "@/components/LogEvidenceShellContext";
import { LogEvidenceFileMetricsContext } from "@/components/LogEvidenceFileMetricsContext";
import { MitreDefenseEvasionPanel } from "@/components/MitreDefenseEvasionPanel";
import { VirusTotalSampleCard } from "@/components/VirusTotalSampleCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { jobStatusBadgeClass, riskLevelBadgeClass } from "@/lib/analysisUi";
import { buildFlowJourneyNarrative, getFlowNodeDetailsWithFallback } from "@/lib/flowGraph";
import { formatBytes } from "@/lib/format";
import { downloadAnalysisFlowGraphJson, downloadAnalysisSummaryJson } from "@/lib/analysisJsonExport";
import { downloadReduceLogsAnalysisExcel, downloadReduceLogsFlowExcel } from "@/lib/reduceLogsExcelExport";
import { asRecord } from "@/lib/payload";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import type { MitreEvidenceOccurrence } from "@shared/analysis";
import { AlertTriangle, ArrowLeft, ArrowRight, BrainCircuit, FileDown, FileSpreadsheet, Filter, Hash, ShieldAlert, Sparkles } from "lucide-react";
import { Streamdown } from "streamdown";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "wouter";
import { toast } from "sonner";

function InterpretacaoConsolidadaContent() {
  const { sidebarCollapsed } = useDashboardShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const [eventSearch, setEventSearch] = useState("");
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [interpretationTab, setInterpretationTab] = useState("overview");
  const [mitreTraceTarget, setMitreTraceTarget] = useState<{
    jobId: string;
    targetNodeId: string;
    phaseNodeId: string;
    eventNodeId: string | null;
    evidenceFileName: string;
    evidenceLineNumber: number;
  } | null>(null);
  const [graphFitViewPulse, setGraphFitViewPulse] = useState(0);

  /** Evita limpar `mitreTraceTarget` quando o próprio rastreio MITRE atualiza o nó. */
  const skipClearTraceOnGraphSelect = useRef(false);

  const selectedJobId = searchParams.get("job");

  const jobsQuery = trpc.analysis.list.useQuery(
    { limit: 50 },
    { refetchInterval: 5000 },
  );

  useEffect(() => {
    if (selectedJobId) return;
    const first = jobsQuery.data?.[0]?.jobId;
    if (!first) return;
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("job", first);
        return p;
      },
      { replace: true },
    );
  }, [jobsQuery.data, selectedJobId, setSearchParams]);

  useEffect(() => {
    if (skipClearTraceOnGraphSelect.current) {
      skipClearTraceOnGraphSelect.current = false;
      return;
    }
    setMitreTraceTarget(null);
  }, [selectedGraphNodeId]);

  useEffect(() => {
    setSelectedGraphNodeId(null);
    setInterpretationTab("overview");
    setMitreTraceTarget(null);
    setGraphFitViewPulse(0);
  }, [selectedJobId]);

  const detailQuery = trpc.analysis.detail.useQuery(
    { jobId: selectedJobId ?? "" },
    {
      enabled: Boolean(selectedJobId),
      refetchInterval: (query) => {
        const status = query.state.data?.job.status;
        return status === "running" || status === "queued" ? 4000 : false;
      },
    },
  );

  const selectedDetail = detailQuery.data ?? null;

  const filteredEvents = useMemo(() => {
    const events = selectedDetail?.events ?? [];
    const query = eventSearch.trim().toLowerCase();
    if (!query) return events;
    return events.filter((event) => {
      const payload = JSON.stringify(event.payloadJson ?? {}).toLowerCase();
      return `${event.eventType} ${event.stage ?? ""} ${event.message ?? ""} ${payload}`.toLowerCase().includes(query);
    });
  }, [eventSearch, selectedDetail?.events]);

  const effectiveGraphNodeId = useMemo(() => {
    const nodes = selectedDetail?.flowGraph.nodes ?? [];
    if (!nodes.length) return null;
    if (selectedGraphNodeId && nodes.some((n) => n.id === selectedGraphNodeId)) {
      return selectedGraphNodeId;
    }
    return nodes[0]!.id;
  }, [selectedDetail?.flowGraph.nodes, selectedGraphNodeId]);

  const logEvidenceShellValue = useMemo(
    () => ({
      onBackToSummary: () => setInterpretationTab("overview"),
    }),
    [],
  );

  const focusFlowNode = useCallback((nodeId: string) => {
    const nodes = selectedDetail?.flowGraph.nodes;
    if (!nodes?.some((n) => n.id === nodeId)) return;
    setSelectedGraphNodeId(nodeId);
    setGraphFitViewPulse((p) => p + 1);
    requestAnimationFrame(() => {
      document.querySelector(`[data-flow-node-id="${CSS.escape(nodeId)}"]`)?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }, [selectedDetail?.flowGraph.nodes]);

  const selectedGraphNode = useMemo(
    () => selectedDetail?.flowGraph.nodes.find((node) => node.id === effectiveGraphNodeId) ?? null,
    [selectedDetail?.flowGraph.nodes, effectiveGraphNodeId],
  );
  const selectedGraphNodeDetails = useMemo(
    () => getFlowNodeDetailsWithFallback(selectedGraphNode, selectedDetail?.flowGraph ?? null),
    [selectedGraphNode, selectedDetail?.flowGraph],
  );
  const selectedGraphNodeIncomingEdge = useMemo(() => {
    if (!selectedDetail?.flowGraph.edges.length || !selectedGraphNode) return null;
    return selectedDetail.flowGraph.edges.find((edge) => edge.target === selectedGraphNode.id) ?? null;
  }, [selectedDetail?.flowGraph.edges, selectedGraphNode]);
  const selectedGraphNodeIncomingEdgeSourceNode = useMemo(() => {
    if (!selectedDetail?.flowGraph.nodes.length || !selectedGraphNodeIncomingEdge) return null;
    return selectedDetail.flowGraph.nodes.find((node) => node.id === selectedGraphNodeIncomingEdge.source) ?? null;
  }, [selectedDetail?.flowGraph.nodes, selectedGraphNodeIncomingEdge]);

  const flowJourneyNarrativeText = useMemo(() => {
    if (!selectedDetail) return "";
    return buildFlowJourneyNarrative({
      flowGraph: selectedDetail.flowGraph,
      classification: selectedDetail.classification,
      riskLevel: selectedDetail.riskLevel,
      currentPhase: selectedDetail.currentPhase,
    });
  }, [selectedDetail]);

  function selectJobId(jobId: string) {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("job", jobId);
      return p;
    });
  }

  function handleExportAnalysisExcel() {
    if (!selectedDetail) {
      toast.error("Não há dados de análise para exportar.");
      return;
    }
    try {
      downloadReduceLogsAnalysisExcel({ detail: selectedDetail, jobId: selectedJobId });
      toast.success("Excel de análise gerado (resumo, indicadores, MITRE, fluxo, eventos…).");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o Excel de análise.");
    }
  }

  const handleMitreTrace = useCallback(
    (occ: MitreEvidenceOccurrence) => {
      if (!selectedJobId) {
        toast.error("Seleccione um lote válido.");
        return;
      }
      setInterpretationTab("graph");
      const target = occ.graphNodeId ?? occ.phaseNodeId;
      skipClearTraceOnGraphSelect.current = true;
      setMitreTraceTarget({
        jobId: selectedJobId,
        targetNodeId: target,
        phaseNodeId: occ.phaseNodeId,
        eventNodeId: occ.graphNodeId,
        evidenceFileName: occ.fileName,
        evidenceLineNumber: occ.lineNumber,
      });
      focusFlowNode(target);
      toast.info(`${occ.fileName} · linha ${occ.lineNumber} · fase: ${occ.stage} — fluxo destacado (ícone âmbar = original; verde = reduzido preservado no grafo/jornada).`);
    },
    [selectedJobId, focusFlowNode],
  );

  function handleExportFlowExcel() {
    if (!selectedDetail?.flowGraph.nodes.length) {
      toast.error("Não há grafo de fluxo para exportar.");
      return;
    }
    try {
      downloadReduceLogsFlowExcel({ detail: selectedDetail, jobId: selectedJobId });
      toast.success("Excel do fluxo gerado (narrativa, fases, APIs, ligações).");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o Excel do fluxo.");
    }
  }

  function handleExportFlowGraphJson() {
    if (!selectedDetail) {
      toast.error("Não há dados de análise para exportar.");
      return;
    }
    try {
      downloadAnalysisFlowGraphJson({ detail: selectedDetail, jobId: selectedJobId });
      toast.success("JSON do grafo de fluxo descarregado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o JSON do fluxo.");
    }
  }

  function handleExportSummaryJson() {
    if (!selectedDetail) {
      toast.error("Não há dados de análise para exportar.");
      return;
    }
    try {
      downloadAnalysisSummaryJson({ detail: selectedDetail, jobId: selectedJobId });
      toast.success("JSON de resumo descarregado (payload do servidor quando existente).");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o JSON de resumo.");
    }
  }

  return (
    <div className="w-full min-w-0 space-y-6 text-foreground">
        <section>
          <Card className="min-w-0 border-border bg-card text-card-foreground shadow-md dark:border-white/10 dark:bg-slate-950/80 dark:shadow-xl dark:shadow-slate-950/30">
            <CardHeader className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <CardTitle>Interpretação consolidada</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Lote vindo do <Link href="/" className="font-medium text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-300">Dashboard</Link>
                    {selectedDetail?.job.sampleName ? (
                      <span>
                        : <span className="text-foreground/90"> {selectedDetail.job.sampleName}</span>
                      </span>
                    ) : null}
                    . Pode trocar o lote no menu abaixo; o URL usa <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground/90 dark:bg-white/10">?job=</code> com o mesmo ID.
                  </p>
                </div>
                {selectedJobId ? (
                  <div
                    className="flex w-full shrink-0 sm:w-auto sm:max-w-[min(100%,20rem)] sm:justify-end"
                    title={`ID do lote: ${selectedJobId}`}
                  >
                    <div className="flex w-full min-w-0 items-start gap-2.5 rounded-xl border-2 border-cyan-500/50 bg-cyan-500/15 px-3 py-2.5 shadow-sm dark:border-cyan-400/40 dark:bg-cyan-950/40">
                      <Hash className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500 dark:text-cyan-300" aria-hidden />
                      <div className="min-w-0 text-left sm:text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-900 dark:text-cyan-200/95">
                          ID do lote
                        </p>
                        <p className="mt-0.5 break-all font-mono text-sm font-semibold leading-snug text-foreground sm:text-right">
                          {selectedJobId}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="w-full min-w-0 max-w-md space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Trocar lote (job ativo)</p>
                  <Select
                    value={selectedJobId ?? ""}
                    onValueChange={selectJobId}
                    disabled={!jobsQuery.data?.length}
                  >
                    <SelectTrigger className="border-border bg-background dark:bg-slate-950/80">
                      <SelectValue placeholder="Nenhum job disponível" />
                    </SelectTrigger>
                    <SelectContent>
                      {(jobsQuery.data ?? []).map((job) => (
                        <SelectItem key={job.jobId} value={job.jobId}>
                          <span className="font-medium">{job.sampleName}</span>
                          <span className="ml-1 font-mono text-xs text-muted-foreground"> {job.jobId}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedDetail ? (
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-cyan-600/40 text-cyan-900 hover:bg-cyan-500/15 dark:border-cyan-400/35 dark:text-cyan-100"
                      onClick={handleExportAnalysisExcel}
                    >
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Exportar análise (Excel)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-border text-foreground hover:bg-muted dark:border-white/15"
                      onClick={handleExportFlowGraphJson}
                      title='Apenas nós e arestas do grafo (schema contradef.flowGraph.v1)'
                    >
                      <FileDown className="mr-2 h-4 w-4" />
                      Fluxo (.json)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-border text-foreground hover:bg-muted dark:border-white/15"
                      onClick={handleExportSummaryJson}
                      title="Resumo do servidor insight.summaryJson; se faltar, campos sintetizados no detail"
                    >
                      <FileDown className="mr-2 h-4 w-4 shrink-0" />
                      Resumo (.json)
                    </Button>
                    <Badge className={jobStatusBadgeClass(selectedDetail.job.status)}>{selectedDetail.job.status}</Badge>
                    <Badge className={riskLevelBadgeClass(selectedDetail.riskLevel)}>{selectedDetail.riskLevel}</Badge>
                    <Badge variant="outline" className="border-border text-foreground dark:border-white/10">{selectedDetail.classification}</Badge>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="min-w-0">
              {!selectedDetail ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-muted-foreground dark:border-white/10 dark:bg-white/5">
                  Nenhuma análise selecionada.
                </div>
              ) : (
                <div className="min-w-0 space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard icon={ShieldAlert} label="Categoria" value={selectedDetail.classification} helper={selectedDetail.currentPhase} />
                    <MetricCard icon={AlertTriangle} label="Risco" value={selectedDetail.riskLevel.toUpperCase()} helper={`${selectedDetail.techniques.length} técnica(s) destacadas`} />
                    <MetricCard icon={Filter} label="Redução" value={`${selectedDetail.metrics.reductionPercent.toFixed(1)}%`} helper={`${selectedDetail.metrics.reducedLineCount} linhas mantidas`} />
                    <MetricCard icon={BrainCircuit} label="APIs suspeitas" value={String(selectedDetail.suspiciousApis.length)} helper={`${selectedDetail.metrics.triggerCount} gatilho(s) heurísticos`} />
                  </div>

                  <Tabs value={interpretationTab} onValueChange={setInterpretationTab} className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Conteúdo da visão geral</p>
                      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1.5 rounded-xl border border-border bg-muted p-1.5 dark:border-white/12 dark:bg-slate-950/85">
                        <TabsTrigger
                          value="overview"
                          className="rounded-lg border border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground data-[state=active]:border-cyan-500/45 data-[state=active]:bg-cyan-500/20 data-[state=active]:font-medium data-[state=active]:text-cyan-900 dark:data-[state=active]:border-cyan-400/45 dark:data-[state=active]:text-cyan-50"
                        >
                          Resumo
                        </TabsTrigger>
                        <TabsTrigger
                          value="graph"
                          className="rounded-lg border border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground data-[state=active]:border-cyan-500/45 data-[state=active]:bg-cyan-500/20 data-[state=active]:font-medium data-[state=active]:text-cyan-900 dark:data-[state=active]:border-cyan-400/45 dark:data-[state=active]:text-cyan-50"
                        >
                          Fluxo
                        </TabsTrigger>
                        <TabsTrigger
                          value="artifacts"
                          className="rounded-lg border border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground data-[state=active]:border-cyan-500/45 data-[state=active]:bg-cyan-500/20 data-[state=active]:font-medium data-[state=active]:text-cyan-900 dark:data-[state=active]:border-cyan-400/45 dark:data-[state=active]:text-cyan-50"
                        >
                          Artefatos
                        </TabsTrigger>
                        <TabsTrigger
                          value="events"
                          className="rounded-lg border border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground data-[state=active]:border-cyan-500/45 data-[state=active]:bg-cyan-500/20 data-[state=active]:font-medium data-[state=active]:text-cyan-900 dark:data-[state=active]:border-cyan-400/45 dark:data-[state=active]:text-cyan-50"
                        >
                          Eventos do job
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="overview" className="space-y-4">
                      <VirusTotalSampleCard sampleSha256={selectedDetail.job.sampleSha256} />
                      <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
                        <Card className="border-border bg-card text-card-foreground shadow-sm dark:border-white/10 dark:bg-white/5">
                          <CardHeader>
                            <CardTitle className="text-lg">Resumo interpretativo</CardTitle>
                            <CardDescription>{selectedDetail.insight?.title ?? "Resumo automático"}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="prose mt-3 max-w-none text-foreground dark:prose-invert prose-headings:text-foreground prose-p:text-muted-foreground dark:prose-headings:text-white dark:prose-p:text-muted-foreground">
                              <Streamdown>{selectedDetail.insight?.summaryMarkdown ?? "Resumo ainda não disponível."}</Streamdown>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="border-border bg-card text-card-foreground shadow-sm dark:border-white/10 dark:bg-white/5">
                          <CardHeader>
                            <CardTitle className="text-lg">Indicadores da análise</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-2xl border border-border bg-muted/70 p-3 dark:border-white/10 dark:bg-slate-950/80">
                                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Linhas originais</p>
                                <p className="mt-2 text-lg font-semibold text-foreground">{selectedDetail.metrics.originalLineCount}</p>
                              </div>
                              <div className="rounded-2xl border border-border bg-muted/70 p-3 dark:border-white/10 dark:bg-slate-950/80">
                                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Linhas reduzidas</p>
                                <p className="mt-2 text-lg font-semibold text-foreground">{selectedDetail.metrics.reducedLineCount}</p>
                              </div>
                              <div className="rounded-2xl border border-border bg-muted/70 p-3 dark:border-white/10 dark:bg-slate-950/80">
                                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tamanho original</p>
                                <p className="mt-2 text-lg font-semibold text-foreground">{formatBytes(selectedDetail.metrics.originalBytes)}</p>
                              </div>
                              <div className="rounded-2xl border border-border bg-muted/70 p-3 dark:border-white/10 dark:bg-slate-950/80">
                                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tamanho reduzido</p>
                                <p className="mt-2 text-lg font-semibold text-foreground">{formatBytes(selectedDetail.metrics.reducedBytes)}</p>
                              </div>
                            </div>
                            <Separator />
                            <MitreDefenseEvasionPanel
                              mitre={selectedDetail.mitreDefenseEvasion}
                              heuristicTags={selectedDetail.techniques}
                              onEvidenceTrace={handleMitreTrace}
                            />
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-foreground">Heurísticas destacadas nos logs</p>
                              <div className="flex flex-wrap gap-2">
                                {selectedDetail.techniques.length ? selectedDetail.techniques.map((technique) => (
                                  <Badge key={technique} variant="outline" className="border-border bg-muted/50 text-foreground dark:border-white/10 dark:bg-white/5">
                                    {technique}
                                  </Badge>
                                )) : <p className="text-sm text-muted-foreground">Nenhuma técnica marcada.</p>}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-foreground">Recomendações</p>
                              <ul className="space-y-2 text-sm text-muted-foreground">
                                {selectedDetail.recommendations.map((recommendation) => (
                                  <li key={recommendation} className="rounded-xl border border-border bg-muted/40 p-3 dark:border-white/10 dark:bg-white/5">
                                    {recommendation}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>

                    <TabsContent value="graph" className="space-y-4">
                      <LogEvidenceFileMetricsContext.Provider value={selectedDetail.fileMetrics}>
                      <LogEvidenceShellContext.Provider value={logEvidenceShellValue}>
                      <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 dark:border-cyan-400/25 dark:bg-cyan-500/[0.07]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800 dark:text-cyan-200/90">
                              Caminho até à identificação
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Leitura contínua da jornada por fase até ao veredito; útil para relatório ou integrações.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="default"
                              className="shrink-0 gap-2 border-2 border-cyan-600/50 font-semibold text-cyan-950 shadow-sm hover:bg-cyan-500/25 dark:border-cyan-400/45 dark:text-cyan-50 dark:hover:bg-cyan-500/20"
                              onClick={() => setInterpretationTab("overview")}
                            >
                              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                              Voltar ao resumo
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0 border-cyan-600/40 text-cyan-900 hover:bg-cyan-500/15 dark:border-cyan-400/35 dark:text-cyan-100"
                              onClick={handleExportFlowExcel}
                            >
                              <FileSpreadsheet className="mr-2 h-4 w-4" />
                              Exportar fluxo (Excel)
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0 border-border text-foreground hover:bg-muted dark:border-white/15"
                              onClick={handleExportFlowGraphJson}
                              title='Apenas grafo UI (contradef.flowGraph.v1)'
                            >
                              <FileDown className="mr-2 h-4 w-4" />
                              Fluxo (.json)
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0 border-border text-foreground hover:bg-muted dark:border-white/15"
                              onClick={handleExportSummaryJson}
                              title="summaryJson gravado pelo job + envelope"
                            >
                              <FileDown className="mr-2 h-4 w-4" />
                              Resumo (.json)
                            </Button>
                          </div>
                        </div>
                        <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                          {flowJourneyNarrativeText || "Sem dados de fluxo para este job."}
                        </p>
                      </div>
                      <div
                        className={cn(
                          "grid min-w-0 gap-4",
                          sidebarCollapsed
                            ? "xl:grid-cols-[minmax(0,1.2fr),min(400px,32vw)] xl:gap-5 2xl:grid-cols-[minmax(0,1.35fr),400px]"
                            : "lg:grid-cols-[minmax(0,1fr),320px]",
                        )}
                      >
                        <div className="min-w-0 max-w-full rounded-3xl border border-border bg-gradient-to-br from-muted/80 via-background to-cyan-500/10 p-4 dark:border-white/10 dark:from-slate-950 dark:via-slate-900 dark:to-cyan-950/40">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <Sparkles className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                            Clique num nó (fase ou API) ou na jornada; o painel à direita mostra o detalhe.
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {selectedDetail.flowGraph.nodes.length ? selectedDetail.flowGraph.nodes.map((node) => (
                              <button
                                key={node.id}
                                type="button"
                                data-flow-node-id={node.id}
                                onClick={() => focusFlowNode(node.id)}
                                className={`rounded-2xl border px-3 py-2 text-left text-sm transition ${effectiveGraphNodeId === node.id ? "border-cyan-500/50 bg-cyan-500/15 text-foreground dark:border-cyan-400/40 dark:bg-cyan-500/10 dark:text-white" : "border-border bg-muted/50 text-foreground hover:bg-muted dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"}`}
                              >
                                <span className="font-medium">{node.label}</span>
                                <Badge variant="outline" className="ml-2 border-border text-xs text-muted-foreground dark:border-white/10">{node.kind}</Badge>
                              </button>
                            )) : (
                              <p className="text-sm text-muted-foreground">Fluxo ainda vazio; aguarde a conclusão da correlação.</p>
                            )}
                          </div>
                          <div className="mt-4 space-y-3">
                            {mitreTraceTarget ? (
                              <p className="text-[11px] leading-relaxed text-muted-foreground">
                                Rastreado desde o resumo MITRE:{" "}
                                <span className="break-all font-mono text-foreground/90">
                                  {mitreTraceTarget.evidenceFileName}:{mitreTraceTarget.evidenceLineNumber}
                                </span>
                                . Use os ícones: âmbar = trecho do log íntegro; verde = trecho preservado no reduzido (mesma referência de linha do original).
                              </p>
                            ) : null}
                            <FlowCorrelationGraph
                              key={`flow-graph-${selectedJobId ?? "none"}`}
                              graph={selectedDetail.flowGraph}
                              selectedNodeId={effectiveGraphNodeId}
                              onSelectNode={focusFlowNode}
                              expandedHeight={sidebarCollapsed}
                              jobId={selectedJobId}
                              phaseLogPeekOverride={
                                mitreTraceTarget && !mitreTraceTarget.eventNodeId
                                  ? {
                                      phaseNodeId: mitreTraceTarget.phaseNodeId,
                                      jobId: mitreTraceTarget.jobId,
                                      fileName: mitreTraceTarget.evidenceFileName,
                                      lineNumber: mitreTraceTarget.evidenceLineNumber,
                                    }
                                  : null
                              }
                              focusFitNodeId={effectiveGraphNodeId}
                              graphFitPulse={graphFitViewPulse}
                            />
                          </div>
                          <div className="mt-4 space-y-3">
                            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Jornada por fase</p>
                            <FlowJourneyDiagram
                              graph={selectedDetail.flowGraph}
                              selectedNodeId={effectiveGraphNodeId}
                              onSelectNode={focusFlowNode}
                              jobId={selectedJobId}
                              phaseLogPeekOverride={
                                mitreTraceTarget && !mitreTraceTarget.eventNodeId
                                  ? {
                                      phaseNodeId: mitreTraceTarget.phaseNodeId,
                                      jobId: mitreTraceTarget.jobId,
                                      fileName: mitreTraceTarget.evidenceFileName,
                                      lineNumber: mitreTraceTarget.evidenceLineNumber,
                                    }
                                  : null
                              }
                            />
                          </div>
                          <details className="mt-4 rounded-2xl border border-border bg-muted/40 px-3 py-2 dark:border-white/10 dark:bg-black/15">
                            <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">
                              Arestas do fluxo (lista) — {selectedDetail.flowGraph.edges.length} ligações
                            </summary>
                            <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto text-xs text-muted-foreground">
                              {selectedDetail.flowGraph.edges.map((edge) => (
                                <div key={`${edge.source}-${edge.target}-${edge.relation}`} className="flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-1 dark:border-white/10 dark:bg-white/5">
                                  <span>{edge.source.replace("phase:", "").replace("event:", "")}</span>
                                  <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-800 dark:border-cyan-400/25 dark:text-cyan-200">{edge.relation}</span>
                                  <ArrowRight className="h-3 w-3 shrink-0" />
                                  <span>{edge.target.replace("phase:", "").replace("event:", "")}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        </div>
                        <div className="min-w-0 rounded-2xl border border-border bg-muted/50 p-4 dark:border-white/10 dark:bg-black/20">
                          <p className="text-sm font-medium text-foreground">Nó selecionado</p>
                          <p className="mt-1 text-xs text-muted-foreground">{selectedGraphNode?.label ?? "Selecione um nó na lista ou no grafo."}</p>
                          {selectedGraphNode ? (
                            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                              <div className="rounded-xl border border-border bg-muted/80 p-3 dark:border-white/10 dark:bg-slate-950/70">
                                <p><span className="text-muted-foreground">Arquivo de origem:</span> {selectedGraphNodeDetails.sourceFile ?? "—"}</p>
                                <p><span className="text-muted-foreground">Tipo de log:</span> {selectedGraphNodeDetails.sourceLogType ?? "—"}</p>
                                <p><span className="text-muted-foreground">Linha:</span> {selectedGraphNodeDetails.sourceLineNumber ?? "—"}</p>
                                <p><span className="text-muted-foreground">Fase:</span> {selectedGraphNodeDetails.stage ?? "—"}</p>
                                <p>
                                  <span className="text-muted-foreground">Transição:</span>{" "}
                                  {selectedGraphNodeIncomingEdge
                                    ? `${selectedGraphNodeIncomingEdge.relation}${
                                        selectedGraphNodeIncomingEdgeSourceNode
                                          ? ` (desde «${selectedGraphNodeIncomingEdgeSourceNode.label}»)`
                                          : ""
                                      }`
                                    : "—"}
                                </p>
                                {selectedGraphNode.kind === "phase" ? (
                                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                    Em fases, ficheiro e linha são derivados das evidências API ligadas no grafo (agregação); não há uma única linha de log da fase em si.
                                  </p>
                                ) : null}
                                {selectedGraphNodeDetails.phaseOriginNote ? (
                                  <p className="mt-2 text-xs leading-relaxed text-amber-900 dark:text-amber-100/95">
                                    {selectedGraphNodeDetails.phaseOriginNote}
                                  </p>
                                ) : null}
                              </div>
                              {selectedJobId &&
                              selectedGraphNode.kind === "api" &&
                              selectedGraphNodeDetails.sourceFile &&
                              !selectedGraphNodeDetails.sourceFile.includes("(+") &&
                              typeof selectedGraphNodeDetails.sourceLineNumber === "number" ? (
                                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2 dark:border-white/12 dark:bg-slate-950/65">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    PNG (âmbar = íntegro · verde = reduzido):
                                  </span>
                                  <LogEvidenceCorrelatedIcons
                                    jobId={selectedJobId}
                                    fileName={selectedGraphNodeDetails.sourceFile}
                                    lineNumber={selectedGraphNodeDetails.sourceLineNumber}
                                    variant="icon"
                                    caption={selectedGraphNode.label}
                                    onBeforeOpen={() => {
                                      if (effectiveGraphNodeId) focusFlowNode(effectiveGraphNodeId);
                                    }}
                                  />
                                </div>
                              ) : null}
                              <div className="rounded-xl border border-border bg-muted/80 p-3 dark:border-white/10 dark:bg-slate-950/70">
                                <p className="text-foreground">
                                  <span className="text-muted-foreground">Como foi identificado:</span>{" "}
                                  {selectedGraphNodeDetails.identification ?? selectedGraphNodeDetails.identifiedBy ?? "Sem descrição de identificação."}
                                </p>
                                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                                  {selectedGraphNodeDetails.evidence ?? "Sem evidência textual disponível."}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(selectedGraphNodeDetails.suspiciousApis.length
                                  ? selectedGraphNodeDetails.suspiciousApis
                                  : ["Sem APIs mapeadas"]
                                ).map((api) => (
                                  <Badge key={api} variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:border-amber-400/25 dark:text-amber-200">{api}</Badge>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      </LogEvidenceShellContext.Provider>
                      </LogEvidenceFileMetricsContext.Provider>
                    </TabsContent>

                    <TabsContent value="artifacts" className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Artefatos registrados para este job. Download usa URL assinada quando o storage remoto está configurado; caso contrário, o servidor oferece cópia local autenticada (mesma sessão) enquanto o arquivo existir em disco.
                      </p>
                      <div className="space-y-2">
                        {selectedDetail.artifacts.length ? selectedDetail.artifacts.map((artifact) => (
                          <a
                            key={`${artifact.artifactType}-${artifact.relativePath}`}
                            href={artifact.downloadUrl ?? artifact.storageUrl ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center justify-between rounded-2xl border border-border bg-muted/80 p-4 transition dark:border-white/10 dark:bg-slate-950/70 ${artifact.downloadUrl || artifact.storageUrl ? "hover:border-cyan-400/30 hover:bg-cyan-500/10" : "pointer-events-none opacity-60"}`}
                          >
                            <div>
                              <p className="text-sm font-medium text-foreground">{artifact.label}</p>
                              <p className="text-xs text-muted-foreground">{artifact.artifactType} · {formatBytes(artifact.sizeBytes ?? undefined)}</p>
                            </div>
                            <FileDown className="h-4 w-4 text-muted-foreground" />
                          </a>
                        )) : (
                          <p className="text-sm text-muted-foreground">Nenhum artefato listado ainda.</p>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="events" className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-[1fr,220px]">
                        <Input
                          value={eventSearch}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => setEventSearch(event.target.value)}
                          placeholder="Filtrar por API, fase, arquivo ou texto"
                          className="border-border bg-background dark:bg-slate-950/80"
                        />
                        <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/5">
                          {filteredEvents.length} evento(s) exibido(s)
                        </div>
                      </div>
                      <div className="overflow-x-auto rounded-2xl border border-border bg-muted/30 dark:border-white/10 dark:bg-slate-950/40">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fase</TableHead>
                              <TableHead>Evento</TableHead>
                              <TableHead>Arquivo</TableHead>
                              <TableHead>APIs</TableHead>
                              <TableHead>Detalhe</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredEvents.map((event, index) => {
                              const payload = asRecord(event.payloadJson);
                              const apis = Array.isArray(payload.suspiciousApis) ? payload.suspiciousApis as string[] : [];
                              return (
                                <TableRow key={`${event.eventType}-${index}-${String(event.createdAt)}`}>
                                  <TableCell>{event.stage ?? "—"}</TableCell>
                                  <TableCell>{event.eventType}</TableCell>
                                  <TableCell>{typeof payload.fileName === "string" ? payload.fileName : "—"}</TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-2">
                                      {apis.length ? apis.map((api) => (
                                        <Badge key={api} className="border-amber-500/35 bg-amber-500/10 text-amber-900 dark:border-amber-400/25 dark:text-amber-300">{api}</Badge>
                                      )) : <span className="text-muted-foreground">—</span>}
                                    </div>
                                  </TableCell>
                                  <TableCell className="max-w-md text-muted-foreground">{event.message ?? "—"}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
    </div>
  );
}

export default function InterpretacaoConsolidada() {
  return (
    <DashboardLayout>
      <InterpretacaoConsolidadaContent />
    </DashboardLayout>
  );
}
