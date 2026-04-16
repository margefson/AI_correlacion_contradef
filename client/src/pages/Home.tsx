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
import {
  CHUNK_UPLOAD_HARD_MAX_BYTES,
  CHUNK_UPLOAD_MAX_BYTES,
  GATEWAY_SINGLE_REQUEST_MAX_BYTES,
  inspectAnalysisArchive,
  MAX_ARCHIVE_BYTES,
  MAX_BATCH_UPLOAD_FILES,
  uploadAnalysisArchiveBatch,
  type UploadRetryStage,
} from "@/lib/analysisUpload";
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
type JobSortValue = "newest" | "oldest" | "progress_desc" | "status";

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

type UploadQueueStatus = "validated" | "invalid" | "uploading" | "starting" | "completed" | "error";

type UploadStageTelemetry = Record<UploadRetryStage, number>;

type UploadQueueItem = {
  id: string;
  file: File;
  status: UploadQueueStatus;
  progress: number;
  message: string;
  remainingBytes: number;
  chunkCount: number;
  usesChunkedTransport: boolean;
  maxPartBytes: number;
  failureTelemetry: UploadStageTelemetry;
  jobId?: string;
  bytesTransferred: number;
  estimatedThroughputBps?: number;
  estimatedEtaSeconds?: number | null;
  startedAt?: number;
  lastProgressAt?: number;
  lastProgressBytes?: number;
  lastFailedStage?: UploadRetryStage | null;
  allowManualRetry?: boolean;
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

function uploadQueueStatusLabel(status: UploadQueueStatus) {
  switch (status) {
    case "validated":
      return "Validado";
    case "invalid":
      return "Bloqueado";
    case "uploading":
      return "Enviando";
    case "starting":
      return "Criando job";
    case "completed":
      return "Concluído";
    case "error":
      return "Falhou";
    default:
      return "Aguardando";
  }
}

function uploadQueueStatusClasses(status: UploadQueueStatus) {
  switch (status) {
    case "validated":
      return "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/20";
    case "invalid":
      return "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/20";
    case "uploading":
      return "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/20";
    case "starting":
      return "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-400/20";
    case "completed":
      return "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/20";
    case "error":
      return "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/20";
    default:
      return "bg-white/10 text-white ring-1 ring-white/10";
  }
}

function createEmptyUploadStageTelemetry(): UploadStageTelemetry {
  return {
    session: 0,
    chunk: 0,
    complete: 0,
  };
}

function uploadRetryStageLabel(stage: UploadRetryStage) {
  switch (stage) {
    case "session":
      return "retomando a sessão segura de upload";
    case "chunk":
      return "reenviando a parte interrompida";
    case "complete":
      return "confirmando a criação final do job";
    default:
      return "retomando a transferência";
  }
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

function formatEtaSeconds(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "calculando";
  if (value < 60) return `${Math.ceil(value)} s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.ceil(value % 60);
  return `${minutes} min ${seconds.toString().padStart(2, "0")} s`;
}

function formatThroughput(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  return `${formatBytes(value)}/s`;
}

function parseCommaSeparated(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildUploadQueueId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
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
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [focusFunction, setFocusFunction] = useState("IsDebuggerPresent");
  const [focusTermsInput, setFocusTermsInput] = useState("IsDebuggerPresent, VirtualProtect, CreateRemoteThread");
  const [focusRegexesInput, setFocusRegexesInput] = useState("Zw.*InformationProcess, Nt.*QuerySystemInformation");
  const [sampleNameFilter, setSampleNameFilter] = useState("");
  const [focusFilter, setFocusFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusValue>("all");
  const [jobSort, setJobSort] = useState<JobSortValue>("newest");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [compareJobId, setCompareJobId] = useState<string | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeUploadLabel, setActiveUploadLabel] = useState<string | null>(null);
  const [submitPhase, setSubmitPhase] = useState<"idle" | "validating" | "uploading" | "starting">("idle");
  const [liveJobs, setLiveJobs] = useState<Array<Record<string, any>> | null>(null);
  const [liveDetail, setLiveDetail] = useState<any | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("offline");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [telemetryFilter, setTelemetryFilter] = useState("");

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
  const sortedJobs = useMemo(() => {
    const statusOrder: Record<string, number> = {
      running: 0,
      queued: 1,
      failed: 2,
      completed: 3,
      cancelled: 4,
    };

    const timestampValue = (job: Record<string, any>) => {
      const raw = job.updatedAt ?? job.updated_at ?? job.createdAt ?? job.created_at;
      const value = raw ? new Date(raw).getTime() : 0;
      return Number.isFinite(value) ? value : 0;
    };

    return [...jobs].sort((left, right) => {
      if (jobSort === "oldest") return timestampValue(left) - timestampValue(right);
      if (jobSort === "progress_desc") {
        const progressDiff = Number(right.progress ?? 0) - Number(left.progress ?? 0);
        if (progressDiff !== 0) return progressDiff;
        return timestampValue(right) - timestampValue(left);
      }
      if (jobSort === "status") {
        const statusDiff = (statusOrder[String(left.status)] ?? 99) - (statusOrder[String(right.status)] ?? 99);
        if (statusDiff !== 0) return statusDiff;
        return timestampValue(right) - timestampValue(left);
      }
      return timestampValue(right) - timestampValue(left);
    });
  }, [jobSort, jobs]);

  useEffect(() => {
    const firstJobId = sortedJobs[0]?.jobId;
    if (!selectedJobId && firstJobId) {
      setSelectedJobId(firstJobId);
    }
  }, [selectedJobId, sortedJobs]);

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

  const aggregatedMetrics = useMemo(() => {
    const sampleCounts = new Map<string, number>();
    const functionCounts = new Map<string, number>();
    const stalledJobs = jobs.filter((job) => {
      if (!["queued", "running"].includes(String(job.status))) return false;
      const reference = job.updatedAt ?? job.updated_at ?? job.lastEventAt ?? job.createdAt ?? job.created_at;
      const timestamp = reference ? new Date(reference).getTime() : Number.NaN;
      return Number.isFinite(timestamp) && Date.now() - timestamp > 10 * 60 * 1000;
    });

    for (const job of jobs) {
      const sampleName = String(job.sampleName ?? job.sample_name ?? "Sem amostra definida").trim() || "Sem amostra definida";
      const focusName = String(job.focusFunction ?? job.focus_function ?? "Sem função declarada").trim() || "Sem função declarada";
      sampleCounts.set(sampleName, (sampleCounts.get(sampleName) ?? 0) + 1);
      functionCounts.set(focusName, (functionCounts.get(focusName) ?? 0) + 1);
    }

    const sortEntries = (entries: Map<string, number>) => Array.from(entries.entries()).sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0], "pt-BR");
    });

    return {
      distinctSamples: sampleCounts.size,
      distinctFunctions: functionCounts.size,
      topSample: sortEntries(sampleCounts)[0] ?? null,
      topFunction: sortEntries(functionCounts)[0] ?? null,
      stalledJobs: stalledJobs.slice(0, 3),
    };
  }, [jobs]);

  const primaryArtifacts = (selectedDetail?.artifacts ?? []).filter(
    (artifact: any) => !artifact.relativePath.includes("output/function_flows/"),
  );
  const jsonArtifact = primaryArtifacts.find((artifact: any) => artifact.relativePath.toLowerCase().endsWith(".json"));
  const markdownArtifact = primaryArtifacts.find((artifact: any) => artifact.relativePath.toLowerCase().endsWith(".md") || artifact.relativePath.toLowerCase().endsWith(".markdown"));
  const docxArtifact = primaryArtifacts.find((artifact: any) => artifact.relativePath.toLowerCase().endsWith(".docx"));
  const functionFlowGroups = useMemo(() => {
    const prettifyFlowName = (slug: string) => slug
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    type FunctionFlowGroup = {
      slug: string;
      title: string;
      pngArtifact?: any;
      jsonArtifact?: any;
      mmdArtifact?: any;
    };

    const grouped = new Map<string, FunctionFlowGroup>();

    for (const artifact of selectedDetail?.artifacts ?? []) {
      const matched = artifact.relativePath.match(/function_flows\/([^/]+)\/fluxo_[^/]+\.(png|json|mmd)$/i);
      if (!matched) continue;

      const [, slug, extension] = matched;
      const current: FunctionFlowGroup = grouped.get(slug) ?? {
        slug,
        title: prettifyFlowName(slug),
      };

      if (extension.toLowerCase() === "png") current.pngArtifact = artifact;
      if (extension.toLowerCase() === "json") current.jsonArtifact = artifact;
      if (extension.toLowerCase() === "mmd") current.mmdArtifact = artifact;

      grouped.set(slug, current);
    }

    return Array.from(grouped.values()).sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));
  }, [selectedDetail?.artifacts]);
  const graphNodes = (selectedDetail?.graph?.nodes ?? []) as GraphNode[];
  const graphEdges = (selectedDetail?.graph?.edges ?? []) as GraphEdge[];
  const compareGraphNodes = (compareDetail?.graph?.nodes ?? []) as GraphNode[];
  const compareGraphEdges = (compareDetail?.graph?.edges ?? []) as GraphEdge[];
  const compareCandidates = sortedJobs.filter((job) => job.jobId !== selectedJobId);
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

  const queueSummary = useMemo(() => {
    const totalFiles = uploadQueue.length;
    const totalBytes = uploadQueue.reduce((sum, item) => sum + item.file.size, 0);
    const completedFiles = uploadQueue.filter((item) => item.status === "completed").length;
    const invalidFiles = uploadQueue.filter((item) => item.status === "invalid").length;
    const activeFiles = uploadQueue.filter((item) => item.status === "uploading" || item.status === "starting").length;
    const averageProgress = totalFiles > 0
      ? Math.round(uploadQueue.reduce((sum, item) => sum + item.progress, 0) / totalFiles)
      : 0;
    const failureTelemetry = uploadQueue.reduce<UploadStageTelemetry>((accumulator, item) => ({
      session: accumulator.session + item.failureTelemetry.session,
      chunk: accumulator.chunk + item.failureTelemetry.chunk,
      complete: accumulator.complete + item.failureTelemetry.complete,
    }), createEmptyUploadStageTelemetry());
    const aggregateThroughputBps = uploadQueue.reduce((sum, item) => sum + (item.estimatedThroughputBps ?? 0), 0);
    const activeEtaCandidates = uploadQueue
      .map((item) => item.estimatedEtaSeconds)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    const manualRetryCount = uploadQueue.filter((item) => item.allowManualRetry).length;

    return {
      totalFiles,
      totalBytes,
      completedFiles,
      invalidFiles,
      activeFiles,
      averageProgress,
      failureTelemetry,
      aggregateThroughputBps,
      longestEtaSeconds: activeEtaCandidates.length > 0 ? Math.max(...activeEtaCandidates) : null,
      manualRetryCount,
    };
  }, [uploadQueue]);

  const filteredTelemetryItems = useMemo(() => {
    const normalizedFilter = telemetryFilter.trim().toLowerCase();
    const sorted = [...uploadQueue].sort((left, right) => {
      const leftStamp = left.lastProgressAt ?? left.startedAt ?? 0;
      const rightStamp = right.lastProgressAt ?? right.startedAt ?? 0;
      return rightStamp - leftStamp;
    });

    if (!normalizedFilter) return sorted;

    return sorted.filter((item) => {
      const haystack = [
        item.file.name,
        item.jobId ?? "",
        item.lastFailedStage ?? "",
        item.message,
        uploadQueueStatusLabel(item.status),
      ].join(" ").toLowerCase();
      return haystack.includes(normalizedFilter);
    });
  }, [telemetryFilter, uploadQueue]);


  const readyUploadItems = useMemo(
    () => uploadQueue.filter((item) => item.status === "validated" || item.status === "error"),
    [uploadQueue],
  );

  function updateUploadQueueItem(queueId: string, updater: (item: UploadQueueItem) => UploadQueueItem) {
    setUploadQueue((current) => current.map((item) => (item.id === queueId ? updater(item) : item)));
  }

  async function handleFileSelection(fileList: FileList | null) {
    const incomingFiles = Array.from(fileList ?? []);
    if (incomingFiles.length === 0) return;

    if (incomingFiles.length > MAX_BATCH_UPLOAD_FILES) {
      toast.error(`A fila aceita até ${MAX_BATCH_UPLOAD_FILES} arquivos por rodada. Os demais foram ignorados.`);
    }

    setSubmitPhase("validating");
    setSubmissionError(null);
    setActiveUploadLabel(null);
    setUploadProgress(0);

    const inspectedItems = await Promise.all(
      incomingFiles.slice(0, MAX_BATCH_UPLOAD_FILES).map(async (file) => {
        const inspection = await inspectAnalysisArchive(file);
        return {
          id: buildUploadQueueId(file),
          file,
          status: inspection.ok ? "validated" : "invalid",
          progress: 0,
          message: inspection.message,
          remainingBytes: inspection.remainingBytes,
          chunkCount: inspection.chunkCount,
          usesChunkedTransport: inspection.usesChunkedTransport,
          maxPartBytes: inspection.usesChunkedTransport ? CHUNK_UPLOAD_MAX_BYTES : GATEWAY_SINGLE_REQUEST_MAX_BYTES,
          failureTelemetry: createEmptyUploadStageTelemetry(),
          bytesTransferred: 0,
          estimatedThroughputBps: undefined,
          estimatedEtaSeconds: null,
          startedAt: undefined,
          lastProgressAt: undefined,
          lastProgressBytes: undefined,
          lastFailedStage: null,
          allowManualRetry: false,
        } satisfies UploadQueueItem;
      }),
    );

    setUploadQueue((current) => {
      const nextItems = new Map(current.map((item) => [item.id, item]));
      inspectedItems.forEach((item) => nextItems.set(item.id, item));
      return Array.from(nextItems.values());
    });

    if (inspectedItems.some((item) => item.status === "invalid")) {
      setSubmissionError("Um ou mais arquivos foram bloqueados na verificação prévia. Revise a fila antes de iniciar a análise.");
    }

    setSubmitPhase("idle");
  }

  const positionedNodes = useMemo(() => buildGraphLayout(graphNodes), [graphNodes]);
  const selectedGraphNode = positionedNodes.find((node) => node.id === highlightedNodeId) ?? positionedNodes[0] ?? null;
  const visibleEdges = highlightedNodeId
    ? graphEdges.filter((edge) => edge.source === highlightedNodeId || edge.target === highlightedNodeId)
    : graphEdges;

  async function submitUploadFiles(files: File[]) {
    const focusFunctionValue = focusFunction.trim();
    const effectiveFocusFunction = focusFunctionValue || "TraceFcnCall.M1::ALL_FUNCTIONS";

    try {
      setSubmissionError(null);
      setSubmitPhase("uploading");
      setUploadProgress(0);

      const results = await uploadAnalysisArchiveBatch(
        {
          files,
          focusFunction: effectiveFocusFunction,
          focusTerms: parseCommaSeparated(focusTermsInput),
          focusRegexes: parseCommaSeparated(focusRegexesInput),
          origin: window.location.origin,
        },
        {
          onFileStart: (file, fileIndex, totalFiles) => {
            const queueId = buildUploadQueueId(file);
            const startedAt = Date.now();
            setActiveUploadLabel(file.name);
            updateUploadQueueItem(queueId, (item) => ({
              ...item,
              status: "uploading",
              progress: 0,
              bytesTransferred: 0,
              estimatedThroughputBps: undefined,
              estimatedEtaSeconds: item.usesChunkedTransport ? Math.max(1, item.chunkCount * 2) : null,
              startedAt,
              lastProgressAt: startedAt,
              lastProgressBytes: 0,
              lastFailedStage: null,
              allowManualRetry: false,
              message: `Arquivo ${fileIndex + 1} de ${totalFiles}: preparando envio seguro em partes.`,
            }));
          },
          onFileProgress: (file, progress, fileIndex, totalFiles) => {
            const queueId = buildUploadQueueId(file);
            const now = Date.now();
            const bytesTransferred = Math.min(file.size, Math.round((Math.max(0, progress) / 100) * file.size));
            setActiveUploadLabel(file.name);
            setUploadProgress(progress);
            updateUploadQueueItem(queueId, (item) => {
              const previousBytes = item.lastProgressBytes ?? 0;
              const previousTime = item.lastProgressAt ?? item.startedAt ?? now;
              const elapsedSeconds = Math.max(0.001, (now - previousTime) / 1000);
              const deltaBytes = Math.max(0, bytesTransferred - previousBytes);
              const estimatedThroughputBps = deltaBytes > 0
                ? deltaBytes / elapsedSeconds
                : item.estimatedThroughputBps;
              const remainingBytes = Math.max(0, file.size - bytesTransferred);
              const estimatedEtaSeconds = estimatedThroughputBps && estimatedThroughputBps > 0
                ? remainingBytes / estimatedThroughputBps
                : item.estimatedEtaSeconds ?? null;

              return {
                ...item,
                status: "uploading",
                progress,
                bytesTransferred,
                estimatedThroughputBps,
                estimatedEtaSeconds,
                lastProgressAt: now,
                lastProgressBytes: bytesTransferred,
                allowManualRetry: false,
                message: `Arquivo ${fileIndex + 1} de ${totalFiles}: ${formatPercent(progress)} transferido para o backend web.`,
              };
            });
          },
          onFileRetry: (file, attempt, stage, error, fileIndex, totalFiles) => {
            const queueId = buildUploadQueueId(file);
            updateUploadQueueItem(queueId, (item) => ({
              ...item,
              status: "uploading",
              lastFailedStage: stage,
              allowManualRetry: false,
              message: `Arquivo ${fileIndex + 1} de ${totalFiles}: ${uploadRetryStageLabel(stage)} (tentativa ${attempt}/3) após falha transitória. ${error.message}`,
            }));
          },
          onFileStageFailure: (file, stage, error, context, fileIndex, totalFiles) => {
            const queueId = buildUploadQueueId(file);
            updateUploadQueueItem(queueId, (item) => ({
              ...item,
              failureTelemetry: {
                ...item.failureTelemetry,
                [stage]: item.failureTelemetry[stage] + 1,
              },
              lastFailedStage: stage,
              allowManualRetry: !context.willRetry,
              message: context.willRetry
                ? `Arquivo ${fileIndex + 1} de ${totalFiles}: ${uploadRetryStageLabel(stage)} após falha transitória. ${error.message}`
                : `Arquivo ${fileIndex + 1} de ${totalFiles}: a etapa ${stage === "session" ? "de sessão" : stage === "chunk" ? "de parte" : "de conclusão"} esgotou as tentativas automáticas. Você pode acionar o reenvio manual desta etapa.`,
            }));
          },
          onFileSuccess: (file, result, fileIndex, totalFiles) => {
            const queueId = buildUploadQueueId(file);
            setSubmitPhase("starting");
            updateUploadQueueItem(queueId, (item) => ({
              ...item,
              status: "completed",
              progress: 100,
              bytesTransferred: file.size,
              estimatedThroughputBps: item.estimatedThroughputBps,
              estimatedEtaSeconds: 0,
              lastProgressAt: Date.now(),
              lastProgressBytes: file.size,
              lastFailedStage: null,
              allowManualRetry: false,
              message: `Arquivo ${fileIndex + 1} de ${totalFiles}: job ${result.jobId} criado com sucesso e entregue à fila operacional.`,
              jobId: result.jobId,
            }));
          },
          onFileError: (file, error, fileIndex, totalFiles) => {
            const queueId = buildUploadQueueId(file);
            updateUploadQueueItem(queueId, (item) => ({
              ...item,
              status: "error",
              progress: item.lastFailedStage === "complete" ? Math.max(item.progress, 99) : item.progress,
              estimatedEtaSeconds: item.lastFailedStage === "complete" ? 0 : item.estimatedEtaSeconds,
              allowManualRetry: true,
              message: `Arquivo ${fileIndex + 1} de ${totalFiles}: ${error.message}`,
            }));
          },
        },
      );

      const successfulJobIds = results
        .map((entry) => entry.result?.jobId)
        .filter((jobId): jobId is string => Boolean(jobId));
      const failedCount = results.filter((entry) => entry.error).length;

      if (successfulJobIds.length === 0) {
        const failureMessages = results
          .map((entry) => entry.error?.message?.trim())
          .filter((message): message is string => Boolean(message))
          .slice(0, 3);

        throw new Error(
          failureMessages.length > 0
            ? `Os arquivos válidos da fila não conseguiram iniciar análise. ${failureMessages.join(" | ")}`
            : "Os arquivos válidos da fila não conseguiram iniciar análise. Revise as mensagens individuais e tente novamente.",
        );
      }

      setUploadProgress(100);
      setSelectedJobId(successfulJobIds[successfulJobIds.length - 1] ?? null);
      setActiveTab("queue");
      if (isAdmin) {
        await resumeSyncMutation.mutateAsync();
      }
      await utils.analysis.list.invalidate();
      await Promise.all(successfulJobIds.map((jobId) => utils.analysis.detail.invalidate({ jobId })));

      if (failedCount > 0) {
        const message = `${failedCount} arquivo(s) falharam na fila atual. Os demais foram enviados com sucesso.`;
        setSubmissionError(message);
        toast.error(message);
      } else {
        toast.success(`${successfulJobIds.length} arquivo(s) enviados para a fila de análise.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao iniciar a análise.";
      setSubmissionError(message);
      toast.error(message);
    } finally {
      setSubmitPhase("idle");
      setUploadProgress(0);
      setActiveUploadLabel(null);
    }
  }

  async function handleRetryFailedUpload(queueId: string) {
    const targetItem = uploadQueue.find((item) => item.id === queueId);
    if (!targetItem || isSubmittingJob) return;

    await submitUploadFiles([targetItem.file]);
  }

  async function handleSubmitJob() {
    if (!auth.isAuthenticated) {
      const message = "Sua sessão não está ativa. Faça login novamente antes de iniciar a análise.";
      setSubmissionError(message);
      toast.error(message);
      return;
    }

    const pendingItems = readyUploadItems;
    if (pendingItems.length === 0) {
      const message = uploadQueue.length === 0
        ? "Selecione um ou mais pacotes .7z antes de iniciar a análise."
        : "Não há arquivos elegíveis para envio. Revise os itens bloqueados ou adicione novos arquivos à fila.";
      setSubmissionError(message);
      toast.error(message);
      return;
    }

    await submitUploadFiles(pendingItems.map((item) => item.file));
  }

  const canSubmitUploadQueue = auth.isAuthenticated && readyUploadItems.length > 0 && !isSubmittingJob;

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
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Cobertura operacional</div>
                        <div className="mt-2 text-lg font-medium text-white">{aggregatedMetrics.distinctSamples} amostras · {aggregatedMetrics.distinctFunctions} focos registrados</div>
                      </div>
                      <RefreshCcw className="h-4 w-4 text-cyan-200" />
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Amostra mais recorrente</div>
                        <div className="mt-2 font-medium text-white">{aggregatedMetrics.topSample?.[0] ?? "Sem dados suficientes"}</div>
                        <div className="mt-1 text-slate-400">{aggregatedMetrics.topSample ? `${aggregatedMetrics.topSample[1]} job(s) correlacionados` : "Aguardando histórico consolidado."}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Função mais recorrente</div>
                        <div className="mt-2 font-medium text-white">{aggregatedMetrics.topFunction?.[0] ?? "Sem dados suficientes"}</div>
                        <div className="mt-1 text-slate-400">{aggregatedMetrics.topFunction ? `${aggregatedMetrics.topFunction[1]} ocorrência(s) no histórico` : "Aguardando histórico consolidado."}</div>
                      </div>
                    </div>
                  </div>
                  <div className={`rounded-2xl border p-4 ${streamStatus === "degraded" || aggregatedMetrics.stalledJobs.length > 0 ? "border-amber-400/20 bg-amber-500/10" : "border-emerald-400/20 bg-emerald-500/10"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Alertas de acompanhamento</div>
                        <div className="mt-2 text-lg font-medium text-white">
                          {streamStatus === "degraded" || aggregatedMetrics.stalledJobs.length > 0 ? "Atenção operacional requerida" : "Telemetria e fila dentro do esperado"}
                        </div>
                      </div>
                      <Clock3 className={streamStatus === "degraded" || aggregatedMetrics.stalledJobs.length > 0 ? "h-4 w-4 text-amber-200" : "h-4 w-4 text-emerald-200"} />
                    </div>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-200">
                      <div>
                        {streamStatus === "degraded"
                          ? `O stream SSE está em reconexão automática. ${streamError ?? "O cliente seguirá tentando restabelecer o canal sem interromper a tela atual."}`
                          : "O stream SSE segue saudável, com snapshots válidos e atualização contínua do painel."}
                      </div>
                      <div>
                        {aggregatedMetrics.stalledJobs.length > 0
                          ? `Há ${aggregatedMetrics.stalledJobs.length} job(s) com possível travamento operacional há mais de 10 minutos: ${aggregatedMetrics.stalledJobs.map((job: any) => job.sampleName || job.jobId).join(", ")}.`
                          : "Nenhum job ativo aparenta estar travado com base na última atualização observada."}
                      </div>
                    </div>
                  </div>
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
                  <div className="grid gap-3 lg:grid-cols-[1fr_1fr_220px_220px_auto]">
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
                    <Select value={jobSort} onValueChange={(value) => setJobSort(value as JobSortValue)}>
                      <SelectTrigger className="border-white/10 bg-slate-950/60 text-slate-100">
                        <SelectValue placeholder="Ordenação" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Mais recentes primeiro</SelectItem>
                        <SelectItem value="oldest">Mais antigos primeiro</SelectItem>
                        <SelectItem value="progress_desc">Maior progresso primeiro</SelectItem>
                        <SelectItem value="status">Agrupar por status</SelectItem>
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
                        {sortedJobs.map((job) => (
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
                      <label className="text-sm font-medium text-slate-200">Pacotes compactados</label>
                      <div className="rounded-2xl border border-dashed border-cyan-400/20 bg-slate-950/60 p-4">
                        <Input
                          type="file"
                          accept=".7z"
                          multiple
                          onChange={(event) => {
                            void handleFileSelection(event.target.files);
                            event.currentTarget.value = "";
                          }}
                          className="border-white/10 bg-slate-950/70 text-slate-100 file:text-slate-200"
                        />
                          <p className="mt-3 text-sm text-slate-400">
                            Limite operacional atual: {Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024))} MB por arquivo. Arquivos acima de {Math.round(GATEWAY_SINGLE_REQUEST_MAX_BYTES / (1024 * 1024))} MB são enviados em partes seguras para contornar o limite por requisição do domínio publicado. Cada parte fragmentada usa até {Math.round(CHUNK_UPLOAD_MAX_BYTES / (1024 * 1024))} MB, abaixo do teto rígido de {Math.round(CHUNK_UPLOAD_HARD_MAX_BYTES / (1024 * 1024))} MB do parser multipart. Cada rodada aceita até {MAX_BATCH_UPLOAD_FILES} arquivos .7z.
                          </p>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                          <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
                            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Fila atual</div>
                            <div className="mt-2 text-2xl font-semibold text-white">{queueSummary.totalFiles}</div>
                            <p className="mt-1 break-words text-slate-400">{formatBytes(queueSummary.totalBytes)} preparados para validação e envio.</p>
                          </div>
                          <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
                            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Concluídos</div>
                            <div className="mt-2 text-2xl font-semibold text-white">{queueSummary.completedFiles}</div>
                            <p className="mt-1 break-words text-slate-400">{queueSummary.invalidFiles} bloqueado(s) · {queueSummary.manualRetryCount} apto(s) a reenvio manual.</p>
                          </div>
                          <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
                            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Throughput agregado</div>
                            <div className="mt-2 text-2xl font-semibold text-white">{formatThroughput(queueSummary.aggregateThroughputBps)}</div>
                            <p className="mt-1 break-words text-slate-400">ETA operacional da fila ativa: {formatEtaSeconds(queueSummary.longestEtaSeconds)}.</p>
                          </div>
                          <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
                            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Telemetria de falhas</div>
                            <div className="mt-2 break-words text-sm font-medium text-white">sessão {queueSummary.failureTelemetry.session} · parte {queueSummary.failureTelemetry.chunk} · conclusão {queueSummary.failureTelemetry.complete}</div>
                            <p className="mt-1 break-words text-slate-400">Contagem acumulada das falhas observadas antes do sucesso ou da interrupção final.</p>
                          </div>
                        </div>
                        {uploadQueue.length > 0 ? (
                          <div className="mt-4 space-y-3">
                            {uploadQueue.map((item) => (
                              <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 break-all font-medium text-white">
                                      <FileArchive className="h-4 w-4 shrink-0 text-cyan-300" /> {item.file.name}
                                    </div>
                                    <p className="mt-2 break-words text-xs text-slate-400">
                                      {formatBytes(item.file.size)} · restante até o teto: {item.remainingBytes > 0 ? formatBytes(item.remainingBytes) : "0 B"} · {item.usesChunkedTransport ? `${item.chunkCount} parte(s) seguras` : "envio direto"}
                                    </p>
                                    <p className="mt-1 break-words text-xs text-slate-500">
                                      {item.usesChunkedTransport
                                        ? `Máximo efetivo por parte: ${formatBytes(item.maxPartBytes)} · teto rígido do parser: ${formatBytes(CHUNK_UPLOAD_HARD_MAX_BYTES)}`
                                        : `Limite do envio direto por requisição: ${formatBytes(item.maxPartBytes)}`}
                                    </p>
                                  </div>
                                  <Badge className={uploadQueueStatusClasses(item.status)}>{uploadQueueStatusLabel(item.status)}</Badge>
                                </div>
                                <p className={`mt-3 break-words leading-6 ${item.status === "invalid" || item.status === "error" ? "text-rose-200" : "text-slate-300"}`}>
                                  {item.message}
                                </p>
                                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                  <div className="rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Progresso</div>
                                    <div className="mt-1 text-sm font-medium text-white">{formatPercent(item.progress)}</div>
                                    <div className="text-xs text-slate-400">{formatBytes(item.bytesTransferred)} transferidos</div>
                                  </div>
                                  <div className="rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Throughput</div>
                                    <div className="mt-1 text-sm font-medium text-white">{formatThroughput(item.estimatedThroughputBps)}</div>
                                    <div className="text-xs text-slate-400">Estimativa por variação recente do envio</div>
                                  </div>
                                  <div className="rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">ETA</div>
                                    <div className="mt-1 text-sm font-medium text-white">{formatEtaSeconds(item.estimatedEtaSeconds)}</div>
                                    <div className="text-xs text-slate-400">Último estágio com falha: {item.lastFailedStage ? item.lastFailedStage : "nenhum"}</div>
                                  </div>
                                  <div className="rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Ação manual</div>
                                    <div className="mt-1 text-sm font-medium text-white">{item.allowManualRetry ? "Disponível" : "Automática"}</div>
                                    <div className="text-xs text-slate-400">Use apenas quando a retomada automática esgotar as tentativas.</div>
                                  </div>
                                </div>
                                {(item.failureTelemetry.session > 0 || item.failureTelemetry.chunk > 0 || item.failureTelemetry.complete > 0) ? (
                                  <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-500/10 px-3 py-2 text-xs leading-6 text-amber-100">
                                    Telemetria de falhas do arquivo: sessão {item.failureTelemetry.session} · parte {item.failureTelemetry.chunk} · conclusão {item.failureTelemetry.complete}
                                  </div>
                                ) : null}
                                <div className="mt-3">
                                  <Progress value={item.progress} className="h-2 bg-cyan-950/40" />
                                </div>
                                {item.allowManualRetry ? (
                                  <div className="mt-3 flex flex-wrap justify-end gap-3">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      disabled={isSubmittingJob}
                                      className="border-amber-400/30 bg-amber-500/10 text-amber-50 hover:bg-amber-500/20"
                                      onClick={() => {
                                        void handleRetryFailedUpload(item.id);
                                      }}
                                    >
                                      <RefreshCcw className="mr-2 h-4 w-4" /> Reenviar etapa falha
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-slate-300">
                            Selecione um ou mais arquivos .7z para validar assinatura, estimar o envio em partes e montar a fila sequencial de análise.
                          </div>
                        )}
                        {submissionError ? (
                          <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm leading-6 text-rose-100">
                            {submissionError}
                          </div>
                        ) : null}
                        {isSubmittingJob ? (
                          <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3 text-sm text-cyan-50">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <span>
                                {submitPhase === "validating"
                                  ? "Validando assinatura e preparando sessões seguras..."
                                  : submitPhase === "uploading"
                                    ? `Enviando ${activeUploadLabel ?? "arquivo atual"} em partes seguras...`
                                    : "Upload concluído. Criando job e sincronizando a fila..."}
                              </span>
                              <span>{submitPhase === "starting" ? "100%" : formatPercent(uploadProgress)}</span>
                            </div>
                            <Progress value={submitPhase === "starting" ? 100 : uploadProgress} className="h-2 bg-cyan-950/40" />
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
                        Esse valor é usado tanto para a submissão quanto para a organização do histórico e das notificações ao final do job. Se o campo ficar vazio, a aplicação solicita a análise completa do pacote para gerar fluxos por função.
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
                      disabled={!canSubmitUploadQueue}
                      className="rounded-xl bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                    >
                      {isSubmittingJob ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <UploadCloud className="mr-2 h-4 w-4" />
                      )}
                      {isSubmittingJob ? "Enviando fila..." : "Iniciar análise em lote"}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"
                      onClick={() => {
                        setUploadQueue([]);
                        setSubmissionError(null);
                        setUploadProgress(0);
                        setActiveUploadLabel(null);
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
                  <Separator className="bg-white/10" />
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">Telemetria histórica de uploads</p>
                        <p className="text-xs text-slate-500">Filtre por arquivo, job, estágio ou texto da última mensagem operacional.</p>
                      </div>
                      <div className="text-xs text-slate-400">{filteredTelemetryItems.length} registro(s) visível(is)</div>
                    </div>
                    <Input
                      value={telemetryFilter}
                      onChange={(event) => setTelemetryFilter(event.target.value)}
                      placeholder="Filtrar por arquivo, job, estágio ou mensagem"
                      className="border-white/10 bg-slate-950/60 text-slate-100 placeholder:text-slate-500"
                    />
                    <div className="space-y-3">
                      {filteredTelemetryItems.length > 0 ? filteredTelemetryItems.slice(0, 8).map((item) => (
                        <div key={`telemetry-${item.id}`} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-xs leading-6 text-slate-300">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-white">{item.file.name}</span>
                            <Badge className={uploadQueueStatusClasses(item.status)}>{uploadQueueStatusLabel(item.status)}</Badge>
                          </div>
                          <p className="mt-2 break-words text-slate-400">{item.jobId ? `Job ${item.jobId}` : "Job ainda não criado"} · último estágio sensível: {item.lastFailedStage ?? "nenhum"}</p>
                          <p className="mt-2 break-words text-slate-300">{item.message}</p>
                          <p className="mt-2 text-amber-100">sessão {item.failureTelemetry.session} · parte {item.failureTelemetry.chunk} · conclusão {item.failureTelemetry.complete}</p>
                        </div>
                      )) : (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-4 text-xs text-slate-400">
                          A telemetria histórica aparecerá aqui assim que a fila registrar validações, retries, falhas ou conclusões de upload.
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="queue" forceMount className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
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
                    {functionFlowGroups.length > 0 ? (
                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-sm font-medium text-white">Fluxos gerados por função</div>
                            <div className="mt-1 text-sm text-slate-400">
                              Cada função encontrada em <code className="rounded bg-black/30 px-1 py-0.5 text-slate-200">TraceFcnCall.M1</code> recebe artefatos dedicados no padrão legado: PNG, JSON estrutural e Mermaid.
                            </div>
                          </div>
                          <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-emerald-200">
                            {functionFlowGroups.length} funções
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {functionFlowGroups.map((flow) => (
                            <div key={flow.slug} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                              <div className="text-sm font-medium text-white">{flow.title}</div>
                              <div className="mt-1 text-xs text-slate-500">Slug técnico: {flow.slug}</div>
                              <div className="mt-4 flex flex-wrap gap-2">
                                {flow.pngArtifact?.storageUrl ? (
                                  <a
                                    href={flow.pngArtifact.storageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/15"
                                  >
                                    Abrir PNG
                                  </a>
                                ) : null}
                                {flow.jsonArtifact?.storageUrl ? (
                                  <a
                                    href={flow.jsonArtifact.storageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-white/30 hover:bg-white/[0.08]"
                                  >
                                    JSON estrutural
                                  </a>
                                ) : null}
                                {flow.mmdArtifact?.storageUrl ? (
                                  <a
                                    href={flow.mmdArtifact.storageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-white/30 hover:bg-white/[0.08]"
                                  >
                                    Mermaid
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
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
