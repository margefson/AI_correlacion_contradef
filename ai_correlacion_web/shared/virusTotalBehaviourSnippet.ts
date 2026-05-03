import type { VirusTotalBehaviourSnippet } from "./virusTotalReport";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function clip(s: string, maxChars: number): string {
  const t = s.trim();
  if (t.length <= maxChars) {
    return t;
  }
  return `${t.slice(0, Math.max(1, maxChars - 1))}…`;
}

function sampleStrings(raw: unknown, limit: number, maxCharsPerItem: number): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of raw) {
    const s = str(entry);
    if (!s) {
      continue;
    }
    out.push(clip(s, maxCharsPerItem));
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

/**
 * Produz uma vista reduzida e segura do objecto VT `behaviour_summary` (atributos agregados).
 */
export function extractBehaviourSnippet(attributes: Record<string, unknown>): VirusTotalBehaviourSnippet {
  const ips: string[] = [];
  const ipTraffic = attributes.ip_traffic;
  if (Array.isArray(ipTraffic)) {
    for (const row of ipTraffic) {
      if (row && typeof row === "object") {
        const ip = str((row as { destination_ip?: unknown }).destination_ip);
        if (ip) {
          ips.push(ip);
          if (ips.length >= 15) {
            break;
          }
        }
      }
    }
  }

  const httpUrls: string[] = [];
  const conv = attributes.http_conversations;
  if (Array.isArray(conv)) {
    for (const row of conv) {
      if (row && typeof row === "object") {
        const url = str((row as { url?: unknown }).url);
        if (url) {
          httpUrls.push(clip(url, 360));
          if (httpUrls.length >= 15) {
            break;
          }
        }
      }
    }
  }

  const dropped: string[] = [];
  const filesDropped = attributes.files_dropped;
  if (Array.isArray(filesDropped)) {
    for (const row of filesDropped) {
      if (row && typeof row === "object") {
        const hex = str((row as { sha256?: unknown }).sha256)?.toLowerCase();
        if (hex && /^[a-f0-9]{64}$/.test(hex)) {
          dropped.push(hex);
          if (dropped.length >= 12) {
            break;
          }
        }
      }
    }
  }

  const processes: string[] = [];
  const tree = attributes.processes_tree;
  if (Array.isArray(tree)) {
    for (const row of tree) {
      if (row && typeof row === "object") {
        const nm = str((row as { name?: unknown }).name);
        const pid = str((row as { process_id?: unknown }).process_id);
        if (nm) {
          processes.push(pid ? `${nm} (${pid})` : nm);
          if (processes.length >= 15) {
            break;
          }
        }
      }
    }
  }

  const analysis =
    num(attributes.analysis_date) ?? num(attributes.last_modification_date);

  return {
    analysisDate: analysis,
    sandboxName: str(attributes.sandbox_name),
    behash: str(attributes.behash),
    tagsSample: sampleStrings(attributes.tags, 22, 120),
    callsHighlightedSample: sampleStrings(attributes.calls_highlighted, 25, 200),
    commandExecutionsSample: sampleStrings(attributes.command_executions, 15, 280),
    filesWrittenSample: sampleStrings(attributes.files_written, 15, 240),
    modulesLoadedSample: sampleStrings(attributes.modules_loaded, 15, 200),
    registryKeysOpenedSample: sampleStrings(attributes.registry_keys_opened, 15, 200),
    ipsFromTrafficSample: ips.slice(0, 15),
    httpUrlsSample: httpUrls,
    droppedSha256Sample: dropped,
    processesSample: processes,
  };
}
