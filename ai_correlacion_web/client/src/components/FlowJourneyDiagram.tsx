import { Badge } from "@/components/ui/badge";
import type { EvidencePeekPayload, PhaseLogPeekOverride } from "@/components/FlowCorrelationGraph";
import { LogEvidenceCorrelatedIcons } from "@/components/LogEvidenceCorrelatedIcons";
import { getFlowNodeDetailsWithFallback } from "@/lib/flowGraph";
import type { FlowGraph } from "@shared/analysis";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

function nodeLogPeek(jobId: string, graph: FlowGraph, nodeId: string): EvidencePeekPayload | null {
  const gn = graph.nodes.find((n) => n.id === nodeId);
  if (!gn) return null;
  const d = getFlowNodeDetailsWithFallback(gn, graph);
  const sf = d.sourceFile;
  const ln = d.sourceLineNumber;
  if (!sf || sf.includes("(+") || ln == null) return null;
  return { jobId, fileName: sf, lineNumber: ln };
}

export default function FlowJourneyDiagram({
  graph,
  selectedNodeId,
  onSelectNode,
  jobId,
  phaseLogPeekOverride = null,
}: {
  graph: FlowGraph;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  jobId: string | null;
  /** Rastreio MITRE só para fase (sem nó API): força ficheiro/linha no cartão da fase. */
  phaseLogPeekOverride?: PhaseLogPeekOverride | null;
}) {
  const phases = useMemo(() => {
    const phaseNodes = graph.nodes.filter((node) => node.id.startsWith("phase:"));
    return phaseNodes.map((phase) => {
      const events = graph.edges
        .filter((edge) => edge.source === phase.id && edge.target.startsWith("event:"))
        .map((edge) => {
          const eventNode = graph.nodes.find((node) => node.id === edge.target);
          const incoming = graph.edges.find((candidate) => candidate.target === edge.target && candidate.source.startsWith("event:"));
          return eventNode ? { node: eventNode, incoming } : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      return { phase, events };
    });
  }, [graph]);

  if (!phases.length) {
    return <p className="text-sm text-muted-foreground">Fluxo ainda vazio; aguarde a conclusão da correlação.</p>;
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto pb-2">
      <div className="flex min-w-max items-stretch gap-3">
        {phases.map((entry, index) => {
          const phaseOverridePeek =
            phaseLogPeekOverride?.phaseNodeId === entry.phase.id
              ? ({
                  jobId: phaseLogPeekOverride.jobId,
                  fileName: phaseLogPeekOverride.fileName,
                  lineNumber: phaseLogPeekOverride.lineNumber,
                } satisfies EvidencePeekPayload)
              : null;
          const phasePeekFromGraph = jobId ? nodeLogPeek(jobId, graph, entry.phase.id) : null;
          const phasePeek = phaseOverridePeek ?? phasePeekFromGraph;

          return (
            <div key={entry.phase.id} className="flex items-stretch gap-3">
              <div
                className={`w-[280px] rounded-2xl border p-3 transition-colors ${
                  selectedNodeId === entry.phase.id
                    ? "border-cyan-500/50 bg-cyan-500/15 dark:border-cyan-400/45 dark:bg-cyan-500/[0.12]"
                    : "border-border bg-muted/60 dark:border-white/10 dark:bg-slate-950/70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectNode(entry.phase.id)}
                    className={`min-w-0 flex-1 rounded-lg text-left transition ${
                      selectedNodeId === entry.phase.id
                        ? "text-cyan-900 dark:text-cyan-100"
                        : "text-foreground hover:opacity-90 dark:text-zinc-100 dark:hover:text-white"
                    }`}
                  >
                    <p className="text-sm font-semibold">{entry.phase.label}</p>
                    <p className="mt-0.5 text-[10px] font-normal text-muted-foreground">Ver resumo da fase</p>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {phasePeek ? (
                      <LogEvidenceCorrelatedIcons
                        variant="icon"
                        jobId={phasePeek.jobId}
                        fileName={phasePeek.fileName}
                        lineNumber={phasePeek.lineNumber}
                        caption={`Fase: ${entry.phase.label}`}
                        onBeforeOpen={() => onSelectNode(entry.phase.id)}
                      />
                    ) : null}
                    <Badge
                      variant="outline"
                      className="border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground dark:border-white/10 dark:text-zinc-300"
                    >
                      Fase
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {entry.events.length ? (
                    entry.events.map(({ node, incoming }) => {
                      const rowPeek = jobId ? nodeLogPeek(jobId, graph, node.id) : null;
                      return (
                        <div
                          key={node.id}
                          className={`flex w-full items-stretch gap-2 rounded-xl border px-3 py-2 transition ${
                            selectedNodeId === node.id
                              ? "border-cyan-500/50 bg-cyan-500/15 dark:border-cyan-400/40 dark:bg-cyan-500/10 dark:text-white"
                              : "border-border bg-muted/50 text-foreground dark:border-white/10 dark:bg-black/20 dark:text-zinc-200"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectNode(node.id)}
                            className="min-w-0 flex-1 rounded-lg text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-cyan-500/45"
                          >
                            <span className="block text-xs font-medium">{node.label}</span>
                            {incoming?.relation ? (
                              <span className="mt-1 block text-[11px] text-muted-foreground">{incoming.relation}</span>
                            ) : null}
                          </button>
                          {rowPeek ? (
                            <div className="flex shrink-0 items-center py-0.5">
                              <LogEvidenceCorrelatedIcons
                                variant="icon"
                                jobId={rowPeek.jobId}
                                fileName={rowPeek.fileName}
                                lineNumber={rowPeek.lineNumber}
                                caption={node.label}
                                onBeforeOpen={() => onSelectNode(node.id)}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-muted-foreground">Sem evidências nesta fase.</p>
                  )}
                </div>
              </div>
              {index < phases.length - 1 ? (
                <div className="flex items-center">
                  <ArrowRight className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
