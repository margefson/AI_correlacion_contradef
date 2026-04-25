import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { jobStatusBadgeClass } from "@/lib/analysisUi";
import { formatBytes, formatDateTimeLocale, formatDurationMs, formatPercentFine } from "@/lib/format";
import { isReduceLogsDebugEnabled } from "@/lib/reduceLogsDebug";
import { downloadReduceLogsExcelWorkbook } from "@/lib/reduceLogsExcelExport";
import { clearPersistedReduceLogsJobId, readPersistedReduceLogsJobId, writePersistedReduceLogsJobId } from "@/lib/reduceLogsSession";
import { trpc } from "@/lib/trpc";
import {
  completeReduceLogsUpload,
  getReduceLogsUploadCapabilities,
  initReduceLogsUpload,
  type UploadCompletionFilePayload,
  uploadReduceLogsLegacy,
  uploadReduceLogsChunk,
} from "@/services/analysisService";
import {
  buildMonitoredFiles,
  getFileInterpretation,
  getFileRecommendation,
  inferLogType,
  type FileMonitor,
  type ProcessingStatus,
  type SubmittedFileMonitor,
} from "@/pages/reduceLogsMonitor";
import {
  AlertTriangle,
  Database,
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
import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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
  if (file.processingStatus === "completed") return "Revisar";
  return "Em análise";
}

function getSemaforoTone(file: FileMonitor) {
  const label = getSemaforo(file);
  if (label === "Preservado") return "text-emerald-300";
  if (label === "Revisar") return "text-amber-200";
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
    uploadStatus: "queued" as ProcessingStatus,
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

function ProgressStrip({ value, tone = "cyan" }: { value: number; tone?: "cyan" | "emerald" | "rose" | "amber" }) {
  const toneClass = tone === "emerald"
    ? "bg-emerald-400"
    : tone === "rose"
      ? "bg-rose-400"
      : tone === "amber"
        ? "bg-amber-400"
        : "bg-cyan-400";

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-white/10">
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
  const utils = trpc.useUtils();
  const logFilesInputRef = useRef<HTMLInputElement>(null);
  const [analysisName, setAnalysisName] = useState(ANALYSIS_NAME_PREFIX);
  const [focusTerms, setFocusTerms] = useState("VirtualProtect, NtQueryInformationProcess, IsDebuggerPresent, Sleep");
  const [focusRegexes, setFocusRegexes] = useState("VirtualProtect.*RW.*RX, Nt.*QueryInformationProcess");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(() => (
    typeof window !== "undefined" ? readPersistedReduceLogsJobId() : null
  ));
  const [showRestoreHint, setShowRestoreHint] = useState(false);
  const [logDropHover, setLogDropHover] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
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

  const resumeActiveSync = trpc.analysis.resumeActiveSync.useMutation();

  useEffect(() => {
    resumeActiveSync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!readPersistedReduceLogsJobId()) return;
    try {
      if (sessionStorage.getItem(RESTORE_BANNER_SESSION_KEY) === "1") return;
    } catch {
      /* private mode */
    }
    setShowRestoreHint(true);
  }, []);

  useEffect(() => {
    if (submittedJobId) {
      writePersistedReduceLogsJobId(submittedJobId);
    }
  }, [submittedJobId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setUiNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const submittedDetailQuery = trpc.analysis.detail.useQuery(
    { jobId: submittedJobId ?? "" },
    {
      enabled: Boolean(submittedJobId),
      refetchInterval: (query) => {
        const status = query.state.data?.job.status;
        return status === "running" || status === "queued" ? pollIntervalMs : false;
      },
    },
  );

  const uploadedDetail = submittedDetailQuery.data;

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
    if (!submittedJobId) return;
    if (submittedDetailQuery.isError) {
      console.warn("[ReduceLogs:detail]", "erro ao obter detalhe do job", {
        jobId: submittedJobId,
        error: submittedDetailQuery.error,
      });
      return;
    }
    if (!uploadedDetail) return;
    const newest = uploadedDetail.events[0];
    console.info("[ReduceLogs:detail:poll]", {
      jobId: submittedJobId,
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
    });
  }, [
    submittedJobId,
    uploadedDetail,
    submittedDetailQuery.dataUpdatedAt,
    submittedDetailQuery.fetchStatus,
    submittedDetailQuery.isFetching,
    submittedDetailQuery.isError,
    submittedDetailQuery.error,
  ]);

  const monitoredFiles = useMemo(
    () => buildMonitoredFiles(submittedFiles, uploadedDetail?.fileMetrics ?? []),
    [submittedFiles, uploadedDetail],
  );

  const monitorDetailLoading = Boolean(
    submittedJobId &&
    !monitoredFiles.length &&
    submittedDetailQuery.isLoading &&
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
    const uploadDurations = monitoredFiles.filter((file) => !file.uploadReused && file.uploadDurationMs > 0).map((file) => file.uploadDurationMs);
    const averageUploadDurationMs = uploadDurations.length
      ? uploadDurations.reduce((sum, value) => sum + value, 0) / uploadDurations.length
      : 0;

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
      averageUploadDurationMs,
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
          if (!hay.includes(file.fileName)) return;
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
    return uiNowMs - lastEventAt.getTime() > 120000;
  }), [fileLastEventAtMap, monitoredFiles, uiNowMs]);
  const stalledFileNameSet = useMemo(() => {
    const set = new Set<string>();
    monitoredFiles.forEach((file) => {
      if (file.processingStatus !== "running") return;
      const lastEventAt = fileLastEventAtMap.get(file.fileName);
      const stageSince = fileCurrentStageSinceMap.get(file.fileName);
      const stageElapsedMs = stageSince ? uiNowMs - stageSince.getTime() : 0;
      const noRecentActivity = !lastEventAt || (uiNowMs - lastEventAt.getTime() > 120000);
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
        jobId: submittedJobId,
        jobDisplayName,
        files: monitoredFiles,
        fileExtra,
      });
      toast.success("Excel gerado com as folhas Resumo, Acompanhamento e Sugestões.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o Excel.");
    }
  }

  function dismissTrackedJob() {
    clearPersistedReduceLogsJobId();
    setSubmittedJobId(null);
    setSubmittedFiles([]);
    setActiveFileTab("");
    setShowRestoreHint(false);
    try {
      sessionStorage.removeItem(RESTORE_BANNER_SESSION_KEY);
    } catch {
      /* ignore */
    }
    toast.message("Acompanhamento deste lote encerrado neste navegador", {
      description: "O job pode continuar no servidor. Para voltar a ver o painel, use o histórico de análises ou submeta o lote novamente.",
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
    clearPersistedReduceLogsJobId();
    setSubmittedJobId(null);

    const initialBatch = buildInitialSubmittedFiles(selectedFiles);
    setSubmittedFiles(initialBatch);
    setActiveFileTab(initialBatch[0]?.fileName ?? "");

    try {
      const submissionInput = {
        analysisName: analysisName.trim(),
        focusTerms,
        focusRegexes,
        origin: window.location.origin,
      };
      const capabilities = await getReduceLogsUploadCapabilities().catch(() => null);
      const shouldUseLegacy = capabilities?.storageConfigured === false;

      if (shouldUseLegacy) {
        const legacyPayload = await uploadReduceLogsLegacy({
          ...submissionInput,
          files: selectedFiles,
        });
        setSubmittedFiles((current) => current.map((file) => ({
          ...file,
          uploadProgress: 100,
          uploadStatus: "completed",
          uploadReused: false,
        })));
        const legacyJobId = legacyPayload?.job?.jobId ?? null;
        toast.success("Armazenamento partilhado (Forge) não configurado — lote enviado em modo directo (multipart).", {
          description: "Em produção, configure BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY para uploads em blocos para o object storage.",
        });
        setSelectedFiles([]);

        if (legacyJobId) {
          setSubmittedJobId(legacyJobId);
          await utils.analysis.detail.invalidate({ jobId: legacyJobId });
        }

        return;
      }

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
        const legacyPayload = await uploadReduceLogsLegacy({
          ...submissionInput,
          files: selectedFiles,
        });
        setSubmittedFiles((current) => current.map((file) => ({
          ...file,
          uploadProgress: 100,
          uploadStatus: "completed",
          uploadReused: false,
        })));
        const legacyJobId = legacyPayload?.job?.jobId ?? null;
        toast.success("Armazenamento partilhado (Forge) não configurado — lote enviado em modo directo (multipart).", {
          description: "Em produção, configure BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY para uploads em blocos para o object storage.",
        });
        setSelectedFiles([]);

        if (legacyJobId) {
          setSubmittedJobId(legacyJobId);
          await utils.analysis.detail.invalidate({ jobId: legacyJobId });
        }

        return null;
      });
      if (!initPayload) {
        return;
      }

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
          setSubmittedFiles((current) => updateSubmittedFile(current, file.name, {
            uploadFileId: remoteFile.fileId,
            uploadStatus: "completed",
            uploadProgress: 100,
            uploadDurationMs: 0,
            uploadReused: true,
          }));

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

        setSubmittedFiles((current) => updateSubmittedFile(current, file.name, {
          uploadFileId: remoteFile.fileId,
          uploadStatus: "uploading",
          uploadProgress: 0,
          uploadReused: false,
          uploadDurationMs: 0,
        }));

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

          setSubmittedFiles((current) => updateSubmittedFile(current, file.name, {
            uploadStatus: sentBytes >= file.size ? "completed" : "uploading",
            uploadProgress: typeof chunkPayload.uploadProgress === "number"
              ? chunkPayload.uploadProgress
              : Math.round((sentBytes / file.size) * 100),
            uploadDurationMs,
            uploadReused: false,
          }));
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
        setSubmittedJobId(jobId);
        await utils.analysis.detail.invalidate({ jobId });
      }
    } catch (error) {
      setSubmittedFiles((current) => current.map((file) => ({
        ...file,
        uploadStatus: file.uploadProgress > 0 && file.uploadProgress >= 100 ? file.uploadStatus : "failed",
      })));
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a redução.");
    } finally {
      setIsUploading(false);
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
                  Reduzir Logs
                </Badge>
                <Badge variant="outline" className="border-border text-muted-foreground dark:border-white/10">
                  Lote atual + monitoramento por arquivo
                </Badge>
              </div>
              <CardTitle className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Redução com acompanhamento individual de cada log submetido
              </CardTitle>
              <CardDescription className="text-base leading-7 text-muted-foreground">
                Esta tela passa a tratar a submissão atual como um <strong>lote monitorado</strong>. Cada arquivo enviado ganha seu próprio acompanhamento de upload, etapa de redução e resultado final antes/depois.
              </CardDescription>
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
                    <CardDescription>
                      Envie um ou mais logs da Contradef. Se o mesmo arquivo já tiver sido persistido no backend, a tela reaproveita o conteúdo existente e evita novo upload do artefato grande. Depois do envio, o job fica associado a esta página neste navegador — pode sair e voltar a &quot;Reduzir Logs&quot; para rever o progresso.
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="border-border text-muted-foreground dark:border-white/10">
                  {submittedJobId ? `Job atual: ${submittedJobId}` : "Nenhum lote ativo nesta sessão"}
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
                <p className="text-xs leading-5 text-muted-foreground">
                  Um clique abre o explorador e substitui a seleção atual. Arrastar para esta zona adiciona ficheiros ao lote (evita duplicados pelo nome, tamanho e data de modificação).
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Termos prioritários</label>
                  <Textarea
                    value={focusTerms}
                    onChange={(event) => setFocusTerms(event.target.value)}
                    className="min-h-28 border-border bg-background dark:bg-slate-950/80"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Regex heurístico complementar</label>
                  <Textarea
                    value={focusRegexes}
                    onChange={(event) => setFocusRegexes(event.target.value)}
                    className="min-h-28 border-border bg-background dark:bg-slate-950/80"
                  />
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
                  Nenhum arquivo foi selecionado ainda. Escolha um ou mais logs para disparar a redução e criar um lote acompanhado nesta tela.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleReductionSubmit} disabled={isUploading} className="transition duration-200 hover:-translate-y-0.5">
                  {isUploading ? "Enviando lote e iniciando redução..." : "Executar redução com upload"}
                </Button>
                <p className="text-sm text-muted-foreground">
                  Após o envio ou reaproveitamento, o monitoramento abaixo passa a refletir o lote atual, atualizando os arquivos individualmente conforme o processamento avança.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-border bg-card text-card-foreground shadow-md dark:border-emerald-400/15 dark:bg-slate-950/80 dark:shadow-xl dark:shadow-slate-950/30">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Monitoramento do lote atual</CardTitle>
                  <CardDescription>
                    Visão única do lote atual: status geral, leitura consolidada e acompanhamento por arquivo.
                  </CardDescription>
                  {submittedJobId ? (
                    <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                      <span className="text-muted-foreground">
                        {!submittedDetailQuery.dataUpdatedAt && submittedDetailQuery.isFetching
                          ? "A pedir estado ao servidor…"
                          : submittedDetailQuery.dataUpdatedAt
                            ? `Última resposta do servidor: ${formatDateTimeLocale(new Date(submittedDetailQuery.dataUpdatedAt))}${
                              submittedDetailQuery.isFetching ? " · a atualizar…" : ""
                            }.`
                            : "A aguardar a primeira resposta do servidor…"}
                      </span>{" "}
                      Se o relógio acima se renova cerca de 2 em 2 segundos enquanto o job está em execução, o browser está a receber dados; se percentagens e mensagens não mudam durante muito tempo, o motor pode estar numa fase longa sem gravar eventos (comum em ficheiros de vários GB) ou bloqueado — confirme no servidor (processo, CPU, logs).
                      {!isReduceLogsDebugEnabled() ? (
                        <span className="mt-1 block text-muted-foreground">
                          Consola (opcional):{" "}
                          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground dark:bg-black/30">
                            localStorage.setItem(&quot;contradef_reduce_logs_debug&quot;,&quot;1&quot;)
                          </code>{" "}
                          e recarregar a página; desligar com{" "}
                          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground dark:bg-black/30">
                            localStorage.removeItem(&quot;contradef_reduce_logs_debug&quot;)
                          </code>
                          .
                        </span>
                      ) : (
                        <span className="mt-1 block font-mono text-[10px] text-emerald-400/90">
                          Debug da consola ligado — filtre mensagens por «ReduceLogs:detail».
                        </span>
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {submittedJobId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-border bg-transparent text-foreground hover:bg-muted dark:border-white/15 dark:hover:bg-white/10"
                      onClick={dismissTrackedJob}
                    >
                      Encerrar acompanhamento
                    </Button>
                  ) : null}
                  <Badge className="border-emerald-500/35 bg-emerald-500/15 text-emerald-900 dark:border-emerald-400/25 dark:text-emerald-300">
                    {submittedJobId ? `job ${submittedJobId}` : "aguardando lote"}
                  </Badge>
                  <Badge variant="outline" className="border-border text-muted-foreground dark:border-white/10">autoatualização 2s</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {showRestoreHint && submittedJobId ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-cyan-500/35 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-950 dark:border-cyan-400/25 dark:text-cyan-50 sm:flex-row sm:items-center sm:justify-between">
                  <p className="leading-relaxed">
                    <span className="font-medium text-cyan-900 dark:text-cyan-100">Último job retomado neste navegador.</span>{" "}
                    O identificador <span className="font-mono text-xs text-cyan-800 dark:text-cyan-200/90">{submittedJobId}</span> fica guardado até encerrar o acompanhamento ou iniciar um novo envio.
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
              {submittedDetailQuery.isError ? (
                <div className="rounded-2xl border border-rose-400/35 bg-rose-500/10 p-5 text-sm leading-6 text-rose-950 dark:border-rose-400/25 dark:text-rose-100">
                  Não foi possível carregar este job (pode ter expirado ou o identificador deixou de ser válido).{" "}
                  <button
                    type="button"
                    className="font-medium text-rose-800 underline underline-offset-2 hover:text-rose-950 dark:text-rose-50 dark:hover:text-white"
                    onClick={dismissTrackedJob}
                  >
                    Limpar e preparar novo lote
                  </button>
                  .
                </div>
              ) : monitorDetailLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-cyan-500/35 bg-cyan-500/10 p-10 text-center text-sm text-muted-foreground dark:border-cyan-400/20 dark:bg-cyan-500/5">
                  <RefreshCw className="h-8 w-8 animate-spin text-cyan-600/80 dark:text-cyan-300/80" />
                  <p>A carregar o estado do lote no servidor…</p>
                </div>
              ) : !monitoredFiles.length ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground dark:border-white/10 dark:bg-black/20">
                  Assim que você submeter um lote, esta área mostrará o status consolidado da redução, o progresso individual de cada log e as etapas executadas para cada arquivo. Se já enviou antes, o painel reabre automaticamente ao voltar a esta página no mesmo navegador.
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-4">
                    <MetricCard
                      icon={RefreshCw}
                      label="Status do lote"
                      value={uploadedDetail ? getStatusLabel(uploadedDetail.job.status) : isUploading ? "Enviando" : "Em preparação"}
                      helper={uploadedDetail
                        ? `${uploadedDetail.job.progress}% · ${uploadedDetail.job.stage}${staleRunningFiles.length ? ` · ${staleRunningFiles.length} arquivo(s) sem atualização recente` : ""}`
                        : `${monitoredFiles.length} arquivo(s) no lote atual`}
                    />
                    <MetricCard
                      icon={Database}
                      label="Arquivos no lote"
                      value={`${monitoredFiles.length}`}
                      helper={`${batchSummary?.completedFiles ?? 0} concluído(s), ${batchSummary?.runningFiles ?? 0} em processamento, ${batchSummary?.failedFiles ?? 0} com falha · tempo médio de upload ${formatDurationMs(batchSummary?.averageUploadDurationMs ?? 0)}`}
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

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      O estado do lote é consultado de X em X segundos (abaixo). O registo de leitura vem do servidor; não precisa de intervalo tão curto se estiver a seguir o texto.
                    </p>
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
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            A barra 45% na grelha é um marco fixo da fase de redução; aqui o backend reporta o avanço em linhas e bytes. Actualizado cerca de 2,5s durante ficheiros muito grandes.
                          </p>
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

                  <Tabs defaultValue="overview" className="space-y-5">
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

                    <TabsContent value="overview" className="space-y-4">

                  {showsLocalStorageModeBadge ? (
                    <div className="rounded-2xl border border-amber-400/35 bg-amber-500/10 p-4 text-sm leading-6 text-amber-950 dark:border-amber-400/25 dark:text-amber-100">
                      Execução concluída sem envio ao storage remoto (Forge). O processamento e as métricas foram gerados normalmente; use os links de download abaixo para acessar a cópia mantida no servidor, quando existir.
                    </div>
                  ) : null}

                    </TabsContent>

                    <TabsContent value="files" className="space-y-4">

                  <div className="rounded-2xl border border-border bg-muted/50 dark:border-white/10 dark:bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Acompanhamento por arquivo</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          Progresso de upload, processamento e resultado de redução para cada log do lote atual.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-emerald-600/35 text-emerald-900 hover:bg-emerald-500/10 dark:border-emerald-400/30 dark:text-emerald-100"
                          disabled={!monitoredFiles.length}
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
                    <p className="mt-2 text-xs text-muted-foreground">
                      O Excel inclui o lote completo (todas as linhas), com as folhas «Resumo», «Acompanhamento» e «Sugestões» — independentemente dos filtros da tabela.
                    </p>
                    <div className="mt-6 rounded-xl border border-border bg-muted/70 p-4 dark:border-white/10 dark:bg-slate-950/55">
                      <div className="mb-3 space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtros e ordenação</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Aplicam-se às tabelas deste separador. A prioridade de investigação e os dados exportados para Excel não são limitados por estes botões.
                        </p>
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

                    <div className="mt-8 rounded-xl border border-emerald-500/35 bg-gradient-to-b from-emerald-500/10 to-muted/80 p-4 text-sm text-muted-foreground shadow-[inset_0_1px_0_0_rgba(52,211,153,0.15)] dark:border-emerald-500/25 dark:from-emerald-500/[0.06] dark:to-slate-950/60 dark:shadow-[inset_0_1px_0_0_rgba(52,211,153,0.12)]">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-400/90">Prioridade de investigação</p>
                      <p className="mt-2 font-medium text-foreground">Ordem sugerida para triagem</p>
                      <p className="mt-1 text-muted-foreground">
                        {visibleMonitoredFiles.length
                          ? `${visibleMonitoredFiles.slice(0, 3).map((file) => file.fileName).join(" · ")}`
                          : "Sem arquivos priorizados para o filtro atual."}
                      </p>
                      {focusCriticalMode && criticalFocusCandidate ? (
                        <p className="mt-2 text-rose-800 dark:text-rose-200">Foco automático atual: {criticalFocusCandidate.fileName}</p>
                      ) : null}
                    </div>

                    <div className="mt-4 hidden overflow-hidden rounded-xl border border-border md:block dark:border-white/10">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="sticky left-0 z-10 bg-muted dark:bg-slate-950">Arquivo</TableHead>
                            <TableHead>Upload</TableHead>
                            <TableHead>Processamento</TableHead>
                            <TableHead>Tempo de upload</TableHead>
                            <TableHead>Etapa atual</TableHead>
                            <TableHead>Tamanho antes</TableHead>
                            <TableHead>Tamanho depois</TableHead>
                            <TableHead>Redução</TableHead>
                            <TableHead>Sinais críticos</TableHead>
                            <TableHead>Semáforo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleMonitoredFiles.map((file) => {
                            const reduction = file.originalBytes > 0 ? 100 * (1 - file.reducedBytes / file.originalBytes) : 0;
                            const uploadTone = file.uploadStatus === "failed" ? "rose" : file.uploadStatus === "completed" || file.uploadStatus === "running" ? "emerald" : "cyan";
                            const processingVisual = getProcessingStatusVisual(file.processingStatus);
                            const lastEventAt = fileLastEventAtMap.get(file.fileName);
                            const isPossiblyStalled = file.processingStatus === "running" && (!lastEventAt || (uiNowMs - lastEventAt.getTime() > 120000));
                            const stageSince = fileCurrentStageSinceMap.get(file.fileName);
                            const stageElapsedMs = stageSince ? uiNowMs - stageSince.getTime() : 0;
                            const isStageLong = stageElapsedMs > STAGE_WARNING_THRESHOLD_MS && (file.processingStatus === "running" || file.processingStatus === "queued");

                            return (
                              <TableRow key={`${submittedJobId ?? "lote"}-${file.fileName}`} className={processingVisual.row}>
                                <TableCell className="sticky left-0 z-10 bg-muted font-medium text-foreground dark:bg-slate-950">{file.fileName}</TableCell>
                                <TableCell className="min-w-44">
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                      <span>{getStatusLabel(file.uploadStatus)}</span>
                                      <span>{file.uploadProgress}%</span>
                                    </div>
                                    <ProgressStrip value={file.uploadProgress} tone={uploadTone} />
                                  </div>
                                </TableCell>
                                <TableCell className="min-w-44">
                                  <div className="space-y-2">
                                    <div className={`flex items-center justify-between gap-2 text-xs ${processingVisual.label}`}>
                                      <span className="flex items-center gap-2">
                                        <Badge className={processingVisual.badge}>{getStatusLabel(file.processingStatus)}</Badge>
                                        {isPossiblyStalled ? <span className="text-amber-200">sem atualização recente</span> : null}
                                      </span>
                                      <span>{file.processingProgress}%</span>
                                    </div>
                                    <ProgressStrip value={file.processingProgress} tone={processingVisual.progressTone} />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-foreground">{file.uploadReused ? "Reaproveitado" : formatDurationMs(file.uploadDurationMs)}</p>
                                    <p className="text-xs text-muted-foreground">{file.uploadReused ? "Arquivo já existia no servidor" : "Tempo bruto de envio até 100%"}</p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-foreground">{file.currentStage}</p>
                                    <p className="text-xs text-muted-foreground">{file.currentStep}</p>
                                    <p className="text-xs text-muted-foreground">{formatLastActivityLabel(lastEventAt)}</p>
                                    {stageSince ? (
                                      <p className={`text-xs ${isStageLong ? "text-amber-200" : "text-muted-foreground"}`}>
                                        Na etapa atual há {formatElapsedMs(stageElapsedMs)}
                                      </p>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell>{formatBytes(file.originalBytes)}</TableCell>
                                <TableCell>{formatBytes(file.reducedBytes)}</TableCell>
                                <TableCell>{formatPercentFine(reduction)}</TableCell>
                                <TableCell>{`${file.suspiciousEventCount} eventos / ${file.triggerCount} gatilhos`}</TableCell>
                                <TableCell className={getSemaforoTone(file)}>{getSemaforo(file)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="mt-4 space-y-3 md:hidden">
                      {visibleMonitoredFiles.map((file) => {
                        const reduction = file.originalBytes > 0 ? 100 * (1 - file.reducedBytes / file.originalBytes) : 0;
                        const processingVisual = getProcessingStatusVisual(file.processingStatus);
                        const lastEventAt = fileLastEventAtMap.get(file.fileName);
                        const isPossiblyStalled = file.processingStatus === "running" && (!lastEventAt || (uiNowMs - lastEventAt.getTime() > 120000));
                        const stageSince = fileCurrentStageSinceMap.get(file.fileName);
                        const stageElapsedMs = stageSince ? uiNowMs - stageSince.getTime() : 0;
                        const isStageLong = stageElapsedMs > STAGE_WARNING_THRESHOLD_MS && (file.processingStatus === "running" || file.processingStatus === "queued");
                        return (
                          <div key={`mobile-${submittedJobId ?? "lote"}-${file.fileName}`} className={`rounded-xl border border-border bg-muted/70 dark:border-white/10 dark:bg-slate-950/60 p-3 ${processingVisual.row}`}>
                            <p className="text-sm font-medium text-foreground">{file.fileName}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{file.currentStage} · {file.currentStep}</p>
                            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                              <p>Upload: {getStatusLabel(file.uploadStatus)} ({file.uploadProgress}%)</p>
                              <p className={processingVisual.label}>
                                Processamento: {getStatusLabel(file.processingStatus)} ({file.processingProgress}%)
                                {isPossiblyStalled ? " · sem atualização recente" : ""}
                              </p>
                              <p>{formatLastActivityLabel(lastEventAt)}</p>
                              {stageSince ? <p className={isStageLong ? "text-amber-200" : "text-muted-foreground"}>Na etapa atual há {formatElapsedMs(stageElapsedMs)}</p> : null}
                              <p>Tempo de upload: {file.uploadReused ? "Reaproveitado" : formatDurationMs(file.uploadDurationMs)}</p>
                              <p>Redução: {formatPercentFine(reduction)} · {file.suspiciousEventCount} eventos / {file.triggerCount} gatilhos</p>
                              <p>Semáforo: <span className={getSemaforoTone(file)}>{getSemaforo(file)}</span></p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-muted/50 dark:border-white/10 dark:bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Sugestões de acompanhamento do lote atual</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          Recomendações automáticas por arquivo para orientar a próxima ação do analista.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-emerald-600/35 text-emerald-900 hover:bg-emerald-500/10 dark:border-emerald-400/30 dark:text-emerald-100"
                          disabled={!monitoredFiles.length}
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

                    <div className="mt-4 hidden overflow-hidden rounded-xl border border-border md:block dark:border-white/10">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="sticky left-0 z-10 bg-muted dark:bg-slate-950">Arquivo</TableHead>
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
                              <TableCell className="sticky left-0 z-10 bg-muted font-medium text-foreground dark:bg-slate-950">{file.fileName}</TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <Badge className={processingVisual.badge}>{getStatusLabel(file.processingStatus)}</Badge>
                                  <p className="text-xs text-muted-foreground">{file.currentStep}</p>
                                </div>
                              </TableCell>
                              <TableCell>{getFileInterpretation(file)}</TableCell>
                              <TableCell>{getFileRecommendation(file)}</TableCell>
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

                    <TabsContent value="operational" className="space-y-4">

                  <div className="rounded-2xl border border-border bg-muted/60 p-4 dark:border-cyan-400/15 dark:bg-slate-950/60">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Painel operacional por arquivo</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          Detalhamento técnico do arquivo selecionado (etapas, leitura operacional e eventos).
                        </p>
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
                                  <p className={`text-[11px] ${processingVisual.label}`}>{getStatusLabel(file.processingStatus)} · {file.processingProgress}%</p>
                                </div>
                              </TabsTrigger>
                            );
                          })}
                          </TabsList>
                        </div>

                        {visibleMonitoredFiles.map((file) => {
                          const reduction = file.originalBytes > 0 ? 100 * (1 - file.reducedBytes / file.originalBytes) : 0;
                          const lastEventAt = fileLastEventAtMap.get(file.fileName);
                          const isPossiblyStalled = file.processingStatus === "running" && (!lastEventAt || (uiNowMs - lastEventAt.getTime() > 120000));
                          const stageSince = fileCurrentStageSinceMap.get(file.fileName);
                          const stageElapsedMs = stageSince ? uiNowMs - stageSince.getTime() : 0;
                          const isStageLong = stageElapsedMs > STAGE_WARNING_THRESHOLD_MS && (file.processingStatus === "running" || file.processingStatus === "queued");
                          return (
                            <TabsContent key={`content-${file.fileName}`} value={file.fileName} className="space-y-4">
                              <div className="grid gap-4 md:grid-cols-4">
                                <MetricCard icon={RefreshCw} label="Upload" value={`${file.uploadProgress}%`} helper={file.uploadReused ? "Reaproveitado do servidor" : `${getStatusLabel(file.uploadStatus)} · ${formatDurationMs(file.uploadDurationMs)}`} />
                                <MetricCard icon={Database} label="Processamento" value={`${file.processingProgress}%`} helper={`${getStatusLabel(file.processingStatus)} · ${file.currentStage}`} />
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
                                    <p><span className="font-medium text-foreground">Tempo de upload:</span> {file.uploadReused ? "Reaproveitado do servidor, sem novo envio" : formatDurationMs(file.uploadDurationMs)}</p>
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
