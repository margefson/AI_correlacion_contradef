const SHA256_HEX = /^[a-f0-9]{64}$/i;

/**
 * Normaliza um SHA-256 em minúsculas ou retorna null se vazio/ inválido.
 * O [VirusTotal](https://www.virustotal.com/gui/home/upload) identifica ficheiros na GUI por hash (tipicamente SHA-256).
 */
export function normalizeOptionalSampleSha256(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return SHA256_HEX.test(trimmed) ? trimmed : null;
}

const SHA256_TOKEN = /\b[a-fA-F0-9]{64}\b/g;

export type SampleSha256HarvestOptions = {
  /**
   * Nome da análise no formulário (ex.: `Redução Logs Contradef <64hex>`).
   * Se contiver um SHA-256 explícito após o prefixo Contradef, tem prioridade máxima.
   */
  analysisName?: string | null;
};

/**
 * Igual ao prefixo usado em `ReduceLogs.tsx` (`ANALYSIS_NAME_PREFIX` + hash da amostra).
 */
const CONTRADEF_ANALYSIS_NAME_SHA =
  /Redu[çc]ão\s+Logs\s+Contradef\s+(?:sha-?256\s+)?([a-fA-F0-9]{64})\b/i;

function extractSha256FromContradefAnalysisName(analysisName: string | null | undefined): string | null {
  if (analysisName == null || typeof analysisName !== "string") return null;
  const m = analysisName.match(CONTRADEF_ANALYSIS_NAME_SHA);
  if (!m?.[1]) return null;
  return normalizeOptionalSampleSha256(m[1]);
}

/** Janela em torno do token para decidir se o digest é da amostra ou outro artefacto (hash de chunk, etc.). */
const CONTEXT_WIN_BEFORE = 140;
const CONTEXT_WIN_AFTER = 48;

function patternMatchesWhole(re: RegExp, text: string): boolean {
  const flags = re.flags.includes("g") ? re.flags.replace(/g/g, "") : re.flags;
  const clean = flags === re.flags ? re : new RegExp(re.source, flags);
  return clean.test(text);
}

const SAMPLE_CONTEXT_POSITIVE: ReadonlyArray<{ re: RegExp; weight: number }> = [
  {
    /** «Arquivo analisado: » com dois-pontos (relatório Contradef) — prioridade extra sobre outros hex isolados na janela. */
    re: /\barquivo\s+analisa(?:do|dos|da|das)\s*:|ficheiro\s+analisa(?:do|dos|da|das)\s*:/i,
    weight: 155,
  },
  {
    re: /\barquivo\s+analisa(?:do|da|dos|das)\b|\barquivo\s+da\s+amostra\b|ficheiro\s+analisa(?:do|da|dos|das)\b/i,
    weight: 120,
  },
  {
    re: /amostra\s+analisada|\bhash\s+da\s+amostra\b|\bdigest\s+da\s+amostra\b|sha-?256\s+da\s+amostra|sha\s*256\s*da\s+amostra/i,
    weight: 120,
  },
  { re: /bin[áa]rio\s+(?:da\s+)?amostra|malware\s+sample|(?:target|subject)\s+file/i, weight: 110 },
  /** Evitar `\files/<64 hex>` dentro do próprio hex; VT explícito basta para score. */
  { re: /virustotal|vt\s*[\/_]gui|reports?\/api\//i, weight: 95 },
  /** «Dados Quantitativos» bloco típico; não usar `tipo: Trojan` (linha pode cair na janela de outro hex). */
  { re: /dados\s+quantitativos/i, weight: 70 },
  { re: /\bsha-?\s?256\b|\bsha256\b/i, weight: 45 },
  { re: /\bamostra\b|\bsample\s+hash\b|\bexecutable\b|\bpayload\b/i, weight: 28 },
  { re: /\barquivo\b|\bfile\b/i, weight: 14 },
  { re: /\bhash\b|\bdigest\b/i, weight: 10 },
];

const SAMPLE_CONTEXT_NEGATIVE: ReadonlyArray<{ re: RegExp; weight: number }> = [
  /** Uma só penalização por estas etiquetas inline (antes acumulava `-80×3` e varria a linha boa seguinte). */
  {
    re: /\b(?:fingerprint|filefingerprint|chunks?|multipart|upload\s*session|storagefileid)\b/i,
    weight: -95,
  },
  { re: /compressed_sha256|source_sha256|storage_key|storagekey|"sha256"\s*:\s*"[^"]*"\s*,\s*"compressed/i, weight: -55 },
  { re: /checksum\s+do\s+ficheiro\s+submetido|checksum\s+dos?\s+log/i, weight: -40 },
];

function scoreSampleSha256Occurrence(body: string, hexStartIndex: number, hexLen: number): number {
  const w0 = Math.max(0, hexStartIndex - CONTEXT_WIN_BEFORE);
  const w1 = Math.min(body.length, hexStartIndex + hexLen + CONTEXT_WIN_AFTER);
  const window = body.slice(w0, w1);
  let score = 0;
  for (const { re, weight } of SAMPLE_CONTEXT_POSITIVE) {
    if (patternMatchesWhole(re, window)) score += weight;
  }
  for (const { re, weight } of SAMPLE_CONTEXT_NEGATIVE) {
    if (patternMatchesWhole(re, window)) score += weight;
  }
  return score;
}

type Sha256Cand = {
  normalized: string;
  score: number;
  /** Índice do body na lista original (preferir fontes mais cedo só em empate de score). */
  bodyOrder: number;
  hexStartIndex: number;
};

function gatherSha256CandidatesFromBody(body: string, bodyOrder: number, cands: Sha256Cand[]): void {
  const re = new RegExp(SHA256_TOKEN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const normalized = normalizeOptionalSampleSha256(m[0]);
    if (!normalized) continue;
    const score = scoreSampleSha256Occurrence(body, m.index, m[0].length);
    cands.push({ normalized, score, bodyOrder, hexStartIndex: m.index });
  }
}

/**
 * Escolhe o SHA-256 mais provável de corresponder à **amostra** analisada (vs. outros digests nos mesmos logs).
 * Usa o nome da análise Contradef (quando presente) e etiquetas/contexto próximos do hex.
 */
export function extractBestNormalizedSha256FromBodies(
  bodies: (string | null | undefined)[],
  options?: SampleSha256HarvestOptions,
): string | null {
  const fromName = extractSha256FromContradefAnalysisName(options?.analysisName);
  if (fromName) return fromName;

  const cands: Sha256Cand[] = [];
  bodies.forEach((body, bodyOrder) => {
    if (body == null || typeof body !== "string" || !body.trim()) return;
    gatherSha256CandidatesFromBody(body, bodyOrder, cands);
  });
  if (cands.length === 0) return null;

  cands.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.bodyOrder !== b.bodyOrder) return a.bodyOrder - b.bodyOrder;
    return a.hexStartIndex - b.hexStartIndex;
  });
  return cands[0]?.normalized ?? null;
}

/**
 * Alias de `extractBestNormalizedSha256FromBodies` (comportamento antigo: primeiro candidato único;
 * com vários hex no mesmo texto, aplica heurísticas de contexto).
 */
export function extractFirstNormalizedSha256FromBodies(
  bodies: (string | null | undefined)[],
  options?: SampleSha256HarvestOptions,
): string | null {
  return extractBestNormalizedSha256FromBodies(bodies, options);
}

/** URL da ficha do ficheiro na GUI do VirusTotal (hash SHA-256). */
export function virusTotalGuiFileUrl(sha256Lowercase: string): string {
  return `https://www.virustotal.com/gui/file/${sha256Lowercase}`;
}

export function isValidSha256Hex(value: string): boolean {
  return SHA256_HEX.test(value.trim());
}
