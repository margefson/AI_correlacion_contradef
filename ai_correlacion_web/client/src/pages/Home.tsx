import DashboardLayout from "@/components/DashboardLayout";
import FlowJourneyDiagram from "@/components/FlowJourneyDiagram";
import { MitreDefenseEvasionPanel } from "@/components/MitreDefenseEvasionPanel";
import { VirusTotalSampleCard } from "@/components/VirusTotalSampleCard";
import { Badge } from "@/components/ui/badge";
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
import { extractFlowNodeDetails } from "@/lib/flowGraph";
import { formatBytes, formatDateTimeShort, formatPercentRounded } from "@/lib/format";
import { asRecord, type PayloadRecord } from "@/lib/payload";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  FileDown,
  FileSearch,
  Filter,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { useEffect, useMemo, useState } from "react";

type StatusFilter = "all" | "queued" | "running" | "completed" | "failed" | "cancelled";

export default function Home() {
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

  const selectedGraphNode = useMemo(() => {
    return selectedDetail?.flowGraph.nodes.find((node) => node.id === selectedGraphNodeId) ?? null;
  }, [selectedDetail?.flowGraph.nodes, selectedGraphNodeId]);
  const selectedGraphNodeDetails = useMemo(() => extractFlowNodeDetails(selectedGraphNode?.metadata), [selectedGraphNode?.metadata]);
  const selectedGraphNodeIncomingEdge = useMemo(() => {
    if (!selectedDetail?.flowGraph.edges.length || !selectedGraphNode) return null;
    return selectedDetail.flowGraph.edges.find((edge) => edge.target === selectedGraphNode.id) ?? null;
  }, [selectedDetail?.flowGraph.edges, selectedGraphNode]);
  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1680px] space-y-6 text-foreground">
        <section>
          <Card className="border-white/10 bg-slate-950/80 shadow-2xl shadow-cyan-950/20">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-cyan-400/25 bg-cyan-500/10 text-cyan-300">Centro de análise Contradef</Badge>
              </div>
              <CardTitle className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
                Plataforma web para redução, interpretação e acompanhamento de logs de malware evasivo
              </CardTitle>
              <CardDescription className="text-base leading-7 text-zinc-300">
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
          <Card className="border-white/10 bg-slate-950/80 shadow-xl shadow-slate-950/30">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Fila e histórico</CardTitle>
                  <CardDescription>Selecione uma análise para abrir o dashboard detalhado.</CardDescription>
                </div>
                <Badge className={jobStatusBadgeClass(statusFilter === "all" ? undefined : statusFilter)}>{statusFilter === "all" ? "Todos" : statusFilter}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr,180px]">
                <Input
                  placeholder="Filtrar por nome da amostra"
                  value={sampleFilter}
                  onChange={(event) => setSampleFilter(event.target.value)}
                  className="bg-slate-950/80"
                />
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  <SelectTrigger className="bg-slate-950/80">
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
                        className={`w-full rounded-2xl border p-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${isActive ? "border-cyan-400/40 bg-cyan-500/10 shadow-md shadow-cyan-950/20" : "border-white/10 bg-white/5 hover:-translate-y-0.5 hover:bg-white/10 hover:shadow-md hover:shadow-slate-950/30"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="line-clamp-1 text-sm font-semibold text-white">{job.sampleName}</p>
                            <p className="text-xs text-zinc-300">{job.jobId}</p>
                          </div>
                          <Badge className={jobStatusBadgeClass(job.status)}>{job.status}</Badge>
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-xs text-zinc-300">
                            <span>{job.stage}</span>
                            <span>{formatPercentRounded(job.progress)}</span>
                          </div>
                          <Progress value={job.progress} className="h-1.5" />
                          <p className="text-sm text-zinc-300">{job.message ?? "Sem mensagem adicional."}</p>
                          <p className="text-xs text-zinc-400">Atualizado em {formatDateTimeShort(job.updatedAt)}</p>
                        </div>
                      </button>
                    );
                  })}
                  {jobsQuery.data?.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
                      Nenhuma análise foi registrada ainda. Faça upload dos logs para criar o primeiro caso.
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/80 shadow-xl shadow-slate-950/30">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Dashboard analítico</CardTitle>
                  <CardDescription>Visão consolidada do fluxo, da redução e da interpretação da amostra selecionada.</CardDescription>
                </div>
                {selectedDetail ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge className={jobStatusBadgeClass(selectedDetail.job.status)}>{selectedDetail.job.status}</Badge>
                    <Badge className={riskLevelBadgeClass(selectedDetail.riskLevel)}>{selectedDetail.riskLevel}</Badge>
                    <Badge variant="outline" className="border-white/10 text-zinc-200">{selectedDetail.classification}</Badge>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedDetail ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-10 text-center text-zinc-300">
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
                    <TabsList className="flex h-auto flex-wrap gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
                      <TabsTrigger value="overview" className="rounded-lg px-3 py-1.5 data-[state=active]:bg-cyan-500/20">Resumo</TabsTrigger>
                      <TabsTrigger value="timeline" className="rounded-lg px-3 py-1.5 data-[state=active]:bg-cyan-500/20">Timeline</TabsTrigger>
                      <TabsTrigger value="graph" className="rounded-lg px-3 py-1.5 data-[state=active]:bg-cyan-500/20">Fluxo</TabsTrigger>
                      <TabsTrigger value="events" className="rounded-lg px-3 py-1.5 data-[state=active]:bg-cyan-500/20">Eventos</TabsTrigger>
                      <TabsTrigger value="report" className="rounded-lg px-3 py-1.5 data-[state=active]:bg-cyan-500/20">Relatório</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                      <VirusTotalSampleCard sampleSha256={selectedDetail.job.sampleSha256} />
                      <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
                        <Card className="border-white/10 bg-white/5">
                          <CardHeader>
                            <CardTitle className="text-lg">Resumo interpretativo</CardTitle>
                            <CardDescription>{selectedDetail.insight?.title ?? "Resumo automático"}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="prose prose-invert max-w-none prose-p:text-zinc-300 prose-headings:text-white">
                              <Streamdown>{selectedDetail.insight?.summaryMarkdown ?? "Resumo ainda não disponível."}</Streamdown>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="border-white/10 bg-white/5">
                          <CardHeader>
                            <CardTitle className="text-lg">Indicadores gerenciais</CardTitle>
                            <CardDescription>Métricas de compressão e pistas prioritárias para o analista.</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Linhas originais</p>
                                <p className="mt-2 text-lg font-semibold text-white">{selectedDetail.metrics.originalLineCount}</p>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Linhas reduzidas</p>
                                <p className="mt-2 text-lg font-semibold text-white">{selectedDetail.metrics.reducedLineCount}</p>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Tamanho original</p>
                                <p className="mt-2 text-lg font-semibold text-white">{formatBytes(selectedDetail.metrics.originalBytes)}</p>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Tamanho reduzido</p>
                                <p className="mt-2 text-lg font-semibold text-white">{formatBytes(selectedDetail.metrics.reducedBytes)}</p>
                              </div>
                            </div>
                            <Separator />
                            <MitreDefenseEvasionPanel
                              mitre={selectedDetail.mitreDefenseEvasion}
                              heuristicTags={selectedDetail.techniques}
                            />
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-zinc-200">Heurísticas destacadas nos logs</p>
                              <div className="flex flex-wrap gap-2">
                                {selectedDetail.techniques.length ? selectedDetail.techniques.map((technique) => (
                                  <Badge key={technique} variant="outline" className="border-white/10 bg-white/5 text-zinc-200">{technique}</Badge>
                                )) : <p className="text-sm text-zinc-300">Nenhuma técnica marcada.</p>}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-zinc-200">Recomendações</p>
                              <ul className="space-y-2 text-sm text-zinc-300">
                                {selectedDetail.recommendations.map((recommendation) => (
                                  <li key={recommendation} className="rounded-xl border border-white/10 bg-white/5 p-3">{recommendation}</li>
                                ))}
                              </ul>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>

                    <TabsContent value="timeline" className="space-y-4">
                      <ScrollArea className="h-[420px] pr-4">
                        <div className="space-y-4">
                          {selectedDetail.events.map((event, index) => {
                            const payload = asRecord(event.payloadJson);
                            return (
                              <div key={`${event.eventType}-${index}-${String(event.createdAt)}`} className="relative rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <Badge className={jobStatusBadgeClass(selectedDetail.job.status)}>{event.stage ?? "Sem fase"}</Badge>
                                  <Badge variant="outline" className="border-white/10 text-zinc-200">{event.eventType}</Badge>
                                  {payload.trigger === true ? <Badge className="bg-rose-500/15 text-rose-300 border-rose-400/25">gatilho</Badge> : null}
                                </div>
                                <p className="text-sm text-zinc-200">{event.message ?? "Evento sem descrição"}</p>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-300">
                                  <span>{formatDateTimeShort(event.createdAt)}</span>
                                  {typeof payload.fileName === "string" ? <span>{payload.fileName}</span> : null}
                                  {typeof payload.logType === "string" ? <span>{payload.logType}</span> : null}
                                  {typeof payload.lineNumber === "number" ? <span>linha {payload.lineNumber}</span> : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    <TabsContent value="graph" className="space-y-4">
                      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
                        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/40 p-4">
                          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
                            <Sparkles className="h-4 w-4 text-cyan-300" />
                            Clique em um nó para inspecionar o contexto associado no painel ao lado.
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            {selectedDetail.flowGraph.nodes.map((node) => (
                              <button key={node.id} type="button" onClick={() => setSelectedGraphNodeId(node.id)} className={`rounded-2xl border px-4 py-3 text-left transition ${selectedGraphNodeId === node.id ? "border-cyan-400/40 bg-cyan-500/10 text-white" : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"}`}>
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <span>{node.label}</span>
                                  <Badge variant="outline" className="border-white/10 text-zinc-300">{node.kind}</Badge>
                                </div>
                              </button>
                            ))}
                          </div>
                          <div className="mt-4 space-y-3">
                            <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Jornada por fase</p>
                            <FlowJourneyDiagram
                              graph={selectedDetail.flowGraph}
                              selectedNodeId={selectedGraphNodeId}
                              onSelectNode={setSelectedGraphNodeId}
                            />
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2 text-zinc-300">
                            {selectedDetail.flowGraph.edges.map((edge) => (
                              <div key={`${edge.source}-${edge.target}-${edge.relation}`} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
                                <span>{edge.source.replace("phase:", "").replace("event:", "")}</span>
                                <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-200">{edge.relation}</span>
                                <ArrowRight className="h-3 w-3" />
                                <span>{edge.target.replace("phase:", "").replace("event:", "")}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <Card className="border-white/10 bg-white/5">
                          <CardHeader>
                            <CardTitle className="text-lg">Inspeção do nó</CardTitle>
                            <CardDescription>{selectedGraphNode ? selectedGraphNode.label : "Selecione um nó do fluxo para ver sua origem no log e o método de identificação."}</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3 text-sm text-zinc-300">
                            {selectedGraphNode ? (
                              <>
                                <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                                  <p><span className="text-zinc-400">Arquivo de origem:</span> {selectedGraphNodeDetails.sourceFile ?? "—"}</p>
                                  <p><span className="text-zinc-400">Tipo de log:</span> {selectedGraphNodeDetails.sourceLogType ?? "—"}</p>
                                  <p><span className="text-zinc-400">Linha:</span> {selectedGraphNodeDetails.sourceLineNumber ?? "—"}</p>
                                  <p><span className="text-zinc-400">Fase:</span> {selectedGraphNodeDetails.stage ?? "—"}</p>
                                  <p><span className="text-zinc-400">Transição:</span> {selectedGraphNodeIncomingEdge?.relation ?? "—"}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                                  <p className="text-zinc-200">
                                    <span className="text-zinc-400">Como foi identificado:</span>{" "}
                                    {selectedGraphNodeDetails.identification ?? selectedGraphNodeDetails.identifiedBy ?? "Sem descrição de identificação."}
                                  </p>
                                  <p className="mt-2 text-zinc-300">{selectedGraphNodeDetails.evidence ?? "Sem evidência textual disponível."}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(selectedGraphNodeDetails.suspiciousApis.length
                                    ? selectedGraphNodeDetails.suspiciousApis
                                    : ["Sem APIs mapeadas"]
                                  ).map((api) => (
                                    <Badge key={api} variant="outline" className="border-amber-400/25 bg-amber-500/10 text-amber-200">{api}</Badge>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-zinc-300">Nenhum nó selecionado.</p>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>

                    <TabsContent value="events" className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-[1fr,220px]">
                        <Input value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Filtrar por API, fase, arquivo ou texto" />
                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">{filteredEvents.length} evento(s) exibido(s)</div>
                      </div>
                      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40">
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
                                        <Badge key={api} className="border-amber-400/25 bg-amber-500/10 text-amber-300">{api}</Badge>
                                      )) : <span className="text-zinc-400">—</span>}
                                    </div>
                                  </TableCell>
                                  <TableCell className="max-w-md text-zinc-300">{event.message ?? "—"}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>

                    <TabsContent value="report" className="space-y-4">
                      <div className="grid gap-4 lg:grid-cols-[1fr,300px]">
                        <Card className="border-white/10 bg-white/5">
                          <CardHeader>
                            <CardTitle className="text-lg">Relatório exportável</CardTitle>
                            <CardDescription>Baixe os artefatos gerados ou utilize o markdown abaixo como base do parecer técnico.</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="prose prose-invert max-w-none prose-p:text-zinc-300 prose-headings:text-white">
                              <Streamdown>{selectedDetail.insight?.summaryMarkdown ?? "Relatório ainda não gerado."}</Streamdown>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="border-white/10 bg-white/5">
                          <CardHeader>
                            <CardTitle className="text-lg">Artefatos disponíveis</CardTitle>
                            <CardDescription>Logs brutos, logs reduzidos, grafo consolidado e relatório final.</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {selectedDetail.artifacts.map((artifact) => (
                              <a key={`${artifact.artifactType}-${artifact.relativePath}`} href={artifact.downloadUrl ?? artifact.storageUrl ?? "#"} target="_blank" rel="noreferrer" className={`flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-4 transition ${artifact.downloadUrl || artifact.storageUrl ? "hover:border-cyan-400/30 hover:bg-cyan-500/10" : "pointer-events-none opacity-60"}`}>
                                <div>
                                  <p className="text-sm font-medium text-white">{artifact.label}</p>
                                  <p className="text-xs text-zinc-300">{artifact.artifactType} · {formatBytes(artifact.sizeBytes ?? undefined)}</p>
                                </div>
                                <FileDown className="h-4 w-4 text-zinc-300" />
                              </a>
                            ))}
                          </CardContent>
                        </Card>
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
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-4 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400/20 hover:shadow-md hover:shadow-cyan-950/20">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-zinc-300">{label}</p>
        <Icon className="h-4 w-4 text-cyan-300" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm text-zinc-300">{helper}</p>
    </div>
  );
}
