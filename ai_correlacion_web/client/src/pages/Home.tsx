import DashboardLayout from "@/components/DashboardLayout";
import FlowCorrelationGraph from "@/components/FlowCorrelationGraph";
import FlowJourneyDiagram from "@/components/FlowJourneyDiagram";
import { MitreDefenseEvasionPanel } from "@/components/MitreDefenseEvasionPanel";
import { VirusTotalSampleCard } from "@/components/VirusTotalSampleCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { formatBytes, formatDateTimeShort, formatPercentFine, formatPercentRounded } from "@/lib/format";
import { downloadReduceLogsAnalysisExcel, downloadReduceLogsFlowExcel } from "@/lib/reduceLogsExcelExport";
import { useAuth } from "@/_core/hooks/useAuth";
import { asRecord, type PayloadRecord } from "@/lib/payload";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  FileDown,
  FileSearch,
  FileSpreadsheet,
  Filter,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type StatusFilter = "all" | "queued" | "running" | "completed" | "failed" | "cancelled";

export default function Home() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sampleFilter, setSampleFilter] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);

  const jobsQuery = trpc.analysis.list.useQuery({
    sampleName: sampleFilter.trim() || undefined,
    status: statusFilter === "all" ? undefined : [statusFilter],
    limit: 50,
  }, {
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!selectedJobId && jobsQuery.data?.length) {
      setSelectedJobId(jobsQuery.data[0].jobId);
    }
  }, [jobsQuery.data, selectedJobId]);

  useEffect(() => {
    setSelectedGraphNodeId(null);
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

  const dashboardMetrics = useMemo(() => {
    const jobs = jobsQuery.data ?? [];
    const completed = jobs.filter((job) => job.status === "completed").length;
    const running = jobs.filter((job) => job.status === "running").length;
    const failed = jobs.filter((job) => job.status === "failed").length;
    const progressAverage = jobs.length
      ? Math.round(jobs.reduce((sum, job) => sum + (job.progress ?? 0), 0) / jobs.length)
      : 0;
    return { total: jobs.length, completed, running, failed, progressAverage };
  }, [jobsQuery.data]);

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
  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1680px] space-y-6 text-foreground">
        <section>
          <Card className="border-border bg-card text-card-foreground shadow-md dark:border-white/10 dark:bg-slate-950/80 dark:shadow-2xl dark:shadow-cyan-950/20">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-cyan-500/35 bg-cyan-500/15 text-cyan-800 dark:border-cyan-400/25 dark:bg-cyan-500/10 dark:text-cyan-300">
                  Centro de análise Contradef
                </Badge>
              </div>
              <CardTitle className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Plataforma web para redução, interpretação e acompanhamento de logs de malware evasivo
              </CardTitle>
              <CardDescription className="text-base leading-7 text-muted-foreground">
                Envie os logs do Contradef, reduza o volume por heurística, acompanhe o fluxo do malware em timeline ou grafo e receba um veredito interpretável com suporte de LLM.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={FileSearch} label="Análises registradas" value={String(dashboardMetrics.total)} helper="Histórico consultável pelo analista" />
              <MetricCard icon={Activity} label="Execuções em andamento" value={String(dashboardMetrics.running)} helper="Atualização automática do status" />
              <MetricCard icon={ShieldCheck} label="Concluídas" value={String(dashboardMetrics.completed)} helper="Jobs com veredito disponível" />
              <MetricCard icon={Radar} label="Progresso médio" value={`${dashboardMetrics.progressAverage}%`} helper={dashboardMetrics.failed ? `${dashboardMetrics.failed} falha(s) registradas` : "Sem falhas registradas"} />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.88fr,1.12fr]">
          <Card className="border-border bg-card text-card-foreground shadow-md dark:border-white/10 dark:bg-slate-950/80 dark:shadow-xl dark:shadow-slate-950/30">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Fila e histórico</CardTitle>
                  <CardDescription>Selecione uma análise para abrir o dashboard detalhado.</CardDescription>
                  {user && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {user.role === "admin" ? (
                        <>Perfil de administrador: esta lista e os detalhes refletem <span className="font-medium">todas as análises do sistema</span>.</>
                      ) : (
                        <>Com esta conta, só vê análises <span className="font-medium">submetidas por si</span>.</>
                      )}
                    </p>
                  )}
                </div>
                <Badge className={jobStatusBadgeClass(statusFilter === "all" ? undefined : statusFilter)}>{statusFilter === "all" ? "Todos" : statusFilter}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr,180px]">
                <Input
                  placeholder="Filtrar por nome da amostra"
                  value={sampleFilter}
                  onChange={(event) => setSampleFilter(event.target.value)}
                  className="border-border bg-background dark:bg-slate-950/80"
                />
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  <SelectTrigger className="border-border bg-background dark:bg-slate-950/80">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ScrollArea className="h-[560px] pr-4">
                <div className="space-y-3">
                  {(jobsQuery.data ?? []).map((job) => {
                    const isActive = selectedJobId === job.jobId;
                    return (
                      <button
                        key={job.jobId}
                        type="button"
                        onClick={() => setSelectedJobId(job.jobId)}
                        className={`w-full rounded-2xl border p-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 dark:focus-visible:ring-cyan-400/50 ${isActive ? "border-cyan-500/50 bg-cyan-500/15 shadow-md dark:border-cyan-400/40 dark:bg-cyan-500/10 dark:shadow-cyan-950/20" : "border-border bg-muted/40 hover:-translate-y-0.5 hover:bg-muted/70 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:hover:shadow-slate-950/30"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="line-clamp-1 text-sm font-semibold text-foreground">{job.sampleName}</p>
                            <p className="text-xs text-muted-foreground">{job.jobId}</p>
                          </div>
                          <Badge className={jobStatusBadgeClass(job.status)}>{job.status}</Badge>
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{job.stage}</span>
                            <span>{formatPercentRounded(job.progress)}</span>
                          </div>
                          <Progress value={job.progress} className="h-1.5" />
                          <p className="text-sm text-muted-foreground">{job.message ?? "Sem mensagem adicional."}</p>
                          <p className="text-xs text-muted-foreground">Atualizado em {formatDateTimeShort(job.updatedAt)}</p>
                        </div>
                      </button>
                    );
                  })}
                  {jobsQuery.data?.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/5">
                      Nenhuma análise foi registrada ainda. Faça upload dos logs para criar o primeiro caso.
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-border bg-card text-card-foreground shadow-md dark:border-white/10 dark:bg-slate-950/80 dark:shadow-xl dark:shadow-slate-950/30">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Interpretação consolidada</CardTitle>
                  <CardDescription>
                    Classificação, fluxo correlacionado, artefatos e resumo da análise selecionada — disponível apenas no Centro Analítico.
                  </CardDescription>
                </div>
                {selectedDetail ? (
                  <div className="flex flex-wrap items-center gap-2">
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
                    <Badge className={jobStatusBadgeClass(selectedDetail.job.status)}>{selectedDetail.job.status}</Badge>
                    <Badge className={riskLevelBadgeClass(selectedDetail.riskLevel)}>{selectedDetail.riskLevel}</Badge>
                    <Badge variant="outline" className="border-border text-foreground dark:border-white/10">{selectedDetail.classification}</Badge>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedDetail ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-muted-foreground dark:border-white/10 dark:bg-white/5">
                  Selecione uma análise no painel lateral para abrir o detalhamento.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard icon={ShieldAlert} label="Categoria" value={selectedDetail.classification} helper={selectedDetail.currentPhase} />
                    <MetricCard icon={AlertTriangle} label="Risco" value={selectedDetail.riskLevel.toUpperCase()} helper={`${selectedDetail.techniques.length} técnica(s) destacadas`} />
                    <MetricCard icon={Filter} label="Redução" value={`${selectedDetail.metrics.reductionPercent.toFixed(1)}%`} helper={`${selectedDetail.metrics.reducedLineCount} linhas mantidas`} />
                    <MetricCard icon={BrainCircuit} label="APIs suspeitas" value={String(selectedDetail.suspiciousApis.length)} helper={`${selectedDetail.metrics.triggerCount} gatilho(s) heurísticos`} />
                  </div>

                  <Tabs defaultValue="overview" className="space-y-4">
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
                            <CardDescription>Métricas de compressão, fase comportamental e pistas prioritárias.</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid gap-2 border-b border-border pb-4 text-sm text-muted-foreground">
                              <p><span className="text-muted-foreground">Fase comportamental:</span> {selectedDetail.currentPhase}</p>
                              <p>
                                <span className="text-muted-foreground">Redução (linhas):</span>{" "}
                                {selectedDetail.metrics.originalLineCount} → {selectedDetail.metrics.reducedLineCount} ({formatPercentFine(selectedDetail.metrics.reductionPercent)})
                              </p>
                              <p>
                                <span className="text-muted-foreground">APIs suspeitas (lista):</span>{" "}
                                {selectedDetail.suspiciousApis.length ? selectedDetail.suspiciousApis.join(", ") : "—"}
                              </p>
                            </div>
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
                        </div>
                        <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                          {flowJourneyNarrativeText || "Sem dados de fluxo para este job."}
                        </p>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
                        <div className="rounded-3xl border border-border bg-gradient-to-br from-muted/80 via-background to-cyan-500/10 p-4 dark:border-white/10 dark:from-slate-950 dark:via-slate-900 dark:to-cyan-950/40">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <Sparkles className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                            Clique num nó (fase ou API) ou na jornada; o painel à direita mostra o detalhe.
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {selectedDetail.flowGraph.nodes.length ? selectedDetail.flowGraph.nodes.map((node) => (
                              <button
                                key={node.id}
                                type="button"
                                onClick={() => setSelectedGraphNodeId(node.id)}
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
                            <FlowCorrelationGraph
                              graph={selectedDetail.flowGraph}
                              selectedNodeId={effectiveGraphNodeId}
                              onSelectNode={setSelectedGraphNodeId}
                            />
                          </div>
                          <div className="mt-4 space-y-3">
                            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Jornada por fase</p>
                            <FlowJourneyDiagram
                              graph={selectedDetail.flowGraph}
                              selectedNodeId={effectiveGraphNodeId}
                              onSelectNode={setSelectedGraphNodeId}
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
                        <div className="rounded-2xl border border-border bg-muted/50 p-4 dark:border-white/10 dark:bg-black/20">
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
                          onChange={(event) => setEventSearch(event.target.value)}
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
    </DashboardLayout>
  );
}

function MetricCard({ icon: Icon, label, value, helper }: { icon: typeof Activity; label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-500/35 hover:shadow-md dark:border-white/10 dark:bg-gradient-to-br dark:from-white/10 dark:via-white/5 dark:to-transparent dark:hover:border-cyan-400/20 dark:hover:shadow-cyan-950/20">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}
