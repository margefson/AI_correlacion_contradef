import React from "react";
import { useAuth } from "@/_core/hooks/useAuth";
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
import { uploadAnalysisArchive, MAX_ARCHIVE_BYTES } from "@/lib/analysisUpload";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileArchive,
  FileJson2,
  FileSearch,
  GitCommitHorizontal,
  Link2,
  Loader2,
  Radar,
  RefreshCcw,
  ShieldCheck,
  TerminalSquare,
  UploadCloud,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type StatusValue = "all" | "queued" | "running" | "completed" | "failed" | "cancelled";

type GraphNode = {
  id: string;
  label?: string;
  kind?: string;
  metadata?: Record<string, unknown>;
};

type GraphEdge = {
  source: string;
  target: string;
  relation?: string | null;
  weight?: number | null;
  evidence?: string | null;
  metadata?: Record<string, unknown>;
};

type StreamStatus = "connecting" | "live" | "degraded" | "offline";

type StreamSnapshot = {
  emittedAt: number;
  jobs?: Array<Record<string, any>>;
  detail?: any | null;
};

function statusClasses(status?: string | null) {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20";
    case "running":
      return "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/20";
    case "queued":
      return "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20";
    case "failed":
      return "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20";
    case "cancelled":
      return "bg-zinc-500/20 text-zinc-300 ring-1 ring-zinc-400/20";
    default:
      return "bg-white/10 text-white ring-1 ring-white/10";
  }
}

function metricTone(kind: "primary" | "success" | "warning" | "neutral") {
  if (kind === "success") return "from-emerald-500/20 via-emerald-500/5 to-transparent";
  if (kind === "warning") return "from-amber-500/20 via-amber-500/5 to-transparent";
  if (kind === "neutral") return "from-slate-500/20 via-slate-500/5 to-transparent";
  return "from-cyan-500/25 via-indigo-500/10 to-transparent";
}

function formatDateTime(value?: Date | string | number | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatPercent(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function parseCommaSeparated(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildGraphLayout(nodes: GraphNode[]) {
  if (nodes.length === 0) return [] as Array<GraphNode & { x: number; y: number }>;
  const centerX = 320;
  const centerY = 190;
  const radius = Math.min(140, 60 + nodes.length * 8);

  return nodes.map((node, index) => {
    if (index === 0) {
      return { ...node, x: centerX, y: centerY };
    }
    const angle = ((index - 1) / Math.max(1, nodes.length - 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });
}

export default function Home() {
  const utils = trpc.useUtils();
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [focusFunction, setFocusFunction] = useState("IsDebuggerPresent");
  const [focusTermsInput, setFocusTermsInput] = useState("IsDebuggerPresent, VirtualProtect, CreateRemoteThread");
  const [focusRegexesInput, setFocusRegexesInput] = useState("Zw.*InformationProcess, Nt.*QuerySystemInformation");
  const [sampleNameFilter, setSampleNameFilter] = useState("");
  const [focusFilter, setFocusFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusValue>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [compareJobId, setCompareJobId] = useState<string | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitPhase, setSubmitPhase] = useState<"idle" | "uploading" | "starting">("idle");
  const [liveJobs, setLiveJobs] = useState<Array<Record<string, any>> | null>(null);
  const [liveDetail, setLiveDetail] = useState<any | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("offline");
  const [streamError, setStreamError] = useState<string | null>(null);

  const isAdmin = auth.user?.role === "admin";
  const isSubmittingJob = submitPhase !== "idle";

  const listInput = useMemo(
    () => ({
      sampleName: sampleNameFilter.trim() || undefined,
      focusFunction: focusFilter.trim() || undefined,
      status: statusFilter === "all" ? undefined : [statusFilter],
      limit: 50,
    }),
    [focusFilter, sampleNameFilter, statusFilter],
  );

  const jobsQuery = trpc.analysis.list.useQuery(listInput, {
    enabled: auth.isAuthenticated,
    refetchInterval: false,
  });

  const detailQuery = trpc.analysis.detail.useQuery(
    { jobId: selectedJobId ?? "" },
    {
      enabled: auth.isAuthenticated && !!selectedJobId,
    },
  );

  const compareDetailQuery = trpc.analysis.detail.useQuery(
    { jobId: compareJobId ?? "" },
    {
      enabled: auth.isAuthenticated && !!compareJobId,
    },
  );

  const resumeSyncMutation = trpc.analysis.resumeActiveSync.useMutation();
  const syncJobMutation = trpc.analysis.sync.useMutation({
    onError: (error) => {
      toast.error(error.message || "Não foi possível sincronizar o job selecionado.");
    },
  });

  useEffect(() => {
    if (!auth.isAuthenticated || !isAdmin) return;
    resumeSyncMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isAuthenticated, isAdmin]);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setLiveJobs(null);
      setLiveDetail(null);
      setStreamStatus("offline");
      setStreamError(null);
      return;
    }

    setStreamStatus("connecting");
    setStreamError(null);

    const streamUrl = selectedJobId
      ? `/api/analysis/stream?jobId=${encodeURIComponent(selectedJobId)}`
      : "/api/analysis/stream";
    const source = new EventSource(streamUrl);

    source.addEventListener("snapshot", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as StreamSnapshot;
        setLiveJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
        setLiveDetail(payload.detail ?? null);
        setStreamStatus("live");
        setStreamError(null);
      } catch {
        setStreamStatus("degraded");
        setStreamError("O stream retornou um snapshot inválido e foi ignorado pelo cliente.");
      }
    });

    source.addEventListener("error", (event) => {
      const message = (event as MessageEvent<string>).data
        ? (() => {
            try {
              const parsed = JSON.parse((event as MessageEvent<string>).data) as { message?: string };
              return parsed.message || "Conexão em tempo real temporariamente indisponível.";
            } catch {
              return "Conexão em tempo real temporariamente indisponível.";
            }
          })()
        : "Conexão em tempo real temporariamente indisponível.";

      setStreamStatus("degraded");
      setStreamError(message);
    });

    return () => {
      source.close();
    };
  }, [auth.isAuthenticated, selectedJobId]);

  const jobs = (liveJobs ?? jobsQuery.data ?? []) as Array<Record<string, any>>;
  const selectedDetail = (liveDetail ?? detailQuery.data) as any;
  const compareDetail = compareDetailQuery.data as any;
  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running");

  useEffect(() => {
    const firstJobId = jobs[0]?.jobId;
    if (!selectedJobId && firstJobId) {
      setSelectedJobId(firstJobId);
    }
  }, [jobs, selectedJobId]);

  useEffect(() => {
    if (jobs.length === 0) {
      if (compareJobId !== null) {
        setCompareJobId(null);
      }
      return;
    }

    if (compareJobId && compareJobId !== selectedJobId && jobs.some((job) => job.jobId === compareJobId)) {
      return;
    }

    const fallbackCompareJobId = jobs.find((job) => job.jobId !== selectedJobId)?.jobId ?? null;
    if (fallbackCompareJobId !== compareJobId) {
      setCompareJobId(fallbackCompareJobId);
    }
  }, [compareJobId, jobs, selectedJobId]);

  const metrics = useMemo(() => {
    const total = jobs.length;
    const completed = jobs.filter((job) => job.status === "completed").length;
    const failed = jobs.filter((job) => job.status === "failed").length;
    const avgProgress = total > 0
      ? Math.round(jobs.reduce((sum, job) => sum + (job.progress ?? 0), 0) / total)
      : 0;

    return {
      total,
      completed,
      failed,
      active: activeJobs.length,
      avgProgress,
    };
  }, [activeJobs.length, jobs]);

  const jsonArtifact = selectedDetail?.artifacts?.find((artifact: any) => artifact.relativePath.toLowerCase().endsWith(".json"));
  const markdownArtifact = selectedDetail?.artifacts?.find((artifact: any) => artifact.relativePath.toLowerCase().endsWith(".md") || artifact.relativePath.toLowerCase().endsWith(".markdown"));
  const docxArtifact = selectedDetail?.artifacts?.find((artifact: any) => artifact.relativePath.toLowerCase().endsWith(".docx"));
  const graphNodes = (selectedDetail?.graph?.nodes ?? []) as GraphNode[];
  const graphEdges = (selectedDetail?.graph?.edges ?? []) as GraphEdge[];
  const compareGraphNodes = (compareDetail?.graph?.nodes ?? []) as GraphNode[];
  const compareGraphEdges = (compareDetail?.graph?.edges ?? []) as GraphEdge[];
  const compareCandidates = jobs.filter((job) => job.jobId !== selectedJobId);
  const comparisonSummary = useMemo(() => {
    if (!selectedDetail?.job || !compareDetail?.job) return null;

    const selectedNodeIds = new Set<string>(graphNodes.map((node) => node.id));
    const compareNodeIds = new Set<string>(compareGraphNodes.map((node) => node.id));
    const sharedFunctions = Array.from(selectedNodeIds).filter((nodeId) => compareNodeIds.has(nodeId));

    const selectedArtifacts = new Set<string>((selectedDetail.artifacts ?? []).map((artifact: any) => artifact.relativePath));
    const comparedArtifacts = new Set<string>((compareDetail.artifacts ?? []).map((artifact: any) => artifact.relativePath));
    const sharedArtifacts = Array.from(selectedArtifacts).filter((artifactPath) => comparedArtifacts.has(artifactPath));

    return {
      sharedFunctions: sharedFunctions.slice(0, 12),
      sharedArtifacts: sharedArtifacts.slice(0, 12),
      selectedNodeCount: graphNodes.length,
      compareNodeCount: compareGraphNodes.length,
      selectedEdgeCount: graphEdges.length,
      compareEdgeCount: compareGraphEdges.length,
      sameFocusFunction: selectedDetail.job.focusFunction === compareDetail.job.focusFunction,
    };
  }, [compareDetail, compareGraphEdges.length, compareGraphNodes, graphEdges.length, graphNodes, selectedDetail]);

  const positionedNodes = useMemo(() => buildGraphLayout(graphNodes), [graphNodes]);
  const selectedGraphNode = positionedNodes.find((node) => node.id === highlightedNodeId) ?? positionedNodes[0] ?? null;
  const visibleEdges = highlightedNodeId
    ? graphEdges.filter((edge) => edge.source === highlightedNodeId || edge.target === highlightedNodeId)
    : graphEdges;

  async function handleSubmitJob() {
    if (!auth.isAuthenticated) {
      const message = "Sua sessão não está ativa. Faça login novamente antes de iniciar a análise.";
      setSubmissionError(message);
      toast.error(message);
      return;
    }

    if (!selectedFile) {
      const message = "Selecione um pacote .7z antes de iniciar a análise.";
      setSubmissionError(message);
      toast.error(message);
      return;
    }
    if (!selectedFile.name.toLowerCase().endsWith(".7z")) {
      const message = "A plataforma aceita apenas arquivos .7z nesta etapa.";
      setSubmissionError(message);
      toast.error(message);
      return;
    }
    if (selectedFile.size > MAX_ARCHIVE_BYTES) {
      const message = `O arquivo excede o limite operacional de ${Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024))} MB aceito pelo backend web.`;
      setSubmissionError(message);
      toast.error(message);
      return;
    }

    try {
      setSubmissionError(null);
      setSubmitPhase("uploading");
      setUploadProgress(0);

      const createdJob = await uploadAnalysisArchive(
        {
          file: selectedFile,
          focusFunction: focusFunction.trim(),
          focusTerms: parseCommaSeparated(focusTermsInput),
          focusRegexes: parseCommaSeparated(focusRegexesInput),
          origin: window.location.origin,
        },
        {
          onUploadProgress: (progress) => setUploadProgress(progress),
        },
      ) as { jobId: string } | undefined;

      setSubmitPhase("starting");
      setUploadProgress(100);

      if (!createdJob?.jobId) {
        throw new Error("A análise foi iniciada, mas o identificador do job não foi retornado corretamente.");
      }

      toast.success("Job enviado para a fila de análise.");
      setSelectedFile(null);
      setSelectedJobId(createdJob.jobId);
      setActiveTab("queue");
      if (isAdmin) {
        await resumeSyncMutation.mutateAsync();
      }
      await utils.analysis.list.invalidate();
      await utils.analysis.detail.invalidate({ jobId: createdJob.jobId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao iniciar a análise.";
      setSubmissionError(message);
      toast.error(message);
    } finally {
      setSubmitPhase("idle");
      setUploadProgress(0);
    }
  }

  return (
    <DashboardLayout>
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(180deg,rgba(7,12,24,0.96),rgba(3,6,16,0.98))] text-slate-100 shadow-[0_30px_120px_rgba(6,12,28,0.55)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(56,189,248,0.06),transparent_40%,rgba(14,165,233,0.08))]" />
        <div className="container relative flex flex-col gap-8 py-8 lg:py-10">
          <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
            <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
              <CardHeader className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-3 max-w-3xl">
                    <Badge className="bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-300/20">
                      Centro de comando analítico
                    </Badge>
                    <CardTitle className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                      Integração em tempo real com o pipeline legado de correlação CDF
                    </CardTitle>
                    <CardDescription className="max-w-2xl text-base leading-7 text-slate-300">
                      Envie pacotes 7z, acompanhe estágios, logs e artefatos em tempo real, visualize o fluxo de correlação e receba resumo interpretativo, notificação operacional e versionamento automático no repositório configurado.
                    </CardDescription>
                  </div>
                  <div className="grid min-w-[230px] gap-3 rounded-2xl border border-cyan-400/10 bg-slate-950/60 p-4 shadow-inner shadow-cyan-950/30">
                    <div className="flex items-center gap-3 text-sm text-slate-300">
                      <ShieldCheck className="h-4 w-4 text-cyan-300" />
                      Perfil atual: {isAdmin ? "Administrador operacional" : "Analista de triagem"}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-300">
                      <TerminalSquare className="h-4 w-4 text-cyan-300" />
                      Captura contínua de stdout e stderr por job
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-300">
                      <GitCommitHorizontal className="h-4 w-4 text-cyan-300" />
                      Commit e trilha operacional ao final do processamento
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-300">
                      <Radar className="h-4 w-4 text-cyan-300" />
                      Stream SSE {streamStatus === "live" ? "ao vivo" : streamStatus === "connecting" ? "conectando" : streamStatus === "degraded" ? "em reconexão" : "inativo"}
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      title: "Jobs no histórico",
                      value: String(metrics.total),
                      caption: "Base pronta para auditoria e reaproveitamento de resultados.",
                      icon: FileSearch,
                      tone: "primary" as const,
                    },
                    {
                      title: "Fila ativa",
                      value: String(metrics.active),
                      caption: "Sincronização contínua com o pipeline legado.",
                      icon: Activity,
                      tone: "warning" as const,
                    },
                    {
                      title: "Concluídos",
                      value: String(metrics.completed),
                      caption: "Jobs com resumo e artefatos consolidados.",
                      icon: CheckCircle2,
                      tone: "success" as const,
                    },
                    {
                      title: "Progresso médio",
                      value: formatPercent(metrics.avgProgress),
                      caption: metrics.failed > 0 ? `${metrics.failed} falha(s) observada(s) no histórico recente.` : "Sem falhas registradas entre os últimos itens listados.",
                      icon: Radar,
                      tone: "neutral" as const,
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className={`rounded-2xl border border-white/10 bg-gradient-to-br ${metricTone(item.tone)} p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)]`}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-sm text-slate-300">{item.title}</span>
                        <item.icon className="h-4 w-4 text-cyan-200" />
                      </div>
                      <div className="text-3xl font-semibold tracking-tight text-white">{item.value}</div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{item.caption}</p>
                    </div>
                  ))}
                </div>
              </CardHeader>
            </Card>

            <Card className="border-white/10 bg-slate-950/80 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl text-white">Atividade operacional imediata</CardTitle>
                <CardDescription className="text-slate-400">
                  Acompanhe o status mais recente sem sair da tela principal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeJobs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-slate-300">
                    Nenhum job ativo no momento. Você pode iniciar uma nova submissão e a fila será retomada automaticamente neste painel.
                  </div>
                ) : (
                  activeJobs.slice(0, 3).map((job) => (
                    <button
                      key={job.jobId}
                      type="button"
                      onClick={() => {
                        setSelectedJobId(job.jobId);
                        setActiveTab("queue");
                      }}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-cyan-400/30 hover:bg-cyan-500/5"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">{job.sampleName}</p>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{job.focusFunction}</p>
                        </div>
                        <Badge className={statusClasses(job.status)}>{job.status}</Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>{job.stage}</span>
                          <span>{formatPercent(job.progress)}</span>
                        </div>
                        <Progress value={job.progress ?? 0} className="h-2 bg-white/10" />
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{job.message || "Sincronizando estado do job com o pipeline..."}</p>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </section>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid h-auto grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 lg:grid-cols-5">
              <TabsTrigger value="overview" className="rounded-xl data-[state=active]:bg-cyan-500/15 data-[state=active]:text-white">
                Visão executiva
              </TabsTrigger>
              <TabsTrigger value="submission" className="rounded-xl data-[state=active]:bg-cyan-500/15 data-[state=active]:text-white">
                Nova submissão
              </TabsTrigger>
              <TabsTrigger value="queue" className="rounded-xl data-[state=active]:bg-cyan-500/15 data-[state=active]:text-white">
                Tempo real
              </TabsTrigger>
              <TabsTrigger value="results" className="rounded-xl data-[state=active]:bg-cyan-500/15 data-[state=active]:text-white">
                Resultados
              </TabsTrigger>
              <TabsTrigger value="compare" className="rounded-xl data-[state=active]:bg-cyan-500/15 data-[state=active]:text-white">
                Comparação
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-white">Histórico filtrável de análises</CardTitle>
                  <CardDescription className="text-slate-400">
                    Selecione qualquer execução para abrir os detalhes completos, artefatos e logs consolidados.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-[1fr_1fr_220px_auto]">
                    <Input
                      value={sampleNameFilter}
                      onChange={(event) => setSampleNameFilter(event.target.value)}
                      placeholder="Filtrar por amostra"
                      className="border-white/10 bg-slate-950/60 text-slate-100 placeholder:text-slate-500"
                    />
                    <Input
                      value={focusFilter}
                      onChange={(event) => setFocusFilter(event.target.value)}
                      placeholder="Filtrar por função"
                      className="border-white/10 bg-slate-950/60 text-slate-100 placeholder:text-slate-500"
                    />
                    <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusValue)}>
                      <SelectTrigger className="border-white/10 bg-slate-950/60 text-slate-100">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os status</SelectItem>
                        <SelectItem value="queued">Queued</SelectItem>
                        <SelectItem value="running">Running</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"
                      onClick={() => jobsQuery.refetch()}
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" /> Atualizar
                    </Button>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                          <TableHead>Amostra</TableHead>
                          <TableHead>Foco</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Progresso</TableHead>
                          <TableHead>Criado em</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jobs.map((job) => (
                          <TableRow
                            key={job.jobId}
                            className="cursor-pointer border-white/10 hover:bg-cyan-500/5"
                            onClick={() => {
                              setSelectedJobId(job.jobId);
                              setActiveTab("results");
                            }}
                          >
                            <TableCell>
                              <div>
                                <div className="font-medium text-slate-100">{job.sampleName}</div>
                                <div className="text-xs text-slate-500">{job.jobId}</div>
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-300">{job.focusFunction}</TableCell>
                            <TableCell><Badge className={statusClasses(job.status)}>{job.status}</Badge></TableCell>
                            <TableCell className="w-[180px]">
                              <div className="space-y-2">
                                <Progress value={job.progress ?? 0} className="h-2 bg-white/10" />
                                <div className="text-xs text-slate-400">{formatPercent(job.progress)}</div>
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-400">{formatDateTime(job.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                        {jobs.length === 0 ? (
                          <TableRow className="border-white/10 hover:bg-transparent">
                            <TableCell colSpan={5} className="py-12 text-center text-slate-400">
                              Nenhum job encontrado com os filtros aplicados.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-white">Último job selecionado</CardTitle>
                  <CardDescription className="text-slate-400">
                    Resumo operacional para orientar a triagem antes do mergulho técnico.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedDetail?.job ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Amostra</div>
                          <div className="mt-2 text-lg font-medium text-white">{selectedDetail.job.sampleName}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Função-alvo</div>
                          <div className="mt-2 text-lg font-medium text-white">{selectedDetail.job.focusFunction}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Estado</div>
                          <div className="mt-2"><Badge className={statusClasses(selectedDetail.job.status)}>{selectedDetail.job.status}</Badge></div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Última atualização</div>
                          <div className="mt-2 text-lg font-medium text-white">{formatDateTime(selectedDetail.job.updatedAt)}</div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-cyan-400/10 bg-cyan-500/5 p-4 text-sm leading-7 text-slate-300">
                        {selectedDetail.job.message || "O backend ainda está consolidando dados adicionais deste job."}
                      </div>
                      {selectedDetail.insight?.summaryMarkdown ? (
                        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-cyan-200">
                            <FileSearch className="h-4 w-4" /> Resumo interpretativo
                          </div>
                          <div className="prose prose-invert max-w-none prose-p:text-slate-300 prose-strong:text-white prose-headings:text-white">
                            <Streamdown>{selectedDetail.insight.summaryMarkdown}</Streamdown>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">
                          O resumo interpretativo será exibido quando o JSON de correlação estiver disponível e o enriquecimento via LLM for concluído.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm leading-7 text-slate-400">
                      Selecione um job no histórico para abrir o painel de resultados consolidados.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="submission" className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
              <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-white">Nova submissão de análise</CardTitle>
                  <CardDescription className="text-slate-400">
                    O pacote 7z é enviado para o armazenamento seguro, despachado ao pipeline Python e acompanhado automaticamente por esta aplicação.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-200">Pacote compactado</label>
                      <div className="rounded-2xl border border-dashed border-cyan-400/20 bg-slate-950/60 p-4">
                        <Input
                          type="file"
                          accept=".7z"
                          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                          className="border-white/10 bg-slate-950/70 text-slate-100 file:text-slate-200"
                        />
                        <p className="mt-3 text-sm text-slate-400">
                          Limite operacional atual: {Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024))} MB. O envio agora usa upload multipart, evitando a sobrecarga do transporte em base64 e retornando JSON explícito em caso de falha.
                        </p>
                        {selectedFile ? (
                          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
                            <div className="flex items-center gap-2 font-medium text-white">
                              <FileArchive className="h-4 w-4 text-cyan-300" /> {selectedFile.name}
                            </div>
                            <div className="mt-2 text-slate-400">{formatBytes(selectedFile.size)}</div>
                          </div>
                        ) : null}
                        {submissionError ? (
                          <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm leading-6 text-rose-100">
                            {submissionError}
                          </div>
                        ) : null}
                        {isSubmittingJob ? (
                          <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3 text-sm text-cyan-50">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <span>{submitPhase === "uploading" ? "Enviando arquivo para o backend web..." : "Upload concluído. Criando job e sincronizando a fila..."}</span>
                              <span>{submitPhase === "uploading" ? formatPercent(uploadProgress) : "100%"}</span>
                            </div>
                            <Progress value={submitPhase === "uploading" ? uploadProgress : 100} className="h-2 bg-cyan-950/40" />
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-200">Função de interesse</label>
                      <Input
                        value={focusFunction}
                        onChange={(event) => setFocusFunction(event.target.value)}
                        placeholder="Ex.: IsDebuggerPresent"
                        className="border-white/10 bg-slate-950/60 text-slate-100 placeholder:text-slate-500"
                      />
                      <p className="text-sm leading-6 text-slate-400">
                        Esse valor é usado tanto para a submissão quanto para a organização do histórico e das notificações ao final do job.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-200">Termos de foco</label>
                      <Textarea
                        value={focusTermsInput}
                        onChange={(event) => setFocusTermsInput(event.target.value)}
                        rows={5}
                        className="border-white/10 bg-slate-950/60 text-slate-100 placeholder:text-slate-500"
                        placeholder="Separe os termos por vírgula"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-200">Expressões regulares</label>
                      <Textarea
                        value={focusRegexesInput}
                        onChange={(event) => setFocusRegexesInput(event.target.value)}
                        rows={5}
                        className="border-white/10 bg-slate-950/60 text-slate-100 placeholder:text-slate-500"
                        placeholder="Separe as expressões por vírgula"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={handleSubmitJob}
                      disabled={isSubmittingJob || !auth.isAuthenticated}
                      className="rounded-xl bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                    >
                      {isSubmittingJob ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <UploadCloud className="mr-2 h-4 w-4" />
                      )}
                      {isSubmittingJob ? "Enviando..." : "Iniciar análise"}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"
                      onClick={() => {
                        setSelectedFile(null);
                        setSubmissionError(null);
                        setUploadProgress(0);
                        setSubmitPhase("idle");
                        setFocusFunction("IsDebuggerPresent");
                        setFocusTermsInput("IsDebuggerPresent, VirtualProtect, CreateRemoteThread");
                        setFocusRegexesInput("Zw.*InformationProcess, Nt.*QuerySystemInformation");
                      }}
                    >
                      Restaurar parâmetros
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-white">O que acontece após o envio</CardTitle>
                  <CardDescription className="text-slate-400">
                    A aplicação opera como fachada de observabilidade e orquestração sobre o backend legado.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm leading-7 text-slate-300">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                    <p className="font-medium text-white">1. Ingestão controlada</p>
                    <p>O arquivo é validado, persistido em armazenamento externo e associado a um job interno para rastreabilidade.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                    <p className="font-medium text-white">2. Execução assistida</p>
                    <p>O pipeline Python recebe os parâmetros, expõe progresso incremental e publica artefatos que são sincronizados para o dashboard.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                    <p className="font-medium text-white">3. Consolidação operacional</p>
                    <p>Ao concluir, a plataforma gera resumo por LLM, envia notificação ao proprietário e prepara o commit dos artefatos no repositório configurado.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="queue" className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-white">Fila e sincronização em tempo real</CardTitle>
                  <CardDescription className="text-slate-400">
                    Selecione um job para acompanhar progresso, estágio corrente e trechos recentes dos logs operacionais.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {jobs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-5 text-sm text-slate-400">
                      Ainda não há jobs cadastrados. Inicie uma submissão para ativar a fila monitorada.
                    </div>
                  ) : (
                    jobs.slice(0, 12).map((job) => (
                      <button
                        key={job.jobId}
                        type="button"
                        onClick={() => setSelectedJobId(job.jobId)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${selectedJobId === job.jobId ? "border-cyan-400/30 bg-cyan-500/8" : "border-white/10 bg-slate-950/60 hover:border-white/20"}`}
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-white">{job.sampleName}</div>
                            <div className="text-xs tracking-[0.16em] text-slate-500 uppercase">{job.focusFunction}</div>
                          </div>
                          <Badge className={statusClasses(job.status)}>{job.status}</Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>{job.stage}</span>
                            <span>{formatPercent(job.progress)}</span>
                          </div>
                          <Progress value={job.progress ?? 0} className="h-2 bg-white/10" />
                        </div>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div>
                      <CardTitle className="text-white">Telemetria do job selecionado</CardTitle>
                      <CardDescription className="text-slate-400">
                        O painel principal agora consome snapshots contínuos via SSE, reduzindo polling no cliente e refletindo progresso, estágio e logs à medida que o backend persiste novos eventos.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={streamStatus === "live" ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/20" : streamStatus === "connecting" ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/20" : streamStatus === "degraded" ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/20" : "bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/20"}>
                        SSE {streamStatus === "live" ? "ao vivo" : streamStatus === "connecting" ? "conectando" : streamStatus === "degraded" ? "reconectando" : "offline"}
                      </Badge>
                      <Badge className={isAdmin ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/20" : "bg-white/10 text-slate-200 ring-1 ring-white/10"}>
                        {isAdmin ? "Ações administrativas habilitadas" : "Modo de triagem com controles críticos bloqueados"}
                      </Badge>
                    </div>
                    {streamError ? (
                      <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                        {streamError}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {isAdmin ? (
                      <>
                        <Button
                          variant="outline"
                          disabled={resumeSyncMutation.isPending}
                          onClick={async () => {
                            await resumeSyncMutation.mutateAsync();
                            await utils.analysis.list.invalidate();
                          }}
                          className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"
                        >
                          {resumeSyncMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
                          Retomar acompanhamento
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!selectedJobId || syncJobMutation.isPending}
                          onClick={async () => {
                            if (!selectedJobId) return;
                            const result = await syncJobMutation.mutateAsync({ jobId: selectedJobId }) as { job: { jobId: string } };
                            await utils.analysis.detail.invalidate({ jobId: result.job.jobId });
                            await utils.analysis.list.invalidate();
                          }}
                          className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"
                        >
                          {syncJobMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="mr-2 h-4 w-4" />
                          )}
                          Sincronizar agora
                        </Button>
                      </>
                    ) : (
                      <div className="max-w-sm rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-slate-300">
                        Analistas acompanham a execução em tempo real, mas a retomada e a sincronização forçada ficam restritas ao perfil administrativo.
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedDetail?.job ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Status</div>
                          <div className="mt-2"><Badge className={statusClasses(selectedDetail.job.status)}>{selectedDetail.job.status}</Badge></div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Estágio</div>
                          <div className="mt-2 text-lg font-medium text-white">{selectedDetail.job.stage}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Criado em</div>
                          <div className="mt-2 text-lg font-medium text-white">{formatDateTime(selectedDetail.job.createdAt)}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Progresso</div>
                          <div className="mt-2 text-lg font-medium text-white">{formatPercent(selectedDetail.job.progress)}</div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                        <div className="mb-3 flex items-center justify-between text-sm text-slate-400">
                          <span>{selectedDetail.job.message || "Aguardando próxima atualização do pipeline."}</span>
                          <span>{formatPercent(selectedDetail.job.progress)}</span>
                        </div>
                        <Progress value={selectedDetail.job.progress ?? 0} className="h-2 bg-white/10" />
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-cyan-200">
                            <TerminalSquare className="h-4 w-4" /> stdout recente
                          </div>
                          <ScrollArea className="h-[240px] rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs leading-6 text-emerald-200">
                            <pre className="whitespace-pre-wrap break-words">{selectedDetail.job.stdoutTail || "Nenhum trecho de stdout disponível até o momento."}</pre>
                          </ScrollArea>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-rose-200">
                            <TerminalSquare className="h-4 w-4" /> stderr recente
                          </div>
                          <ScrollArea className="h-[240px] rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs leading-6 text-rose-200">
                            <pre className="whitespace-pre-wrap break-words">{selectedDetail.job.stderrTail || "Nenhum trecho de stderr disponível até o momento."}</pre>
                          </ScrollArea>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm text-slate-400">
                      Selecione um job para observar os logs progressivos e o status de execução em tempo real.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="compare" className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-white">Seleção de jobs para comparação</CardTitle>
                  <CardDescription className="text-slate-400">
                    Escolha um job de referência e outro job concluído ou em andamento para contrastar foco analítico, tamanho do grafo, artefatos publicados e interseções estruturais.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Job base</div>
                    <div className="mt-2 text-lg font-medium text-white">{selectedDetail?.job?.sampleName || "Selecione um job na fila ou no histórico"}</div>
                    <div className="mt-2 text-sm text-slate-300">{selectedDetail?.job?.focusFunction || "Sem função focal definida"}</div>
                  </div>
                  <div className="space-y-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Comparar com</div>
                    {compareCandidates.length > 0 ? compareCandidates.slice(0, 8).map((job: any) => (
                      <button
                        key={job.jobId}
                        type="button"
                        onClick={() => setCompareJobId(job.jobId)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${compareJobId === job.jobId ? "border-cyan-400/30 bg-cyan-500/8" : "border-white/10 bg-slate-950/60 hover:border-white/20"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-white">{job.sampleName}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{job.focusFunction}</div>
                          </div>
                          <Badge className={statusClasses(job.status)}>{job.status}</Badge>
                        </div>
                        <div className="mt-3 text-sm text-slate-400">{job.message || "Sem mensagem operacional publicada."}</div>
                      </button>
                    )) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-5 text-sm text-slate-400">
                        É necessário haver pelo menos dois jobs no histórico para habilitar a comparação lado a lado.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-white">Matriz comparativa</CardTitle>
                  <CardDescription className="text-slate-400">
                    A matriz evidencia convergências entre funções correlacionadas, artefatos emitidos e densidade do grafo para acelerar triagem e revisão entre amostras.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {comparisonSummary && compareDetail?.job && selectedDetail?.job ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Nós do job base</div>
                          <div className="mt-2 text-2xl font-semibold text-white">{comparisonSummary.selectedNodeCount}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Nós do comparado</div>
                          <div className="mt-2 text-2xl font-semibold text-white">{comparisonSummary.compareNodeCount}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Arestas do job base</div>
                          <div className="mt-2 text-2xl font-semibold text-white">{comparisonSummary.selectedEdgeCount}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Arestas do comparado</div>
                          <div className="mt-2 text-2xl font-semibold text-white">{comparisonSummary.compareEdgeCount}</div>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Função focal</div>
                              <div className="mt-2 text-lg font-medium text-white">{selectedDetail.job.focusFunction}</div>
                            </div>
                            <Badge className={comparisonSummary.sameFocusFunction ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/20" : "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/20"}>
                              {comparisonSummary.sameFocusFunction ? "Foco coincidente" : "Focos diferentes"}
                            </Badge>
                          </div>
                          <div className="text-sm leading-7 text-slate-300">
                            Base: <span className="font-medium text-white">{selectedDetail.job.sampleName}</span><br />
                            Comparado: <span className="font-medium text-white">{compareDetail.job.sampleName}</span>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Artefatos compartilhados</div>
                          <div className="mt-2 text-2xl font-semibold text-white">{comparisonSummary.sharedArtifacts.length}</div>
                          <div className="mt-2 text-sm text-slate-400">A sobreposição considera caminhos relativos publicados pela orquestração web.</div>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <div className="mb-3 text-sm font-medium text-cyan-200">Funções compartilhadas</div>
                          <ScrollArea className="h-[220px] rounded-xl border border-white/10 bg-black/30 p-3">
                            <div className="space-y-2 text-sm text-slate-300">
                              {comparisonSummary.sharedFunctions.length > 0 ? comparisonSummary.sharedFunctions.map((nodeId: string) => (
                                <div key={nodeId} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">{nodeId}</div>
                              )) : <div className="text-slate-500">Nenhum nó compartilhado foi identificado até o momento.</div>}
                            </div>
                          </ScrollArea>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                          <div className="mb-3 text-sm font-medium text-cyan-200">Artefatos com mesmo caminho relativo</div>
                          <ScrollArea className="h-[220px] rounded-xl border border-white/10 bg-black/30 p-3">
                            <div className="space-y-2 text-sm text-slate-300">
                              {comparisonSummary.sharedArtifacts.length > 0 ? comparisonSummary.sharedArtifacts.map((artifactPath: string) => (
                                <div key={artifactPath} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">{artifactPath}</div>
                              )) : <div className="text-slate-500">Ainda não há artefatos equivalentes entre os dois jobs.</div>}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm leading-7 text-slate-400">
                      Selecione um job base e um segundo job para habilitar a matriz comparativa de grafo, artefatos e foco analítico.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="results" className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-6">
                <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="text-white">Fluxo de correlação</CardTitle>
                    <CardDescription className="text-slate-400">
                      Visualização interativa dos nós e relações encontrados a partir do JSON de correlação consolidado.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {positionedNodes.length > 0 ? (
                      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                          <svg viewBox="0 0 640 380" className="h-[380px] w-full">
                            {visibleEdges.map((edge, index) => {
                              const source = positionedNodes.find((node) => node.id === edge.source);
                              const target = positionedNodes.find((node) => node.id === edge.target);
                              if (!source || !target) return null;
                              const emphasized = !highlightedNodeId || edge.source === highlightedNodeId || edge.target === highlightedNodeId;
                              return (
                                <g key={`${edge.source}-${edge.target}-${index}`}>
                                  <line
                                    x1={source.x}
                                    y1={source.y}
                                    x2={target.x}
                                    y2={target.y}
                                    stroke={emphasized ? "rgba(34,211,238,0.8)" : "rgba(148,163,184,0.22)"}
                                    strokeWidth={emphasized ? 2.4 : 1.2}
                                  />
                                  <text
                                    x={(source.x + target.x) / 2}
                                    y={(source.y + target.y) / 2 - 6}
                                    fill="rgba(148,163,184,0.85)"
                                    fontSize="11"
                                    textAnchor="middle"
                                  >
                                    {edge.relation || "relates_to"}
                                  </text>
                                </g>
                              );
                            })}
                            {positionedNodes.map((node) => {
                              const active = selectedGraphNode?.id === node.id;
                              return (
                                <g key={node.id} onClick={() => setHighlightedNodeId(node.id)} className="cursor-pointer">
                                  <circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={active ? 20 : 15}
                                    fill={active ? "rgba(34,211,238,0.88)" : "rgba(15,23,42,0.98)"}
                                    stroke={active ? "rgba(224,242,254,0.95)" : "rgba(34,211,238,0.35)"}
                                    strokeWidth={active ? 2.5 : 1.5}
                                  />
                                  <text x={node.x} y={node.y + 4} fill={active ? "#020617" : "#e2e8f0"} fontSize="10" textAnchor="middle">
                                    {node.kind?.slice(0, 3)?.toUpperCase() || "FUN"}
                                  </text>
                                  <text x={node.x} y={node.y + 32} fill="rgba(226,232,240,0.92)" fontSize="11" textAnchor="middle">
                                    {(node.label || node.id).slice(0, 18)}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm text-slate-400">Nó destacado</p>
                              <h3 className="text-lg font-medium text-white">{selectedGraphNode?.label || selectedGraphNode?.id || "Sem seleção"}</h3>
                            </div>
                            <Button
                              variant="outline"
                              className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"
                              onClick={() => setHighlightedNodeId(null)}
                            >
                              Limpar foco
                            </Button>
                          </div>
                          <div className="space-y-3 text-sm text-slate-300">
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Tipo</div>
                              <div className="mt-2">{selectedGraphNode?.kind || "function"}</div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Conexões visíveis</div>
                              <div className="mt-2">{visibleEdges.length}</div>
                            </div>
                            <ScrollArea className="h-[190px] rounded-xl border border-white/10 bg-white/[0.03] p-3">
                              <div className="space-y-2">
                                {visibleEdges.map((edge, index) => (
                                  <div key={`${edge.source}-${edge.target}-${index}`} className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Relação</div>
                                    <div className="mt-1 font-medium text-white">{edge.source} → {edge.target}</div>
                                    <div className="mt-2 text-slate-400">{edge.evidence || edge.relation || "Sem evidência textual consolidada."}</div>
                                  </div>
                                ))}
                                {visibleEdges.length === 0 ? (
                                  <div className="text-sm text-slate-500">Nenhuma aresta correspondente ao foco atual.</div>
                                ) : null}
                              </div>
                            </ScrollArea>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-sm leading-7 text-slate-400">
                        O grafo interativo será exibido assim que o job selecionado publicar um artefato JSON com nós e arestas, ou um fluxo correlacionado convertível para esse formato.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="text-white">Tabela de correlações</CardTitle>
                    <CardDescription className="text-slate-400">
                      Relações detectadas e respectivas evidências presentes no artefato consolidado do job.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/10 hover:bg-transparent">
                            <TableHead>Origem</TableHead>
                            <TableHead>Destino</TableHead>
                            <TableHead>Relação</TableHead>
                            <TableHead>Peso</TableHead>
                            <TableHead>Evidência</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {graphEdges.map((edge, index) => (
                            <TableRow key={`${edge.source}-${edge.target}-${index}`} className="border-white/10 hover:bg-white/[0.03]">
                              <TableCell className="text-slate-200">{edge.source}</TableCell>
                              <TableCell className="text-slate-200">{edge.target}</TableCell>
                              <TableCell className="text-slate-300">{edge.relation || "correlates_with"}</TableCell>
                              <TableCell className="text-slate-400">{edge.weight ?? "—"}</TableCell>
                              <TableCell className="max-w-[280px] text-slate-400">{edge.evidence || "—"}</TableCell>
                            </TableRow>
                          ))}
                          {graphEdges.length === 0 ? (
                            <TableRow className="border-white/10 hover:bg-transparent">
                              <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                                Ainda não há correlações estruturadas para este job.
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="text-white">Artefatos publicados</CardTitle>
                    <CardDescription className="text-slate-400">
                      Acesso direto a JSON, Markdown, DOCX e demais saídas sincronizadas pelo orquestrador web.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      {[
                        { label: "Exportar JSON", artifact: jsonArtifact },
                        { label: "Exportar Markdown", artifact: markdownArtifact },
                        { label: "Exportar DOCX", artifact: docxArtifact },
                      ].map((item) => (
                        item.artifact?.storageUrl ? (
                          <a
                            key={item.label}
                            href={item.artifact.storageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-2xl border border-cyan-400/20 bg-cyan-500/8 p-4 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/12"
                          >
                            {item.label}
                            <div className="mt-2 text-xs font-normal text-cyan-200/80">{item.artifact.relativePath}</div>
                          </a>
                        ) : (
                          <div
                            key={item.label}
                            className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-4 text-sm text-slate-500"
                          >
                            {item.label}
                            <div className="mt-2 text-xs text-slate-500">Formato ainda não disponível para este job.</div>
                          </div>
                        )
                      ))}
                    </div>
                    {selectedDetail?.artifacts?.map((artifact: any) => (
                      <a
                        key={artifact.id}
                        href={artifact.storageUrl || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-2xl border border-white/10 bg-slate-950/60 p-4 transition hover:border-cyan-400/30 hover:bg-cyan-500/5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 text-white">
                              <FileJson2 className="h-4 w-4 text-cyan-300" />
                              <span className="font-medium">{artifact.label}</span>
                            </div>
                            <div className="mt-2 text-sm text-slate-400">{artifact.relativePath}</div>
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-slate-500" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                          <span>{artifact.artifactType || "artifact"}</span>
                          <span>{formatBytes(artifact.sizeBytes)}</span>
                          {artifact.mimeType ? <span>{artifact.mimeType}</span> : null}
                        </div>
                      </a>
                    ))}
                    {!selectedDetail?.artifacts?.length ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-5 text-sm text-slate-500">
                        Os links de artefatos serão exibidos quando o backend finalizar a sincronização da saída do pipeline.
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="text-white">Notificação e commit</CardTitle>
                    <CardDescription className="text-slate-400">
                      Estado da etapa operacional que consolida a análise para auditoria e versionamento.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Resumo LLM</div>
                          <div className="mt-2 text-lg font-medium text-white">{selectedDetail?.job?.llmSummaryStatus || "pending"}</div>
                        </div>
                        <Badge className={statusClasses(selectedDetail?.job?.llmSummaryStatus)}>{selectedDetail?.job?.llmSummaryStatus || "pending"}</Badge>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Commit</div>
                          <div className="mt-2 text-lg font-medium text-white">{selectedDetail?.commit?.status || selectedDetail?.job?.commitStatus || "pending"}</div>
                        </div>
                        <Badge className={statusClasses(selectedDetail?.commit?.status || selectedDetail?.job?.commitStatus)}>
                          {selectedDetail?.commit?.status || selectedDetail?.job?.commitStatus || "pending"}
                        </Badge>
                      </div>
                      <Separator className="my-4 bg-white/10" />
                      <div className="space-y-3 text-sm text-slate-300">
                        <div className="flex items-start gap-3">
                          <GitCommitHorizontal className="mt-0.5 h-4 w-4 text-cyan-300" />
                          <div>
                            <div className="font-medium text-white">Repositório</div>
                            <div className="text-slate-400">{selectedDetail?.commit?.repository || "Configuração padrão do pipeline"}</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Link2 className="mt-0.5 h-4 w-4 text-cyan-300" />
                          <div>
                            <div className="font-medium text-white">Commit SHA</div>
                            <div className="text-slate-400">{selectedDetail?.commit?.commitHash || "Aguardando execução"}</div>
                          </div>
                        </div>
                        {selectedDetail?.commit?.repository && selectedDetail?.commit?.commitHash ? (
                          <a
                            href={`https://github.com/${selectedDetail.commit.repository}/commit/${selectedDetail.commit.commitHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-cyan-200 underline-offset-4 hover:underline"
                          >
                            Abrir commit no GitHub <ArrowUpRight className="h-4 w-4" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
