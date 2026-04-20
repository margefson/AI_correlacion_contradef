import DashboardLayout from "@/components/DashboardLayout";
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
import { Textarea } from "@/components/ui/textarea";
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
  UploadCloud,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type StatusFilter = "all" | "queued" | "running" | "completed" | "failed" | "cancelled";
type LogType = "FunctionInterceptor" | "TraceFcnCall" | "TraceMemory" | "TraceInstructions" | "TraceDisassembly" | "Unknown";
type PayloadRecord = Record<string, unknown>;

function statusVariant(status?: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-400/25";
    case "running":
      return "bg-cyan-500/15 text-cyan-300 border-cyan-400/25";
    case "queued":
      return "bg-amber-500/15 text-amber-300 border-amber-400/25";
    case "failed":
      return "bg-rose-500/15 text-rose-300 border-rose-400/25";
    default:
      return "bg-zinc-500/15 text-zinc-300 border-zinc-400/25";
  }
}

function riskVariant(risk?: string) {
  switch (risk) {
    case "critical":
      return "bg-rose-500/15 text-rose-300 border-rose-400/25";
    case "high":
      return "bg-amber-500/15 text-amber-300 border-amber-400/25";
    case "medium":
      return "bg-cyan-500/15 text-cyan-300 border-cyan-400/25";
    default:
      return "bg-emerald-500/15 text-emerald-300 border-emerald-400/25";
  }
}

function formatDate(value?: Date | string | number | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatPercent(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function calculateReductionPercent(original?: number | null, reduced?: number | null) {
  if (!original || original <= 0 || typeof reduced !== "number") return 0;
  return Math.max(0, Math.min(100, (1 - reduced / original) * 100));
}

function parseCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferLogType(fileName: string): LogType {
  const lowered = fileName.toLowerCase();
  if (lowered.includes("functioninterceptor") || lowered.includes("function_interceptor")) return "FunctionInterceptor";
  if (lowered.includes("tracefcncall") || lowered.includes("trace_fcn_call")) return "TraceFcnCall";
  if (lowered.includes("tracememory") || lowered.includes("trace_memory")) return "TraceMemory";
  if (lowered.includes("traceinstructions") || lowered.includes("trace_instructions")) return "TraceInstructions";
  if (lowered.includes("tracedisassembly") || lowered.includes("trace_disassembly")) return "TraceDisassembly";
  return "Unknown";
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Falha ao ler o arquivo selecionado."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Falha ao converter o arquivo para base64."));
    reader.readAsDataURL(file);
  });
}

function asRecord(value: unknown): PayloadRecord {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as PayloadRecord;
}

export default function Home() {
  const utils = trpc.useUtils();
  const [analysisName, setAnalysisName] = useState("Amostra Contradef - Sessão 1");
  const [focusTerms, setFocusTerms] = useState("VirtualProtect, NtQueryInformationProcess, IsDebuggerPresent, Sleep");
  const [focusRegexes, setFocusRegexes] = useState("VirtualProtect.*RW.*RX, Nt.*QueryInformationProcess");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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

  const reductionBaselineQuery = trpc.analysis.reductionBaseline.useQuery();

  const submitMutation = trpc.analysis.submit.useMutation({
    onSuccess: async (result) => {
      toast.success("Análise iniciada com sucesso.");
      await utils.analysis.list.invalidate();
      if (result?.job?.jobId) {
        setSelectedJobId(result.job.jobId);
        await utils.analysis.detail.invalidate({ jobId: result.job.jobId });
      }
      setSelectedFiles([]);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

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

  async function handleSubmit() {
    if (!selectedFiles.length) {
      toast.error("Selecione ao menos um log da Contradef.");
      return;
    }

    try {
      const logFiles = await Promise.all(selectedFiles.map(async (file) => ({
        fileName: file.name,
        base64: await fileToBase64(file),
        logType: inferLogType(file.name),
      })));

      await submitMutation.mutateAsync({
        analysisName,
        logFiles,
        focusTerms: parseCsv(focusTerms),
        focusRegexes: parseCsv(focusRegexes),
        origin: window.location.origin,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a análise.");
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 text-foreground">
        <section className="grid gap-6 xl:grid-cols-[1.4fr,0.9fr]">
          <Card className="border-white/10 bg-slate-950/80 shadow-2xl shadow-cyan-950/20">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-cyan-400/25 bg-cyan-500/10 text-cyan-300">Centro de análise Contradef</Badge>
                <Badge variant="outline" className="border-white/10 text-zinc-300">Node.js + React + IA</Badge>
              </div>
              <CardTitle className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Plataforma web para redução, interpretação e acompanhamento de logs de malware evasivo
              </CardTitle>
              <CardDescription className="max-w-3xl text-base leading-7 text-zinc-300">
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

          <Card className="border-white/10 bg-slate-950/80 shadow-xl shadow-slate-950/30">
            <CardHeader>
              <CardTitle className="text-xl">Submissão de logs</CardTitle>
              <CardDescription>
                O pipeline aceita múltiplos arquivos e infere automaticamente o tipo de log pelo nome do arquivo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Nome da análise</label>
                <Input value={analysisName} onChange={(event) => setAnalysisName(event.target.value)} placeholder="Ex.: Sample-APT-01" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Termos prioritários</label>
                <Textarea value={focusTerms} onChange={(event) => setFocusTerms(event.target.value)} className="min-h-24" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Regex heurístico complementar</label>
                <Textarea value={focusRegexes} onChange={(event) => setFocusRegexes(event.target.value)} className="min-h-20" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Arquivos de log</label>
                <Input type="file" multiple accept=".log,.txt,.json,.csv" onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))} />
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.length ? selectedFiles.map((file) => (
                    <Badge key={file.name} variant="outline" className="border-white/10 bg-white/5 text-zinc-200">
                      {file.name} · {inferLogType(file.name)}
                    </Badge>
                  )) : (
                    <p className="text-sm text-zinc-400">Nenhum arquivo selecionado.</p>
                  )}
                </div>
              </div>
              <Button className="w-full gap-2" onClick={handleSubmit} disabled={submitMutation.isPending}>
                <UploadCloud className="h-4 w-4" />
                {submitMutation.isPending ? "Processando análise..." : "Iniciar análise automatizada"}
              </Button>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-cyan-400/15 bg-slate-950/80 shadow-xl shadow-cyan-950/10">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Teste inicial do redutor em C++</CardTitle>
                  <CardDescription>
                    Validação isolada da heurística do documento técnico, usando as amostras reais <span className="font-medium text-zinc-200">FunctionInterceptor</span>, <span className="font-medium text-zinc-200">TraceInstructions</span> e <span className="font-medium text-zinc-200">TraceMemory</span> presentes no repositório base.
                  </CardDescription>
                </div>
                <Badge className={reductionBaselineQuery.data?.available ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300" : "border-amber-400/25 bg-amber-500/10 text-amber-300"}>gatilho {reductionBaselineQuery.data?.trigger_address ?? "—"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <MiniInfo label="Bytes antes" value={formatBytes(reductionBaselineQuery.data?.combined.original_bytes)} />
                <MiniInfo label="Bytes depois" value={formatBytes(reductionBaselineQuery.data?.combined.reduced_bytes)} />
                <MiniInfo label="Redução medida" value={formatPercent(reductionBaselineQuery.data?.combined.reduction_percent)} />
              </div>
              {reductionBaselineQuery.isLoading ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
                  Carregando o resultado do teste inicial do redutor em C++...
                </div>
              ) : reductionBaselineQuery.error ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">
                  Falha ao carregar a comparação antes/depois: {reductionBaselineQuery.error.message}
                </div>
              ) : !reductionBaselineQuery.data?.available ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                  {reductionBaselineQuery.data?.errorMessage ?? "O baseline de redução ainda não está disponível."}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Log</TableHead>
                        <TableHead>Linhas antes</TableHead>
                        <TableHead>Linhas depois</TableHead>
                        <TableHead>Tamanho antes</TableHead>
                        <TableHead>Tamanho depois</TableHead>
                        <TableHead>Redução</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(reductionBaselineQuery.data?.files ?? []).map((file) => (
                        <TableRow key={file.file}>
                          <TableCell className="font-medium text-zinc-100">{file.file}</TableCell>
                          <TableCell>{file.original_lines}</TableCell>
                          <TableCell>{file.reduced_lines}</TableCell>
                          <TableCell>{formatBytes(file.original_bytes)}</TableCell>
                          <TableCell>{formatBytes(file.reduced_bytes)}</TableCell>
                          <TableCell>{formatPercent(calculateReductionPercent(file.original_bytes, file.reduced_bytes))}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-cyan-500/5">
                        <TableCell className="font-semibold text-cyan-200">Total combinado</TableCell>
                        <TableCell>{reductionBaselineQuery.data.combined.original_lines}</TableCell>
                        <TableCell>{reductionBaselineQuery.data.combined.reduced_lines}</TableCell>
                        <TableCell>{formatBytes(reductionBaselineQuery.data.combined.original_bytes)}</TableCell>
                        <TableCell>{formatBytes(reductionBaselineQuery.data.combined.reduced_bytes)}</TableCell>
                        <TableCell>{formatPercent(reductionBaselineQuery.data.combined.reduction_percent)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-sm leading-6 text-zinc-400">
                Nesta etapa, a plataforma está demonstrando primeiro a <span className="text-zinc-200">diminuição efetiva do volume</span> após um gatilho <span className="text-zinc-200">VirtualProtect RW→RX</span>. Depois dessa validação, evoluímos a mesma lógica para o restante do fluxo analítico.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.88fr,1.12fr]">
          <Card className="border-white/10 bg-slate-950/80">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Fila e histórico</CardTitle>
                  <CardDescription>Selecione uma análise para abrir o dashboard detalhado.</CardDescription>
                </div>
                <Badge className={statusVariant(statusFilter === "all" ? undefined : statusFilter)}>{statusFilter === "all" ? "Todos" : statusFilter}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr,180px]">
                <Input placeholder="Filtrar por nome da amostra" value={sampleFilter} onChange={(event) => setSampleFilter(event.target.value)} />
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  <SelectTrigger>
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
              <ScrollArea className="h-[540px] pr-4">
                <div className="space-y-3">
                  {(jobsQuery.data ?? []).map((job) => {
                    const isActive = selectedJobId === job.jobId;
                    return (
                      <button key={job.jobId} type="button" onClick={() => setSelectedJobId(job.jobId)} className={`w-full rounded-2xl border p-4 text-left transition ${isActive ? "border-cyan-400/40 bg-cyan-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">{job.sampleName}</p>
                            <p className="text-xs text-zinc-400">{job.jobId}</p>
                          </div>
                          <Badge className={statusVariant(job.status)}>{job.status}</Badge>
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-xs text-zinc-400">
                            <span>{job.stage}</span>
                            <span>{formatPercent(job.progress)}</span>
                          </div>
                          <Progress value={job.progress} />
                          <p className="text-sm text-zinc-300">{job.message ?? "Sem mensagem adicional."}</p>
                          <p className="text-xs text-zinc-500">Atualizado em {formatDate(job.updatedAt)}</p>
                        </div>
                      </button>
                    );
                  })}
                  {jobsQuery.data?.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
                      Nenhuma análise foi registrada ainda. Faça upload dos logs para criar o primeiro caso.
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/80">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Dashboard analítico</CardTitle>
                  <CardDescription>Visão consolidada do fluxo, da redução e da interpretação da amostra selecionada.</CardDescription>
                </div>
                {selectedDetail ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge className={statusVariant(selectedDetail.job.status)}>{selectedDetail.job.status}</Badge>
                    <Badge className={riskVariant(selectedDetail.riskLevel)}>{selectedDetail.riskLevel}</Badge>
                    <Badge variant="outline" className="border-white/10 text-zinc-200">{selectedDetail.classification}</Badge>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedDetail ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-10 text-center text-zinc-400">
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
                    <TabsList className="flex flex-wrap gap-2 bg-transparent p-0">
                      <TabsTrigger value="overview">Resumo</TabsTrigger>
                      <TabsTrigger value="timeline">Timeline</TabsTrigger>
                      <TabsTrigger value="graph">Fluxo</TabsTrigger>
                      <TabsTrigger value="events">Eventos</TabsTrigger>
                      <TabsTrigger value="report">Relatório</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
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
                              <MiniInfo label="Linhas originais" value={String(selectedDetail.metrics.originalLineCount)} />
                              <MiniInfo label="Linhas reduzidas" value={String(selectedDetail.metrics.reducedLineCount)} />
                              <MiniInfo label="Tamanho original" value={formatBytes(selectedDetail.metrics.originalBytes)} />
                              <MiniInfo label="Tamanho reduzido" value={formatBytes(selectedDetail.metrics.reducedBytes)} />
                            </div>
                            <Separator />
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-zinc-200">Técnicas destacadas</p>
                              <div className="flex flex-wrap gap-2">
                                {selectedDetail.techniques.length ? selectedDetail.techniques.map((technique) => (
                                  <Badge key={technique} variant="outline" className="border-white/10 bg-white/5 text-zinc-200">{technique}</Badge>
                                )) : <p className="text-sm text-zinc-400">Nenhuma técnica marcada.</p>}
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
                                  <Badge className={statusVariant(selectedDetail.job.status)}>{event.stage ?? "Sem fase"}</Badge>
                                  <Badge variant="outline" className="border-white/10 text-zinc-200">{event.eventType}</Badge>
                                  {payload.trigger === true ? <Badge className="bg-rose-500/15 text-rose-300 border-rose-400/25">gatilho</Badge> : null}
                                </div>
                                <p className="text-sm text-zinc-200">{event.message ?? "Evento sem descrição"}</p>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-400">
                                  <span>{formatDate(event.createdAt)}</span>
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
                          <div className="mt-4 flex flex-wrap items-center gap-2 text-zinc-400">
                            {selectedDetail.flowGraph.edges.map((edge) => (
                              <div key={`${edge.source}-${edge.target}-${edge.relation}`} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
                                <span>{edge.source.replace("phase:", "").replace("event:", "")}</span>
                                <ArrowRight className="h-3 w-3" />
                                <span>{edge.target.replace("phase:", "").replace("event:", "")}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <Card className="border-white/10 bg-white/5">
                          <CardHeader>
                            <CardTitle className="text-lg">Inspeção do nó</CardTitle>
                            <CardDescription>{selectedGraphNode ? selectedGraphNode.label : "Selecione um nó do fluxo para ver seus metadados."}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            {selectedGraphNode ? (
                              <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-xs text-zinc-300">{JSON.stringify(selectedGraphNode.metadata ?? {}, null, 2)}</pre>
                            ) : (
                              <p className="text-sm text-zinc-400">Nenhum nó selecionado.</p>
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
                      <div className="overflow-hidden rounded-2xl border border-white/10">
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
                                      )) : <span className="text-zinc-500">—</span>}
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
                              <a key={`${artifact.artifactType}-${artifact.relativePath}`} href={artifact.storageUrl ?? "#"} target="_blank" rel="noreferrer" className={`flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-4 transition ${artifact.storageUrl ? "hover:border-cyan-400/30 hover:bg-cyan-500/10" : "pointer-events-none opacity-60"}`}>
                                <div>
                                  <p className="text-sm font-medium text-white">{artifact.label}</p>
                                  <p className="text-xs text-zinc-400">{artifact.artifactType} · {formatBytes(artifact.sizeBytes ?? undefined)}</p>
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
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">{label}</p>
        <Icon className="h-4 w-4 text-cyan-300" />
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm text-zinc-400">{helper}</p>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
