import { z } from "zod";

import mitreTa0005Catalog from "./data/mitreTa0005Catalog.json";

type MitreRef = { id: string; name: string; url: string };

/** Catálogo estático (técnicas + sub-técnicas) para TA0005, regenerado com `node scripts/generate-ta0005-catalog.mjs`. */
export const MITRE_TA0005_CATALOG = mitreTa0005Catalog;
export const MITRE_TA0005_CATALOG_ENTRY_COUNT = mitreTa0005Catalog.techniques.length;
export const MITRE_TA0005_PARENT_TECHNIQUE_COUNT = mitreTa0005Catalog.techniques.filter(
  (t) => !t.id.includes("."),
).length;

function techniqueUrl(id: string): string {
  const dot = id.indexOf(".");
  if (dot === -1) return `https://attack.mitre.org/techniques/${id}/`;
  return `https://attack.mitre.org/techniques/${id.slice(0, dot)}/${id.slice(dot + 1)}/`;
}

const T1622: MitreRef = { id: "T1622", name: "Debugger Evasion", url: techniqueUrl("T1622") };
const T1678: MitreRef = { id: "T1678", name: "Delay Execution", url: techniqueUrl("T1678") };
const T1027: MitreRef = { id: "T1027", name: "Obfuscated Files or Information", url: techniqueUrl("T1027") };
const T1027_007: MitreRef = { id: "T1027.007", name: "Dynamic API Resolution", url: techniqueUrl("T1027.007") };
const T1055: MitreRef = { id: "T1055", name: "Process Injection", url: techniqueUrl("T1055") };
const T1055_001: MitreRef = { id: "T1055.001", name: "Dynamic-link Library Injection", url: techniqueUrl("T1055.001") };
const T1055_002: MitreRef = { id: "T1055.002", name: "Portable Executable Injection", url: techniqueUrl("T1055.002") };
const T1070: MitreRef = { id: "T1070", name: "Indicator Removal", url: techniqueUrl("T1070") };
const T1070_004: MitreRef = { id: "T1070.004", name: "File Deletion", url: techniqueUrl("T1070.004") };
const T1497_001: MitreRef = { id: "T1497.001", name: "System Checks", url: techniqueUrl("T1497.001") };
const T1497_003: MitreRef = { id: "T1497.003", name: "Time Based Checks", url: techniqueUrl("T1497.003") };

/** Heuristic-only mapping when APIs are not enough to pick a sub-technique. */
const HEURISTIC_BASE: Record<string, MitreRef> = {
  "Anti-debug": T1622,
  "Atraso deliberado": T1678,
  "Transição RW→RX": T1027,
  "Injeção de código": T1055,
  "Manipulação de arquivos": T1070,
  "Detecção de VM": T1497_001,
  "Verificação de overhead": T1497_003,
};

export const DEFENSE_EVASION_HEURISTIC_TAGS = new Set(Object.keys(HEURISTIC_BASE));

/** Evento reduzido usado para localizar ficheiro/linha/nó no grafo. */
export type MitreTraceEvent = {
  fileName: string;
  lineNumber: number;
  stage: string;
  suspicious: boolean;
  suspiciousApis: string[];
  techniqueTags: string[];
};

export const mitreEvidenceOccurrenceSchema = z.object({
  fileName: z.string(),
  lineNumber: z.number().int().nonnegative(),
  stage: z.string(),
  /** Nó `event:…` no grafo de fluxo, quando a linha entra na jornada suspeita (até 28 eventos). */
  graphNodeId: z.string().nullable(),
  /** Nó `phase:…` correspondente à fase inferida (sempre definido). */
  phaseNodeId: z.string(),
});

export type MitreEvidenceOccurrence = z.infer<typeof mitreEvidenceOccurrenceSchema>;

export const mitreDefenseEvidenceItemSchema = z.object({
  label: z.string(),
  occurrences: z.array(mitreEvidenceOccurrenceSchema),
});

export type MitreDefenseEvidenceItem = z.infer<typeof mitreDefenseEvidenceItemSchema>;

export const mitreDefenseEvasionTechniqueSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  heuristicEvidence: z.array(mitreDefenseEvidenceItemSchema),
});

export const mitreDefenseEvasionSchema = z.object({
  tacticId: z.literal("TA0005"),
  tacticName: z.string(),
  tacticUrl: z.string().url(),
  /** Técnicas de nível superior do TA0005 (MITRE lista 47 abaixo da táctica). */
  tacticTechniqueCount: z.number().int().nonnegative(),
  /** Soma técnicas + sub-técnicas do catálogo completo; opcional em relatórios antigos. */
  tacticCatalogEntryCount: z.number().int().nonnegative().optional(),
  /** Redundante com tacticTechniqueCount para novas análises; opcional em relatórios antigos. */
  tacticParentTechniqueCount: z.number().int().nonnegative().optional(),
  techniques: z.array(mitreDefenseEvasionTechniqueSchema),
});

export type MitreDefenseEvasion = z.infer<typeof mitreDefenseEvasionSchema>;
export type MitreDefenseEvasionTechnique = z.infer<typeof mitreDefenseEvasionTechniqueSchema>;

export const MITRE_DEFENSE_EVASION_TACTIC = {
  id: "TA0005" as const,
  name: "Defense Evasion",
  url: "https://attack.mitre.org/tactics/TA0005/",
  /** Current Enterprise ATT&CK count for this tactic (TA0005 lists 47 techniques). */
  techniqueCount: 47,
};

type BuildInput = {
  heuristicTags: string[];
  suspiciousApis: string[];
  /** Quando presente, preenche `occurrences` por evidência (ficheiro, linha, nós do grafo). */
  events?: MitreTraceEvent[];
  /** `fileName + "\\0" + lineNumber` → id do nó API no grafo (`buildFlowGraph`). */
  fileLineToNodeId?: Map<string, string>;
};

function addEvidence(
  map: Map<string, { ref: MitreRef; evidence: Set<string> }>,
  ref: MitreRef,
  evidence: string,
) {
  const cur = map.get(ref.id) ?? { ref, evidence: new Set<string>() };
  cur.evidence.add(evidence);
  map.set(ref.id, cur);
}

const fileLineKey = (fileName: string, lineNumber: number) => `${fileName}\0${String(lineNumber)}`;

/**
 * Localiza linhas de log e o nó do grafo associado a uma etiqueta de evidência (API:… / Heurística:…).
 * Etiquetas combinadas com ", " (ex.: várias APIs na mesma técnica) são divididas.
 */
export function traceMitreEvidenceOccurrences(
  label: string,
  events: MitreTraceEvent[],
  fileLineToNodeId: Map<string, string>,
): MitreEvidenceOccurrence[] {
  if (!events.length) {
    return [];
  }

  const parts = label
    .split(/\s*[,;]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return [];
  }

  const out: MitreEvidenceOccurrence[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    if (part.startsWith("API:")) {
      const api = part.slice(4).trim();
      for (const e of events) {
        if (!e.suspicious) continue;
        if (!e.suspiciousApis.includes(api)) continue;
        const dedupe = fileLineKey(e.fileName, e.lineNumber);
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const graphNodeId = fileLineToNodeId.get(dedupe) ?? null;
        out.push({
          fileName: e.fileName,
          lineNumber: e.lineNumber,
          stage: e.stage,
          graphNodeId,
          phaseNodeId: `phase:${e.stage}`,
        });
      }
    } else if (part.startsWith("Heurística:")) {
      const tag = part.slice(11).trim();
      for (const e of events) {
        if (!e.suspicious) continue;
        if (!e.techniqueTags.includes(tag)) continue;
        const dedupe = fileLineKey(e.fileName, e.lineNumber);
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const graphNodeId = fileLineToNodeId.get(dedupe) ?? null;
        out.push({
          fileName: e.fileName,
          lineNumber: e.lineNumber,
          stage: e.stage,
          graphNodeId,
          phaseNodeId: `phase:${e.stage}`,
        });
      }
    }
  }

  out.sort((a, b) => a.fileName.localeCompare(b.fileName) || a.lineNumber - b.lineNumber);
  return out;
}

export function buildMitreDefenseEvasion(heuristicTags: string[], suspiciousApis: string[] = []): MitreDefenseEvasion {
  return buildMitreDefenseEvasionFromEvidence({ heuristicTags, suspiciousApis });
}

export function buildMitreDefenseEvasionFromEvidence(input: BuildInput): MitreDefenseEvasion {
  const apis = input.suspiciousApis;
  const apiSet = new Set(apis);
  const map = new Map<string, { ref: MitreRef; evidence: Set<string> }>();

  if (apiSet.has("GetProcAddress")) {
    addEvidence(map, T1027_007, "API:GetProcAddress");
  }
  if (apiSet.has("WriteProcessMemory")) {
    addEvidence(map, T1055_002, "API:WriteProcessMemory");
  } else if (apiSet.has("CreateRemoteThread")) {
    addEvidence(map, T1055_001, "API:CreateRemoteThread");
  }
  if (apiSet.has("EnumSystemFirmwareTables")) {
    addEvidence(map, T1497_001, "API:EnumSystemFirmwareTables");
  }
  if (apiSet.has("GetTickCount")) {
    addEvidence(map, T1497_003, "API:GetTickCount");
  }
  if (apiSet.has("RtlQueryPerformanceCounter")) {
    addEvidence(map, T1497_003, "API:RtlQueryPerformanceCounter");
  }
  if (["IsDebuggerPresent", "CheckRemoteDebuggerPresent", "NtQueryInformationProcess", "ZwQueryInformationProcess"].some((a) => apiSet.has(a))) {
    const hit = ["IsDebuggerPresent", "CheckRemoteDebuggerPresent", "NtQueryInformationProcess", "ZwQueryInformationProcess"].filter((a) => apiSet.has(a));
    addEvidence(map, T1622, hit.map((a) => `API:${a}`).join(", "));
  }
  if (apiSet.has("Sleep") || apiSet.has("NtDelayExecution")) {
    addEvidence(map, T1678, apiSet.has("Sleep") ? "API:Sleep" : "API:NtDelayExecution");
  }
  if (apiSet.has("DeleteFile")) {
    addEvidence(map, T1070_004, "API:DeleteFile");
  }
  if (apiSet.has("VirtualProtect") || apiSet.has("VirtualAlloc")) {
    const hit = ["VirtualProtect", "VirtualAlloc"].filter((a) => apiSet.has(a));
    addEvidence(map, T1027, hit.map((a) => `API:${a}`).join(", "));
  }

  for (let i = 0; i < input.heuristicTags.length; i += 1) {
    const tag = input.heuristicTags[i]!;
    const ref = HEURISTIC_BASE[tag];
    if (!ref) continue;
    addEvidence(map, ref, `Heurística:${tag}`);
  }

  const events = input.events ?? [];
  const fileLineToNodeId = input.fileLineToNodeId ?? new Map<string, string>();

  const techniques = Array.from(map.values())
    .map((entry) => ({
      id: entry.ref.id,
      name: entry.ref.name,
      url: entry.ref.url,
      heuristicEvidence: Array.from(entry.evidence)
        .sort((a, b) => a.localeCompare(b))
        .map((label) => ({
          label,
          occurrences: traceMitreEvidenceOccurrences(label, events, fileLineToNodeId),
        })),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    tacticId: "TA0005",
    tacticName: MITRE_DEFENSE_EVASION_TACTIC.name,
    tacticUrl: MITRE_DEFENSE_EVASION_TACTIC.url,
    tacticTechniqueCount: MITRE_DEFENSE_EVASION_TACTIC.techniqueCount,
    tacticCatalogEntryCount: MITRE_TA0005_CATALOG_ENTRY_COUNT,
    tacticParentTechniqueCount: MITRE_TA0005_PARENT_TECHNIQUE_COUNT,
    techniques,
  };
}

/** Heuristic tags that do not map to TA0005 (e.g. network, persistence heuristics). */
export function listHeuristicsOutsideTa0005(heuristicTags: string[]): string[] {
  return heuristicTags.filter((t) => !DEFENSE_EVASION_HEURISTIC_TAGS.has(t));
}
