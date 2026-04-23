import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

type FlowNode = {
  id: string;
  label: string;
  kind?: string;
};

type FlowEdge = {
  source: string;
  target: string;
  relation: string;
};

type FlowGraphLike = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export default function FlowJourneyDiagram({
  graph,
  selectedNodeId,
  onSelectNode,
}: {
  graph: FlowGraphLike;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
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
    return <p className="text-sm text-zinc-400">Fluxo ainda vazio; aguarde a conclusão da correlação.</p>;
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-stretch gap-3">
        {phases.map((entry, index) => (
          <div key={entry.phase.id} className="flex items-stretch gap-3">
            <div
              className={`w-[280px] rounded-2xl border p-3 transition-colors ${
                selectedNodeId === entry.phase.id
                  ? "border-cyan-400/45 bg-cyan-500/[0.12]"
                  : "border-white/10 bg-slate-950/70"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectNode(entry.phase.id)}
                  className={`rounded-lg text-left transition ${selectedNodeId === entry.phase.id ? "text-cyan-100" : "text-zinc-100 hover:text-white"}`}
                >
                  <p className="text-sm font-semibold">{entry.phase.label}</p>
                  <p className="mt-0.5 text-[10px] font-normal text-zinc-500">Ver resumo da fase</p>
                </button>
                <Badge variant="outline" className="shrink-0 border-white/10 text-[10px] uppercase tracking-[0.08em] text-zinc-300">Fase</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {entry.events.length ? entry.events.map(({ node, incoming }) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => onSelectNode(node.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${selectedNodeId === node.id ? "border-cyan-400/40 bg-cyan-500/10 text-white" : "border-white/10 bg-black/20 text-zinc-200 hover:border-cyan-400/30 hover:bg-white/10"}`}
                  >
                    <p className="text-xs font-medium">{node.label}</p>
                    {incoming?.relation ? (
                      <p className="mt-1 text-[11px] text-zinc-400">{incoming.relation}</p>
                    ) : null}
                  </button>
                )) : <p className="text-xs text-zinc-400">Sem evidências nesta fase.</p>}
              </div>
            </div>
            {index < phases.length - 1 ? (
              <div className="flex items-center">
                <ArrowRight className="h-4 w-4 text-cyan-300" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
