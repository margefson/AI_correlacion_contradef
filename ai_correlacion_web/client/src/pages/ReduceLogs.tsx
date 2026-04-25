import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { jobStatusBadgeClass } from "@/lib/analysisUi";
import { formatBytes, formatDateTimeLocale, formatPercentFine, formatPercentRounded } from "@/lib/format";
import { isReduceLogsDebugEnabled } from "@/lib/reduceLogsDebug";
import { downloadReduceLogsExcelWorkbook } from "@/lib/reduceLogsExcelExport";
import {
  clearPersistedReduceLogsJobId,
  MAX_TRACKED_LOTS,
  nextTrackedAfterPrepend,
  readSelectedJobId,
  readTrackedJobIds,
  writeSelectedJobId,
  writeTrackedJobIds,
} from "@/lib/reduceLogsSession";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  completeReduceLogsUpload,
  getReduceLogsUploadCapabilities,
  initReduceLogsUpload,
  type UploadCompletionFilePayload,
  uploadReduceLogsChunk,
  uploadReduceLogsLegacyWithProgress,
} from "@/services/analysisService";
import {
  buildMonitoredFiles,
  getFileInterpretation,
  getFileRecommendation,
  inferLogType,
  isArchiveContainerFile,
  type FileMonitor,
  type ProcessingStatus,
  type SubmittedFileMonitor,
} from "@/pages/reduceLogsMonitor";
import {
  AlertTriangle,
  Database,
  Filter,
  FileArchive,
  FileDown,
  FileSpreadsheet,
  FolderOpen,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { Link } from "wouter";

/** Lote “virtual” antes do servidor devolver o `jobId` (ctr-…), para acompanhar o envio ficheiro a ficheiro. */
/** 10 colunas: `table-fixed` + colgroup desalinhava; grid com `minmax(0,1fr)` alinha cabeçalho e células. */
const FILE_TRACKING_GRID_10 =
  "grid w-full min-w-0 [grid-template-columns:repeat(10,minmax(0,1fr))] gap-0 text-xs [word-break:break-word]";
const fileTrackTh =
  "text-left min-w-0 border-r border-border/70 bg-muted/50 px-1.5 py-1.5 align-top text-[11px] font-medium leading-tight [overflow-wrap:anywhere] first:bg-muted first:dark:bg-slate-950 last:border-r-0 dark:border-white/10";
const fileTrackTd =
  "text-left min-w-0 border-r border-border/70 px-1.5 py-1.5 align-top [overflow-wrap:anywhere] first:bg-muted first:font-medium first:text-foreground first:dark:bg-slate-950 last:border-r-0 dark:border-white/10";

const LOCAL_UPLOAD_LOT_ID = "__local-uploading__" as const;

/** Ficheiros muito grandes podem demorar minutos entre eventos de ficheiro; evita falso “travado” na UI. */
const STALE_NO_EVENT_MS = 120_000;
const STALE_NO_EVENT_MS_LARGE = 10 * 60_000;
const STALE_SIZE_THRESHOLD_BYTES = 100 * 1024 * 1024;

function fileNameBase(fileName: string) {
  const parts = fileName.split(/[/\\]/);
  return parts.at(-1) ?? fileName;
}

function buildReducedLogDownloadUrl(jobId: string, fileName: string) {
  return `/api/analysis-artifacts/reduced-log-by-file?${new URLSearchParams({ jobId, fileName }).toString()}`;
}

function staleThresholdMsForFile(file: FileMonitor) {
  const big = Math.max(file.originalBytes ?? 0, file.sizeBytes ?? 0);
  return big >= STALE_SIZE_THRESHOLD_BYTES ? STALE_NO_EVENT_MS_LARGE : STALE_NO_EVENT_MS;
}

function getStatusLabel(status?: string | null) {
  switch (status) {
    case "queued":
      return "Na fila";
    case "uploading":
      return "Enviando";
    case "running":
      return "Processando";
    case "completed":
      return "Concluído";
    case "failed":
      return "Falhou";
    default:
      return "Sem processamento";
  }
}

function getProcessingStatusVisual(status?: string | null) {
  if (status === "completed") {
    return {
      badge: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
      row: "bg-emerald-500/5",
      label: "text-emerald-200",
      progressTone: "emerald" as const,
    };
  }
  if (status === "running") {
    return {
      badge: "border-cyan-400/35 bg-cyan-500/15 text-cyan-200",
      row: "bg-cyan-500/5",
      label: "text-cyan-200",
      progressTone: "cyan" as const,
    };
  }
  if (status === "queued" || status === "uploading") {
    return {
      badge: "border-amber-400/35 bg-amber-500/15 text-amber-200",
      row: "bg-amber-500/5",
      label: "text-amber-200",
      progressTone: "amber" as const,
    };
  }
  if (status === "failed") {
    return {
      badge: "border-rose-400/35 bg-rose-500/15 text-rose-200",
      row: "bg-rose-500/5",
      label: "text-rose-200",
      progressTone: "rose" as const,
    };
  }
  return {
    badge: "border-border bg-muted/50 text-muted-foreground dark:border-white/10 dark:bg-white/5",
    row: "",
    label: "text-muted-foreground",
    progressTone: "cyan" as const,
  };
}

/** Mesma paleta/estrutura que `getProcessingStatusVisual`, para a coluna Upload alinhar com Processamento. */
function getUploadStatusVisual(status?: string | null) {
  if (status === "completed") {
    return {
      badge: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
      label: "text-emerald-200",
      progressTone: "emerald" as const,
    };
  }
  if (status === "running") {
    return {
      badge: "border-cyan-400/35 bg-cyan-500/15 text-cyan-200",
      label: "text-cyan-200",
      progressTone: "cyan" as const,
    };
  }
  if (status === "queued" || status === "uploading") {
    return {
      badge: "border-amber-400/35 bg-amber-500/15 text-amber-200",
      label: "text-amber-200",
      progressTone: "amber" as const,
    };
  }
  if (status === "failed") {
    return {
      badge: "border-rose-400/35 bg-rose-500/15 text-rose-200",
      label: "text-rose-200",
      progressTone: "rose" as const,
    };
  }
  return {
    badge: "border-border bg-muted/50 text-muted-foreground dark:border-white/10 dark:bg-white/5",
    label: "text-muted-foreground",
    progressTone: "cyan" as const,
  };
}

function formatLastActivityLabel(value?: Date | null) {
  if (!value) return "sem eventos recentes";
  const diffMs = Date.now() - value.getTime();
  if (diffMs < 15000) return "atividade agora";
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 60) return `última atualização há ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `última atualização há ${minutes}min`;
}

function formatElapsedMs(ms: number) {
  const safe = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}min`;
  }
  if (minutes > 0) return `${minutes}min ${seconds}s`;
  return `${seconds}s`;
}

function getSemaforo(file: FileMonitor) {
  if (file.processingStatus === "failed") return "Falhou";
  if (file.processingStatus === "queued" || file.processingStatus === "uploading") return "Aguardando";
  if (file.triggerCount > 0 || file.suspiciousEventCount > 0) return "Preservado";
  /* Concluído sem sinais destacados: não indica falha, apenas caso de rotina de leitura. */
  if (file.processingStatus === "completed") return "Rotina";
  return "Em análise";
}

function getSemaforoTone(file: FileMonitor) {
  const label = getSemaforo(file);
  if (label === "Preservado") return "text-emerald-300";
  if (label === "Rotina") return "text-cyan-200/90";
  if (label === "Falhou") return "text-rose-200";
  return "text-muted-foreground";
}

const DEFAULT_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const STORAGE_CREDENTIALS_MISSING_FRAGMENT = "Storage proxy credentials missing";
const STAGE_WARNING_THRESHOLD_MS = 5 * 60 * 1000;
const REDUCE_LOGS_POLL_MS_KEY = "contradef.reduceLogsPollMs";
const DEFAULT_REDUCE_LOGS_POLL_MS = 5000;
const POLL_MS_OPTIONS = [2000, 5000, 10000, 30000, 60000] as const;

const LOG_FILE_ACCEPT = ".cdf,.csv,.json,.log,.txt,.7z,.zip,.rar";
const LOG_FILE_EXT = new Set(["cdf", "csv", "json", "log", "txt", "7z", "zip", "rar"]);
const RESTORE_BANNER_SESSION_KEY = "contradef_reduce_logs_restore_banner_ack";
const ANALYSIS_NAME_PREFIX = "Redução Logs Contradef ";

function isAcceptedLogFile(file: File) {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  return LOG_FILE_EXT.has(ext);
}

function logFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function mergeSelectedLogFiles(prev: File[], incoming: File[]) {
  const map = new Map<string, File>();
  for (const f of prev) map.set(logFileKey(f), f);
  for (const f of incoming) {
    if (isAcceptedLogFile(f)) map.set(logFileKey(f), f);
  }
  return Array.from(map.values());
}

function buildInitialSubmittedFiles(files: File[]) {
  return files.map((file) => ({
    fileName: file.name,
    logType: inferLogType(file.name),
    sizeBytes: file.size,
    uploadProgress: 0,
    /** `uploading` logo ao submeter: evita "Na fila" na coluna de upload (confundia com fila de outro lote no servidor). Ainda 0% até `init` e primeiro bloco. */
    uploadStatus: "uploading" as ProcessingStatus,
  }));
}

function updateSubmittedFile(
  current: SubmittedFileMonitor[],
  fileName: string,
  patch: Partial<SubmittedFileMonitor>,
) {
  return current.map((file) => (file.fileName === fileName ? { ...file, ...patch } : file));
}

function isStorageCredentialsMissingError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes(STORAGE_CREDENTIALS_MISSING_FRAGMENT);
}

function formatFileProcessingPercent(p: number | null) {
  if (p == null) return "—";
  const x = Math.round(p * 10) / 10;
  return `${x % 1 === 0 ? x.toFixed(0) : x.toFixed(1)}%`;
}

function ProgressStrip({
  value,
  indeterminate,
  tone = "cyan",
  className,
}: {
  value: number;
  indeterminate?: boolean;
  tone?: "cyan" | "emerald" | "rose" | "amber";
  className?: string;
}) {
  const toneClass = tone === "emerald"
    ? "bg-emerald-400"
    : tone === "rose"
      ? "bg-rose-400"
      : tone === "amber"
        ? "bg-amber-400"
        : "bg-cyan-400";

  if (indeterminate) {
    return (
      <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-white/10", className)}>
        <div className={`${toneClass} h-full w-[38%] animate-pulse rounded-full`} />
      </div>
    );
  }

  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-white/10", className)}>
      <div className={`${toneClass} h-full rounded-full transition-all duration-300`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof RefreshCw;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-muted/70 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:hover:shadow-slate-950/30">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

export default function ReduceLogs() {
  const { user, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const logFilesInputRef = useRef<HTMLInputElement>(null);
  const [analysisName, setAnalysisName] = useState(ANALYSIS_NAME_PREFIX);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [trackedJobIds, setTrackedJobIds] = useState<string[]>(() => (
    typeof window !== "undefined" ? readTrackedJobIds() : []
  ));
  const [selectedJobId, setSelectedJobId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const ids = readTrackedJobIds();
    const sel = readSelectedJobId();
    if (sel && ids.includes(sel)) {
      return sel;
    }
    return ids[0] ?? null;
  });
  const [uploadSessionJobId, setUploadSessionJobId] = useState<string | null>(null);
  const [showRestoreHint, setShowRestoreHint] = useState(false);
  const [logDropHover, setLogDropHover] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  /** Mensagem de alto nível durante init/envio/completação (o utilizador vê o que o servidor está a fazer). */
  const [uploadPipelineStatus, setUploadPipelineStatus] = useState<string | null>(null);
  /** Só no envio multipart directo: bytes enviados para a barra / % real (fetch não reporta; usamos XHR). */
  const [directMultipartBytes, setDirectMultipartBytes] = useState<{ loaded: number; total: number } | null>(null);
  const [submittedFiles, setSubmittedFiles] = useState<SubmittedFileMonitor[]>([]);
  const [activeFileTab, setActiveFileTab] = useState<string>("");
  const [uiNowMs, setUiNowMs] = useState(() => Date.now());
  const [fileQuickFilter, setFileQuickFilter] = useState<"all" | "stalled" | "running" | "completed">("all");
  const [sortByPriority, setSortByPriority] = useState(true);
  const [focusCriticalMode, setFocusCriticalMode] = useState(true);
  const [pollIntervalMs, setPollIntervalMs] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_REDUCE_LOGS_POLL_MS;
    try {
      const raw = window.localStorage.getItem(REDUCE_LOGS_POLL_MS_KEY);
      const n = raw ? parseInt(raw, 10) : NaN;
      return POLL_MS_OPTIONS.includes(n as (typeof POLL_MS_OPTIONS)[number]) ? n : DEFAULT_REDUCE_LOGS_POLL_MS;
    } catch {
      return DEFAULT_REDUCE_LOGS_POLL_MS;
    }
  });
  const activityLogRef = useRef<HTMLPreElement | null>(null);

  const resumeActiveSync = trpc.analysis.resumeActiveSync.useMutation({
    onSuccess: (data) => {
      const resumed = data?.resumedJobs ?? [];
      if (!resumed.length) {
        return;
      }
      setTrackedJobIds((prev) => {
        const seen = new Set<string>();
        const merged: string[] = [];
        for (const id of [...resumed, ...prev]) {
          if (seen.has(id)) continue;
          seen.add(id);
          merged.push(id);
        }
        return merged.slice(0, MAX_TRACKED_LOTS);
      });
    },
  });
  const deleteJobMutation = trpc.analysis.deleteJob.useMutation();

  useEffect(() => {
    resumeActiveSync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!readTrackedJobIds().length) return;
    try {
      if (sessionStorage.getItem(RESTORE_BANNER_SESSION_KEY) === "1") return;
    } catch {
      /* private mode */
    }
    setShowRestoreHint(true);
  }, []);

  useEffect(() => {
    writeTrackedJobIds(trackedJobIds);
  }, [trackedJobIds]);

  useEffect(() => {
    writeSelectedJobId(selectedJobId);
  }, [selectedJobId]);

  useEffect(() => {
    if (!trackedJobIds.length) {
      if (selectedJobId !== null) {
        setSelectedJobId(null);
      }
      return;
    }
    if (selectedJobId && trackedJobIds.includes(selectedJobId)) {
      return;
    }
    setSelectedJobId(trackedJobIds[0] ?? null);
  }, [trackedJobIds, selectedJobId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setUiNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const jobListQuery = trpc.analysis.list.useQuery(
    { limit: 100 },
    { refetchInterval: 10_000, enabled: trackedJobIds.length > 0 },
  );

  const jobRowById = useMemo(() => {
    const map = new Map<
      string,
      { sampleName: string; status: string; progress: number; createdByUserId: number | null }
    >();
    for (const row of jobListQuery.data ?? []) {
      const created = row.createdByUserId;
      map.set(row.jobId, {
        sampleName: String(row.sampleName ?? "").trim() || row.jobId,
        status: String(row.status ?? ""),
        progress: Number(row.progress ?? 0) || 0,
        createdByUserId: typeof created === "number" && Number.isFinite(created) ? created : null,
      });
    }
    return map;
  }, [jobListQuery.data]);

  const selectedListRow = useMemo(
    () => (selectedJobId && selectedJobId !== LOCAL_UPLOAD_LOT_ID ? jobRowById.get(selectedJobId) : undefined),
    [selectedJobId, jobRowById],
  );

  function canServerDeleteJob(lotId: string) {
    if (authLoading || !user) {
      return false;
    }
    if (lotId === LOCAL_UPLOAD_LOT_ID) {
      return false;
    }
    if (lotId === uploadSessionJobId) {
      return true;
    }
    const row = jobRowById.get(lotId);
    if (!row) {
      return false;
    }
    return row.createdByUserId != null && row.createdByUserId === user.id;
  }

  const isLocalUploadLotSelected = selectedJobId === LOCAL_UPLOAD_LOT_ID;

  const submittedDetailQuery = trpc.analysis.detail.useQuery(
    { jobId: isLocalUploadLotSelected ? "skip-local" : (selectedJobId ?? "") },
    {
      enabled: Boolean(selectedJobId) && !isLocalUploadLotSelected,
      refetchInterval: (query) => {
        const status = query.state.data?.job.status;
        return status === "running" || status === "queued" ? pollIntervalMs : false;
      },
    },
  );

  const uploadedDetail = isLocalUploadLotSelected ? null : (submittedDetailQuery.data ?? null);

  useEffect(() => {
    const el = activityLogRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [uploadedDetail?.job?.stdoutTail, uploadedDetail?.job?.message]);

  const hasRemoteArtifacts = Boolean(
    uploadedDetail?.artifacts?.some((artifact) => Boolean(artifact.storageUrl)),
  );
  const showsLocalStorageModeBadge = Boolean(
    uploadedDetail
    && (uploadedDetail.job.status === "completed" || uploadedDetail.job.status === "failed")
    && !hasRemoteArtifacts,
  );

  useEffect(() => {
    if (!isReduceLogsDebugEnabled()) return;
    if (!selectedJobId) return;
    if (submittedDetailQuery.isError) {
      console.warn("[ReduceLogs:detail]", "erro ao obter detalhe do job", {
        jobId: selectedJobId,
        error: submittedDetailQuery.error,
      });
      return;
    }
    if (!uploadedDetail) return;
    const newest = uploadedDetail.events[0];
    console.info("[ReduceLogs:detail:poll]", {
      jobId: selectedJobId,
      responseReceivedAt: submittedDetailQuery.dataUpdatedAt
        ? new Date(submittedDetailQuery.dataUpdatedAt).toISOString()
        : null,
      fetchStatus: submittedDetailQuery.fetchStatus,
      isFetching: submittedDetailQuery.isFetching,
      job: {
        status: uploadedDetail.job.status,
        progress: uploadedDetail.job.progress,
        stage: uploadedDetail.job.stage,
        rowUpdatedAt: formatDateTimeLocale(uploadedDetail.job.updatedAt),
      },
      newestEvent: newest
        ? {
            at: formatDateTimeLocale(newest.createdAt),
            stage: newest.stage,
            type: newest.eventType,
            progress: newest.progress,
          }
        : null,
      fileMetrics: uploadedDetail.fileMetrics.map((f) => ({
        file: f.fileName,
        status: f.status,
        progress: f.progress,
        stage: f.currentStage,
      })),
      serverProcessDebug: uploadedDetail.serverProcessDebug ?? null,
    });
  }, [
    selectedJobId,
    uploadedDetail,
    submittedDetailQuery.dataUpdatedAt,
    submittedDetailQuery.fetchStatus,
    submittedDetailQuery.isFetching,
    submittedDetailQuery.isError,
    submittedDetailQuery.error,
  ]);

  const includeSubmittedFilesInMerge = Boolean(
    uploadSessionJobId && selectedJobId && uploadSessionJobId === selectedJobId,
  );

  const localUploadAverageProgress = useMemo(() => {
    if (!submittedFiles.length) {
      return 0;
    }
    return Math.round(submittedFiles.reduce((s, f) => s + f.uploadProgress, 0) / submittedFiles.length);
  }, [submittedFiles]);

  const isOnlyArchiveSubmission = useMemo(
    () => submittedFiles.length > 0 && submittedFiles.every((f) => isArchiveContainerFile(f.fileName)),
    [submittedFiles],
  );

  const monitoredFiles = useMemo(
    () => buildMonitoredFiles(
      includeSubmittedFilesInMerge ? submittedFiles : [],
      uploadedDetail?.fileMetrics ?? [],
    ),
    [includeSubmittedFilesInMerge, submittedFiles, uploadedDetail],
  );

  /**
   * Mostra o painel (métricas, tabs) mesmo com 0 ficheiros quando a lista (poll) ainda conhece o job
   * e o `detail` falhou — evita deixar só a faixa de erro a substituir todo o acompanhamento.
   */
  const showMainMonitoringPanel = useMemo(
    () => Boolean(
      monitoredFiles.length
      || (submittedDetailQuery.isError && !isLocalUploadLotSelected && selectedJobId && selectedListRow),
    ),
    [monitoredFiles.length, submittedDetailQuery.isError, isLocalUploadLotSelected, selectedJobId, selectedListRow],
  );

  /** Primeira resposta do `detail` ainda não chegou (servidor a responder ou instância a acordar). */
  const monitorDetailLoading = Boolean(
    selectedJobId &&
    !isLocalUploadLotSelected &&
    !monitoredFiles.length &&
    !uploadedDetail &&
    (submittedDetailQuery.isLoading || submittedDetailQuery.isPending) &&
    !submittedDetailQuery.isError,
  );

  /** O job existe mas ainda não há linhas de ficheiro (ex.: .7z a extrair no servidor, ou fila a aquecer). */
  const showJobStatusWithoutFileTable = Boolean(
    selectedJobId &&
    uploadedDetail &&
    !monitoredFiles.length &&
    !submittedDetailQuery.isError,
  );

  const batchSummary = useMemo(() => {
    if (!monitoredFiles.length) return null;

    const completedFiles = monitoredFiles.filter((file) => file.processingStatus === "completed").length;
    const runningFiles = monitoredFiles.filter((file) => file.processingStatus === "running").length;
    const failedFiles = monitoredFiles.filter((file) => file.processingStatus === "failed").length;
    const totalOriginalBytes = monitoredFiles.reduce((sum, file) => sum + file.originalBytes, 0);
    const totalReducedBytes = monitoredFiles.reduce((sum, file) => sum + file.reducedBytes, 0);
    const totalOriginalLines = monitoredFiles.reduce((sum, file) => sum + file.originalLineCount, 0);
    const totalReducedLines = monitoredFiles.reduce((sum, file) => sum + file.reducedLineCount, 0);
    const discardedLines = Math.max(0, totalOriginalLines - totalReducedLines);
    const suspiciousCount = monitoredFiles.reduce((sum, file) => sum + file.suspiciousEventCount, 0);
    const triggerCount = monitoredFiles.reduce((sum, file) => sum + file.triggerCount, 0);
    const reductionPercent = totalOriginalBytes > 0 ? 100 * (1 - totalReducedBytes / totalOriginalBytes) : 0;

    return {
      completedFiles,
      runningFiles,
      failedFiles,
      totalOriginalBytes,
      totalReducedBytes,
      totalOriginalLines,
      totalReducedLines,
      discardedLines,
      suspiciousCount,
      triggerCount,
      reductionPercent,
    };
  }, [monitoredFiles]);

  const fileLastEventAtMap = useMemo(() => {
    const map = new Map<string, Date>();
    (uploadedDetail?.events ?? []).forEach((event) => {
      const payload = event.payloadJson && !Array.isArray(event.payloadJson) ? event.payloadJson as Record<string, unknown> : null;
      const fileName = typeof payload?.fileName === "string" ? payload.fileName : null;
      if (!fileName || !event.createdAt) return;
      const createdAt = new Date(event.createdAt);
      if (!Number.isFinite(createdAt.getTime())) return;
      const previous = map.get(fileName);
      if (!previous || createdAt > previous) {
        map.set(fileName, createdAt);
      }
    });
    const job = uploadedDetail?.job;
    if (job?.status === "running" && job.updatedAt) {
      const pulse = new Date(job.updatedAt);
      if (Number.isFinite(pulse.getTime())) {
        const hay = `${job.message ?? ""}\n${job.stdoutTail ?? ""}`;
        (uploadedDetail?.fileMetrics ?? []).forEach((file) => {
          if (file.status !== "running" && file.status !== "queued") return;
          const base = fileNameBase(file.fileName);
          if (!hay.includes(file.fileName) && !hay.includes(base)) return;
          const prev = map.get(file.fileName);
          if (!prev || pulse > prev) {
            map.set(file.fileName, pulse);
          }
        });
      }
    }
    return map;
  }, [uploadedDetail?.events, uploadedDetail?.job, uploadedDetail?.fileMetrics]);
  const fileCurrentStageSinceMap = useMemo(() => {
    const map = new Map<string, Date>();
    const stageMap = new Map<string, string>();
    const events = [...(uploadedDetail?.events ?? [])].sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return leftTime - rightTime;
    });

    events.forEach((event) => {
      const payload = event.payloadJson && !Array.isArray(event.payloadJson) ? event.payloadJson as Record<string, unknown> : null;
      const fileName = typeof payload?.fileName === "string" ? payload.fileName : null;
      const currentStage = typeof payload?.currentStage === "string"
        ? payload.currentStage
        : typeof event.stage === "string"
          ? event.stage
          : null;
      if (!fileName || !currentStage || !event.createdAt) return;
      const createdAt = new Date(event.createdAt);
      if (!Number.isFinite(createdAt.getTime())) return;
      const previousStage = stageMap.get(fileName);
      if (previousStage !== currentStage) {
        stageMap.set(fileName, currentStage);
        map.set(fileName, createdAt);
      }
    });
    return map;
  }, [uploadedDetail?.events]);
  const staleRunningFiles = useMemo(() => monitoredFiles.filter((file) => {
    if (file.processingStatus !== "running") return false;
    const lastEventAt = fileLastEventAtMap.get(file.fileName);
    if (!lastEventAt) return true;
    return uiNowMs - lastEventAt.getTime() > staleThresholdMsForFile(file);
  }), [fileLastEventAtMap, monitoredFiles, uiNowMs]);
  const stalledFileNameSet = useMemo(() => {
    const set = new Set<string>();
    monitoredFiles.forEach((file) => {
      if (file.processingStatus !== "running") return;
      const lastEventAt = fileLastEventAtMap.get(file.fileName);
      const stageSince = fileCurrentStageSinceMap.get(file.fileName);
      const stageElapsedMs = stageSince ? uiNowMs - stageSince.getTime() : 0;
      const noRecentActivity = !lastEventAt || (uiNowMs - lastEventAt.getTime() > staleThresholdMsForFile(file));
      if (noRecentActivity || stageElapsedMs > STAGE_WARNING_THRESHOLD_MS) {
        set.add(file.fileName);
      }
    });
    return set;
  }, [fileCurrentStageSinceMap, fileLastEventAtMap, monitoredFiles, uiNowMs]);
  const priorityScoreMap = useMemo(() => {
    const map = new Map<string, number>();
    monitoredFiles.forEach((file) => {
      const stalled = stalledFileNameSet.has(file.fileName) ? 1 : 0;
      const score = stalled * 1000 + (file.triggerCount * 5) + (file.suspiciousEventCount * 2) + (file.processingStatus === "running" ? 50 : 0);
      map.set(file.fileName, score);
    });
    return map;
  }, [monitoredFiles, stalledFileNameSet]);
  const priorityScoredFiles = useMemo(
    () => [...monitoredFiles].sort((left, right) => (priorityScoreMap.get(right.fileName) ?? 0) - (priorityScoreMap.get(left.fileName) ?? 0)),
    [monitoredFiles, priorityScoreMap],
  );
  const criticalFocusCandidate = useMemo(
    () => priorityScoredFiles.find((file) => stalledFileNameSet.has(file.fileName) || file.triggerCount > 0 || file.suspiciousEventCount > 0 || file.processingStatus === "running") ?? null,
    [priorityScoredFiles, stalledFileNameSet],
  );
  const filteredMonitoredFiles = useMemo(() => {
    if (fileQuickFilter === "stalled") return monitoredFiles.filter((file) => stalledFileNameSet.has(file.fileName));
    if (fileQuickFilter === "running") return monitoredFiles.filter((file) => file.processingStatus === "running");
    if (fileQuickFilter === "completed") return monitoredFiles.filter((file) => file.processingStatus === "completed");
    return monitoredFiles;
  }, [fileQuickFilter, monitoredFiles, stalledFileNameSet]);
  const visibleMonitoredFiles = useMemo(() => {
    if (!sortByPriority) return filteredMonitoredFiles;
    const scored = [...filteredMonitoredFiles];
    scored.sort((left, right) => {
      const leftScore = priorityScoreMap.get(left.fileName) ?? 0;
      const rightScore = priorityScoreMap.get(right.fileName) ?? 0;
      if (leftScore !== rightScore) return rightScore - leftScore;
      return left.fileName.localeCompare(right.fileName);
    });
    return scored;
  }, [filteredMonitoredFiles, priorityScoreMap, sortByPriority]);
  const activeFile = visibleMonitoredFiles.find((file) => file.fileName === activeFileTab) ?? visibleMonitoredFiles[0] ?? null;

  useEffect(() => {
    if (!focusCriticalMode || !criticalFocusCandidate) return;
    if (activeFileTab === criticalFocusCandidate.fileName) return;
    const activeScore = activeFileTab ? (priorityScoreMap.get(activeFileTab) ?? -1) : -1;
    const candidateScore = priorityScoreMap.get(criticalFocusCandidate.fileName) ?? -1;
    if (candidateScore >= activeScore + 100) {
      setActiveFileTab(criticalFocusCandidate.fileName);
    }
  }, [activeFileTab, criticalFocusCandidate, focusCriticalMode, priorityScoreMap]);

  useEffect(() => {
    if (!activeFileTab && visibleMonitoredFiles[0]?.fileName) {
      setActiveFileTab(visibleMonitoredFiles[0].fileName);
      return;
    }

    if (activeFileTab && !visibleMonitoredFiles.some((file) => file.fileName === activeFileTab) && visibleMonitoredFiles[0]?.fileName) {
      setActiveFileTab(visibleMonitoredFiles[0].fileName);
    }
  }, [activeFileTab, visibleMonitoredFiles]);

  const activeFileEvents = useMemo(() => {
    if (!activeFile || !uploadedDetail?.events) return [];
    return uploadedDetail.events
      .filter((event) => {
        const payload = event.payloadJson && !Array.isArray(event.payloadJson) ? event.payloadJson as Record<string, unknown> : null;
        return payload?.fileName === activeFile.fileName;
      })
      .slice(-8);
  }, [activeFile, uploadedDetail?.events]);

  function handleExportReduceLogsExcel() {
    if (selectedJobId === LOCAL_UPLOAD_LOT_ID) {
      toast.error("Aguarde o servidor criar o job (ID ctr-…) antes de exportar.");
      return;
    }
    if (!monitoredFiles.length) {
      toast.error("Não há ficheiros no lote para exportar.");
      return;
    }
    const fileExtra = new Map<string, { lastActivity: string; timeInStage: string }>();
    for (const file of monitoredFiles) {
      const lastEventAt = fileLastEventAtMap.get(file.fileName);
      const stageSince = fileCurrentStageSinceMap.get(file.fileName);
      fileExtra.set(file.fileName, {
        lastActivity: formatLastActivityLabel(lastEventAt),
        timeInStage: stageSince ? formatElapsedMs(uiNowMs - stageSince.getTime()) : "",
      });
    }
    const jobDisplayName = uploadedDetail?.job.sampleName?.trim() || analysisName.trim() || "—";
    try {
      downloadReduceLogsExcelWorkbook({
        jobId: selectedJobId,
        jobDisplayName,
        files: monitoredFiles,
        fileExtra,
      });
      toast.success("Excel gerado com as folhas Resumo, Acompanhamento e Sugestões.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o Excel.");
    }
  }

  function registerNewJobInPanel(jobId: string) {
    setTrackedJobIds((prev) => {
      const withoutPending = prev.filter((x) => x !== LOCAL_UPLOAD_LOT_ID);
      return nextTrackedAfterPrepend(jobId, withoutPending);
    });
    setSelectedJobId(jobId);
    setUploadSessionJobId(jobId);
    void utils.analysis.list.invalidate();
  }

  function stripLocalUploadPlaceholder() {
    setTrackedJobIds((prev) => prev.filter((id) => id !== LOCAL_UPLOAD_LOT_ID));
    setUploadSessionJobId((u) => (u === LOCAL_UPLOAD_LOT_ID ? null : u));
  }

  function afterRemoveFromPanelState(jobId: string) {
    setTrackedJobIds((prev) => prev.filter((x) => x !== jobId));
    if (uploadSessionJobId === jobId) {
      setUploadSessionJobId(null);
    }
    if (showRestoreHint) {
      setShowRestoreHint(false);
    }
    try {
      sessionStorage.setItem(RESTORE_BANNER_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function removeFromPanelLocalOnly(jobId: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Retirar este lote do painel local? (Não apaga dados do servidor: não submeteu este lote com esta conta.)",
      )
    ) {
      return;
    }
    afterRemoveFromPanelState(jobId);
    toast.message("Lote retirado do painel", {
      description: "Continua no Dashboard para quem o submeteu.",
    });
  }

  async function removeMyLotFromServerAndPanel(jobId: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Apagar este lote no servidor? Só lhe é permitido porque o submeteu. Deixará de aparecer no Dashboard.",
      )
    ) {
      return;
    }
    try {
      await deleteJobMutation.mutateAsync({ jobId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível apagar o lote no servidor.");
      return;
    }
    afterRemoveFromPanelState(jobId);
    void utils.analysis.list.invalidate();
    void utils.analysis.detail.invalidate({ jobId });
    toast.success("Lote apagado no servidor. Já não aparece no Dashboard.");
  }

  function dismissAllTrackedLots() {
    setTrackedJobIds([]);
    setSelectedJobId(null);
    setUploadSessionJobId(null);
    setSubmittedFiles([]);
    setActiveFileTab("");
    setShowRestoreHint(false);
    try {
      sessionStorage.setItem(RESTORE_BANNER_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    clearPersistedReduceLogsJobId();
    try {
      localStorage.removeItem("contradef_reduce_logs_tracked_job_ids_v2");
      localStorage.removeItem("contradef_reduce_logs_selected_job_id_v2");
    } catch {
      /* */
    }
    toast.message("Todos os acompanhamentos locais foram limpos", {
      description: "Os jobs continuam no Dashboard.",
    });
  }

  function handleLogFilesInputChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = Array.from(event.target.files ?? []);
    const picked = raw.filter(isAcceptedLogFile);
    setSelectedFiles(picked);
    event.target.value = "";
    if (!picked.length && raw.length > 0) {
      toast.message("Nenhum ficheiro aceite", {
        description: "Use extensões .cdf, .csv, .json, .log, .txt, .7z, .zip ou .rar.",
      });
    }
  }

  function handleLogDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!isUploading) setLogDropHover(true);
  }

  function handleLogDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setLogDropHover(false);
  }

  function handleLogDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setLogDropHover(false);
    if (isUploading) return;
    const picked = Array.from(event.dataTransfer.files ?? []).filter(isAcceptedLogFile);
    if (!picked.length) {
      toast.message("Nenhum ficheiro aceite", {
        description: "Arraste logs ou arquivo compactado (.7z, .zip, .rar) ou clique para escolher.",
      });
      return;
    }
    setSelectedFiles((prev) => mergeSelectedLogFiles(prev, picked));
  }

  async function handleReductionSubmit() {
    if (!selectedFiles.length) {
      toast.error("Selecione ao menos um arquivo de log da Contradef.");
      return;
    }

    if (!analysisName.trim()) {
      toast.error("Informe um nome para a validação antes de enviar os arquivos.");
      return;
    }

    if (selectedFiles.some((file) => file.size <= 0)) {
      toast.error("Remova arquivos vazios antes de iniciar a redução do lote.");
      return;
    }

    setIsUploading(true);
    setUploadPipelineStatus("A preparar a lista de ficheiros e a contactar o servidor…");

    setUploadSessionJobId(LOCAL_UPLOAD_LOT_ID);
    setSelectedJobId(LOCAL_UPLOAD_LOT_ID);
    setTrackedJobIds((prev) => {
      if (prev.includes(LOCAL_UPLOAD_LOT_ID)) {
        return prev;
      }
      return [LOCAL_UPLOAD_LOT_ID, ...prev].slice(0, MAX_TRACKED_LOTS);
    });

    const initialBatch = buildInitialSubmittedFiles(selectedFiles);
    setSubmittedFiles(initialBatch);
    setActiveFileTab(initialBatch[0]?.fileName ?? "");

    try {
      setDirectMultipartBytes(null);
      const submissionInput = {
        analysisName: analysisName.trim(),
        focusTerms: "",
        focusRegexes: "",
        origin: window.location.origin,
      };

      const runLegacyMultipart = async () => {
        const lotBytes = selectedFiles.reduce((s, f) => s + f.size, 0);
        setDirectMultipartBytes({ loaded: 0, total: lotBytes });
        const legacyPayload = await uploadReduceLogsLegacyWithProgress(
          { ...submissionInput, files: selectedFiles },
          ({ loaded, total, percent }) => {
            setDirectMultipartBytes({ loaded, total: total > 0 ? total : lotBytes });
            setSubmittedFiles((current) => current.map((file) => ({
              ...file,
              uploadProgress: percent,
              uploadStatus: "uploading" as ProcessingStatus,
            })));
          },
        );
        setSubmittedFiles((current) => current.map((file) => ({
          ...file,
          uploadProgress: 100,
          uploadStatus: "completed",
          uploadReused: false,
        })));
        setDirectMultipartBytes({ loaded: lotBytes, total: lotBytes });
        return legacyPayload;
      };

      setUploadPipelineStatus("A obter definições de envio (armazenamento / partes) no servidor…");
      const capabilities = await getReduceLogsUploadCapabilities().catch(() => null);
      const shouldUseLegacy = capabilities?.storageConfigured === false;

      if (shouldUseLegacy) {
        setUploadPipelineStatus("A enviar o lote (modo directo) — acompanhe a barra de progresso abaixo; não recarregue a página…");
        const legacyPayload = await runLegacyMultipart();
        const legacyJobId = legacyPayload?.job?.jobId ?? null;
        toast.success("Armazenamento partilhado (Forge) não configurado — lote enviado em modo directo (multipart).", {
          description: "Em produção, configure BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY para uploads em blocos para o object storage.",
        });
        setSelectedFiles([]);

        if (legacyJobId) {
          setUploadPipelineStatus("A sincronizar o painel com o novo job…");
          registerNewJobInPanel(legacyJobId);
          await utils.analysis.detail.invalidate({ jobId: legacyJobId });
        }

        return;
      }

      setUploadPipelineStatus("A iniciar sessão de upload no servidor…");
      const initPayload = await initReduceLogsUpload({
        ...submissionInput,
        files: selectedFiles.map((file) => ({
          fileName: file.name,
          sizeBytes: file.size,
          logType: inferLogType(file.name),
          lastModifiedMs: file.lastModified,
        })),
      }).catch(async (error) => {
        if (!isStorageCredentialsMissingError(error)) {
          throw error;
        }

        // Local/dev fallback: use the legacy multipart route when shared storage is not configured.
        setUploadPipelineStatus("A enviar o lote (modo directo) — acompanhe a barra de progresso abaixo…");
        const legacyPayload = await runLegacyMultipart();
        const legacyJobId = legacyPayload?.job?.jobId ?? null;
        toast.success("Armazenamento partilhado (Forge) não configurado — lote enviado em modo directo (multipart).", {
          description: "Em produção, configure BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY para uploads em blocos para o object storage.",
        });
        setSelectedFiles([]);

        if (legacyJobId) {
          setUploadPipelineStatus("A sincronizar o painel com o novo job…");
          registerNewJobInPanel(legacyJobId);
          await utils.analysis.detail.invalidate({ jobId: legacyJobId });
        }

        return null;
      });
      if (!initPayload) {
        stripLocalUploadPlaceholder();
        return;
      }

      setUploadPipelineStatus("A enviar ficheiros (arquivos .7z grandes podem demorar muitos minutos)…");
      const chunkSizeBytes = Math.min(initPayload.maxChunkBytes || DEFAULT_CHUNK_SIZE_BYTES, DEFAULT_CHUNK_SIZE_BYTES);

      const completionFilesPayload: UploadCompletionFilePayload[] = [];

      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        const remoteFile = initPayload.files[index];
        if (!remoteFile) {
          throw new Error(`A sessão de upload não retornou metadados para ${file.name}.`);
        }

        const isReused = Boolean(remoteFile.reused);
        const expectedChunkCount = remoteFile.chunkCount ?? Math.ceil(file.size / chunkSizeBytes);

        if (isReused) {
          flushSync(() => {
            setSubmittedFiles((current) => updateSubmittedFile(current, file.name, {
              uploadFileId: remoteFile.fileId,
              uploadStatus: "completed",
              uploadProgress: 100,
              uploadDurationMs: 0,
              uploadReused: true,
            }));
          });

          completionFilesPayload.push({
            fileId: remoteFile.fileId,
            fileName: remoteFile.fileName,
            sizeBytes: remoteFile.sizeBytes,
            logType: remoteFile.logType,
            chunkCount: expectedChunkCount,
            lastModifiedMs: file.lastModified,
            uploadDurationMs: 0,
            reused: true,
            storageSessionId: remoteFile.storageSessionId,
            storageFileId: remoteFile.storageFileId,
          });
          continue;
        }

        flushSync(() => {
          setSubmittedFiles((current) => updateSubmittedFile(current, file.name, {
            uploadFileId: remoteFile.fileId,
            uploadStatus: "uploading",
            uploadProgress: 0,
            uploadReused: false,
            uploadDurationMs: 0,
          }));
        });
        setUploadPipelineStatus(
          `A enviar ${file.name} (ficheiro ${index + 1}/${selectedFiles.length}) — 0%…`,
        );

        const uploadStartedAt = Date.now();
        let sentBytes = 0;
        let chunkIndex = 0;

        while (sentBytes < file.size) {
          const nextBoundary = Math.min(file.size, sentBytes + chunkSizeBytes);
          const chunk = file.slice(sentBytes, nextBoundary);
          const chunkPayload = await uploadReduceLogsChunk(initPayload.sessionId, remoteFile.fileId, chunkIndex, chunk);

          sentBytes = nextBoundary;
          chunkIndex += 1;
          const uploadDurationMs = Date.now() - uploadStartedAt;
          const pct = Math.round((sentBytes / file.size) * 100);
          if (chunkIndex % 2 === 0 || sentBytes >= file.size) {
            setUploadPipelineStatus(
              `A enviar ${file.name} (${index + 1}/${selectedFiles.length}) — ${pct}% do ficheiro…`,
            );
          }

          flushSync(() => {
            setSubmittedFiles((current) => updateSubmittedFile(current, file.name, {
              uploadStatus: sentBytes >= file.size ? "completed" : "uploading",
              uploadProgress: typeof chunkPayload.uploadProgress === "number"
                ? chunkPayload.uploadProgress
                : Math.round((sentBytes / file.size) * 100),
              uploadDurationMs,
              uploadReused: false,
            }));
          });
        }

        completionFilesPayload.push({
          fileId: remoteFile.fileId,
          fileName: file.name,
          sizeBytes: file.size,
          logType: inferLogType(file.name),
          chunkCount: expectedChunkCount,
          lastModifiedMs: file.lastModified,
          uploadDurationMs: Date.now() - uploadStartedAt,
          reused: false,
          storageSessionId: remoteFile.storageSessionId,
          storageFileId: remoteFile.storageFileId,
        });
      }

      setUploadPipelineStatus("A finalizar o upload no armazenamento e a criar o job de redução no servidor…");
      const payload = await completeReduceLogsUpload({
        sessionId: initPayload.sessionId,
        ...submissionInput,
        files: completionFilesPayload,
      });

      setSubmittedFiles((current) => current.map((file) => ({
        ...file,
        uploadProgress: 100,
        uploadStatus: "completed",
      })));

      const jobId = payload?.job?.jobId ?? null;
      toast.success("Upload concluído e redução iniciada com sucesso para o lote atual.");
      setSelectedFiles([]);

      if (jobId) {
        setUploadPipelineStatus("A abrir o painel do job e a pedir o estado ao servidor…");
        registerNewJobInPanel(jobId);
        await utils.analysis.detail.invalidate({ jobId });
        await utils.analysis.list.invalidate();
      } else {
        setUploadPipelineStatus("Upload concluído, mas o servidor não devolveu o ID do job — veja o Dashboard.");
      }
    } catch (error) {
      stripLocalUploadPlaceholder();
      setSubmittedFiles((current) => current.map((file) => ({
        ...file,
        uploadStatus: file.uploadProgress > 0 && file.uploadProgress >= 100 ? file.uploadStatus : "failed",
      })));
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a redução.");
    } finally {
      setIsUploading(false);
      setUploadPipelineStatus(null);
      setDirectMultipartBytes(null);
    }
  }

  return (
    <DashboardLayout>
      <div className="w-full min-w-0 space-y-6 text-foreground">
        <section>
          <Card className="border-border bg-card text-card-foreground shadow-md dark:border-white/10 dark:bg-slate-950/80 dark:shadow-2xl dark:shadow-cyan-950/20">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-cyan-500/35 bg-cyan-500/15 text-cyan-800 dark:border-cyan-400/25 dark:bg-cyan-500/10 dark:text-cyan-300">
                  Reduzir Logs
                </Badge>
                <Badge variant="outline" className="border-border text-muted-foreground dark:border-white/10">
                  Lote atual + monitoramento por arquivo
                </Badge>
              </div>
              <CardTitle className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Redução com acompanhamento individual de cada log submetido
              </CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section>
          <Card className="border-border bg-card text-card-foreground shadow-md dark:border-cyan-400/15 dark:bg-slate-950/80 dark:shadow-xl dark:shadow-slate-950/30">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <UploadCloud className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
                  <div>
                    <CardTitle>Enviar lote de logs para reduzir</CardTitle>
                  </div>
                </div>
                <Badge variant="outline" className="border-border text-muted-foreground dark:border-white/10">
                  {trackedJobIds.length
                    ? `${trackedJobIds.length} lote(s) a acompanhar nesta sessão`
                    : "Nenhum lote na lista local"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2 lg:col-span-2">
                  <label className="text-sm font-medium text-foreground">Nome da validação</label>
                  <Input
                    value={analysisName}
                    onChange={(event) => setAnalysisName(event.target.value)}
                    className="border-border bg-background dark:bg-slate-950/80"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Use o texto fixo <span className="font-medium text-foreground">{ANALYSIS_NAME_PREFIX.trimEnd()}</span> e acrescente o SHA-256 da amostra em hexadecimal (64 caracteres), sem espaços — por exemplo{" "}
                    <span className="font-mono text-muted-foreground">{ANALYSIS_NAME_PREFIX}36685efcf34c7a7a6f6dd2e48199e4700b5ab8fe3945a50297703dd8daced74f</span>
                    . O hash de ficheiros já reduzidos para comparar no fim do fluxo será tratado noutro ecrã.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" id="reduce-logs-file-label">
                  Arquivos de log
                </label>
                <input
                  ref={logFilesInputRef}
                  type="file"
                  multiple
                  accept={LOG_FILE_ACCEPT}
                  className="sr-only"
                  aria-labelledby="reduce-logs-file-label"
                  disabled={isUploading}
                  onChange={handleLogFilesInputChange}
                />
                <div
                  role="button"
                  tabIndex={isUploading ? -1 : 0}
                  aria-labelledby="reduce-logs-file-label"
                  className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 dark:focus-visible:ring-cyan-400/50 ${
                    logDropHover
                      ? "border-cyan-500/55 bg-cyan-500/15 dark:border-cyan-400/60 dark:bg-cyan-500/15"
                      : "border-cyan-500/40 bg-cyan-500/10 hover:border-cyan-500/55 hover:bg-cyan-500/15 dark:border-cyan-400/30 dark:bg-cyan-500/[0.07] dark:hover:border-cyan-400/45 dark:hover:bg-cyan-500/10"
                  } ${isUploading ? "pointer-events-none opacity-60" : ""}`}
                  onClick={() => {
                    if (!isUploading) logFilesInputRef.current?.click();
                  }}
                  onKeyDown={(event) => {
                    if (isUploading) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      logFilesInputRef.current?.click();
                    }
                  }}
                  onDragOver={handleLogDragOver}
                  onDragLeave={handleLogDragLeave}
                  onDrop={handleLogDrop}
                >
                  <UploadCloud className="h-10 w-10 text-cyan-600/90 dark:text-cyan-300/90" aria-hidden />
                  <p className="mt-4 text-sm font-medium text-foreground">
                    Clique para escolher ou arraste os ficheiros para esta zona
                  </p>
                  <p className="mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground">
                    Inclua <span className="font-medium text-foreground">FunctionInterceptor</span>,{" "}
                    <span className="font-medium text-foreground">TraceFcnCall</span>,{" "}
                    <span className="font-medium text-foreground">TraceMemory</span>,{" "}
                    <span className="font-medium text-foreground">TraceInstructions</span> ou{" "}
                    <span className="font-medium text-foreground">TraceDisassembly</span>. Também pode enviar um ficheiro{" "}
                    <span className="font-medium text-foreground">.7z</span>,{" "}
                    <span className="font-medium text-foreground">.zip</span> ou{" "}
                    <span className="font-medium text-foreground">.rar</span> com vários logs.
                  </p>
                  <p className="mt-3 font-mono text-[11px] tracking-wide text-muted-foreground">
                    {LOG_FILE_ACCEPT.replace(/,/g, " · ")}
                  </p>
                </div>
              </div>

              {selectedFiles.length > 0 ? (
                <div className="rounded-2xl border border-border bg-muted/40 p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-sm font-medium text-foreground">Arquivos selecionados para a próxima execução</p>
                  <div className="mt-3 overflow-hidden rounded-xl border border-border dark:border-white/10">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Arquivo</TableHead>
                          <TableHead>Tipo inferido</TableHead>
                          <TableHead>Tamanho local</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedFiles.map((file) => (
                          <TableRow key={`${file.name}-${file.size}`}>
                            <TableCell className="font-medium text-foreground">{file.name}</TableCell>
                            <TableCell>{inferLogType(file.name)}</TableCell>
                            <TableCell>{formatBytes(file.size)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/5">
                  Nenhum ficheiro selecionado.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleReductionSubmit} disabled={isUploading} className="transition duration-200 hover:-translate-y-0.5">
                  {isUploading ? "Enviando lote e iniciando redução..." : "Executar redução com upload"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="min-w-0 border-border bg-card text-card-foreground shadow-md dark:border-emerald-400/15 dark:bg-slate-950/80 dark:shadow-xl dark:shadow-slate-950/30">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Monitoramento dos lotes (esta sessão)</CardTitle>
                  {selectedJobId ? (
                    <div className="mt-1 max-w-3xl text-xs text-muted-foreground">
                      <p>
                        {!submittedDetailQuery.dataUpdatedAt && submittedDetailQuery.isFetching
                          ? "A pedir estado ao servidor…"
                          : submittedDetailQuery.dataUpdatedAt
                            ? `Última resposta do servidor: ${formatDateTimeLocale(new Date(submittedDetailQuery.dataUpdatedAt))}${
                              submittedDetailQuery.isFetching ? " · a atualizar…" : ""
                            }.`
                            : "A aguardar a primeira resposta do servidor…"}
                        {isReduceLogsDebugEnabled() ? (
                          <span className="ml-2 font-mono text-[10px] text-emerald-400/90">(debug consola)</span>
                        ) : null}
                      </p>
                      {isReduceLogsDebugEnabled() && uploadedDetail?.serverProcessDebug ? (
                        <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-emerald-500/35 bg-black/60 p-2 font-mono text-[10px] leading-relaxed text-emerald-100/95">
                          {JSON.stringify(uploadedDetail.serverProcessDebug, null, 2)}
                        </pre>
                      ) : null}
                      {isReduceLogsDebugEnabled() && !isLocalUploadLotSelected && uploadedDetail && !uploadedDetail.serverProcessDebug
                        && !submittedDetailQuery.isLoading ? (
                          <p className="mt-1.5 text-[10px] text-amber-200/90">
                            Sem snapshot do servidor: defina a variável <span className="font-mono">CONTRADEF_SERVER_DEBUG=1</span> no
                            alojamento (e redeploy) para ver memória, CPU, disco e espaço no diretório de trabalho a cada
                            resposta.
                          </p>
                        ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedJobId && !authLoading && canServerDeleteJob(selectedJobId) ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="shrink-0 border-rose-600/50 bg-rose-600/90 text-white shadow-sm hover:bg-rose-600 focus-visible:ring-rose-500 dark:border-rose-500/60 dark:bg-rose-700/90 dark:hover:bg-rose-600"
                      disabled={deleteJobMutation.isPending}
                      onClick={() => {
                        if (selectedJobId) {
                          void removeMyLotFromServerAndPanel(selectedJobId);
                        }
                      }}
                    >
                      Apagar lote (meu)
                    </Button>
                  ) : null}
                  {selectedJobId && !authLoading && !canServerDeleteJob(selectedJobId) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-amber-500/50 text-amber-900 hover:bg-amber-500/12 dark:border-amber-400/45 dark:text-amber-100 dark:hover:bg-amber-950/50"
                      onClick={() => {
                        if (selectedJobId) {
                          removeFromPanelLocalOnly(selectedJobId);
                        }
                      }}
                    >
                      Retirar lote selecionado do painel
                    </Button>
                  ) : null}
                  {trackedJobIds.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-cyan-500/45 text-cyan-900 hover:bg-cyan-500/10 dark:border-cyan-400/40 dark:text-cyan-100 dark:hover:bg-cyan-950/40"
                      disabled={isUploading}
                      onClick={dismissAllTrackedLots}
                    >
                      Limpar lista local
                    </Button>
                  ) : null}
                  <Badge className="border-emerald-500/35 bg-emerald-500/15 text-emerald-900 dark:border-emerald-400/25 dark:text-emerald-300">
                    {selectedJobId
                      ? selectedJobId === LOCAL_UPLOAD_LOT_ID
                        ? "A ver: lote a enviar (aguarda job no servidor)"
                        : `A ver: ${selectedJobId}`
                      : "escolher lote abaixo"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="min-w-0 space-y-5">
              {uploadPipelineStatus && (
                <div className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-950 dark:border-cyan-400/30 dark:bg-cyan-950/40 dark:text-cyan-50">
                  <p className="font-medium text-cyan-900 dark:text-cyan-100">Estado do envio (servidor)</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-cyan-900/95 dark:text-cyan-100/95">{uploadPipelineStatus}</p>
                  {directMultipartBytes && directMultipartBytes.total > 0 ? (
                    <div className="mt-3 space-y-1.5" role="status" aria-live="polite">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] font-medium text-cyan-900 dark:text-cyan-100">
                        <span>Progresso do envio (dados a sair do seu browser)</span>
                        <span className="tabular-nums text-cyan-800 dark:text-cyan-200">
                          {Math.min(
                            100,
                            Math.round((directMultipartBytes.loaded / directMultipartBytes.total) * 100),
                          )}
                          % · {formatBytes(directMultipartBytes.loaded)} / {formatBytes(directMultipartBytes.total)}
                        </span>
                      </div>
                      <ProgressStrip
                        className="h-2.5 sm:h-3"
                        tone="amber"
                        value={Math.min(
                          100,
                          Math.round((directMultipartBytes.loaded / directMultipartBytes.total) * 100),
                        )}
                      />
                    </div>
                  ) : null}
                  <p className="mt-2 text-[11px] text-cyan-800/80 dark:text-cyan-200/80">
                    {directMultipartBytes && directMultipartBytes.total > 0 ? (
                      <>
                        O alojamento pode demorar a responder (ex.: instância a acordar). Não recarregue a página até a barra
                        acima chegar a 100% ou aparecer a mensagem de conclusão.
                      </>
                    ) : (
                      <>
                        O alojamento pode demorar a responder (ex.: instância a acordar). Acompanhe o progresso por ficheiro na
                        secção laranja abaixo e não recarregue até o envio terminar ou surgir mensagem de erro/conclusão.
                      </>
                    )}
                  </p>
                </div>
              )}
              {isUploading && submittedFiles.length > 0 ? (
                <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/5 dark:text-amber-50">
                  <p className="font-medium text-amber-900 dark:text-amber-100">Envio do lote em curso</p>
                  <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-100/90">
                    Os ficheiros abaixo mostram o progresso de cada parte. Depois do envio, o servidor cria o job, extrai 7z/zip se for o caso, e só aí a tabela de redução fica preenchida — pode levar minutos.
                  </p>
                  <ul className="mt-2 max-h-40 list-inside list-disc space-y-1 overflow-y-auto text-xs">
                    {submittedFiles.map((f) => (
                      <li key={f.fileName}>
                        <span className="font-mono">{f.fileName}</span>
                        {" · "}
                        {f.uploadStatus === "uploading"
                          ? `${f.uploadProgress}% enviado`
                          : f.uploadStatus === "completed"
                            ? "enviado"
                            : f.uploadStatus === "failed"
                              ? "falhou no envio"
                              : f.uploadStatus}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {trackedJobIds.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Lotes a acompanhar (clique para expandir o painel)</p>
                  <div className="flex flex-wrap gap-2">
                    {trackedJobIds.map((lotId) => {
                      const row = jobRowById.get(lotId);
                      const isSel = lotId === selectedJobId;
                      return (
                        <div
                          key={lotId}
                          className={`flex max-w-full flex-wrap items-center gap-1 rounded-xl border px-2.5 py-1.5 text-left text-xs transition-colors ${
                            isSel
                              ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-50 dark:border-cyan-400/50"
                              : "border-border bg-muted/50 text-foreground dark:border-white/10 dark:bg-slate-950/80"
                          }`}
                        >
                          <button
                            type="button"
                            className="min-w-0 text-left font-medium"
                            onClick={() => {
                              setSelectedJobId(lotId);
                            }}
                          >
                            <span className="block truncate font-mono text-[10px] opacity-80">
                              {lotId === LOCAL_UPLOAD_LOT_ID ? "envio (sem job ainda no servidor)" : lotId}
                            </span>
                            <span className="block truncate">
                              {lotId === LOCAL_UPLOAD_LOT_ID ? (analysisName.trim() || "Novo lote") : (row?.sampleName ?? "…")}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {lotId === LOCAL_UPLOAD_LOT_ID
                                ? `A enviar ficheiros · ~${localUploadAverageProgress}% (média)`
                                : row
                                  ? `${getStatusLabel(row.status)} · ${row.progress}%`
                                  : "a carregar…"}
                            </span>
                          </button>
                          {authLoading ? (
                            <span
                              className="inline-flex h-7 min-w-7 items-center justify-center text-[10px] text-muted-foreground/50"
                              title="A carregar sessão…"
                            >
                              …
                            </span>
                          ) : lotId === LOCAL_UPLOAD_LOT_ID && isUploading ? (
                            <span
                              className="inline-flex h-7 min-w-7 items-center justify-center text-[10px] text-muted-foreground/50"
                              title="Aguarde o fim do envio para retirar"
                            >
                              …
                            </span>
                          ) : canServerDeleteJob(lotId) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-1.5 text-[10px] text-muted-foreground"
                              disabled={deleteJobMutation.isPending}
                              onClick={() => {
                                void removeMyLotFromServerAndPanel(lotId);
                              }}
                              aria-label={`Apagar o lote ${lotId} no servidor (só o autor)`}
                            >
                              ✕
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-1.5 text-[10px] text-muted-foreground"
                              onClick={() => {
                                removeFromPanelLocalOnly(lotId);
                              }}
                              aria-label={`Retirar ${lotId} do painel local (não apaga o servidor)`}
                            >
                              ✕
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {showRestoreHint && trackedJobIds.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-cyan-500/35 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-950 dark:border-cyan-400/25 dark:text-cyan-50 sm:flex-row sm:items-center sm:justify-between">
                  <p className="leading-relaxed">
                    <span className="font-medium text-cyan-900 dark:text-cyan-100">Há {trackedJobIds.length} lote(s) guardado(s) neste navegador.</span>{" "}
                    A lista fica no painel acima; não perde o anterior quando submete outro.{" "}
                    <Link className="font-medium text-cyan-800 underline underline-offset-2 dark:text-cyan-200" href="/">Ver tudo no Dashboard</Link>
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-cyan-900 hover:bg-cyan-500/20 hover:text-cyan-950 dark:text-cyan-100 dark:hover:text-white"
                    onClick={() => {
                      try {
                        sessionStorage.setItem(RESTORE_BANNER_SESSION_KEY, "1");
                      } catch {
                        /* ignore */
                      }
                      setShowRestoreHint(false);
                    }}
                  >
                    Entendi
                  </Button>
                </div>
              ) : null}
              {submittedDetailQuery.isError && selectedJobId && !isLocalUploadLotSelected ? (
                <div className="rounded-2xl border border-rose-400/35 bg-rose-500/10 p-5 text-sm leading-6 text-rose-950 dark:border-rose-400/25 dark:text-rose-100">
                  <p className="font-medium text-foreground">
                    Não foi possível carregar o detalhe completo deste job (pode ter expirado, rede ou o identificador deixou de ser válido).
                  </p>
                  <p className="mt-1 text-xs text-rose-900/90 dark:text-rose-200/90">
                    {submittedDetailQuery.error?.message
                      ? String(submittedDetailQuery.error.message)
                      : "Erro ao contactar o servidor."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-rose-400/50"
                      onClick={() => {
                        void submittedDetailQuery.refetch();
                      }}
                      disabled={submittedDetailQuery.isFetching}
                    >
                      {submittedDetailQuery.isFetching ? "A tentar…" : "Tentar novamente"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (selectedJobId) {
                          removeFromPanelLocalOnly(selectedJobId);
                        }
                      }}
                    >
                      Retirar este lote do painel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-rose-900 dark:text-rose-100"
                      onClick={dismissAllTrackedLots}
                    >
                      Limpar lista local
                    </Button>
                  </div>
                </div>
              ) : null}
              {selectedJobId
                && selectedJobId !== LOCAL_UPLOAD_LOT_ID
                && submittedDetailQuery.isSuccess
                && !uploadedDetail
                && !submittedDetailQuery.isFetching ? (
                <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-5 text-sm leading-6 text-amber-950 dark:border-amber-400/30 dark:text-amber-100">
                  O servidor devolveu resposta vazia para o job <span className="font-mono">{selectedJobId}</span>. Pode não existir para esta conta, ou ainda não estar indexado.{" "}
                  <Link className="font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-200" href="/">Abrir o Dashboard</Link> para confirmar.
                </div>
              ) : monitorDetailLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-cyan-500/35 bg-cyan-500/10 p-10 text-center text-sm text-muted-foreground dark:border-cyan-400/20 dark:bg-cyan-500/5">
                  <RefreshCw className="h-8 w-8 animate-spin text-cyan-600/80 dark:text-cyan-300/80" />
                  <p className="max-w-md text-foreground">A aguardar o primeiro estado do lote a partir do servidor…</p>
                  <p className="max-w-md text-xs text-muted-foreground">
                    Em alojamento gratuito o contentor pode estar a &quot;acordar&quot; após inatividade (30–60+ s). O ID do lote fica no chip acima, se já foi criado.
                  </p>
                </div>
              ) : showJobStatusWithoutFileTable && uploadedDetail ? (
                <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-5 text-sm leading-6 dark:border-white/10 dark:bg-slate-950/60">
                  <p className="font-medium text-foreground">Lote ativo no servidor (lista de ficheiros a carregar)</p>
                  <p className="text-xs text-muted-foreground">
                    Comum ao enviar um <span className="font-medium">.7z / .zip</span>: o job já existe, mas a lista por ficheiro só aparece após a extração e os primeiros eventos. Abaixo segue o estado geral; aguarde ou veja o registo.
                  </p>
                  <div className="grid gap-2 rounded-xl border border-border/80 bg-background/80 px-3 py-2.5 text-xs font-mono dark:border-white/10">
                    <div className="flex flex-wrap justify-between gap-2 text-foreground">
                      <span>Job</span>
                      <span className="truncate pl-2">{uploadedDetail.job.jobId}</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-muted-foreground">Estado</span>
                      <span>
                        {getStatusLabel(uploadedDetail.job.status)} · {formatPercentRounded(uploadedDetail.job.progress)}%
                      </span>
                    </div>
                    <div className="text-muted-foreground">Etapa: {uploadedDetail.job.stage}</div>
                    {uploadedDetail.job.message ? (
                      <p className="pt-1 text-[11px] leading-relaxed text-foreground/90">{uploadedDetail.job.message}</p>
                    ) : null}
                  </div>
                  {uploadedDetail.job.stdoutTail ? (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Última actividade (servidor)</p>
                      <pre className="max-h-32 overflow-y-auto rounded-lg border border-border/60 bg-black/20 p-2 text-[10px] text-emerald-200/90 dark:border-white/10">
                        {uploadedDetail.job.stdoutTail}
                      </pre>
                    </div>
                  ) : null}
                </div>
              ) : isUploading && isOnlyArchiveSubmission && !monitoredFiles.length ? (
                <div className="rounded-2xl border border-dashed border-cyan-500/35 bg-cyan-500/5 p-5 text-sm text-muted-foreground dark:border-cyan-400/25 dark:bg-cyan-950/20">
                  A tabela de acompanhamento lista os logs <span className="text-foreground">após a extração</span> do arquivo compactado no servidor (não o .7z em si).
                </div>
              ) : !showMainMonitoringPanel ? (
                submittedDetailQuery.isError && !isLocalUploadLotSelected && selectedJobId && !selectedListRow ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-rose-400/30 bg-rose-500/5 p-8 text-center text-sm text-muted-foreground dark:border-rose-400/20 dark:bg-rose-950/20">
                    <p className="text-foreground">A aguardar a linha deste lote na lista (actualização ~10 s)…</p>
                    <p className="max-w-md text-xs">
                      O detalhe do job falhou; se o chip acima mostrar o ID, tente <span className="text-foreground">Tentar novamente</span> no aviso. Se a lista ainda não mostrar o lote, abra o Dashboard.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground dark:border-white/10 dark:bg-black/20">
                    <p>
                      Ainda sem lote nesta vista: escolha ficheiros acima e use <span className="font-medium text-foreground">Executar redução com upload</span>, ou
                      {" "}
                      <Link className="font-medium text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-300" href="/">abra o Dashboard</Link>{" "}
                      se o job já tiver sido criado.
                    </p>
                    <p className="text-xs">
                      Se submeteu e recarregou, a lista de lotes a acompanhar vem do navegador: sem chip acima, adicione o lote a partir do Centro ou volte a enviar. Em produção, um refresh longo pode ocorrer enquanto o serviço inicia.
                    </p>
                  </div>
                )
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-4">
                    <MetricCard
                      icon={RefreshCw}
                      label="Status do lote"
                      value={uploadedDetail
                        ? getStatusLabel(uploadedDetail.job.status)
                        : isUploading
                          ? "A enviar"
                          : selectedListRow
                            ? getStatusLabel(selectedListRow.status)
                            : "Em preparação"}
                      helper={uploadedDetail
                        ? `${uploadedDetail.job.progress}% · ${uploadedDetail.job.stage}${staleRunningFiles.length ? ` · ${staleRunningFiles.length} arquivo(s) sem atualização recente` : ""}`
                        : isLocalUploadLotSelected
                          ? `Envio em curso · ~${localUploadAverageProgress}% (média) · ainda sem job no servidor`
                          : selectedListRow
                            ? submittedDetailQuery.isError
                              ? `${selectedListRow.progress}% (lista) — detalhe do job indisponível; use «Tentar novamente» se necessário.`
                              : `${selectedListRow.progress}% (lista) · ${monitoredFiles.length} arquivo(s) no lote`
                            : `${monitoredFiles.length} arquivo(s) no lote atual`}
                    />
                    <MetricCard
                      icon={Database}
                      label="Arquivos no lote"
                      value={`${monitoredFiles.length}`}
                      helper={`${batchSummary?.completedFiles ?? 0} concluído(s), ${batchSummary?.runningFiles ?? 0} em processamento, ${batchSummary?.failedFiles ?? 0} com falha`}
                    />
                    <MetricCard
                      icon={FileArchive}
                      label="Tamanho consolidado"
                      value={formatBytes(batchSummary?.totalOriginalBytes ?? 0)}
                      helper={`${batchSummary?.totalOriginalLines ?? 0} linhas antes da redução`}
                    />
                    <MetricCard
                      icon={ShieldCheck}
                      label="Redução consolidada"
                      value={formatPercentFine(batchSummary?.reductionPercent ?? 0)}
                      helper={`${batchSummary?.discardedLines ?? 0} linhas descartadas no lote atual`}
                    />
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                    <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Intervalo de actualização do estado</span>
                      <select
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground dark:bg-slate-950"
                        value={String(pollIntervalMs)}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!POLL_MS_OPTIONS.includes(v as (typeof POLL_MS_OPTIONS)[number])) return;
                          setPollIntervalMs(v);
                          try {
                            localStorage.setItem(REDUCE_LOGS_POLL_MS_KEY, String(v));
                          } catch {
                            /* private mode */
                          }
                        }}
                      >
                        {POLL_MS_OPTIONS.map((ms) => (
                          <option key={ms} value={String(ms)}>
                            {ms / 1000} s{ms === DEFAULT_REDUCE_LOGS_POLL_MS ? " (predefinido)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {uploadedDetail?.job
                  && (uploadedDetail.job.status === "running" || uploadedDetail.job.status === "queued")
                  && (uploadedDetail.job.stdoutTail
                    || /A processar|Processando/.test(uploadedDetail.job.message ?? "")) ? (
                    <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/35 p-4 dark:border-cyan-400/20">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">Registo de leitura no servidor</p>
                        </div>
                        <code className="max-w-full shrink-0 break-all rounded border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-900 dark:text-cyan-100/90">
                          {uploadedDetail.job.message}
                        </code>
                      </div>
                      <pre
                        ref={activityLogRef}
                        className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-border/60 bg-black/35 p-3 font-mono text-[11px] leading-relaxed text-cyan-100/95 dark:border-white/10"
                      >
                        {uploadedDetail.job.stdoutTail || "A iniciar leitura e agregar linhas (aguarde o primeiro ponto de controlo)…"}
                      </pre>
                    </div>
                  ) : null}

                  <Tabs defaultValue="overview" className="min-w-0 space-y-5">
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Área do lote</p>
                      <TabsList className="flex h-auto w-full flex-wrap justify-stretch gap-1.5 rounded-2xl border border-cyan-500/35 bg-muted p-1.5 shadow-inner dark:border-cyan-500/25 dark:bg-slate-950/90 dark:shadow-black/40 md:inline-flex md:w-full md:min-w-0">
                        <TabsTrigger
                          value="overview"
                          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground data-[state=active]:border-cyan-500/50 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-900 data-[state=active]:shadow-sm data-[state=active]:hover:bg-cyan-500/25 dark:data-[state=active]:border-cyan-400/55 dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_20px_-4px_rgba(34,211,238,0.35)]"
                        >
                          <LayoutDashboard className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                          Visão geral
                        </TabsTrigger>
                        <TabsTrigger
                          value="files"
                          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground data-[state=active]:border-cyan-500/50 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-900 data-[state=active]:shadow-sm data-[state=active]:hover:bg-cyan-500/25 dark:data-[state=active]:border-cyan-400/55 dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_20px_-4px_rgba(34,211,238,0.35)]"
                        >
                          <FolderOpen className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                          Arquivos
                        </TabsTrigger>
                        <TabsTrigger
                          value="operational"
                          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground data-[state=active]:border-cyan-500/50 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-900 data-[state=active]:shadow-sm data-[state=active]:hover:bg-cyan-500/25 dark:data-[state=active]:border-cyan-400/55 dark:data-[state=active]:text-cyan-50 dark:data-[state=active]:shadow-[0_0_20px_-4px_rgba(34,211,238,0.35)]"
                        >
                          <SlidersHorizontal className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                          Operacional
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="overview" className="min-w-0 space-y-4">

                  {showsLocalStorageModeBadge ? (
                    <div className="rounded-2xl border border-amber-400/35 bg-amber-500/10 p-4 text-sm leading-6 text-amber-950 dark:border-amber-400/25 dark:text-amber-100">
                      Execução concluída sem envio ao storage remoto (Forge). O processamento e as métricas foram gerados normalmente; use os links de download abaixo para acessar a cópia mantida no servidor, quando existir.
                    </div>
                  ) : null}

                    </TabsContent>

                    <TabsContent value="files" className="min-w-0 space-y-4">

                  <div className="w-full min-w-0 max-w-full rounded-2xl border border-border bg-muted/50 p-4 dark:border-white/10 dark:bg-black/20">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Acompanhamento por arquivo</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Concluído: descarregar o texto reduzido (linhas mantidas) para comparar com o original.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-emerald-600/35 text-emerald-900 hover:bg-emerald-500/10 dark:border-emerald-400/30 dark:text-emerald-100"
                          disabled={!monitoredFiles.length || selectedJobId === LOCAL_UPLOAD_LOT_ID}
                          onClick={handleExportReduceLogsExcel}
                        >
                          <FileSpreadsheet className="mr-2 h-4 w-4" />
                          Exportar Excel
                        </Button>
                        <Badge variant="outline" className="border-border text-muted-foreground dark:border-white/10">
                          {uploadedDetail?.currentPhase ?? "lote em preparação"}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-6 rounded-xl border-2 border-cyan-500/40 bg-cyan-500/[0.06] p-4 shadow-sm dark:border-cyan-400/35 dark:bg-cyan-950/25">
                      <div className="mb-3 flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-700 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-200">
                          <Filter className="h-4 w-4" aria-hidden />
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-semibold leading-tight text-foreground">Filtro da tabela de ficheiros</p>
                          <p className="text-xs text-muted-foreground">Aplica-se à grelha logo abaixo (não ao Excel).</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={`border-border dark:border-white/10 ${fileQuickFilter === "stalled" ? "bg-amber-500/15 text-amber-900 dark:text-amber-200" : "text-muted-foreground"}`}
                        onClick={() => setFileQuickFilter((current) => current === "stalled" ? "all" : "stalled")}
                      >
                        {fileQuickFilter === "stalled" ? "Filtro: possivelmente travados" : "Mostrar só possivelmente travados"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={`border-border dark:border-white/10 ${fileQuickFilter === "running" ? "bg-cyan-500/15 text-cyan-900 dark:text-cyan-200" : "text-muted-foreground"}`}
                        onClick={() => setFileQuickFilter((current) => current === "running" ? "all" : "running")}
                      >
                        {fileQuickFilter === "running" ? "Filtro: em processamento" : "Mostrar só em processamento"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={`border-border dark:border-white/10 ${fileQuickFilter === "completed" ? "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200" : "text-muted-foreground"}`}
                        onClick={() => setFileQuickFilter((current) => current === "completed" ? "all" : "completed")}
                      >
                        {fileQuickFilter === "completed" ? "Filtro: concluídos" : "Mostrar só concluídos"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={`border-border dark:border-white/10 ${sortByPriority ? "bg-violet-500/15 text-violet-900 dark:text-violet-200" : "text-muted-foreground"}`}
                        onClick={() => setSortByPriority((current) => !current)}
                      >
                        {sortByPriority ? "Ordenação: prioridade analítica" : "Ordenar por prioridade analítica"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={`border-border dark:border-white/10 ${focusCriticalMode ? "bg-rose-500/15 text-rose-900 dark:text-rose-200" : "text-muted-foreground"}`}
                        onClick={() => setFocusCriticalMode((current) => !current)}
                      >
                        {focusCriticalMode ? "Foco crítico automático ativo" : "Ativar foco crítico automático"}
                      </Button>
                      <Badge variant="outline" className="border-border text-muted-foreground dark:border-white/10">
                        {stalledFileNameSet.size} arquivo(s) em atenção
                      </Badge>
                      </div>
                    </div>

                    {fileQuickFilter !== "all" && visibleMonitoredFiles.length === 0 ? (
                      <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/60 p-3 text-sm text-muted-foreground dark:border-white/10 dark:bg-slate-950/50">
                        Nenhum arquivo corresponde ao filtro selecionado no momento.
                      </div>
                    ) : null}

                    <div className="mt-4 hidden w-full min-w-0 max-w-full overflow-x-hidden rounded-xl border border-border md:block dark:border-white/10">
                      <div className={`${FILE_TRACKING_GRID_10} border-b-2 border-border`}>
                        <div className={fileTrackTh}>Arquivo</div>
                        <div className={fileTrackTh}>Upload</div>
                        <div className={fileTrackTh}>Processamento</div>
                        <div className={fileTrackTh}>Etapa atual</div>
                        <div className={`${fileTrackTh} tabular-nums`}>Antes</div>
                        <div className={`${fileTrackTh} tabular-nums`}>Depois</div>
                        <div className={`${fileTrackTh} tabular-nums`}>Reduzido</div>
                        <div className={fileTrackTh}>Sinais</div>
                        <div className={fileTrackTh} title="Indicador heurístico (preservado / rotina / …)">Semáforo</div>
                        <div className={fileTrackTh} title="Descarregar log reduzido (.txt)">Download</div>
                      </div>
                      {visibleMonitoredFiles.map((file) => {
                        const reduction = file.originalBytes > 0 ? 100 * (1 - file.reducedBytes / file.originalBytes) : 0;
                        const uploadVisual = getUploadStatusVisual(file.uploadStatus);
                        const processingVisual = getProcessingStatusVisual(file.processingStatus);
                        const lastEventAt = fileLastEventAtMap.get(file.fileName);
                        const isPossiblyStalled = file.processingStatus === "running" && (!lastEventAt || (uiNowMs - lastEventAt.getTime() > staleThresholdMsForFile(file)));
                        const stageSince = fileCurrentStageSinceMap.get(file.fileName);
                        const stageElapsedMs = stageSince ? uiNowMs - stageSince.getTime() : 0;
                        const isStageLong = stageElapsedMs > STAGE_WARNING_THRESHOLD_MS && (file.processingStatus === "running" || file.processingStatus === "queued");

                        const canDownloadReduced =
                          Boolean(selectedJobId)
                          && selectedJobId !== LOCAL_UPLOAD_LOT_ID
                          && file.processingStatus === "completed"
                          && file.reducedLineCount > 0;

                        return (
                          <div
                            key={`${selectedJobId ?? "lote"}-${file.fileName}`}
                            className={`${FILE_TRACKING_GRID_10} border-b border-border [align-items:start] ${processingVisual.row}`}
                          >
                            <div className={fileTrackTd} title={file.fileName}>
                              {file.fileName}
                            </div>
                            <div className={fileTrackTd}>
                              <div className="space-y-2">
                                <div className={`flex min-w-0 flex-wrap items-center justify-between gap-x-1 gap-y-0.5 text-xs ${uploadVisual.label}`}>
                                  <span className="flex min-w-0 flex-wrap items-center gap-1">
                                    <Badge className={`max-w-full shrink ${uploadVisual.badge}`}>{getStatusLabel(file.uploadStatus)}</Badge>
                                  </span>
                                  <span className="shrink-0">{file.uploadProgress}%</span>
                                </div>
                                <ProgressStrip value={file.uploadProgress} tone={uploadVisual.progressTone} />
                              </div>
                            </div>
                            <div className={fileTrackTd}>
                              <div className="space-y-2">
                                <div className={`flex min-w-0 flex-wrap items-center justify-between gap-x-1 gap-y-0.5 text-xs ${processingVisual.label}`}>
                                  <span className="flex min-w-0 flex-wrap items-center gap-1">
                                    <Badge className={`max-w-full shrink ${processingVisual.badge}`}>{getStatusLabel(file.processingStatus)}</Badge>
                                    {isPossiblyStalled ? <span className="text-[10px] text-amber-200">sem act.</span> : null}
                                  </span>
                                  <span className="shrink-0">{formatFileProcessingPercent(file.processingProgress)}</span>
                                </div>
                                <ProgressStrip
                                  value={file.processingProgress ?? 0}
                                  indeterminate={file.processingProgress == null && file.processingStatus === "running"}
                                  tone={processingVisual.progressTone}
                                />
                              </div>
                            </div>
                            <div className={fileTrackTd}>
                              <div className="flex w-full min-w-0 flex-col gap-0.5 pr-0.5">
                                <p
                                  className="line-clamp-1 text-[11px] font-medium leading-tight text-foreground"
                                  title={file.currentStage}
                                >
                                  {file.currentStage}
                                </p>
                                <p
                                  className="line-clamp-2 max-h-[2.5rem] text-[10px] leading-snug text-muted-foreground [overflow-wrap:anywhere]"
                                  title={file.currentStep}
                                >
                                  {file.currentStep}
                                </p>
                                <p className="text-[9px] leading-tight text-muted-foreground/90 [overflow-wrap:anywhere]">
                                  <span>{formatLastActivityLabel(lastEventAt)}</span>
                                  {stageSince ? (
                                    <span className={isStageLong ? " text-amber-200" : ""}>
                                      {" "}
                                      · {formatElapsedMs(stageElapsedMs)} nesta etapa
                                    </span>
                                  ) : null}
                                </p>
                              </div>
                            </div>
                            <div className={`${fileTrackTd} whitespace-nowrap text-left text-[11px] tabular-nums`}>{formatBytes(file.originalBytes)}</div>
                            <div className={`${fileTrackTd} whitespace-nowrap text-left text-[11px] tabular-nums`}>{formatBytes(file.reducedBytes)}</div>
                            <div className={`${fileTrackTd} whitespace-nowrap text-left text-[11px] tabular-nums`}>{formatPercentFine(reduction)}</div>
                            <div className={`${fileTrackTd} text-[10px] leading-tight text-muted-foreground`}>
                              <span className="text-foreground">{file.suspiciousEventCount}</span> evt
                              <span className="mx-0.5 text-muted-foreground/70">·</span>
                              <span className="text-foreground">{file.triggerCount}</span> gat.
                            </div>
                            <div className={`${fileTrackTd} break-words text-xs [overflow-wrap:anywhere] ${getSemaforoTone(file)}`}>{getSemaforo(file)}</div>
                            <div className={`${fileTrackTd} p-0.5`}>
                              {canDownloadReduced && selectedJobId ? (
                                <a
                                  href={buildReducedLogDownloadUrl(selectedJobId, file.fileName)}
                                  className="inline-flex justify-start rounded-md p-1.5 text-cyan-700 hover:bg-cyan-500/15 hover:underline dark:text-cyan-300"
                                  title="Descarregar linhas reduzidas (.txt) para comparar com o ficheiro original"
                                  aria-label={`Descarregar log reduzido: ${file.fileName}`}
                                >
                                  <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 space-y-3 md:hidden">
                      {visibleMonitoredFiles.map((file) => {
                        const reduction = file.originalBytes > 0 ? 100 * (1 - file.reducedBytes / file.originalBytes) : 0;
                        const processingVisual = getProcessingStatusVisual(file.processingStatus);
                        const lastEventAt = fileLastEventAtMap.get(file.fileName);
                        const isPossiblyStalled = file.processingStatus === "running" && (!lastEventAt || (uiNowMs - lastEventAt.getTime() > staleThresholdMsForFile(file)));
                        const stageSince = fileCurrentStageSinceMap.get(file.fileName);
                        const stageElapsedMs = stageSince ? uiNowMs - stageSince.getTime() : 0;
                        const isStageLong = stageElapsedMs > STAGE_WARNING_THRESHOLD_MS && (file.processingStatus === "running" || file.processingStatus === "queued");
                        return (
                          <div key={`mobile-${selectedJobId ?? "lote"}-${file.fileName}`} className={`rounded-xl border border-border bg-muted/70 dark:border-white/10 dark:bg-slate-950/60 p-3 ${processingVisual.row}`}>
                            <p className="text-sm font-medium text-foreground">{file.fileName}</p>
                            <p className="mt-0.5 line-clamp-1 text-xs font-medium text-foreground" title={file.currentStage}>
                              {file.currentStage}
                            </p>
                            <p
                              className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground [overflow-wrap:anywhere]"
                              title={file.currentStep}
                            >
                              {file.currentStep}
                            </p>
                            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                              <p>Upload: {getStatusLabel(file.uploadStatus)} ({file.uploadProgress}%)</p>
                              <p className={processingVisual.label}>
                                Processamento: {getStatusLabel(file.processingStatus)} ({formatFileProcessingPercent(file.processingProgress)})
                                {isPossiblyStalled ? " · sem atualização recente" : ""}
                              </p>
                              <p>
                                {formatLastActivityLabel(lastEventAt)}
                                {stageSince ? (
                                  <span className={isStageLong ? " text-amber-200" : ""}>
                                    {" "}
                                    · {formatElapsedMs(stageElapsedMs)} nesta etapa
                                  </span>
                                ) : null}
                              </p>
                              <p>Redução: {formatPercentFine(reduction)} · {file.suspiciousEventCount} eventos / {file.triggerCount} gatilhos</p>
                              <p>Semáforo: <span className={getSemaforoTone(file)}>{getSemaforo(file)}</span></p>
                              {selectedJobId
                              && selectedJobId !== LOCAL_UPLOAD_LOT_ID
                              && file.processingStatus === "completed"
                              && file.reducedLineCount > 0 ? (
                                <p className="pt-1">
                                  <a
                                    href={buildReducedLogDownloadUrl(selectedJobId, file.fileName)}
                                    className="font-medium text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-300"
                                  >
                                    Descarregar log reduzido (.txt)
                                  </a>
                                </p>
                                ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="w-full min-w-0 max-w-full rounded-2xl border border-border bg-muted/50 p-4 dark:border-white/10 dark:bg-black/20">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Sugestões de acompanhamento do lote atual</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-emerald-600/35 text-emerald-900 hover:bg-emerald-500/10 dark:border-emerald-400/30 dark:text-emerald-100"
                          disabled={!monitoredFiles.length || selectedJobId === LOCAL_UPLOAD_LOT_ID}
                          onClick={handleExportReduceLogsExcel}
                        >
                          <FileSpreadsheet className="mr-2 h-4 w-4" />
                          Exportar Excel
                        </Button>
                        <Badge variant="outline" className="border-border text-muted-foreground dark:border-white/10">
                          {`${batchSummary?.suspiciousCount ?? 0} eventos suspeitos / ${batchSummary?.triggerCount ?? 0} gatilhos no lote`}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4 hidden w-full min-w-0 max-w-full rounded-xl border border-border md:block dark:border-white/10">
                      <Table
                        tableContainerClassName="!overflow-x-hidden"
                        className="w-full min-w-0 table-fixed border-collapse text-xs [word-break:break-word] [&_th]:!h-auto [&_th]:!min-h-0 [&_th]:!whitespace-normal [&_th]:!px-1.5 [&_th]:!py-1.5 [&_th]:!align-top [&_td]:!whitespace-normal [&_td]:!p-1.5 [&_td]:!align-top [tbody_td]:min-w-0 [thead_th]:text-[11px] [thead_th]:leading-tight"
                      >
                        <colgroup>
                          {(
                            [16, 14, 34, 36] as const
                          ).map((pct, i) => (
                            <col key={i} style={{ width: `${pct}%` }} />
                          ))}
                        </colgroup>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="bg-muted dark:bg-slate-950">Arquivo</TableHead>
                            <TableHead>Leitura atual</TableHead>
                            <TableHead>Interpretação</TableHead>
                            <TableHead>Ação sugerida</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleMonitoredFiles.map((file) => {
                            const processingVisual = getProcessingStatusVisual(file.processingStatus);
                            return (
                            <TableRow key={`guidance-${file.fileName}`} className={processingVisual.row}>
                              <TableCell className="min-w-0 break-all font-medium text-foreground">{file.fileName}</TableCell>
                              <TableCell className="min-w-0">
                                <div className="space-y-1">
                                  <Badge className={processingVisual.badge}>{getStatusLabel(file.processingStatus)}</Badge>
                                  <p className="text-[11px] text-muted-foreground leading-snug">{file.currentStep}</p>
                                </div>
                              </TableCell>
                              <TableCell className="min-w-0 break-words text-[11px] leading-snug text-muted-foreground">{getFileInterpretation(file)}</TableCell>
                              <TableCell className="min-w-0 break-words text-[11px] leading-snug text-cyan-800 dark:text-cyan-100/95">{getFileRecommendation(file)}</TableCell>
                            </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="mt-4 space-y-3 md:hidden">
                      {visibleMonitoredFiles.map((file) => {
                        const processingVisual = getProcessingStatusVisual(file.processingStatus);
                        return (
                        <div key={`guidance-mobile-${file.fileName}`} className={`rounded-xl border border-border bg-muted/70 dark:border-white/10 dark:bg-slate-950/60 p-3 ${processingVisual.row}`}>
                          <p className="text-sm font-medium text-foreground">{file.fileName}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge className={processingVisual.badge}>{getStatusLabel(file.processingStatus)}</Badge>
                            <p className="text-xs text-muted-foreground">{file.currentStep}</p>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{getFileInterpretation(file)}</p>
                          <p className="mt-2 text-sm text-cyan-800 dark:text-cyan-100">{getFileRecommendation(file)}</p>
                        </div>
                        );
                      })}
                    </div>
                  </div>

                    </TabsContent>

                    <TabsContent value="operational" className="min-w-0 space-y-4">

                  <div className="rounded-2xl border border-border bg-muted/60 p-4 dark:border-cyan-400/15 dark:bg-slate-950/60">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Painel operacional por arquivo</p>
                      </div>
                      {activeFile ? (
                        <Badge className={getProcessingStatusVisual(activeFile.processingStatus).badge}>
                          {getStatusLabel(activeFile.processingStatus)} · {activeFile.fileName}
                        </Badge>
                      ) : null}
                    </div>

                    {activeFile ? (
                      <Tabs value={activeFileTab} onValueChange={setActiveFileTab} className="mt-4 space-y-4">
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Ficheiro ativo no painel</p>
                          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1.5 rounded-xl border border-border bg-muted p-1.5 dark:border-white/12 dark:bg-slate-950/85">
                          {visibleMonitoredFiles.map((file) => {
                            const processingVisual = getProcessingStatusVisual(file.processingStatus);
                            return (
                              <TabsTrigger
                                key={`tab-${file.fileName}`}
                                value={file.fileName}
                                className={`max-w-full rounded-lg border border-transparent px-3 py-2 text-left transition-colors data-[state=active]:border-cyan-400/45 data-[state=active]:bg-cyan-500/20 data-[state=active]:shadow-[0_0_16px_-6px_rgba(34,211,238,0.35)] hover:bg-white/5 ${processingVisual.row}`}
                              >
                                <div className="text-left">
                                  <p className="text-xs font-medium">{file.fileName}</p>
                                  <p className={`text-[11px] ${processingVisual.label}`}>{getStatusLabel(file.processingStatus)} · {formatFileProcessingPercent(file.processingProgress)}</p>
                                </div>
                              </TabsTrigger>
                            );
                          })}
                          </TabsList>
                        </div>

                        {visibleMonitoredFiles.map((file) => {
                          const reduction = file.originalBytes > 0 ? 100 * (1 - file.reducedBytes / file.originalBytes) : 0;
                          const lastEventAt = fileLastEventAtMap.get(file.fileName);
                          const isPossiblyStalled = file.processingStatus === "running" && (!lastEventAt || (uiNowMs - lastEventAt.getTime() > staleThresholdMsForFile(file)));
                          const stageSince = fileCurrentStageSinceMap.get(file.fileName);
                          const stageElapsedMs = stageSince ? uiNowMs - stageSince.getTime() : 0;
                          const isStageLong = stageElapsedMs > STAGE_WARNING_THRESHOLD_MS && (file.processingStatus === "running" || file.processingStatus === "queued");
                          return (
                            <TabsContent key={`content-${file.fileName}`} value={file.fileName} className="space-y-4">
                              <div className="grid gap-4 md:grid-cols-4">
                                <MetricCard icon={RefreshCw} label="Upload" value={`${file.uploadProgress}%`} helper={file.uploadReused ? "Reaproveitado do servidor" : getStatusLabel(file.uploadStatus)} />
                                <MetricCard icon={Database} label="Processamento" value={formatFileProcessingPercent(file.processingProgress)} helper={`${getStatusLabel(file.processingStatus)} · ${file.currentStage}`} />
                                <MetricCard icon={FileArchive} label="Tamanho antes" value={formatBytes(file.originalBytes)} helper={`${file.originalLineCount} linhas`} />
                                <MetricCard icon={ShieldCheck} label="Tamanho depois" value={formatBytes(file.reducedBytes)} helper={`${file.reducedLineCount} linhas · ${formatPercentFine(reduction)}`} />
                              </div>

                              <div className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
                                <div className="rounded-2xl border border-border bg-muted/50 dark:border-white/10 dark:bg-black/20 p-4">
                                  <p className="text-sm font-medium text-foreground">Etapas executadas neste arquivo</p>
                                  <div className="mt-4 space-y-3">
                                    <StepRow title="1. Recebimento do arquivo" status={file.uploadStatus === "failed" ? "Falhou" : file.uploadProgress >= 100 ? "Concluído" : "Em andamento"} description={`Upload ${file.uploadProgress}% · ${formatBytes(file.sizeBytes ?? file.originalBytes)}`} />
                                    <StepRow title="2. Leitura e filtragem heurística" status={file.processingStatus === "queued" ? "Aguardando" : file.processingStatus === "running" ? "Em andamento" : file.processingStatus === "failed" ? "Falhou" : "Concluído"} description={file.currentStep} />
                                    <StepRow title="3. Consolidação do resultado reduzido" status={file.processingStatus === "completed" ? "Concluído" : file.processingStatus === "failed" ? "Falhou" : "Aguardando"} description={file.lastMessage} />
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-border bg-muted/50 dark:border-white/10 dark:bg-black/20 p-4">
                                  <p className="text-sm font-medium text-foreground">Leitura operacional do arquivo</p>
                                  <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                                    <p><span className="font-medium text-foreground">Tipo inferido:</span> {file.logType}</p>
                                    <p><span className="font-medium text-foreground">Etapa atual:</span> {file.currentStage}</p>
                                    <p><span className="font-medium text-foreground">Resultado heurístico:</span> {formatBytes(file.originalBytes)} antes, {formatBytes(file.reducedBytes)} depois, com {formatPercentFine(reduction)} de redução.</p>
                                    <p><span className="font-medium text-foreground">Próxima leitura do analista:</span> {file.currentStep}</p>
                                    <p><span className="font-medium text-foreground">Última mensagem:</span> {file.lastMessage}</p>
                                    <p><span className="font-medium text-foreground">Atividade:</span> {formatLastActivityLabel(lastEventAt)}{isPossiblyStalled ? " (verificar se houve pausa prolongada)" : ""}</p>
                                    {stageSince ? (
                                      <p><span className="font-medium text-foreground">Tempo na etapa atual:</span> <span className={isStageLong ? "text-amber-200" : "text-muted-foreground"}>{formatElapsedMs(stageElapsedMs)}{isStageLong ? " (acima do limite esperado)" : ""}</span></p>
                                    ) : null}
                                    <p><span className="font-medium text-foreground">Sinais críticos:</span> {file.suspiciousEventCount} eventos suspeitos e {file.triggerCount} gatilhos preservados.</p>
                                    <p><span className="font-medium text-foreground">Ação sugerida:</span> {getFileRecommendation(file)}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-border bg-muted/50 dark:border-white/10 dark:bg-black/20 p-4">
                                <p className="text-sm font-medium text-foreground">Eventos e marcos do arquivo</p>
                                {activeFileEvents.length > 0 ? (
                                  <div className="mt-4 hidden overflow-hidden rounded-xl border border-border md:block dark:border-white/10">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Momento</TableHead>
                                          <TableHead>Etapa</TableHead>
                                          <TableHead>Mensagem</TableHead>
                                          <TableHead>Progresso</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {activeFileEvents.map((event, index) => {
                                          const createdAtLabel = event.createdAt ? new Date(event.createdAt).toLocaleTimeString("pt-BR") : "—";
                                          const rowKey = `${file.fileName}-event-${index}-${event.createdAt ? new Date(event.createdAt).getTime() : "sem-data"}`;

                                          return (
                                          <TableRow key={rowKey}>
                                            <TableCell>{createdAtLabel}</TableCell>
                                            <TableCell>{event.stage}</TableCell>
                                            <TableCell>{event.message}</TableCell>
                                            <TableCell>{event.progress}%</TableCell>
                                          </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                ) : null}

                                {activeFileEvents.length > 0 ? (
                                  <div className="mt-4 space-y-2 md:hidden">
                                    {activeFileEvents.map((event, index) => {
                                      const createdAtLabel = event.createdAt ? new Date(event.createdAt).toLocaleTimeString("pt-BR") : "—";
                                      return (
                                        <div key={`event-mobile-${file.fileName}-${index}`} className="rounded-lg border border-border bg-muted/70 p-3 dark:border-white/10 dark:bg-slate-950/60">
                                          <p className="text-xs text-muted-foreground">{createdAtLabel}</p>
                                          <p className="mt-1 text-sm font-medium text-foreground">{event.stage}</p>
                                          <p className="mt-1 text-sm text-muted-foreground">{event.message}</p>
                                          <p className="mt-1 text-xs text-muted-foreground">Progresso: {event.progress}%</p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                                    Os eventos deste arquivo aparecerão aqui conforme o backend registrar as etapas da redução para o lote atual.
                                  </p>
                                )}
                              </div>
                            </TabsContent>
                          );
                        })}
                      </Tabs>
                    ) : null}
                  </div>

                    </TabsContent>
                  </Tabs>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </DashboardLayout>
  );
}

function StepRow({ title, status, description }: { title: string; status: string; description: string }) {
  const tone = status === "Concluído"
    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
    : status === "Falhou"
      ? "border-rose-400/25 bg-rose-500/10 text-rose-200"
      : status === "Em andamento"
        ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-300"
        : status === "Aguardando"
          ? "border-amber-400/25 bg-amber-500/10 text-amber-200"
        : "border-border bg-muted/50 text-muted-foreground dark:border-white/10 dark:bg-white/5";

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <Badge className={tone}>{status}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
