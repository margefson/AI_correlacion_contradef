import type { FlowGraph } from "@shared/analysis";
import { LogEvidenceCorrelatedIcons } from "@/components/LogEvidenceCorrelatedIcons";
import { getFlowNodeDetailsWithFallback } from "@/lib/flowGraph";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import type { Node as DagreLayoutNode } from "dagre";
import { memo, useCallback, useEffect, useMemo, type MouseEvent } from "react";

export type EvidencePeekPayload = {
  jobId: string;
  fileName: string;
  lineNumber: number;
};

/** Sobrepõe ficheiro/linha ao nó de fase (ex.: rastreio MITRE sem nó `event:`). */
export type PhaseLogPeekOverride = {
  phaseNodeId: string;
  jobId: string;
  fileName: string;
  lineNumber: number;
};

export type FlowNodeData = {
  label: string;
  kind: string;
  severity: string;
  evidencePeek?: EvidencePeekPayload | null;
  /** Chamado ao abrir o PNG de evidência: recentrar o grafo neste nó. */
  focusThisNode?: () => void;
};

function peekFromNodeDetails(jobId: string, sourceFile: string | null, lineNumber: number | null): EvidencePeekPayload | null {
  if (!sourceFile || sourceFile.includes("(+") || lineNumber == null) return null;
  return { jobId, fileName: sourceFile, lineNumber };
}

function nodeAccentClass(kind: string) {
  if (kind === "phase") {
    return "border-cyan-500/45 bg-cyan-500/12 dark:border-cyan-400/40 dark:bg-cyan-500/[0.12]";
  }
  if (kind === "verdict") {
    return "border-violet-500/45 bg-violet-500/12 dark:border-violet-400/40 dark:bg-violet-500/[0.12]";
  }
  return "border-border bg-card dark:border-white/12 dark:bg-slate-950/80";
}

const ContradefFlowNode = memo(function ContradefFlowNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const kind = data.kind ?? "event";
  const peek = data.evidencePeek;

  return (
    <>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-cyan-400" />
      <div
        className={`rounded-xl border px-3 py-2 shadow-lg transition-[box-shadow] ${
          peek ? "max-w-[min(300px,calc(100vw-48px))]" : "max-w-[260px]"
        } ${selected ? "ring-2 ring-cyan-500/55 ring-offset-2 ring-offset-background dark:ring-cyan-400/50" : ""} ${nodeAccentClass(kind)}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap break-words text-xs font-medium leading-snug text-foreground dark:text-zinc-100" title={data.label}>
              {data.label}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground dark:text-zinc-500">{kind}</p>
          </div>
          {peek ? (
            <LogEvidenceCorrelatedIcons
              variant="icon"
              jobId={peek.jobId}
              fileName={peek.fileName}
              lineNumber={peek.lineNumber}
              caption={data.label}
              onBeforeOpen={data.focusThisNode}
            />
          ) : null}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-cyan-400" />
    </>
  );
});

const nodeTypes = { contradef: ContradefFlowNode };

function estimateNodeSize(n: { label: string; kind: string }, evidenceOnNode: boolean) {
  const wBase = Math.min(280, Math.max(152, Math.round(11 + n.label.length * 5.2)));
  const w = evidenceOnNode ? Math.min(340, Math.max(wBase, 272)) : wBase;
  const hBase = n.kind === "phase" ? 58 : n.kind === "verdict" ? 62 : 54;
  const h = evidenceOnNode ? hBase + 11 : hBase;
  return { width: w, height: h };
}

function layoutWithDagre(
  nodes: FlowGraph["nodes"],
  edges: FlowGraph["edges"],
  evidenceNodeIdSet: ReadonlySet<string>,
): { rfNodes: Node<FlowNodeData>[]; rfEdges: Edge[] } {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const g = new dagre.graphlib.Graph({ multigraph: true, directed: true }).setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    ranksep: 48,
    nodesep: 28,
    marginx: 24,
    marginy: 24,
    edgesep: 12,
  });

  for (const n of nodes) {
    const { width, height } = estimateNodeSize(n, evidenceNodeIdSet.has(n.id));
    g.setNode(n.id, { width, height });
  }

  edges.forEach((e, i) => {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return;
    g.setEdge(e.source, e.target, {}, `e${i}`);
  });

  dagre.layout(g);

  const rfNodes: Node<FlowNodeData>[] = nodes.map((n) => {
    const laid = g.node(n.id) as DagreLayoutNode;
    return {
      id: n.id,
      type: "contradef",
      position: { x: laid.x - laid.width / 2, y: laid.y - laid.height / 2 },
      data: { label: n.label, kind: n.kind, severity: n.severity },
    };
  });

  const rfEdges: Edge[] = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    rfEdges.push({
      id: `flow-${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      label: e.relation,
      animated: /gatilho|progress/i.test(e.relation),
      style: { stroke: "rgba(148, 163, 184, 0.55)", strokeWidth: 1.25 },
      labelStyle: { fill: "#a5f3fc", fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: "rgba(15, 23, 42, 0.94)" },
      labelBgPadding: [4, 6] as [number, number],
      labelBgBorderRadius: 6,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b", width: 16, height: 16 },
    });
  }

  return { rfNodes, rfEdges };
}

function GraphViewportFocus({ pulse, nodeId }: { pulse: number; nodeId: string | null }) {
  const rf = useReactFlow();

  useEffect(() => {
    if (!pulse || !nodeId) return;
    const t = window.setTimeout(() => {
      try {
        void rf.fitView({
          nodes: [{ id: nodeId }],
          duration: 480,
          padding: 0.28,
          maxZoom: 1.42,
          minZoom: 0.12,
        });
      } catch {
        /* store ainda não pronto */
      }
    }, 60);
    return () => window.clearTimeout(t);
  }, [pulse, nodeId, rf]);

  return null;
}

function buildPeekByNodeId(
  graph: FlowGraph,
  jobId: string | null,
  phaseOverride: PhaseLogPeekOverride | null,
): Map<string, EvidencePeekPayload> {
  const m = new Map<string, EvidencePeekPayload>();
  if (!jobId) return m;

  for (const gn of graph.nodes) {
    const d = getFlowNodeDetailsWithFallback(gn, graph);
    const p = peekFromNodeDetails(jobId, d.sourceFile, d.sourceLineNumber);
    if (p) m.set(gn.id, p);
  }

  if (phaseOverride?.phaseNodeId) {
    m.set(phaseOverride.phaseNodeId, {
      jobId: phaseOverride.jobId,
      fileName: phaseOverride.fileName,
      lineNumber: phaseOverride.lineNumber,
    });
  }

  return m;
}

function FlowCorrelationGraphInner({
  graph,
  selectedNodeId,
  onSelectNode,
  expandedHeight,
  jobId,
  phaseLogPeekOverride,
  focusFitNodeId,
  graphFitPulse,
}: {
  graph: FlowGraph;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  expandedHeight?: boolean;
  jobId: string | null;
  phaseLogPeekOverride: PhaseLogPeekOverride | null;
  focusFitNodeId: string | null;
  graphFitPulse: number;
}) {
  const peekByNodeId = useMemo(
    () => buildPeekByNodeId(graph, jobId, phaseLogPeekOverride),
    [graph, jobId, phaseLogPeekOverride],
  );

  const evidenceNodeIdSet = useMemo(() => new Set(peekByNodeId.keys()), [peekByNodeId]);

  const { rfNodes, rfEdges } = useMemo(
    () => layoutWithDagre(graph.nodes, graph.edges, evidenceNodeIdSet),
    [graph.nodes, graph.edges, evidenceNodeIdSet],
  );

  const nodesForView = useMemo(
    () =>
      rfNodes.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
        data: {
          ...n.data,
          evidencePeek: peekByNodeId.get(n.id) ?? undefined,
          focusThisNode: () => {
            onSelectNode(n.id);
          },
        },
      })),
    [rfNodes, selectedNodeId, peekByNodeId, onSelectNode],
  );

  const onNodeClick = useCallback(
    (_: MouseEvent, node: Node<FlowNodeData>) => {
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  if (!graph.nodes.length) {
    return <p className="text-sm text-muted-foreground">Fluxo ainda vazio; aguarde a conclusão da correlação.</p>;
  }

  const boxHeight = expandedHeight
    ? "h-[min(680px,78vh)] min-h-[420px] lg:min-h-[480px]"
    : "h-[min(520px,65vh)] min-h-[360px]";

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-2">
      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Visão em grafo (arraste para mover; use os controlos para zoom)</p>
      <div
        className={`${boxHeight} w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-muted dark:border-white/10 dark:bg-slate-950`}
      >
        <ReactFlow
          nodes={nodesForView}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView={graphFitPulse === 0}
          fitViewOptions={{ padding: 0.12, maxZoom: 1.15, minZoom: 0.08 }}
          minZoom={0.05}
          maxZoom={1.85}
          proOptions={{ hideAttribution: true }}
          onNodeClick={onNodeClick}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          className="max-w-full bg-muted dark:bg-slate-950"
        >
          <GraphViewportFocus pulse={graphFitPulse} nodeId={focusFitNodeId} />
          <Background gap={16} size={1} className="dark:[&>*]:!stroke-slate-600" color="rgba(100,116,139,0.2)" />
          <Controls className="!border-border !bg-background/95 !shadow-sm dark:!border-white/15 dark:!bg-slate-900/95 [&_button]:!border-border [&_button]:!bg-muted [&_button]:hover:!bg-accent dark:[&_button]:!border-white/10 dark:[&_button]:!bg-slate-800 dark:[&_button]:hover:!bg-slate-700" />
          <MiniMap
            className="!border !border-border !bg-background/95 dark:!border-white/15 dark:!bg-slate-900/90"
            nodeStrokeWidth={2}
            maskColor="rgba(15,23,42,0.12)"
            nodeColor={(n) => {
              const k = (n.data as FlowNodeData | undefined)?.kind;
              if (k === "phase") return "#22d3ee";
              if (k === "verdict") return "#a78bfa";
              return "#64748b";
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function FlowCorrelationGraph({
  graph,
  selectedNodeId,
  onSelectNode,
  expandedHeight = false,
  jobId = null,
  phaseLogPeekOverride = null,
  focusFitNodeId = null,
  graphFitPulse = 0,
}: {
  graph: FlowGraph;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  expandedHeight?: boolean;
  jobId?: string | null;
  phaseLogPeekOverride?: PhaseLogPeekOverride | null;
  /** Nó focal para `fitView` quando `graphFitPulse` aumenta (seleção, MITRE, jornada, ícone evidência…). */
  focusFitNodeId?: string | null;
  graphFitPulse?: number;
}) {
  return (
    <ReactFlowProvider>
      <FlowCorrelationGraphInner
        graph={graph}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
        expandedHeight={expandedHeight}
        jobId={jobId}
        phaseLogPeekOverride={phaseLogPeekOverride}
        focusFitNodeId={focusFitNodeId}
        graphFitPulse={graphFitPulse}
      />
    </ReactFlowProvider>
  );
}
