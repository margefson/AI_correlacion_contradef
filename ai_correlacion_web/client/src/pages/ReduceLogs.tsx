import DashboardLayout from "@/components/DashboardLayout";
import FlowJourneyDiagram from "@/components/FlowJourneyDiagram";
import { ExplicitSha256Block } from "@/components/ExplicitSha256Block";
import { MitreDefenseEvasionPanel } from "@/components/MitreDefenseEvasionPanel";
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
import { jobStatusBadgeClass, riskLevelBadgeClass } from "@/lib/analysisUi";
import { extractFlowNodeDetails } from "@/lib/flowGraph";
import { computeSha256HexFromFile } from "@/lib/fileHash";
import { formatBytes, formatDateTimeLocale, formatDurationMs, formatPercentFine } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { VirusTotalSampleCard } from "@/components/VirusTotalSampleCard";
import { isValidSha256Hex } from "@shared/virusTotal";
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
import { AlertTriangle, ArrowRight, BrainCircuit, Database, FileArchive, FileDown, RefreshCw, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
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
    badge: "border-white/10 bg-white/5 text-zinc-300",
    row: "",
    label: "text-zinc-300",
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
  return "text-zinc-300";
}

const DEFAULT_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const STORAGE_CREDENTIALS_MISSING_FRAGMENT = "Storage proxy credentials missing";
const STAGE_WARNING_THRESHOLD_MS = 5 * 60 * 1000;

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
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white/10 hover:shadow-md hover:shadow-slate-950/30">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-zinc-300">{label}</p>
        <Icon className="h-4 w-4 text-cyan-300" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">{value}</p>
      <p className="mt-2 text-sm text-zinc-300">{helper}</p>
    </div>
  );
}

export default function ReduceLogs() {
  const utils = trpc.useUtils();
  const [analysisName, setAnalysisName] = useState("Redução Contradef - Validação Manual");
  const [sampleSha256Input, setSampleSha256Input] = useState("");
  const [isHashingSample, setIsHashingSample] = useState(false);
  const [sampleHashError, setSampleHashError] = useState<string | null>(null);
  const [sampleExecutableLabel, setSampleExecutableLabel] = useState<string | null>(null);
  const [focusTerms, setFocusTerms] = useState("VirtualProtect, NtQueryInformationProcess, IsDebuggerPresent, Sleep");
  const [focusRegexes, setFocusRegexes] = useState("VirtualProtect.*RW.*RX, Nt.*QueryInformationProcess");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [submittedFiles, setSubmittedFiles] = useState<SubmittedFileMonitor[]>([]);
  const [activeFileTab, setActiveFileTab] = useState<string>("");
  const [reduceLogsGraphNodeId, setReduceLogsGraphNodeId] = useState<string | null>(null);
  const [uiNowMs, setUiNowMs] = useState(() => Date.now());
  const [fileQuickFilter, setFileQuickFilter] = useState<"all" | "stalled" | "running" | "completed">("all");
  const [sortByPriority, setSortByPriority] = useState(true);
  const [focusCriticalMode, setFocusCriticalMode] = useState(true);

  const resumeActiveSync = trpc.analysis.resumeActiveSync.useMutation();

  useEffect(() => {
    resumeActiveSync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        return status === "running" || status === "queued" ? 2000 : false;
      },
    },
  );

  const uploadedDetail = submittedDetailQuery.data;
  const hasRemoteArtifacts = Boolean(
    uploadedDetail?.artifacts?.some((artifact) => Boolean(artifact.storageUrl)),
  );
  const showsLocalStorageModeBadge = Boolean(
    uploadedDetail
    && (uploadedDetail.job.status === "completed" || uploadedDetail.job.status === "failed")
    && !hasRemoteArtifacts,
  );

  useEffect(() => {
    setReduceLogsGraphNodeId(null);
  }, [submittedJobId]);

  const effectiveReduceLogsGraphNodeId = useMemo(() => {
    const nodes = uploadedDetail?.flowGraph.nodes ?? [];
    if (!nodes.length) return null;
    if (reduceLogsGraphNodeId && nodes.some((node) => node.id === reduceLogsGraphNodeId)) {
      return reduceLogsGraphNodeId;
    }
    return nodes[0]!.id;
  }, [uploadedDetail?.flowGraph.nodes, reduceLogsGraphNodeId]);

  const selectedReduceLogsGraphNode = useMemo(
    () => uploadedDetail?.flowGraph.nodes.find((node) => node.id === effectiveReduceLogsGraphNodeId) ?? null,
    [uploadedDetail?.flowGraph.nodes, effectiveReduceLogsGraphNodeId],
  );
  const selectedReduceLogsNodeDetails = useMemo(
    () => extractFlowNodeDetails(selectedReduceLogsGraphNode?.metadata),
    [selectedReduceLogsGraphNode?.metadata],
  );
  const selectedReduceLogsIncomingEdge = useMemo(() => {
    if (!uploadedDetail?.flowGraph.edges.length || !selectedReduceLogsGraphNode) return null;
    return uploadedDetail.flowGraph.edges.find((edge) => edge.target === selectedReduceLogsGraphNode.id) ?? null;
  }, [uploadedDetail?.flowGraph.edges, selectedReduceLogsGraphNode]);
  const monitoredFiles = useMemo(
    () => buildMonitoredFiles(submittedFiles, uploadedDetail?.fileMetrics ?? []),
    [submittedFiles, uploadedDetail],
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
    return map;
  }, [uploadedDetail?.events]);
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

  async function handleSampleExecutableChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setSampleHashError(null);
    if (!file) {
      setSampleExecutableLabel(null);
      return;
    }
    setSampleExecutableLabel(`${file.name} · ${formatBytes(file.size)}`);
    setIsHashingSample(true);
    try {
      const hex = await computeSha256HexFromFile(file);
      setSampleSha256Input(hex);
      toast.success("SHA-256 calculado — confira o bloco destacado abaixo antes de enviar.");
    } catch (err) {
      setSampleSha256Input("");
      const message = err instanceof Error ? err.message : "Não foi possível calcular o SHA-256.";
      setSampleHashError(message);
      toast.error(message);
    } finally {
      setIsHashingSample(false);
    }
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

    const shaTrim = sampleSha256Input.trim().toLowerCase();
    if (shaTrim && !isValidSha256Hex(shaTrim)) {
      toast.error("SHA-256 da amostra inválido: use 64 caracteres hexadecimais ou deixe em branco.");
      return;
    }

    if (selectedFiles.some((file) => file.size <= 0)) {
      toast.error("Remova arquivos vazios antes de iniciar a redução do lote.");
      return;
    }

    setIsUploading(true);
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
        sampleSha256: shaTrim || undefined,
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
        toast.success("Storage externo indisponível no ambiente local. Lote enviado pelo modo legado.");
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
        toast.success("Storage externo indisponível no ambiente local. Lote enviado pelo modo legado.");
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
          <Card className="border-white/10 bg-slate-950/80 shadow-2xl shadow-cyan-950/20">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-cyan-400/25 bg-cyan-500/10 text-cyan-300">Reduzir Logs</Badge>
                <Badge variant="outline" className="border-white/10 text-zinc-300">
                  Lote atual + monitoramento por arquivo
                </Badge>
              </div>
              <CardTitle className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
                Redução com acompanhamento individual de cada log submetido
              </CardTitle>
              <CardDescription className="text-base leading-7 text-zinc-300">
                Esta tela passa a tratar a submissão atual como um <strong>lote monitorado</strong>. Cada arquivo enviado ganha seu próprio acompanhamento de upload, etapa de redução e resultado final antes/depois.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section>
          <Card className="border-cyan-400/15 bg-slate-950/80 shadow-xl shadow-slate-950/30">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <UploadCloud className="h-5 w-5 text-cyan-300" />
                  <div>
                    <CardTitle>Enviar lote de logs para reduzir</CardTitle>
                    <CardDescription>
                      Envie um ou mais logs da Contradef. Se o mesmo arquivo já tiver sido persistido no backend, a tela reaproveita o conteúdo existente e evita novo upload do artefato grande.
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="border-white/10 text-zinc-300">
                  {submittedJobId ? `Job atual: ${submittedJobId}` : "Nenhum lote ativo nesta sessão"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2 lg:col-span-2">
                  <label className="text-sm font-medium text-zinc-200">Nome da validação</label>
                  <Input value={analysisName} onChange={(event) => setAnalysisName(event.target.value)} className="bg-slate-950/80" />
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div>
                  <p className="text-sm font-medium text-zinc-100">Amostra e VirusTotal (opcional)</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    O hash abaixo deve ser o do <span className="text-zinc-300">mesmo binário</span> que vê no VirusTotal — não o dos logs da Contradef. Pode calcular automaticamente a partir do ficheiro ou colar o SHA-256.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-200">Ficheiro da amostra (.exe, .dll, …)</label>
                    <Input
                      type="file"
                      accept=".exe,.dll,.sys,.bin,.elf,.msi,.scr,.dat,.ocx,.cpl,.drv,.so"
                      className="bg-slate-950/80"
                      disabled={isHashingSample}
                      onChange={handleSampleExecutableChange}
                    />
                    {sampleExecutableLabel ? (
                      <p className="text-xs text-zinc-500">Origem do hash: {sampleExecutableLabel}</p>
                    ) : null}
                    {isHashingSample ? <p className="text-xs text-cyan-300">A calcular SHA-256 no navegador…</p> : null}
                    {sampleHashError ? <p className="text-xs text-rose-300">{sampleHashError}</p> : null}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-200">Ou cole o SHA-256 (64 hex)</label>
                    <Input
                      value={sampleSha256Input}
                      onChange={(event) => {
                        setSampleSha256Input(event.target.value);
                        setSampleHashError(null);
                        setSampleExecutableLabel(null);
                      }}
                      placeholder="36685efcf34c7a7a6f6dd2e48199e4700b5ab8fe3945a50297703dd8daced74f"
                      className="bg-slate-950/80 font-mono text-sm"
                      spellCheck={false}
                    />
                  </div>
                </div>
                {isValidSha256Hex(sampleSha256Input.trim()) ? (
                  <ExplicitSha256Block
                    sha256Lowercase={sampleSha256Input.trim().toLowerCase()}
                    helperText={
                      sampleExecutableLabel
                        ? `Hash calculado a partir de: ${sampleExecutableLabel}. Compare com a página do VirusTotal antes de submeter.`
                        : "Hash inserido manualmente. Abra o VirusTotal e confirme que o SHA-256 da ficha coincide com o valor abaixo."
                    }
                  />
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Arquivos de log</label>
                <Input
                  type="file"
                  multiple
                  accept=".cdf,.csv,.json,.log,.txt,.7z,.zip,.rar"
                  onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                  className="bg-slate-950/80"
                />
                <p className="text-xs leading-5 text-zinc-400">
                  Envie arquivos como <span className="font-medium text-zinc-200">FunctionInterceptor</span>, <span className="font-medium text-zinc-200">TraceFcnCall</span>, <span className="font-medium text-zinc-200">TraceMemory</span>, <span className="font-medium text-zinc-200">TraceInstructions</span> ou <span className="font-medium text-zinc-200">TraceDisassembly</span>. Contêineres <span className="font-medium text-zinc-200">.7z/.zip/.rar</span> também são aceitos e processados por logs internos.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">Termos prioritários</label>
                  <Textarea value={focusTerms} onChange={(event) => setFocusTerms(event.target.value)} className="min-h-28 bg-slate-950/80" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">Regex heurístico complementar</label>
                  <Textarea value={focusRegexes} onChange={(event) => setFocusRegexes(event.target.value)} className="min-h-28 bg-slate-950/80" />
                </div>
              </div>

              {selectedFiles.length > 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-medium text-zinc-100">Arquivos selecionados para a próxima execução</p>
                  <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
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
                            <TableCell className="font-medium text-zinc-100">{file.name}</TableCell>
                            <TableCell>{inferLogType(file.name)}</TableCell>
                            <TableCell>{formatBytes(file.size)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                  Nenhum arquivo foi selecionado ainda. Escolha um ou mais logs para disparar a redução e criar um lote acompanhado nesta tela.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleReductionSubmit} disabled={isUploading} className="transition duration-200 hover:-translate-y-0.5">
                  {isUploading ? "Enviando lote e iniciando redução..." : "Executar redução com upload"}
                </Button>
                <p className="text-sm text-zinc-400">
                  Após o envio ou reaproveitamento, o monitoramento abaixo passa a refletir o lote atual, atualizando os arquivos individualmente conforme o processamento avança.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-emerald-400/15 bg-slate-950/80 shadow-xl shadow-slate-950/30">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Monitoramento do lote atual</CardTitle>
                  <CardDescription>
                    Visão única do lote atual: status geral, leitura consolidada e acompanhamento por arquivo.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className="border-emerald-400/25 bg-emerald-500/10 text-emerald-300">
                    {submittedJobId ? `job ${submittedJobId}` : "aguardando lote"}
                  </Badge>
                  <Badge variant="outline" className="border-white/10 text-zinc-300">autoatualização 2s</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {!monitoredFiles.length ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-6 text-zinc-400">
                  Assim que você submeter um lote, esta área mostrará o status consolidado da redução, o progresso individual de cada log e as etapas executadas para cada arquivo.
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

                  <Tabs defaultValue="overview" className="space-y-4">
                    <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
                      <TabsTrigger value="overview" className="rounded-lg px-3 py-1.5 data-[state=active]:bg-cyan-500/20">Visão geral</TabsTrigger>
                      <TabsTrigger value="files" className="rounded-lg px-3 py-1.5 data-[state=active]:bg-cyan-500/20">Arquivos</TabsTrigger>
                      <TabsTrigger value="operational" className="rounded-lg px-3 py-1.5 data-[state=active]:bg-cyan-500/20">Operacional</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">

                  {showsLocalStorageModeBadge ? (
                    <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
                      Execução concluída sem envio ao storage remoto (Forge). O processamento e as métricas foram gerados normalmente; use os links de download abaixo para acessar a cópia mantida no servidor, quando existir.
                    </div>
                  ) : null}

                  {uploadedDetail ? (
                    <Card className="border-cyan-400/20 bg-slate-950/70 shadow-lg shadow-cyan-950/10">
                      <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <CardTitle className="text-lg">Interpretação consolidada do lote atual</CardTitle>
                            <CardDescription>
                              Classificação, fluxo correlacionado, artefatos e resumo alinhados ao dashboard principal — sem sair da rota Reduzir Logs.
                            </CardDescription>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge className={jobStatusBadgeClass(uploadedDetail.job.status)}>{uploadedDetail.job.status}</Badge>
                            <Badge className={riskLevelBadgeClass(uploadedDetail.riskLevel)}>{uploadedDetail.riskLevel}</Badge>
                            <Badge variant="outline" className="border-white/10 text-zinc-200">{uploadedDetail.classification}</Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Tabs defaultValue="resumo" className="space-y-4">
                          <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                            <TabsTrigger value="resumo" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 data-[state=active]:border-cyan-400/30 data-[state=active]:bg-cyan-500/10">Resumo</TabsTrigger>
                            <TabsTrigger value="fluxo" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 data-[state=active]:border-cyan-400/30 data-[state=active]:bg-cyan-500/10">Fluxo</TabsTrigger>
                            <TabsTrigger value="artefatos" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 data-[state=active]:border-cyan-400/30 data-[state=active]:bg-cyan-500/10">Artefatos</TabsTrigger>
                            <TabsTrigger value="timeline" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 data-[state=active]:border-cyan-400/30 data-[state=active]:bg-cyan-500/10">Eventos do job</TabsTrigger>
                          </TabsList>

                          <TabsContent value="resumo" className="space-y-4">
                            <VirusTotalSampleCard sampleSha256={uploadedDetail.job.sampleSha256} />
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                                  <BrainCircuit className="h-4 w-4 text-cyan-300" />
                                  Resumo interpretativo
                                </div>
                                <p className="mt-1 text-xs text-zinc-400">{uploadedDetail.insight?.title ?? "Resumo automático"}</p>
                                <div className="prose prose-invert mt-3 max-w-none prose-p:text-zinc-300 prose-headings:text-white">
                                  <Streamdown>{uploadedDetail.insight?.summaryMarkdown ?? "Resumo ainda não disponível para este job."}</Streamdown>
                                </div>
                              </div>
                              <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="text-sm font-medium text-zinc-100">Indicadores do lote</p>
                                <div className="grid gap-2 text-sm text-zinc-300">
                                  <p><span className="text-zinc-400">Fase comportamental:</span> {uploadedDetail.currentPhase}</p>
                                  <p><span className="text-zinc-400">Redução (linhas):</span> {uploadedDetail.metrics.originalLineCount} → {uploadedDetail.metrics.reducedLineCount} ({formatPercentFine(uploadedDetail.metrics.reductionPercent)})</p>
                                  <p><span className="text-zinc-400">APIs suspeitas (lista):</span> {uploadedDetail.suspiciousApis.length ? uploadedDetail.suspiciousApis.join(", ") : "—"}</p>
                                </div>
                                <MitreDefenseEvasionPanel
                                  mitre={uploadedDetail.mitreDefenseEvasion}
                                  heuristicTags={uploadedDetail.techniques}
                                />
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-zinc-400">Heurísticas nos logs</p>
                                  <div className="flex flex-wrap gap-2">
                                    {uploadedDetail.techniques.length
                                      ? uploadedDetail.techniques.map((technique) => (
                                        <Badge key={technique} variant="outline" className="border-white/10 text-zinc-200">{technique}</Badge>
                                      ))
                                      : <span className="text-xs text-zinc-500">Nenhuma técnica marcada.</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="fluxo" className="space-y-4">
                            <div className="grid gap-4 lg:grid-cols-[1fr,300px]">
                              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/40 p-4">
                                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
                                  <Sparkles className="h-4 w-4 text-cyan-300" />
                                  Clique em um nó para inspecionar metadados no painel ao lado.
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {uploadedDetail.flowGraph.nodes.length ? uploadedDetail.flowGraph.nodes.map((node) => (
                                    <button
                                      key={node.id}
                                      type="button"
                                      onClick={() => setReduceLogsGraphNodeId(node.id)}
                                      className={`rounded-2xl border px-3 py-2 text-left text-sm transition ${effectiveReduceLogsGraphNodeId === node.id ? "border-cyan-400/40 bg-cyan-500/10 text-white" : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"}`}
                                    >
                                      <span className="font-medium">{node.label}</span>
                                      <Badge variant="outline" className="ml-2 border-white/10 text-xs text-zinc-300">{node.kind}</Badge>
                                    </button>
                                  )) : (
                                    <p className="text-sm text-zinc-400">Fluxo ainda vazio; aguarde a conclusão da correlação.</p>
                                  )}
                                </div>
                                <div className="mt-4 space-y-3">
                                  <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Jornada por fase</p>
                                  <FlowJourneyDiagram
                                    graph={uploadedDetail.flowGraph}
                                    selectedNodeId={effectiveReduceLogsGraphNodeId}
                                    onSelectNode={setReduceLogsGraphNodeId}
                                  />
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
                                  {uploadedDetail.flowGraph.edges.map((edge) => (
                                    <div key={`${edge.source}-${edge.target}-${edge.relation}`} className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1">
                                      <span>{edge.source.replace("phase:", "").replace("event:", "")}</span>
                                      <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-200">{edge.relation}</span>
                                      <ArrowRight className="h-3 w-3 shrink-0" />
                                      <span>{edge.target.replace("phase:", "").replace("event:", "")}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="text-sm font-medium text-zinc-100">Nó selecionado</p>
                                <p className="mt-1 text-xs text-zinc-400">{selectedReduceLogsGraphNode?.label ?? "Selecione um nó na lista."}</p>
                                {selectedReduceLogsGraphNode ? (
                                  <div className="mt-3 space-y-3 text-sm text-zinc-300">
                                    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                                      <p><span className="text-zinc-400">Arquivo de origem:</span> {selectedReduceLogsNodeDetails.sourceFile ?? "—"}</p>
                                      <p><span className="text-zinc-400">Tipo de log:</span> {selectedReduceLogsNodeDetails.sourceLogType ?? "—"}</p>
                                      <p><span className="text-zinc-400">Linha:</span> {selectedReduceLogsNodeDetails.sourceLineNumber ?? "—"}</p>
                                      <p><span className="text-zinc-400">Fase:</span> {selectedReduceLogsNodeDetails.stage ?? "—"}</p>
                                      <p><span className="text-zinc-400">Transição:</span> {selectedReduceLogsIncomingEdge?.relation ?? "—"}</p>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                                      <p className="text-zinc-200">
                                        <span className="text-zinc-400">Como foi identificado:</span>{" "}
                                        {selectedReduceLogsNodeDetails.identification ?? selectedReduceLogsNodeDetails.identifiedBy ?? "Sem descrição de identificação."}
                                      </p>
                                      <p className="mt-2 text-zinc-300">{selectedReduceLogsNodeDetails.evidence ?? "Sem evidência textual disponível."}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {(selectedReduceLogsNodeDetails.suspiciousApis.length
                                        ? selectedReduceLogsNodeDetails.suspiciousApis
                                        : ["Sem APIs mapeadas"]
                                      ).map((api) => (
                                        <Badge key={api} variant="outline" className="border-amber-400/25 bg-amber-500/10 text-amber-200">{api}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="artefatos" className="space-y-3">
                            <p className="text-sm text-zinc-400">
                              Artefatos registrados para este job. Download usa URL assinada quando o storage remoto está configurado; caso contrário, o servidor oferece cópia local autenticada (mesma sessão) enquanto o arquivo existir em disco.
                            </p>
                            <div className="space-y-2">
                              {uploadedDetail.artifacts.length ? uploadedDetail.artifacts.map((artifact) => (
                                <a
                                  key={`${artifact.artifactType}-${artifact.relativePath}`}
                                  href={artifact.downloadUrl ?? artifact.storageUrl ?? "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-4 transition ${artifact.downloadUrl || artifact.storageUrl ? "hover:border-cyan-400/30 hover:bg-cyan-500/10" : "pointer-events-none opacity-60"}`}
                                >
                                  <div>
                                    <p className="text-sm font-medium text-zinc-100">{artifact.label}</p>
                                    <p className="text-xs text-zinc-400">{artifact.artifactType} · {formatBytes(artifact.sizeBytes ?? undefined)}</p>
                                  </div>
                                  <FileDown className="h-4 w-4 text-zinc-300" />
                                </a>
                              )) : (
                                <p className="text-sm text-zinc-500">Nenhum artefato listado ainda.</p>
                              )}
                            </div>
                          </TabsContent>

                          <TabsContent value="timeline" className="space-y-3">
                            <p className="text-sm text-zinc-400">Eventos operacionais e evidências retidas (amostra recente).</p>
                            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                              {uploadedDetail.events.slice(0, 40).map((event, index) => (
                                <div key={`${event.eventType}-${index}-${String(event.createdAt)}`} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant="outline" className="border-white/10 text-zinc-300">{event.stage ?? "—"}</Badge>
                                    <Badge className="border-white/10 bg-white/5 text-zinc-200">{event.eventType}</Badge>
                                    <span className="text-xs text-zinc-500">{formatDateTimeLocale(event.createdAt)}</span>
                                  </div>
                                  <p className="mt-2 text-zinc-200">{event.message ?? "—"}</p>
                                </div>
                              ))}
                            </div>
                          </TabsContent>
                        </Tabs>
                      </CardContent>
                    </Card>
                  ) : null}

                    </TabsContent>

                    <TabsContent value="files" className="space-y-4">

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-100">Acompanhamento por arquivo</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-400">
                          Progresso de upload, processamento e resultado de redução para cada log do lote atual.
                        </p>
                      </div>
                      <Badge variant="outline" className="border-white/10 text-zinc-300">
                        {uploadedDetail?.currentPhase ?? "lote em preparação"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className={`border-white/10 ${fileQuickFilter === "stalled" ? "bg-amber-500/15 text-amber-200" : "text-zinc-300"}`}
                        onClick={() => setFileQuickFilter((current) => current === "stalled" ? "all" : "stalled")}
                      >
                        {fileQuickFilter === "stalled" ? "Filtro: possivelmente travados" : "Mostrar só possivelmente travados"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`border-white/10 ${fileQuickFilter === "running" ? "bg-cyan-500/15 text-cyan-200" : "text-zinc-300"}`}
                        onClick={() => setFileQuickFilter((current) => current === "running" ? "all" : "running")}
                      >
                        {fileQuickFilter === "running" ? "Filtro: em processamento" : "Mostrar só em processamento"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`border-white/10 ${fileQuickFilter === "completed" ? "bg-emerald-500/15 text-emerald-200" : "text-zinc-300"}`}
                        onClick={() => setFileQuickFilter((current) => current === "completed" ? "all" : "completed")}
                      >
                        {fileQuickFilter === "completed" ? "Filtro: concluídos" : "Mostrar só concluídos"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`border-white/10 ${sortByPriority ? "bg-violet-500/15 text-violet-200" : "text-zinc-300"}`}
                        onClick={() => setSortByPriority((current) => !current)}
                      >
                        {sortByPriority ? "Ordenação: prioridade analítica" : "Ordenar por prioridade analítica"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`border-white/10 ${focusCriticalMode ? "bg-rose-500/15 text-rose-200" : "text-zinc-300"}`}
                        onClick={() => setFocusCriticalMode((current) => !current)}
                      >
                        {focusCriticalMode ? "Foco crítico automático ativo" : "Ativar foco crítico automático"}
                      </Button>
                      <Badge variant="outline" className="border-white/10 text-zinc-300">
                        {stalledFileNameSet.size} arquivo(s) em atenção
                      </Badge>
                    </div>

                    {fileQuickFilter !== "all" && visibleMonitoredFiles.length === 0 ? (
                      <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-slate-950/50 p-3 text-sm text-zinc-300">
                        Nenhum arquivo corresponde ao filtro selecionado no momento.
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3 text-sm text-zinc-300">
                      <p className="font-medium text-zinc-100">Prioridade de investigação</p>
                      <p className="mt-1 text-zinc-300">
                        {visibleMonitoredFiles.length
                          ? `${visibleMonitoredFiles.slice(0, 3).map((file) => file.fileName).join(" · ")}`
                          : "Sem arquivos priorizados para o filtro atual."}
                      </p>
                      {focusCriticalMode && criticalFocusCandidate ? (
                        <p className="mt-2 text-rose-200">Foco automático atual: {criticalFocusCandidate.fileName}</p>
                      ) : null}
                    </div>

                    <div className="mt-4 hidden overflow-hidden rounded-xl border border-white/10 md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="sticky left-0 z-10 bg-slate-950">Arquivo</TableHead>
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
                                <TableCell className="sticky left-0 z-10 bg-slate-950 font-medium text-zinc-100">{file.fileName}</TableCell>
                                <TableCell className="min-w-44">
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
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
                                    <p className="font-medium text-zinc-100">{file.uploadReused ? "Reaproveitado" : formatDurationMs(file.uploadDurationMs)}</p>
                                    <p className="text-xs text-zinc-400">{file.uploadReused ? "Arquivo já existia no servidor" : "Tempo bruto de envio até 100%"}</p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-zinc-100">{file.currentStage}</p>
                                    <p className="text-xs text-zinc-400">{file.currentStep}</p>
                                    <p className="text-xs text-zinc-400">{formatLastActivityLabel(lastEventAt)}</p>
                                    {stageSince ? (
                                      <p className={`text-xs ${isStageLong ? "text-amber-200" : "text-zinc-400"}`}>
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
                          <div key={`mobile-${submittedJobId ?? "lote"}-${file.fileName}`} className={`rounded-xl border border-white/10 bg-slate-950/60 p-3 ${processingVisual.row}`}>
                            <p className="text-sm font-medium text-zinc-100">{file.fileName}</p>
                            <p className="mt-1 text-xs text-zinc-400">{file.currentStage} · {file.currentStep}</p>
                            <div className="mt-3 space-y-2 text-xs text-zinc-300">
                              <p>Upload: {getStatusLabel(file.uploadStatus)} ({file.uploadProgress}%)</p>
                              <p className={processingVisual.label}>
                                Processamento: {getStatusLabel(file.processingStatus)} ({file.processingProgress}%)
                                {isPossiblyStalled ? " · sem atualização recente" : ""}
                              </p>
                              <p>{formatLastActivityLabel(lastEventAt)}</p>
                              {stageSince ? <p className={isStageLong ? "text-amber-200" : "text-zinc-300"}>Na etapa atual há {formatElapsedMs(stageElapsedMs)}</p> : null}
                              <p>Tempo de upload: {file.uploadReused ? "Reaproveitado" : formatDurationMs(file.uploadDurationMs)}</p>
                              <p>Redução: {formatPercentFine(reduction)} · {file.suspiciousEventCount} eventos / {file.triggerCount} gatilhos</p>
                              <p>Semáforo: <span className={getSemaforoTone(file)}>{getSemaforo(file)}</span></p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-100">Sugestões de acompanhamento do lote atual</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-400">
                          Recomendações automáticas por arquivo para orientar a próxima ação do analista.
                        </p>
                      </div>
                      <Badge variant="outline" className="border-white/10 text-zinc-300">
                        {`${batchSummary?.suspiciousCount ?? 0} eventos suspeitos / ${batchSummary?.triggerCount ?? 0} gatilhos no lote`}
                      </Badge>
                    </div>

                    <div className="mt-4 hidden overflow-hidden rounded-xl border border-white/10 md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="sticky left-0 z-10 bg-slate-950">Arquivo</TableHead>
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
                              <TableCell className="sticky left-0 z-10 bg-slate-950 font-medium text-zinc-100">{file.fileName}</TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <Badge className={processingVisual.badge}>{getStatusLabel(file.processingStatus)}</Badge>
                                  <p className="text-xs text-zinc-300">{file.currentStep}</p>
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
                        <div key={`guidance-mobile-${file.fileName}`} className={`rounded-xl border border-white/10 bg-slate-950/60 p-3 ${processingVisual.row}`}>
                          <p className="text-sm font-medium text-zinc-100">{file.fileName}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge className={processingVisual.badge}>{getStatusLabel(file.processingStatus)}</Badge>
                            <p className="text-xs text-zinc-300">{file.currentStep}</p>
                          </div>
                          <p className="mt-2 text-sm text-zinc-300">{getFileInterpretation(file)}</p>
                          <p className="mt-2 text-sm text-cyan-100">{getFileRecommendation(file)}</p>
                        </div>
                        );
                      })}
                    </div>
                  </div>

                    </TabsContent>

                    <TabsContent value="operational" className="space-y-4">

                  <div className="rounded-2xl border border-cyan-400/15 bg-slate-950/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-100">Painel operacional por arquivo</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-400">
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
                        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
                          {visibleMonitoredFiles.map((file) => {
                            const processingVisual = getProcessingStatusVisual(file.processingStatus);
                            return (
                              <TabsTrigger
                                key={`tab-${file.fileName}`}
                                value={file.fileName}
                                className={`rounded-xl border border-white/10 bg-black/20 px-3 py-2 data-[state=active]:border-cyan-400/30 data-[state=active]:bg-cyan-500/10 ${processingVisual.row}`}
                              >
                                <div className="text-left">
                                  <p className="text-xs font-medium">{file.fileName}</p>
                                  <p className={`text-[11px] ${processingVisual.label}`}>{getStatusLabel(file.processingStatus)} · {file.processingProgress}%</p>
                                </div>
                              </TabsTrigger>
                            );
                          })}
                        </TabsList>

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
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                  <p className="text-sm font-medium text-zinc-100">Etapas executadas neste arquivo</p>
                                  <div className="mt-4 space-y-3">
                                    <StepRow title="1. Recebimento do arquivo" status={file.uploadStatus === "failed" ? "Falhou" : file.uploadProgress >= 100 ? "Concluído" : "Em andamento"} description={`Upload ${file.uploadProgress}% · ${formatBytes(file.sizeBytes ?? file.originalBytes)}`} />
                                    <StepRow title="2. Leitura e filtragem heurística" status={file.processingStatus === "queued" ? "Aguardando" : file.processingStatus === "running" ? "Em andamento" : file.processingStatus === "failed" ? "Falhou" : "Concluído"} description={file.currentStep} />
                                    <StepRow title="3. Consolidação do resultado reduzido" status={file.processingStatus === "completed" ? "Concluído" : file.processingStatus === "failed" ? "Falhou" : "Aguardando"} description={file.lastMessage} />
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                  <p className="text-sm font-medium text-zinc-100">Leitura operacional do arquivo</p>
                                  <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
                                    <p><span className="font-medium text-zinc-100">Tipo inferido:</span> {file.logType}</p>
                                    <p><span className="font-medium text-zinc-100">Etapa atual:</span> {file.currentStage}</p>
                                    <p><span className="font-medium text-zinc-100">Resultado heurístico:</span> {formatBytes(file.originalBytes)} antes, {formatBytes(file.reducedBytes)} depois, com {formatPercentFine(reduction)} de redução.</p>
                                    <p><span className="font-medium text-zinc-100">Tempo de upload:</span> {file.uploadReused ? "Reaproveitado do servidor, sem novo envio" : formatDurationMs(file.uploadDurationMs)}</p>
                                    <p><span className="font-medium text-zinc-100">Próxima leitura do analista:</span> {file.currentStep}</p>
                                    <p><span className="font-medium text-zinc-100">Última mensagem:</span> {file.lastMessage}</p>
                                    <p><span className="font-medium text-zinc-100">Atividade:</span> {formatLastActivityLabel(lastEventAt)}{isPossiblyStalled ? " (verificar se houve pausa prolongada)" : ""}</p>
                                    {stageSince ? (
                                      <p><span className="font-medium text-zinc-100">Tempo na etapa atual:</span> <span className={isStageLong ? "text-amber-200" : "text-zinc-300"}>{formatElapsedMs(stageElapsedMs)}{isStageLong ? " (acima do limite esperado)" : ""}</span></p>
                                    ) : null}
                                    <p><span className="font-medium text-zinc-100">Sinais críticos:</span> {file.suspiciousEventCount} eventos suspeitos e {file.triggerCount} gatilhos preservados.</p>
                                    <p><span className="font-medium text-zinc-100">Ação sugerida:</span> {getFileRecommendation(file)}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="text-sm font-medium text-zinc-100">Eventos e marcos do arquivo</p>
                                {activeFileEvents.length > 0 ? (
                                  <div className="mt-4 hidden overflow-hidden rounded-xl border border-white/10 md:block">
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
                                        <div key={`event-mobile-${file.fileName}-${index}`} className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                                          <p className="text-xs text-zinc-400">{createdAtLabel}</p>
                                          <p className="mt-1 text-sm font-medium text-zinc-100">{event.stage}</p>
                                          <p className="mt-1 text-sm text-zinc-300">{event.message}</p>
                                          <p className="mt-1 text-xs text-zinc-400">Progresso: {event.progress}%</p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="mt-4 text-sm leading-6 text-zinc-400">
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
        : "border-white/10 bg-white/5 text-zinc-300";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-100">{title}</p>
        <Badge className={tone}>{status}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
    </div>
  );
}
