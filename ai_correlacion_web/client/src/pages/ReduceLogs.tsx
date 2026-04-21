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
import { AlertTriangle, Database, FileArchive, RefreshCw, ShieldCheck, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";


function formatBytes(value?: number | null) {
  if (!value || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatPercent(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "0%";
  return `${Math.max(0, Math.min(100, value)).toFixed(value >= 10 ? 1 : 2)}%`;
}

function formatExplorerKilobytes(value?: number | null) {
  if (!value || value <= 0) return "—";
  return `${Math.round(value / 1024).toLocaleString("pt-BR")} KB`;
}

function formatDuration(value?: number | null) {
  if (!value || value <= 0) return "—";
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
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

function getStatusTone(status?: string | null) {
  switch (status) {
    case "completed":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-300";
    case "running":
    case "uploading":
      return "border-cyan-400/25 bg-cyan-500/10 text-cyan-300";
    case "failed":
      return "border-rose-400/25 bg-rose-500/10 text-rose-200";
    default:
      return "border-white/10 bg-white/5 text-zinc-300";
  }
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
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">{label}</p>
        <Icon className="h-4 w-4 text-cyan-300" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">{value}</p>
      <p className="mt-2 text-sm text-zinc-400">{helper}</p>
    </div>
  );
}

export default function ReduceLogs() {
  const utils = trpc.useUtils();
  const [analysisName, setAnalysisName] = useState("Redução Contradef - Validação Manual");
  const [focusTerms, setFocusTerms] = useState("VirtualProtect, NtQueryInformationProcess, IsDebuggerPresent, Sleep");
  const [focusRegexes, setFocusRegexes] = useState("VirtualProtect.*RW.*RX, Nt.*QueryInformationProcess");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [submittedFiles, setSubmittedFiles] = useState<SubmittedFileMonitor[]>([]);
  const [activeFileTab, setActiveFileTab] = useState<string>("");

  const reductionQuery = trpc.analysis.reductionBaseline.useQuery();
  const resumeActiveSync = trpc.analysis.resumeActiveSync.useMutation();

  useEffect(() => {
    resumeActiveSync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const realDataset = reductionQuery.data?.realDatasetCompression;
  const sampleSelectiveTest = reductionQuery.data?.sampleSelectiveTest;
  const uploadedDetail = submittedDetailQuery.data;
  const hasRemoteArtifacts = Boolean(
    uploadedDetail?.artifacts?.some((artifact) => Boolean(artifact.storageUrl)),
  );
  const showsLocalStorageModeBadge = Boolean(
    uploadedDetail
    && (uploadedDetail.job.status === "completed" || uploadedDetail.job.status === "failed")
    && !hasRemoteArtifacts,
  );

  const monitoredFiles = useMemo(
    () => buildMonitoredFiles(submittedFiles, uploadedDetail?.fileMetrics ?? []),
    [submittedFiles, uploadedDetail],
  );

  useEffect(() => {
    if (!activeFileTab && monitoredFiles[0]?.fileName) {
      setActiveFileTab(monitoredFiles[0].fileName);
      return;
    }

    if (activeFileTab && !monitoredFiles.some((file) => file.fileName === activeFileTab) && monitoredFiles[0]?.fileName) {
      setActiveFileTab(monitoredFiles[0].fileName);
    }
  }, [activeFileTab, monitoredFiles]);

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

  const activeFile = monitoredFiles.find((file) => file.fileName === activeFileTab) ?? monitoredFiles[0] ?? null;

  const activeFileEvents = useMemo(() => {
    if (!activeFile || !uploadedDetail?.events) return [];
    return uploadedDetail.events
      .filter((event) => {
        const payload = event.payloadJson && !Array.isArray(event.payloadJson) ? event.payloadJson as Record<string, unknown> : null;
        return payload?.fileName === activeFile.fileName;
      })
      .slice(-8);
  }, [activeFile, uploadedDetail?.events]);

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
      <div className="space-y-6 text-foreground">
        <section>
          <Card className="border-white/10 bg-slate-950/80 shadow-2xl shadow-cyan-950/10">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-cyan-400/25 bg-cyan-500/10 text-cyan-300">Reduzir Logs</Badge>
                <Badge variant="outline" className="border-white/10 text-zinc-300">Lote atual + monitoramento por arquivo</Badge>
              </div>
              <CardTitle className="max-w-5xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Redução com acompanhamento individual de cada log submetido
              </CardTitle>
              <CardDescription className="max-w-5xl text-base leading-7 text-zinc-300">
                Esta tela passa a tratar a submissão atual como um <span className="font-medium text-zinc-100">lote monitorado</span>. Cada arquivo enviado ganha seu próprio acompanhamento de upload, etapa de redução e resultado final antes/depois.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section>
          <Card className="border-cyan-400/15 bg-slate-950/80 shadow-xl shadow-cyan-950/10">
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">Nome da validação</label>
                  <Input value={analysisName} onChange={(event) => setAnalysisName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">Arquivos de log</label>
                  <Input
                    type="file"
                    multiple
                    accept=".cdf,.csv,.json,.log,.txt"
                    onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                  />
                  <p className="text-xs leading-5 text-zinc-400">
                    Envie arquivos como <span className="font-medium text-zinc-200">FunctionInterceptor</span>, <span className="font-medium text-zinc-200">TraceFcnCall</span>, <span className="font-medium text-zinc-200">TraceMemory</span>, <span className="font-medium text-zinc-200">TraceInstructions</span> ou <span className="font-medium text-zinc-200">TraceDisassembly</span>.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">Termos prioritários</label>
                  <Textarea value={focusTerms} onChange={(event) => setFocusTerms(event.target.value)} className="min-h-28" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">Regex heurístico complementar</label>
                  <Textarea value={focusRegexes} onChange={(event) => setFocusRegexes(event.target.value)} className="min-h-28" />
                </div>
              </div>

              {selectedFiles.length > 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
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
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                  Nenhum arquivo foi selecionado ainda. Escolha um ou mais logs para disparar a redução e criar um lote acompanhado nesta tela.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleReductionSubmit} disabled={isUploading}>
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
          <Card className="border-emerald-400/15 bg-slate-950/80 shadow-xl shadow-emerald-950/10">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Monitoramento do lote atual</CardTitle>
                  <CardDescription>
                    O bloco abaixo acompanha a submissão mais recente desta tela. Ele mostra o consolidado do lote e, em seguida, o progresso individual de cada log enviado.
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
                      helper={uploadedDetail ? `${uploadedDetail.job.progress}% · ${uploadedDetail.job.stage}` : `${monitoredFiles.length} arquivo(s) no lote atual`}
                    />
                    <MetricCard
                      icon={Database}
                      label="Arquivos no lote"
                      value={`${monitoredFiles.length}`}
                      helper={`${batchSummary?.completedFiles ?? 0} concluído(s), ${batchSummary?.runningFiles ?? 0} em processamento, ${batchSummary?.failedFiles ?? 0} com falha · tempo médio de upload ${formatDuration(batchSummary?.averageUploadDurationMs ?? 0)}`}
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
                      value={formatPercent(batchSummary?.reductionPercent ?? 0)}
                      helper={`${batchSummary?.discardedLines ?? 0} linhas descartadas no lote atual`}
                    />
                  </div>

                  {showsLocalStorageModeBadge ? (
                    <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
                      Execução concluída em modo local. O processamento e as métricas foram gerados normalmente, mas os artefatos externos não foram enviados para storage remoto neste ambiente.
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-100">Acompanhamento por arquivo</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-400">
                          Cada linha representa um log do lote atual, com progresso de envio, status do processamento e resultado da redução individual.
                          Assim que o backend concluir a etapa heurística, esta tabela passa a preencher para cada arquivo os campos <span className="font-medium text-zinc-200">Tamanho antes</span>, <span className="font-medium text-zinc-200">Tamanho depois</span>, <span className="font-medium text-zinc-200">Redução</span>, <span className="font-medium text-zinc-200">Sinais críticos</span> e a <span className="font-medium text-zinc-200">próxima etapa analítica</span> refletida em <span className="font-medium text-zinc-200">Etapa atual</span>.
                        </p>
                      </div>
                      <Badge variant="outline" className="border-white/10 text-zinc-300">
                        {uploadedDetail?.currentPhase ?? "lote em preparação"}
                      </Badge>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Arquivo</TableHead>
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
                          {monitoredFiles.map((file) => {
                            const reduction = file.originalBytes > 0 ? 100 * (1 - file.reducedBytes / file.originalBytes) : 0;
                            const uploadTone = file.uploadStatus === "failed" ? "rose" : file.uploadStatus === "completed" || file.uploadStatus === "running" ? "emerald" : "cyan";
                            const processingTone = file.processingStatus === "failed" ? "rose" : file.processingStatus === "completed" ? "emerald" : "cyan";

                            return (
                              <TableRow key={`${submittedJobId ?? "lote"}-${file.fileName}`}>
                                <TableCell className="font-medium text-zinc-100">{file.fileName}</TableCell>
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
                                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                                      <span>{getStatusLabel(file.processingStatus)}</span>
                                      <span>{file.processingProgress}%</span>
                                    </div>
                                    <ProgressStrip value={file.processingProgress} tone={processingTone} />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-zinc-100">{file.uploadReused ? "Reaproveitado" : formatDuration(file.uploadDurationMs)}</p>
                                    <p className="text-xs text-zinc-400">{file.uploadReused ? "Arquivo já existia no servidor" : "Tempo bruto de envio até 100%"}</p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-zinc-100">{file.currentStage}</p>
                                    <p className="text-xs text-zinc-400">{file.currentStep}</p>
                                  </div>
                                </TableCell>
                                <TableCell>{formatBytes(file.originalBytes)}</TableCell>
                                <TableCell>{formatBytes(file.reducedBytes)}</TableCell>
                                <TableCell>{formatPercent(reduction)}</TableCell>
                                <TableCell>{`${file.suspiciousEventCount} eventos / ${file.triggerCount} gatilhos`}</TableCell>
                                <TableCell className={getSemaforoTone(file)}>{getSemaforo(file)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-100">Sugestões de acompanhamento do lote atual</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-400">
                          Em vez de usar uma leitura genérica, as recomendações abaixo se ajustam ao lote corrente e indicam como acompanhar cada arquivo reduzido.
                        </p>
                      </div>
                      <Badge variant="outline" className="border-white/10 text-zinc-300">
                        {`${batchSummary?.suspiciousCount ?? 0} eventos suspeitos / ${batchSummary?.triggerCount ?? 0} gatilhos no lote`}
                      </Badge>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Arquivo</TableHead>
                            <TableHead>Leitura atual</TableHead>
                            <TableHead>Interpretação</TableHead>
                            <TableHead>Ação sugerida</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {monitoredFiles.map((file) => (
                            <TableRow key={`guidance-${file.fileName}`}>
                              <TableCell className="font-medium text-zinc-100">{file.fileName}</TableCell>
                              <TableCell>{`${getStatusLabel(file.processingStatus)} · ${file.currentStep}`}</TableCell>
                              <TableCell>{getFileInterpretation(file)}</TableCell>
                              <TableCell>{getFileRecommendation(file)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-cyan-400/15 bg-slate-950/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-100">Painel operacional por arquivo</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-400">
                          Cada aba abaixo detalha a situação individual do log, as etapas executadas e a leitura antes/depois correspondente ao arquivo selecionado.
                        </p>
                      </div>
                      {activeFile ? (
                        <Badge className={getStatusTone(activeFile.processingStatus)}>
                          {getStatusLabel(activeFile.processingStatus)} · {activeFile.fileName}
                        </Badge>
                      ) : null}
                    </div>

                    {activeFile ? (
                      <Tabs value={activeFileTab} onValueChange={setActiveFileTab} className="mt-4 space-y-4">
                        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
                          {monitoredFiles.map((file) => (
                            <TabsTrigger
                              key={`tab-${file.fileName}`}
                              value={file.fileName}
                              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 data-[state=active]:border-cyan-400/30 data-[state=active]:bg-cyan-500/10"
                            >
                              <div className="text-left">
                                <p className="text-xs font-medium">{file.fileName}</p>
                                <p className="text-[11px] text-zinc-400">{getStatusLabel(file.processingStatus)} · {file.processingProgress}%</p>
                              </div>
                            </TabsTrigger>
                          ))}
                        </TabsList>

                        {monitoredFiles.map((file) => {
                          const reduction = file.originalBytes > 0 ? 100 * (1 - file.reducedBytes / file.originalBytes) : 0;
                          return (
                            <TabsContent key={`content-${file.fileName}`} value={file.fileName} className="space-y-4">
                              <div className="grid gap-4 md:grid-cols-4">
                                <MetricCard icon={RefreshCw} label="Upload" value={`${file.uploadProgress}%`} helper={file.uploadReused ? "Reaproveitado do servidor" : `${getStatusLabel(file.uploadStatus)} · ${formatDuration(file.uploadDurationMs)}`} />
                                <MetricCard icon={Database} label="Processamento" value={`${file.processingProgress}%`} helper={`${getStatusLabel(file.processingStatus)} · ${file.currentStage}`} />
                                <MetricCard icon={FileArchive} label="Tamanho antes" value={formatBytes(file.originalBytes)} helper={`${file.originalLineCount} linhas`} />
                                <MetricCard icon={ShieldCheck} label="Tamanho depois" value={formatBytes(file.reducedBytes)} helper={`${file.reducedLineCount} linhas · ${formatPercent(reduction)}`} />
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
                                    <p><span className="font-medium text-zinc-100">Resultado heurístico:</span> {formatBytes(file.originalBytes)} antes, {formatBytes(file.reducedBytes)} depois, com {formatPercent(reduction)} de redução.</p>
                                    <p><span className="font-medium text-zinc-100">Tempo de upload:</span> {file.uploadReused ? "Reaproveitado do servidor, sem novo envio" : formatDuration(file.uploadDurationMs)}</p>
                                    <p><span className="font-medium text-zinc-100">Próxima leitura do analista:</span> {file.currentStep}</p>
                                    <p><span className="font-medium text-zinc-100">Última mensagem:</span> {file.lastMessage}</p>
                                    <p><span className="font-medium text-zinc-100">Sinais críticos:</span> {file.suspiciousEventCount} eventos suspeitos e {file.triggerCount} gatilhos preservados.</p>
                                    <p><span className="font-medium text-zinc-100">Ação sugerida:</span> {getFileRecommendation(file)}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="text-sm font-medium text-zinc-100">Eventos e marcos do arquivo</p>
                                {activeFileEvents.length > 0 ? (
                                  <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
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
                </>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-white/10 bg-slate-950/80 shadow-xl shadow-slate-950/10">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Baseline metodológico opcional</CardTitle>
                  <CardDescription>
                    Estes blocos permanecem apenas como referência secundária. O foco operacional da tela agora está no lote submetido nesta sessão.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-white/10 text-zinc-300">referência secundária</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {reductionQuery.isLoading ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-zinc-400">
                  Carregando referências metodológicas...
                </div>
              ) : reductionQuery.error ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-5 text-sm text-rose-200">
                  Falha ao carregar as referências: {reductionQuery.error.message}
                </div>
              ) : (
                <div className="grid gap-6 xl:grid-cols-2">
                  <Card className="border-emerald-400/15 bg-black/20">
                    <CardHeader>
                      <CardTitle className="text-lg">Tamanhos reais do dataset</CardTitle>
                      <CardDescription>Referência dos manifestos do conjunto real da amostra Full-Execution-Sample-1 / PID 2956.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <MetricCard icon={Database} label="Original" value={formatBytes(realDataset?.total_original_size)} helper={formatExplorerKilobytes(realDataset?.total_original_size)} />
                        <MetricCard icon={FileArchive} label="Reduzido" value={formatBytes(realDataset?.total_compressed_size)} helper={formatPercent(realDataset?.reduction_percent)} />
                      </div>
                      {!realDataset?.available ? (
                        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200">
                          {realDataset?.errorMessage ?? "Os manifestos do dataset real não estão disponíveis neste ambiente."}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card className="border-cyan-400/15 bg-black/20">
                    <CardHeader>
                      <CardTitle className="text-lg">Teste reproduzível do protótipo C++</CardTitle>
                      <CardDescription>Baseline metodológico do protótipo do redutor, útil como comparação externa ao lote atual.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-3">
                        <MetricCard icon={Database} label="Bytes antes" value={formatBytes(sampleSelectiveTest?.combined.original_bytes)} helper={`${sampleSelectiveTest?.combined.original_lines ?? 0} linhas`} />
                        <MetricCard icon={FileArchive} label="Bytes depois" value={formatBytes(sampleSelectiveTest?.combined.reduced_bytes)} helper={`${sampleSelectiveTest?.combined.reduced_lines ?? 0} linhas`} />
                        <MetricCard icon={ShieldCheck} label="Redução" value={formatPercent(sampleSelectiveTest?.combined.reduction_percent)} helper={`gatilho ${sampleSelectiveTest?.trigger_address ?? "—"}`} />
                      </div>
                    </CardContent>
                  </Card>
                </div>
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
