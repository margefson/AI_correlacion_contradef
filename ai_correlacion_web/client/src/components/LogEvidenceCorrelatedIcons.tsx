import { useContext, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLogEvidenceShell } from "@/components/LogEvidenceShellContext";
import { LogEvidenceFileMetricsContext } from "@/components/LogEvidenceFileMetricsContext";
import { cn } from "@/lib/utils";
import {
  type EvidenceSnippetKind,
  loadLogEvidenceSnippetCached,
  pngDownloadNameForEvidence,
} from "@/lib/logEvidenceSnippetLoader";
import type { KeptLogLine } from "@/lib/logEvidencePng";
import {
  fetchOriginalLogSnippetLines,
  fetchReducedLogKeptLines,
  sliceKeptLinesAroundAnchor,
} from "@/lib/logEvidencePng";
import { ArrowLeft, ArrowRightLeft, ChevronRight, FileDown, ImageIcon, Loader2 } from "lucide-react";

export type LogEvidenceVariant = "pill" | "icon" | "node" | "table";

type Props = {
  jobId: string;
  fileName: string;
  lineNumber: number;
  caption?: string;
  variant?: LogEvidenceVariant;
  onBeforeOpen?: () => void;
  showBackToSummary?: boolean;
  onBackToSummary?: () => void;
  originalClassName?: string;
  reducedClassName?: string;
};

export function LogEvidenceCorrelatedIcons({
  originalClassName,
  reducedClassName,
  variant = "icon",
  jobId,
  fileName,
  lineNumber,
  caption,
  onBeforeOpen,
  showBackToSummary,
  onBackToSummary,
}: Props) {
  const [open, setOpen] = useState(false);
  const [snippetMode, setSnippetMode] = useState<EvidenceSnippetKind>("original");
  const [compare, setCompare] = useState(false);

  function launch(mode: EvidenceSnippetKind) {
    onBeforeOpen?.();
    setCompare(false);
    setSnippetMode(mode);
    setOpen(true);
  }

  function handleToggleMode() {
    if (compare) return;
    setSnippetMode((m) => (m === "original" ? "reduced" : "original"));
  }

  function handleDialogOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setCompare(false);
    }
  }

  return (
    <>
      <div
        className="flex shrink-0 items-center gap-1"
        role="group"
        aria-label="Evidência correlacionada: log original e log reduzido"
      >
        <Button
          type="button"
          variant="outline"
          size={variant === "icon" ? "sm" : "sm"}
          title={caption ? `${caption} · Íntegro` : `Png · íntegro · ${fileName}:${lineNumber}`}
          aria-label={`Abrir evidência do log íntegro — ${caption ?? ""}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            launch("original");
          }}
          className={cn(
            variant === "node" &&
              "mt-2 h-7 w-full max-w-full shrink-0 gap-1 px-2 py-0 text-[10px] font-medium justify-start",
            variant === "icon" && "h-8 w-8 shrink-0 border-amber-500/60 bg-amber-950/38 p-0 text-amber-50 hover:bg-amber-900/35 dark:border-amber-400/55 dark:bg-amber-950/48 dark:text-amber-50",
            variant === "pill" && "max-w-[min(100%,14rem)] shrink-0 gap-1.5 text-xs",
            variant === "table" &&
              "h-8 shrink-0 gap-1 border-amber-500/55 bg-amber-950/35 px-2 text-[11px] text-amber-50 dark:border-amber-400/45",
            originalClassName,
          )}
        >
          {variant === "icon" ? <ImageIcon className="h-4 w-4 opacity-95" /> : null}
          {variant === "node" ? <ChevronRight className="h-3 w-3 shrink-0 opacity-70" aria-hidden /> : null}
          {variant !== "icon" ? (
            <span className="min-w-0 truncate">
              {variant === "table" ? "O" : variant === "node" ? `Íntegra · L${lineNumber}` : `Íntegra · L${lineNumber}`}
            </span>
          ) : null}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          title={caption ? `${caption} · Reduzido` : `Png · reduzido · ${fileName}:${lineNumber}`}
          aria-label={`Abrir evidência do log reduzido — ${caption ?? ""}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            launch("reduced");
          }}
          className={cn(
            variant === "node" &&
              "mt-2 h-7 w-full max-w-full shrink-0 gap-1 px-2 py-0 text-[10px] font-medium justify-start",
            variant === "icon" &&
              "h-8 w-8 shrink-0 border-emerald-500/60 bg-emerald-950/35 p-0 text-emerald-50 hover:bg-emerald-900/38 dark:border-emerald-400/52 dark:bg-emerald-950/52 dark:text-emerald-50",
            variant === "pill" && "max-w-[min(100%,14rem)] shrink-0 gap-1.5 text-xs",
            variant === "table" &&
              "h-8 shrink-0 gap-1 border-emerald-500/55 bg-emerald-950/38 px-2 text-[11px] text-emerald-50 dark:border-emerald-400/55",
            reducedClassName,
          )}
        >
          {variant === "icon" ? <ImageIcon className="h-4 w-4 opacity-95" /> : null}
          {variant === "node" ? <ChevronRight className="h-3 w-3 shrink-0 opacity-70" aria-hidden /> : null}
          {variant !== "icon" ? (
            <span className="min-w-0 truncate">
              {variant === "table" ? "R" : variant === "node" ? `Reduz. · L${lineNumber}` : `Reduz. · L${lineNumber}`}
            </span>
          ) : null}
        </Button>
      </div>

      <LogEvidenceCorrelationPanel
        open={open}
        onOpenChange={handleDialogOpen}
        jobId={jobId}
        fileName={fileName}
        lineNumber={lineNumber}
        caption={caption}
        snippetMode={snippetMode}
        onSnippetModeChange={(m) => {
          setCompare(false);
          setSnippetMode(m);
        }}
        onToggleSnippetMode={handleToggleMode}
        compare={compare}
        setCompare={setCompare}
        showBackToSummary={showBackToSummary}
        onBackToSummary={onBackToSummary}
      />
    </>
  );
}

function LogEvidenceCorrelationPanel({
  jobId,
  fileName,
  lineNumber,
  caption,
  open,
  onOpenChange,
  snippetMode,
  onSnippetModeChange,
  onToggleSnippetMode,
  compare,
  setCompare,
  showBackToSummary,
  onBackToSummary,
}: {
  jobId: string;
  fileName: string;
  lineNumber: number;
  caption?: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  snippetMode: EvidenceSnippetKind;
  onSnippetModeChange: (mode: EvidenceSnippetKind) => void;
  onToggleSnippetMode: () => void;
  compare: boolean;
  setCompare: (v: boolean) => void;
  showBackToSummary?: boolean;
  onBackToSummary?: () => void;
}) {
  const shell = useLogEvidenceShell();
  const fileMetricRows = useContext(LogEvidenceFileMetricsContext);

  const resolvedBack = onBackToSummary ?? shell?.onBackToSummary;
  const resolvedShowBack =
    showBackToSummary !== undefined ? showBackToSummary : Boolean(shell?.onBackToSummary);

  const [singleLoading, setSingleLoading] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singlePng, setSinglePng] = useState<string | null>(null);
  const [singleSubtitle, setSingleSubtitle] = useState<string>("");

  const [dualLoading, setDualLoading] = useState(false);
  const [dualError, setDualError] = useState<string | null>(null);
  const [dualOrig, setDualOrig] = useState<string | null>(null);
  const [dualRed, setDualRed] = useState<string | null>(null);

  const [textCompareLoading, setTextCompareLoading] = useState(false);
  const [textCompareErr, setTextCompareErr] = useState<string | null>(null);
  const [textCompare, setTextCompare] = useState<{
    original: { lines: KeptLogLine[]; highlightLine: number };
    reduced: { lines: KeptLogLine[]; highlightLine: number; physicalByRow: number[] };
  } | null>(null);

  useEffect(() => {
    if (!open || compare) return;
    let cancelled = false;
    setSingleLoading(true);
    setSingleError(null);
    setSinglePng(null);
    setSingleSubtitle("");
    void (async () => {
      const purpose = snippetMode === "original" ? "single-original" : "single-reduced";
      const res = await loadLogEvidenceSnippetCached({
        jobId,
        fileName,
        anchorLine: lineNumber,
        snippetKind: snippetMode,
        purpose,
        fileMetricRows,
      });
      if (cancelled) return;
      if (!res.ok) {
        setSingleError(res.message);
        setSingleLoading(false);
        return;
      }
      setSinglePng(res.data.pngDataUrl);
      if (snippetMode === "original") {
        setSingleSubtitle(`Linha ${res.data.lineRef.originalLine} no íntegro`);
      } else {
        const n = res.data.lineRef.reducedTxtLine ?? "—";
        setSingleSubtitle(`.reduced.txt linha ${n}`);
      }
      setSingleLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, compare, snippetMode, jobId, fileName, lineNumber, fileMetricRows]);

  useEffect(() => {
    if (!open || !compare) {
      setDualOrig(null);
      setDualRed(null);
      setDualError(null);
      setDualLoading(false);
      return;
    }
    let cancelled = false;
    setDualLoading(true);
    setDualError(null);
    setDualOrig(null);
    setDualRed(null);
    void Promise.all([
      loadLogEvidenceSnippetCached({
        jobId,
        fileName,
        anchorLine: lineNumber,
        snippetKind: "original",
        purpose: "compare-original",
        fileMetricRows,
      }),
      loadLogEvidenceSnippetCached({
        jobId,
        fileName,
        anchorLine: lineNumber,
        snippetKind: "reduced",
        purpose: "compare-reduced",
        fileMetricRows,
      }),
    ]).then(([a, b]) => {
      if (cancelled) return;
      if (!a.ok || !b.ok) {
        setDualError(
          [!a.ok ? a.message : null, !b.ok ? b.message : null].filter(Boolean).join(" · ") ||
            "Não foi possível carregar a comparação.",
        );
        setDualLoading(false);
        return;
      }
      setDualOrig(a.data.pngDataUrl);
      setDualRed(b.data.pngDataUrl);
      setDualLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, compare, jobId, fileName, lineNumber, fileMetricRows]);

  useEffect(() => {
    if (!open || !compare) {
      setTextCompare(null);
      setTextCompareErr(null);
      setTextCompareLoading(false);
      return;
    }
    let cancelled = false;
    setTextCompareLoading(true);
    setTextCompareErr(null);
    setTextCompare(null);

    void (async () => {
      try {
        const [originalRes, kept] = await Promise.all([
          fetchOriginalLogSnippetLines(jobId, fileName, lineNumber),
          fetchReducedLogKeptLines(jobId, fileName),
        ]);
        if (cancelled) return;
        if (!kept.length) {
          setTextCompareErr("Sem linhas no log reduzido para este ficheiro.");
          setTextCompareLoading(false);
          return;
        }
        const redWindow = sliceKeptLinesAroundAnchor(kept, lineNumber);
        if (!originalRes.lines.length || !redWindow.lines.length) {
          setTextCompareErr("Trecho de texto vazio num dos lados.");
          setTextCompareLoading(false);
          return;
        }
        setTextCompare({
          original: {
            lines: originalRes.lines,
            highlightLine: originalRes.highlightLine,
          },
          reduced: {
            lines: redWindow.lines,
            highlightLine: redWindow.highlightLine,
            physicalByRow: redWindow.physicalLineNumbers,
          },
        });
      } catch (e) {
        if (!cancelled) {
          setTextCompareErr(e instanceof Error ? e.message : "Erro ao carregar texto comparado.");
        }
      } finally {
        if (!cancelled) setTextCompareLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, compare, jobId, fileName, lineNumber]);

  const title = compare
    ? "Comparar evidências — íntegra ↔ reduzida"
    : snippetMode === "original"
      ? "Evidência — log original"
      : "Evidência — log reduzido";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[min(1100px,98vw)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">
            {fileName}
            {caption ? ` · ${caption}` : ""}
          </DialogDescription>

          {!compare ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border bg-muted/60 p-0.5 dark:border-white/10">
                <Button
                  type="button"
                  size="sm"
                  variant={snippetMode === "original" ? "secondary" : "ghost"}
                  className="rounded-lg px-3"
                  aria-pressed={snippetMode === "original"}
                  aria-label="Ver só log íntegro"
                  onClick={() => onSnippetModeChange("original")}
                >
                  Íntegro
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  aria-label="Alternar íntegra e reduzida"
                  disabled={singleLoading}
                  onClick={onToggleSnippetMode}
                >
                  <ArrowRightLeft className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={snippetMode === "reduced" ? "secondary" : "ghost"}
                  className="rounded-lg px-3"
                  aria-pressed={snippetMode === "reduced"}
                  aria-label="Ver só log reduzido"
                  onClick={() => onSnippetModeChange("reduced")}
                >
                  Reduzido
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setCompare(true)}
              >
                Comparar lado a lado
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setCompare(false)}>
                Voltar vista única
              </Button>
            </div>
          )}

          {!compare && singleSubtitle ? (
            <p className="text-xs tabular-nums text-muted-foreground">{singleSubtitle}</p>
          ) : null}

          {compare ? (
            <p className="text-xs text-muted-foreground">
              Referência na correlação do fluxo:{" "}
              <span className="font-mono text-foreground">L{lineNumber}</span>.
            </p>
          ) : null}
        </DialogHeader>

        {compare ? (
          <Tabs defaultValue="images" className="mt-1 w-full min-w-0">
            <TabsList className="grid h-auto w-full max-w-lg grid-cols-2 gap-1 p-1 sm:max-w-md">
              <TabsTrigger value="images" className="text-xs sm:text-sm">
                Imagens (PNG)
              </TabsTrigger>
              <TabsTrigger value="texto" className="text-xs sm:text-sm">
                Texto lado a lado
              </TabsTrigger>
            </TabsList>

            <TabsContent value="images" className="mt-4 min-w-0 space-y-4">
              {dualLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                  A montar imagens lado a lado…
                </div>
              ) : null}

              {dualError ? <p className="text-sm text-destructive">{dualError}</p> : null}

              {dualOrig && dualRed ? (
                <div className="grid gap-4 md:grid-cols-2 md:gap-6">
                  <figure className="min-w-0 space-y-2">
                    <figcaption className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">
                      Íntegro (source)
                    </figcaption>
                    <img
                      src={dualOrig}
                      alt="Trecho original"
                      className="w-full rounded-lg border border-border object-contain dark:border-white/10"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = dualOrig;
                        a.download = pngDownloadNameForEvidence(fileName, lineNumber, "original", "compare");
                        a.click();
                      }}
                    >
                      <FileDown className="mr-2 h-4 w-4" aria-hidden />
                      Transferir PNG íntegra
                    </Button>
                  </figure>
                  <figure className="min-w-0 space-y-2">
                    <figcaption className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                      Reduzido
                    </figcaption>
                    <img
                      src={dualRed}
                      alt="Trecho reduzido"
                      className="w-full rounded-lg border border-border object-contain dark:border-white/10"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = dualRed;
                        a.download = pngDownloadNameForEvidence(fileName, lineNumber, "reduced", "compare");
                        a.click();
                      }}
                    >
                      <FileDown className="mr-2 h-4 w-4" aria-hidden />
                      Transferir PNG reduzida
                    </Button>
                  </figure>
                </div>
              ) : !dualLoading && !dualError ? (
                <p className="text-sm text-muted-foreground">Imagens não disponíveis.</p>
              ) : null}
            </TabsContent>

            <TabsContent value="texto" className="mt-4 min-w-0">
              <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                Mesmo recorte que nos PNGs: trecho obtido por{" "}
                <span className="font-mono text-foreground">fetchOriginalLogSnippetLines</span> e por{" "}
                <span className="font-mono text-foreground">sliceKeptLinesAroundAnchor</span>. Destaque ciano · linha
                referida no fluxo.
              </p>
              {textCompareLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                  A carregar texto…
                </div>
              ) : null}
              {textCompareErr ? <p className="text-sm text-destructive">{textCompareErr}</p> : null}
              {textCompare && !textCompareLoading ? (
                <div className="grid min-h-0 gap-3 md:grid-cols-2 md:gap-4">
                  <EvidenceTextComparePane
                    title="Íntegro (linha no source)"
                    headerClassName="border-amber-500/35 text-amber-800 dark:border-amber-400/35 dark:text-amber-100"
                    lines={textCompare.original.lines}
                    highlightLine={textCompare.original.highlightLine}
                  />
                  <EvidenceTextComparePane
                    title="Reduzido (físico|original)"
                    headerClassName="border-emerald-500/35 text-emerald-800 dark:border-emerald-400/35 dark:text-emerald-100"
                    lines={textCompare.reduced.lines}
                    highlightLine={textCompare.reduced.highlightLine}
                    physicalByRow={textCompare.reduced.physicalByRow}
                  />
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        ) : null}

        {!compare && singleLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
            A carregar…
          </div>
        ) : null}

        {!compare && singleError ? <p className="text-sm text-destructive">{singleError}</p> : null}

        {!compare && singlePng && !singleLoading ? (
          <>
            <img
              src={singlePng}
              alt=""
              className="mt-2 w-full rounded-lg border border-border object-contain dark:border-white/10"
            />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 dark:border-white/10">
              {resolvedShowBack && resolvedBack ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2 font-medium"
                  onClick={() => {
                    onOpenChange(false);
                    resolvedBack();
                  }}
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                  Voltar ao resumo
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = singlePng;
                  a.download = pngDownloadNameForEvidence(fileName, lineNumber, snippetMode);
                  a.click();
                }}
              >
                <FileDown className="mr-2 h-4 w-4" aria-hidden />
                Transferir PNG
              </Button>
            </div>
          </>
        ) : compare ? (
          <div className="mt-6 flex justify-end border-t border-border pt-4 dark:border-white/10">
            {resolvedShowBack && resolvedBack ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-2 font-medium"
                onClick={() => {
                  onOpenChange(false);
                  resolvedBack();
                }}
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                Voltar ao resumo
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EvidenceTextComparePane({
  title,
  headerClassName,
  lines,
  highlightLine,
  physicalByRow,
}: {
  title: string;
  headerClassName: string;
  lines: KeptLogLine[];
  highlightLine: number;
  physicalByRow?: number[];
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-muted/25 dark:border-white/10 dark:bg-slate-950/45">
      <div
        className={cn(
          "shrink-0 border-b bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide dark:bg-slate-900/55",
          headerClassName,
        )}
      >
        {title}
      </div>
      <div className="max-h-[min(52vh,560px)] overflow-auto p-2 font-mono text-[11px] leading-relaxed tabular-nums">
        {lines.map((l, i) => {
          const hi = highlightLine > 0 && l.lineNumber === highlightLine;
          const gutter =
            physicalByRow !== undefined ? `${physicalByRow[i] ?? "?"}|${l.lineNumber}` : String(l.lineNumber);
          return (
            <div
              key={`${gutter}-${i}`}
              className={cn(
                "flex gap-2 border-b border-border/40 py-0.5 pr-1 last:border-b-0 dark:border-white/[0.06]",
                hi && "rounded-sm bg-cyan-500/20 dark:bg-cyan-400/14",
              )}
            >
              <span
                className={cn(
                  "shrink-0 select-none text-right text-muted-foreground",
                  physicalByRow !== undefined ? "w-[7rem]" : "w-12",
                )}
              >
                {gutter}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-foreground">{l.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
