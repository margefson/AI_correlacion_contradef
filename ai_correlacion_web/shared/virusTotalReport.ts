import { z } from "zod";

/** Resumo público VT v3 sobre um ficheiro (SHA-256). */
export const virusTotalAnalysisStatsSchema = z
  .object({
    harmless: z.number().optional(),
    malicious: z.number().optional(),
    suspicious: z.number().optional(),
    undetected: z.number().optional(),
    timeout: z.number().optional(),
    confirmed_timeout: z.number().optional(),
    failure: z.number().optional(),
    type_unsupported: z.number().optional(),
  })
  .passthrough();

export type VirusTotalAnalysisStats = z.infer<typeof virusTotalAnalysisStatsSchema>;

/** Excerto truncado do `behaviour_summary` de `/files/{id}/behaviour_summary` (agregação de sandbox na VT). */
export const virusTotalBehaviourSnippetSchema = z.object({
  analysisDate: z.number().nullable(),
  sandboxName: z.string().nullable(),
  behash: z.string().nullable(),
  tagsSample: z.array(z.string()),
  callsHighlightedSample: z.array(z.string()),
  commandExecutionsSample: z.array(z.string()),
  filesWrittenSample: z.array(z.string()),
  modulesLoadedSample: z.array(z.string()),
  registryKeysOpenedSample: z.array(z.string()),
  ipsFromTrafficSample: z.array(z.string()),
  httpUrlsSample: z.array(z.string()),
  droppedSha256Sample: z.array(z.string()),
  processesSample: z.array(z.string()),
});

export type VirusTotalBehaviourSnippet = z.infer<typeof virusTotalBehaviourSnippetSchema>;

/** Resultado consolidado das chamadas comportamentais (não invalida por si só o relatório principal sobre o ficheiro). */
export const virusTotalBehaviourPackSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("absent"), detail: z.string().optional() }),
  z.object({ state: z.literal("ok"), snippet: virusTotalBehaviourSnippetSchema }),
  z.object({
    state: z.literal("error"),
    message: z.string(),
    code: z.enum(["rate_limit", "unauthorized", "not_found", "upstream_error"]).optional(),
  }),
]);

export type VirusTotalBehaviourPack = z.infer<typeof virusTotalBehaviourPackSchema>;

export const virusTotalFileReportPayloadSchema = z.object({
  kind: z.literal("ok"),
  sha256: z.string(),
  guiUrl: z.string(),
  /** Unix segundos (VT `last_analysis_date`). */
  lastAnalysisDate: z.number().nullable(),
  meaningfulName: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  stats: virusTotalAnalysisStatsSchema.nullable(),
  typeDescription: z.string().nullable(),
  behaviour: virusTotalBehaviourPackSchema,
});

export type VirusTotalFileReportPayload = z.infer<typeof virusTotalFileReportPayloadSchema>;

export const virusTotalUrlReportPayloadSchema = z.object({
  kind: z.literal("ok"),
  /** Identificador VT para `/urls/{id}` (RFC 4648 §5 URL-safe Base64 sem padding). */
  urlId: z.string(),
  guiSearchUrl: z.string(),
  url: z.string(),
  stats: virusTotalAnalysisStatsSchema.nullable(),
  lastAnalysisDate: z.number().nullable(),
  threatNamesSample: z.array(z.string()),
  categoriesSample: z.array(z.string()),
});

export type VirusTotalUrlReportPayload = z.infer<typeof virusTotalUrlReportPayloadSchema>;

export const virusTotalDomainReportPayloadSchema = z.object({
  kind: z.literal("ok"),
  domain: z.string(),
  guiUrl: z.string(),
  stats: virusTotalAnalysisStatsSchema.nullable(),
  lastAnalysisDate: z.number().nullable(),
  threatNamesSample: z.array(z.string()),
  categoriesSample: z.array(z.string()),
  reputation: z.number().nullable(),
});

export type VirusTotalDomainReportPayload = z.infer<typeof virusTotalDomainReportPayloadSchema>;

export const virusTotalIpReportPayloadSchema = z.object({
  kind: z.literal("ok"),
  ip: z.string(),
  guiUrl: z.string(),
  stats: virusTotalAnalysisStatsSchema.nullable(),
  lastAnalysisDate: z.number().nullable(),
  threatNamesSample: z.array(z.string()),
  categoriesSample: z.array(z.string()),
  reputation: z.number().nullable(),
  asn: z.number().nullable(),
  country: z.string().nullable(),
});

export type VirusTotalIpReportPayload = z.infer<typeof virusTotalIpReportPayloadSchema>;

/** Erros/config comuns nas consultas manuais à VT (URL, domínio, IP). */
export type VirusTotalManualProbeError =
  | { ok: false; code: "unconfigured"; message: string }
  | { ok: false; code: "not_found"; message: string }
  | { ok: false; code: "bad_request"; message: string }
  | { ok: false; code: "unauthorized"; message: string }
  | { ok: false; code: "rate_limit"; message: string }
  | { ok: false; code: "upstream_error"; message: string };

/** Resultado das procedures relacionadas ao ficheiro (hash registado no job). */
export type VirusTotalJobLookupResult =
  | { ok: false; code: "unconfigured"; message: string }
  | { ok: false; code: "no_hash"; message: string }
  | { ok: false; code: "not_found"; message: string }
  | { ok: false; code: "bad_request"; message: string }
  | { ok: false; code: "unauthorized"; message: string }
  | { ok: false; code: "rate_limit"; message: string }
  | { ok: false; code: "upstream_error"; message: string }
  | { ok: false; code: "parse_error"; message: string }
  | ({ ok: true } & VirusTotalFileReportPayload);

/** Resultado isolado ao consultar um URL público pela API VT (consulta manual). */
export type VirusTotalUrlLookupResult =
  VirusTotalManualProbeError
  | ({ ok: true } & VirusTotalUrlReportPayload);

export type VirusTotalDomainLookupResult =
  VirusTotalManualProbeError
  | ({ ok: true } & VirusTotalDomainReportPayload);

export type VirusTotalIpLookupResult =
  VirusTotalManualProbeError
  | ({ ok: true } & VirusTotalIpReportPayload);
