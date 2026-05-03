import { extractBestNormalizedSha256FromBodies, type SampleSha256HarvestOptions } from "../shared/virusTotal";

const CAP = 200_000;

function appendCapped(parts: string[], used: { n: number }, slice: string): void {
  const room = CAP - used.n;
  if (room <= 0) return;
  const take = slice.length <= room ? slice : slice.slice(0, room);
  parts.push(take);
  used.n += take.length;
}

/**
 * Procura SHA-256 de amostra no texto já correlacionado (mensagens dos eventos + linhas preservadas nos logs reduzidos).
 * Ignora summaries LLM — combinar com `extractBestNormalizedSha256FromBodies` no fluxo principal.
 */
export function harvestSha256FromNormalizedCorrelation(
  normalizedEvents: ReadonlyArray<{ message?: string | null }>,
  reducedLogs: ReadonlyArray<{ keptLines?: ReadonlyArray<{ text?: string | null }> }>,
  options?: SampleSha256HarvestOptions,
): string | null {
  const parts: string[] = [];
  const used = { n: 0 };
  for (const ev of normalizedEvents) {
    if (typeof ev.message === "string" && ev.message.length) appendCapped(parts, used, `\n${ev.message}`);
    if (used.n >= CAP) break;
  }
  for (const block of reducedLogs) {
    for (const ln of block.keptLines ?? []) {
      if (typeof ln.text === "string" && ln.text.length) appendCapped(parts, used, `\n${ln.text}`);
      if (used.n >= CAP) break;
    }
    if (used.n >= CAP) break;
  }
  const body = parts.join("").trim();
  if (!body.length) return null;
  return extractBestNormalizedSha256FromBodies([body], options);
}

/** Mesma ideia para eventos já persistidos (detalhe do job / retro-preenchimento). */
export function harvestSha256FromStoredEvents(
  events: ReadonlyArray<{ message: string | null; payloadJson: unknown }>,
  options?: SampleSha256HarvestOptions,
): string | null {
  const parts: string[] = [];
  const used = { n: 0 };
  for (const e of events) {
    if (typeof e.message === "string" && e.message.length) appendCapped(parts, used, `\n${e.message}`);
    if (e.payloadJson != null) {
      try {
        appendCapped(parts, used, `\n${JSON.stringify(e.payloadJson)}`);
      } catch {
        /* stringify circular */
      }
    }
    if (used.n >= CAP) break;
  }
  const body = parts.join("").trim();
  if (!body.length) return null;
  return extractBestNormalizedSha256FromBodies([body], options);
}
