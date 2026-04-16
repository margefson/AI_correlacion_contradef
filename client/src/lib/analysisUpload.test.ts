// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHUNK_UPLOAD_MAX_BYTES,
  inspectAnalysisArchive,
  uploadAnalysisArchive,
} from "./analysisUpload";
import { CHUNK_UPLOAD_HARD_MAX_BYTES } from "../../../shared/analysis";

const SEVEN_Z_SIGNATURE = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);

function createSevenZipFile(sizeBytes: number, name = "Full-Execution-Sample-1.7z") {
  const content = new Uint8Array(sizeBytes);
  content.set(SEVEN_Z_SIGNATURE, 0);
  return new File([content], name, {
    type: "application/x-7z-compressed",
    lastModified: 1713225600000,
  });
}

describe("analysisUpload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("particiona uploads grandes com margem de segurança abaixo do teto rígido do backend", async () => {
    const fileSize = 38 * 1024 * 1024;
    const file = createSevenZipFile(fileSize);
    const inspection = await inspectAnalysisArchive(file);
    const observedChunkSizes: number[] = [];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/api/analysis/upload-sessions")) {
        return new Response(
          JSON.stringify({
            uploadId: "upload-1",
            archiveName: file.name,
            totalBytes: file.size,
            chunkSize: CHUNK_UPLOAD_MAX_BYTES,
            totalChunks: Math.ceil(file.size / CHUNK_UPLOAD_MAX_BYTES),
            maxArchiveBytes: 64 * 1024 * 1024,
            directTransportMaxBytes: 30 * 1024 * 1024,
            focusFunction: "all-functions",
            receivedChunkIndexes: [],
            updatedAt: Date.now(),
          }),
          { status: 200 },
        );
      }

      if (url.includes("/api/analysis/upload-sessions/") && url.endsWith("/chunks")) {
        const chunk = init?.body as Blob;
        observedChunkSizes.push(chunk instanceof Blob ? chunk.size : 0);
        expect(init?.headers).toMatchObject({
          "Content-Type": "application/octet-stream",
          "x-chunk-index": expect.any(String),
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      if (url.endsWith("/complete")) {
        return new Response(JSON.stringify({ jobId: "job-123" }), { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await uploadAnalysisArchive({
      file,
      focusFunction: "all-functions",
      focusTerms: [],
      focusRegexes: [],
      origin: "https://example.com",
    });

    expect(result).toEqual({ jobId: "job-123" });
    expect(inspection.ok).toBe(true);
    expect(inspection.usesChunkedTransport).toBe(true);
    expect(inspection.chunkCount).toBe(Math.ceil(file.size / CHUNK_UPLOAD_MAX_BYTES));
    expect(observedChunkSizes).toHaveLength(inspection.chunkCount);
    expect(Math.max(...observedChunkSizes)).toBeLessThan(CHUNK_UPLOAD_HARD_MAX_BYTES);
    expect(Math.max(...observedChunkSizes)).toBeLessThanOrEqual(CHUNK_UPLOAD_MAX_BYTES);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("recupera a etapa complete com fallback idempotente por GET quando o POST final falha", async () => {
    const file = createSevenZipFile(38 * 1024 * 1024, "Complete-Fallback.7z");
    let postCompleteAttempts = 0;
    let getCompleteAttempts = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/analysis/upload-sessions") && method === "POST") {
        return new Response(JSON.stringify({
          uploadId: "upload-complete-fallback",
          archiveName: file.name,
          totalBytes: file.size,
          chunkSize: CHUNK_UPLOAD_MAX_BYTES,
          totalChunks: Math.ceil(file.size / CHUNK_UPLOAD_MAX_BYTES),
          maxArchiveBytes: 64 * 1024 * 1024,
          directTransportMaxBytes: 30 * 1024 * 1024,
          focusFunction: "all-functions",
          receivedChunkIndexes: [],
          updatedAt: Date.now(),
          completionStatus: "open",
        }), { status: 200 });
      }

      if (url.includes("/api/analysis/upload-sessions/") && url.endsWith("/chunks") && method === "POST") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      if (url.endsWith("/api/analysis/upload-sessions/upload-complete-fallback") && method === "GET") {
        return new Response(JSON.stringify({
          uploadId: "upload-complete-fallback",
          archiveName: file.name,
          totalBytes: file.size,
          chunkSize: CHUNK_UPLOAD_MAX_BYTES,
          totalChunks: Math.ceil(file.size / CHUNK_UPLOAD_MAX_BYTES),
          maxArchiveBytes: 64 * 1024 * 1024,
          directTransportMaxBytes: 30 * 1024 * 1024,
          focusFunction: "all-functions",
          receivedChunkIndexes: Array.from({ length: Math.ceil(file.size / CHUNK_UPLOAD_MAX_BYTES) }, (_, index) => index),
          updatedAt: Date.now(),
          completionStatus: "open",
        }), { status: 200 });
      }

      if (url.endsWith("/api/analysis/upload-sessions/upload-complete-fallback/complete") && method === "POST") {
        postCompleteAttempts += 1;
        throw new Error("fetch failed");
      }

      if (url.endsWith("/api/analysis/upload-sessions/upload-complete-fallback/complete") && method === "GET") {
        getCompleteAttempts += 1;
        return new Response(JSON.stringify({ jobId: "job-fallback-complete" }), { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url} (${method})`);
    });

    const result = await uploadAnalysisArchive({
      file,
      focusFunction: "all-functions",
      focusTerms: [],
      focusRegexes: [],
      origin: "https://example.com",
    });

    expect(result).toEqual({ jobId: "job-fallback-complete" });
    expect(postCompleteAttempts).toBeGreaterThan(0);
    expect(getCompleteAttempts).toBeGreaterThan(0);
  });
});
