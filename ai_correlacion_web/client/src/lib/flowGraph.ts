type MetadataRecord = Record<string, unknown>;

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

export type FlowNodeDetails = {
  sourceFile: string | null;
  sourceLogType: string | null;
  sourceLineNumber: number | null;
  stage: string | null;
  identifiedBy: string | null;
  identification: string | null;
  evidence: string | null;
  trigger: boolean | null;
  suspiciousApis: string[];
  techniques: string[];
};

export function extractFlowNodeDetails(metadata: unknown): FlowNodeDetails {
  const record = (metadata ?? {}) as MetadataRecord;
  return {
    sourceFile: asText(record.sourceFile) ?? asText(record.fileName),
    sourceLogType: asText(record.sourceLogType) ?? asText(record.logType),
    sourceLineNumber: asNumber(record.sourceLineNumber) ?? asNumber(record.lineNumber),
    stage: asText(record.stage),
    identifiedBy: asText(record.identifiedBy),
    identification: asText(record.identification),
    evidence: asText(record.evidence) ?? asText(record.message),
    trigger: typeof record.trigger === "boolean" ? record.trigger : null,
    suspiciousApis: asTextList(record.suspiciousApis),
    techniques: asTextList(record.techniques),
  };
}
