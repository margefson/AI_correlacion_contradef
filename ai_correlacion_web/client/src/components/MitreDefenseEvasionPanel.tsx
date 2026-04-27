import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MitreDefenseEvasion, MitreEvidenceOccurrence } from "@shared/analysis";
import { listHeuristicsOutsideTa0005 } from "@shared/analysis";
import { MITRE_TA0005_CATALOG } from "@shared/mitreDefenseEvasion";
import { ChevronDown, ExternalLink } from "lucide-react";

type Props = {
  mitre: MitreDefenseEvasion;
  heuristicTags: string[];
  /** Ao escolher uma ocorrência (ficheiro, linha, nó no grafo). */
  onEvidenceTrace?: (occurrence: MitreEvidenceOccurrence) => void;
};

function EvidencePill({
  rowId,
  item,
  onSelect,
}: {
  rowId: string;
  item: { label: string; occurrences: MitreEvidenceOccurrence[] };
  onSelect?: (occ: MitreEvidenceOccurrence) => void;
}) {
  const { label, occurrences } = item;
  const n = occurrences.length;

  if (!onSelect || n === 0) {
    return (
      <Badge
        variant="outline"
        className="border-border text-foreground dark:border-white/15 dark:text-zinc-200"
        title={n === 0 ? "Sem rastreio de linha (relatório antigo ou heurística só agregada)." : undefined}
      >
        {label}
      </Badge>
    );
  }

  if (n === 1) {
    const occ = occurrences[0]!;
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-auto min-h-7 max-w-full justify-start gap-1 whitespace-normal rounded-md border border-border py-1 text-left text-xs font-normal text-foreground hover:bg-cyan-500/10 dark:border-white/15 dark:hover:bg-cyan-500/15"
        title={`${occ.fileName} · linha ${occ.lineNumber} · ${occ.stage}`}
        onClick={() => onSelect(occ)}
      >
        {label}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-7 max-w-full justify-between gap-1 whitespace-normal rounded-md border border-border py-1 text-left text-xs font-normal text-foreground hover:bg-cyan-500/10 dark:border-white/15 dark:hover:bg-cyan-500/15"
        >
          <span className="line-clamp-2">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          <span className="sr-only">({n} ocorrências)</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-sm">
        {occurrences.map((occ) => (
          <DropdownMenuItem
            key={`${rowId}-${label}-${occ.fileName}-${occ.lineNumber}`}
            className="flex flex-col items-start gap-0.5 py-2"
            onSelect={() => onSelect(occ)}
          >
            <span className="font-mono text-xs text-foreground">
              {occ.fileName}:{occ.lineNumber}
            </span>
            <span className="text-[11px] text-muted-foreground">Fase: {occ.stage}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MitreDefenseEvasionPanel({ mitre, heuristicTags, onEvidenceTrace }: Props) {
  const outsideTa0005 = listHeuristicsOutsideTa0005(heuristicTags);
  const [showUnobserved, setShowUnobserved] = useState(false);

  const parentCount =
    mitre.tacticParentTechniqueCount ?? mitre.tacticTechniqueCount;
  const catalogSize = mitre.tacticCatalogEntryCount ?? MITRE_TA0005_CATALOG.techniques.length;
  const observed = mitre.techniques;

  const unobservedRows = useMemo(() => {
    const seen = new Set(mitre.techniques.map((t) => t.id));
    return MITRE_TA0005_CATALOG.techniques.filter((e) => !seen.has(e.id));
  }, [mitre.techniques]);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-muted/50 p-4 dark:border-white/10 dark:bg-slate-950/60">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">MITRE ATT&CK — evasão de defesas</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Táctica TA0005: {parentCount} técnicas (nível MITRE) · {catalogSize} entradas no catálogo (incl. sub-técnicas)
            {observed.length > 0 ? ` · ${observed.length} com evidência assinalada nesta análise` : " · 0 com evidência nesta análise"}.
            {onEvidenceTrace ? " Clique numa evidência para abrir o fluxo e destacar a fase ou o nó da API." : null}
          </p>
        </div>
        <a
          href={mitre.tacticUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:bg-muted dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
        >
          Abrir TA0005
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {observed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum dos sinais desta análise foi mapeado para técnicas de TA0005. Isso não exclui outras táticas (por
          exemplo, Command and Control ou Persistence). O universo TA0005 encontra-se abaixo (colapsado).
        </p>
      ) : null}

      {observed.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent dark:border-white/10">
              <TableHead className="text-muted-foreground">ID</TableHead>
              <TableHead className="text-muted-foreground">Técnica (MITRE)</TableHead>
              <TableHead className="text-muted-foreground">Evidência nos logs (heurística / API)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {observed.map((row) => (
              <TableRow key={row.id} className="border-border dark:border-white/10">
                <TableCell className="align-top font-mono text-xs text-cyan-800 dark:text-cyan-200">{row.id}</TableCell>
                <TableCell className="align-top">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-foreground underline decoration-cyan-500/30 underline-offset-2 hover:text-cyan-800 dark:hover:text-cyan-200"
                  >
                    {row.name}
                  </a>
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {row.heuristicEvidence.map((item) => (
                      <EvidencePill
                        key={`${row.id}-${item.label}`}
                        rowId={row.id}
                        item={item}
                        onSelect={onEvidenceTrace}
                      />
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <Collapsible open={showUnobserved} onOpenChange={setShowUnobserved}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto w-full justify-between gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <span>
              Técnicas TA0005 sem assinalação nesta análise
              <span className="ml-1.5 font-mono text-[11px]">({unobservedRows.length})</span>
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${showUnobserved ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="max-h-[22rem] overflow-auto rounded-lg border border-border/80 dark:border-white/10">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent dark:border-white/10">
                  <TableHead className="text-[11px] text-muted-foreground">ID</TableHead>
                  <TableHead className="text-[11px] text-muted-foreground">Técnica</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unobservedRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="border-border/60 bg-muted/20 dark:border-white/5 dark:bg-slate-950/40"
                  >
                    <TableCell className="w-[1%] font-mono text-[11px] text-muted-foreground">{row.id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <a href={row.url} target="_blank" rel="noreferrer" className="hover:text-foreground">
                        {row.name}
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {outsideTa0005.length > 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Outras heurísticas (fora de TA0005):</span>{" "}
          {outsideTa0005.join(", ")} — consulte outras táticas na matriz ATT&CK conforme o comportamento.
        </p>
      ) : null}
    </div>
  );
}
