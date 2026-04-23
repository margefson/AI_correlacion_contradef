import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MitreDefenseEvasion } from "@shared/analysis";
import { listHeuristicsOutsideTa0005 } from "@shared/analysis";
import { ExternalLink } from "lucide-react";

type Props = {
  mitre: MitreDefenseEvasion;
  heuristicTags: string[];
};

export function MitreDefenseEvasionPanel({ mitre, heuristicTags }: Props) {
  const outsideTa0005 = listHeuristicsOutsideTa0005(heuristicTags);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-muted/50 p-4 dark:border-white/10 dark:bg-slate-950/60">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">MITRE ATT&CK — evasão de defesas</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            A <span className="text-foreground">categoria da amostra</span> (Trojan, Backdoor, etc.) descreve o{" "}
            <em>tipo</em> de ameaça. A tabela abaixo lista apenas comportamentos dos logs que mapeiam para a tática{" "}
            <a
              href={mitre.tacticUrl}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-700 underline decoration-cyan-500/40 underline-offset-2 hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-200"
            >
              {mitre.tacticId} — {mitre.tacticName}
            </a>{" "}
            (Defense Evasion, matriz Enterprise —{" "}
            <span className="text-foreground">{mitre.tacticTechniqueCount} técnicas</span> nesta tática), listando{" "}
            <span className="text-foreground">técnicas e sub-técnicas</span> quando os logs permitem refinamento (IDs oficiais ATT&CK).
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

      {mitre.techniques.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum dos rótulos heurísticos desta análise foi mapeado para técnicas de TA0005. Isso não exclui outras
          táticas (por exemplo, Command and Control ou Persistence).
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent dark:border-white/10">
              <TableHead className="text-muted-foreground">ID</TableHead>
              <TableHead className="text-muted-foreground">Técnica (MITRE)</TableHead>
              <TableHead className="text-muted-foreground">Evidência nos logs (heurística / API)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mitre.techniques.map((row) => (
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
                    {row.heuristicEvidence.map((tag) => (
                      <Badge key={`${row.id}-${tag}`} variant="outline" className="border-border text-foreground dark:border-white/15 dark:text-zinc-200">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {outsideTa0005.length > 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Outras heurísticas (fora de TA0005):</span>{" "}
          {outsideTa0005.join(", ")} — consulte outras táticas na matriz ATT&CK conforme o comportamento.
        </p>
      ) : null}
    </div>
  );
}
