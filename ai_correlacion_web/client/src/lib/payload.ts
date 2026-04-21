export type PayloadRecord = Record<string, unknown>;

export function asRecord(value: unknown): PayloadRecord {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as PayloadRecord;
}
