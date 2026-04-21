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
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-zinc-100">MITRE ATT&CK — evasão de defesas</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            A <span className="text-zinc-300">categoria da amostra</span> (Trojan, Backdoor, etc.) descreve o{" "}
            <em>tipo</em> de ameaça. A tabela abaixo lista apenas comportamentos dos logs que mapeiam para a tática{" "}
            <a
              href={mitre.tacticUrl}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 underline decoration-cyan-500/40 underline-offset-2 hover:text-cyan-200"
            >
              {mitre.tacticId} — {mitre.tacticName}
            </a>{" "}
            (Defense Evasion, matriz Enterprise —{" "}
            <span className="text-zinc-300">{mitre.tacticTechniqueCount} técnicas</span> nesta tática), listando{" "}
            <span className="text-zinc-300">técnicas e sub-técnicas</span> quando os logs permitem refinamento (IDs oficiais ATT&CK).
          </p>
        </div>
        <a
          href={mitre.tacticUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
        >
          Abrir TA0005
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {mitre.techniques.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Nenhum dos rótulos heurísticos desta análise foi mapeado para técnicas de TA0005. Isso não exclui outras
          táticas (por exemplo, Command and Control ou Persistence).
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-zinc-300">ID</TableHead>
              <TableHead className="text-zinc-300">Técnica (MITRE)</TableHead>
              <TableHead className="text-zinc-300">Evidência nos logs (heurística / API)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mitre.techniques.map((row) => (
              <TableRow key={row.id} className="border-white/10">
                <TableCell className="align-top font-mono text-xs text-cyan-200">{row.id}</TableCell>
                <TableCell className="align-top">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-zinc-100 underline decoration-cyan-500/30 underline-offset-2 hover:text-cyan-200"
                  >
                    {row.name}
                  </a>
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {row.heuristicEvidence.map((tag) => (
                      <Badge key={`${row.id}-${tag}`} variant="outline" className="border-white/15 text-zinc-200">
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
        <p className="text-xs leading-relaxed text-zinc-500">
          <span className="font-medium text-zinc-400">Outras heurísticas (fora de TA0005):</span>{" "}
          {outsideTa0005.join(", ")} — consulte outras táticas na matriz ATT&CK conforme o comportamento.
        </p>
      ) : null}
    </div>
  );
}
