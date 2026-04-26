import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createHash } from "node:crypto";
import { unlink } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const {
  mockStartAnalysisJob,
  mockCreateContext,
  mockStoragePutExact,
  mockStorageGetBuffer,
  storageObjects,
} = vi.hoisted(() => {
  const objects = new Map<string, Buffer>();
  return {
    mockStartAnalysisJob: vi.fn(),
    mockCreateContext: vi.fn(),
    mockStoragePutExact: vi.fn(async (relKey: string, data: Buffer | Uint8Array | string) => {
      const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
      objects.set(relKey, buffer);
      return { key: relKey, url: `https://storage.example/${encodeURIComponent(relKey)}` };
    }),
    mockStorageGetBuffer: vi.fn(async (relKey: string) => {
      const buffer = objects.get(relKey);
      if (!buffer) {
        throw new Error(`missing object: ${relKey}`);
      }
      return {
        key: relKey,
        url: `https://storage.example/${encodeURIComponent(relKey)}`,
        buffer,
      };
    }),
    storageObjects: objects,
  };
});

vi.mock("./analysisService", () => ({
  startAnalysisJob: mockStartAnalysisJob,
}));

vi.mock("./_core/context", () => ({
  createContext: mockCreateContext,
}));

vi.mock("./storage", () => ({
  storagePutExact: mockStoragePutExact,
  storageGetBuffer: mockStorageGetBuffer,
}));

import { registerReduceLogsUploadRoute } from "./_core/reduceLogsUpload";

type StartedJobInput = {
  logFiles: Array<{
    fileName: string;
    tempFilePath?: string;
    sizeBytes?: number;
    logType?: string;
    uploadSessionId?: string;
    uploadFileId?: string;
    uploadChunkCount?: number;
    uploadedByUserId?: number;
    uploadDurationMs?: number;
    uploadReused?: boolean;
  }>;
};

function createAuthenticatedContext() {
  return {
    user: {
      id: 7,
      openId: "analyst-user",
      email: "analyst@example.com",
      name: "Analyst User",
      passwordHash: null,
      loginMethod: "oauth",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as never,
    res: {} as never,
  };
}

describe("reduce logs upload route", () => {
  let server: Server;
  let baseUrl = "";
  let tempFilesToCleanup: string[] = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    storageObjects.clear();
    tempFilesToCleanup = [];
    mockCreateContext.mockResolvedValue(createAuthenticatedContext());

    const app = express();
    app.use(express.json({ limit: "50mb" }));
    app.use(express.urlencoded({ limit: "50mb", extended: true }));
    registerReduceLogsUploadRoute(app);

    server = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, () => resolve(instance));
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await Promise.all(tempFilesToCleanup.map(async (filePath) => {
      await unlink(filePath).catch(() => undefined);
    }));
  });

  it("expõe um endpoint leve de capacidades para validar a versão publicada do upload", async () => {
    const response = await fetch(`${baseUrl}/api/reduce-logs/upload/capabilities`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.mode).toBe("stateless-storage-v2");
    expect(payload.maxChunkBytes).toBeGreaterThan(0);
    expect(payload.methods.chunk).toEqual(["POST", "PUT"]);
    expect(payload.routes).toContain("/api/reduce-logs/upload/chunk");
  });

  it("registra o endpoint legado e exige autenticação", async () => {
    mockCreateContext.mockResolvedValue({ user: null, req: {}, res: {} });

    const response = await fetch(`${baseUrl}/api/reduce-logs/upload`, {
      method: "POST",
    });

    const payload = await response.json();
    expect(response.status).toBe(401);
    expect(payload.message).toMatch(/Autentique-se/);
  });

  it("recebe arquivos em partes por POST, persiste em armazenamento compartilhado e inicia o job analítico", async () => {
    mockStartAnalysisJob.mockResolvedValue({
      job: {
        jobId: "job-upload-1",
        status: "queued",
      },
    });

    const firstFileContent = "VirtualProtect\nSleep\nNtQueryInformationProcess\n";
    const secondFileContent = "0x1000,IsDebuggerPresent\n0x1008,VirtualProtect\n";

    const initResponse = await fetch(`${baseUrl}/api/reduce-logs/upload/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        analysisName: "Lote robusto",
        focusTerms: "VirtualProtect, Sleep",
        focusRegexes: "VirtualProtect.*RW.*RX",
        origin: "https://example.com",
        files: [
          {
            fileName: "TraceInstructions.log",
            sizeBytes: Buffer.byteLength(firstFileContent),
            logType: "TraceInstructions",
          },
          {
            fileName: "TraceFcnCall.log",
            sizeBytes: Buffer.byteLength(secondFileContent),
            logType: "TraceFcnCall",
          },
        ],
      }),
    });

    const initPayload = await initResponse.json();
    expect(initResponse.status).toBe(200);
    expect(initPayload.sessionId).toEqual(expect.any(String));
    expect(initPayload.files).toHaveLength(2);

    const firstRemoteFile = initPayload.files[0] as { fileId: string };
    const secondRemoteFile = initPayload.files[1] as { fileId: string };

    const firstChunkA = Buffer.from(firstFileContent.slice(0, 16), "utf-8");
    const firstChunkB = Buffer.from(firstFileContent.slice(16), "utf-8");

    const firstChunkResponse = await fetch(
      `${baseUrl}/api/reduce-logs/upload/chunk?sessionId=${encodeURIComponent(initPayload.sessionId)}&fileId=${encodeURIComponent(firstRemoteFile.fileId)}&chunkIndex=0`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: firstChunkA,
      },
    );
    expect(firstChunkResponse.status).toBe(200);

    const secondChunkResponse = await fetch(
      `${baseUrl}/api/reduce-logs/upload/chunk?sessionId=${encodeURIComponent(initPayload.sessionId)}&fileId=${encodeURIComponent(firstRemoteFile.fileId)}&chunkIndex=1`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: firstChunkB,
      },
    );
    expect(secondChunkResponse.status).toBe(200);

    const thirdChunkResponse = await fetch(
      `${baseUrl}/api/reduce-logs/upload/chunk?sessionId=${encodeURIComponent(initPayload.sessionId)}&fileId=${encodeURIComponent(secondRemoteFile.fileId)}&chunkIndex=0`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: Buffer.from(secondFileContent, "utf-8"),
      },
    );
    expect(thirdChunkResponse.status).toBe(200);

    const completeResponse = await fetch(`${baseUrl}/api/reduce-logs/upload/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: initPayload.sessionId,
        analysisName: "Lote robusto",
        focusTerms: "VirtualProtect, Sleep",
        focusRegexes: "VirtualProtect.*RW.*RX",
        origin: "https://example.com",
        files: [
          {
            fileId: firstRemoteFile.fileId,
            fileName: "TraceInstructions.log",
            sizeBytes: Buffer.byteLength(firstFileContent),
            logType: "TraceInstructions",
            chunkCount: 2,
            lastModifiedMs: 1713640000000,
            uploadDurationMs: 1234,
            reused: false,
          },
          {
            fileId: secondRemoteFile.fileId,
            fileName: "TraceFcnCall.log",
            sizeBytes: Buffer.byteLength(secondFileContent),
            logType: "TraceFcnCall",
            chunkCount: 1,
            lastModifiedMs: 1713640000100,
            uploadDurationMs: 567,
            reused: false,
          },
        ],
      }),
    });

    const completePayload = await completeResponse.json();
    expect(completeResponse.status).toBe(200);
    expect(completePayload.job.jobId).toBe("job-upload-1");

    expect(mockStoragePutExact).toHaveBeenCalled();
    expect(storageObjects.has("reduce-logs-cache/7/by-name/traceinstructions.log.json")).toBe(true);
    expect(storageObjects.has("reduce-logs-cache/7/by-name/tracefcncall.log.json")).toBe(true);

    expect(mockStartAnalysisJob).toHaveBeenCalledWith(expect.objectContaining({
      analysisName: "Lote robusto",
      createdByUserId: 7,
      focusTerms: ["VirtualProtect", "Sleep"],
      focusRegexes: ["VirtualProtect.*RW.*RX"],
      origin: "https://example.com",
    }));

    const startedInput = mockStartAnalysisJob.mock.calls[0][0] as StartedJobInput;
    expect(startedInput.logFiles).toHaveLength(2);
    expect(startedInput.logFiles[0]).toEqual(expect.objectContaining({
      fileName: "TraceInstructions.log",
      logType: "TraceInstructions",
      sizeBytes: Buffer.byteLength(firstFileContent),
      uploadSessionId: initPayload.sessionId,
      uploadFileId: firstRemoteFile.fileId,
      uploadChunkCount: 2,
      uploadedByUserId: 7,
      uploadDurationMs: 1234,
      uploadReused: false,
    }));
    expect(startedInput.logFiles[1]).toEqual(expect.objectContaining({
      fileName: "TraceFcnCall.log",
      logType: "TraceFcnCall",
      sizeBytes: Buffer.byteLength(secondFileContent),
      uploadSessionId: initPayload.sessionId,
      uploadFileId: secondRemoteFile.fileId,
      uploadChunkCount: 1,
      uploadedByUserId: 7,
      uploadDurationMs: 567,
      uploadReused: false,
    }));
  });

  it("reaproveita arquivos já persistidos quando o mesmo fingerprint já existe no armazenamento do backend", async () => {
    const fileName = "TraceInstructions.log";
    const sizeBytes = 1024;
    const lastModifiedMs = 1713650000000;
    const fingerprint = createHash("sha256")
      .update(`7:${fileName}:${sizeBytes}:${lastModifiedMs}`)
      .digest("hex")
      .slice(0, 24);

    storageObjects.set(
      `reduce-logs-cache/7/${fingerprint}/manifest.json`,
      Buffer.from(JSON.stringify({
        version: 1,
        fileFingerprint: fingerprint,
        fileName,
        logType: "TraceInstructions",
        sizeBytes,
        lastModifiedMs,
        chunkCount: 64,
        storageSessionId: "cached-session-1",
        storageFileId: "cached-file-1",
        uploadedByUserId: 7,
        uploadedAt: new Date().toISOString(),
      })),
    );

    const initResponse = await fetch(`${baseUrl}/api/reduce-logs/upload/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: [
          {
            fileName,
            sizeBytes,
            logType: "TraceInstructions",
            lastModifiedMs,
          },
        ],
      }),
    });

    const initPayload = await initResponse.json();
    expect(initResponse.status).toBe(200);
    expect(initPayload.files[0]).toEqual(expect.objectContaining({
      fileId: "cached-file-1",
      chunkCount: 64,
      reused: true,
      storageSessionId: "cached-session-1",
      storageFileId: "cached-file-1",
    }));
  });

  it("reaproveita um arquivo já persistido pelo mesmo nome/label mesmo quando o fingerprint não coincide", async () => {
    const fileName = "TraceInstructions.log";

    storageObjects.set(
      "reduce-logs-cache/7/by-name/traceinstructions.log.json",
      Buffer.from(JSON.stringify({
        version: 1,
        fileFingerprint: "cached-by-name",
        fileName,
        logType: "TraceInstructions",
        sizeBytes: 4096,
        lastModifiedMs: 1713651000000,
        chunkCount: 32,
        storageSessionId: "cached-session-by-name",
        storageFileId: "cached-file-by-name",
        uploadedByUserId: 7,
        uploadedAt: new Date().toISOString(),
      })),
    );

    const initResponse = await fetch(`${baseUrl}/api/reduce-logs/upload/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: [
          {
            fileName,
            sizeBytes: 8192,
            logType: "TraceInstructions",
            lastModifiedMs: 1713652000000,
          },
        ],
      }),
    });

    const initPayload = await initResponse.json();
    expect(initResponse.status).toBe(200);
    expect(initPayload.files[0]).toEqual(expect.objectContaining({
      fileId: "cached-file-by-name",
      sizeBytes: 4096,
      chunkCount: 32,
      reused: true,
      storageSessionId: "cached-session-by-name",
      storageFileId: "cached-file-by-name",
    }));
  });

  it("aceita dezenas de chunks sequenciais do mesmo arquivo sem depender de sessão em memória", async () => {
    mockStartAnalysisJob.mockResolvedValue({
      job: {
        jobId: "job-many-chunks",
        status: "queued",
      },
    });

    const chunks = Array.from({ length: 50 }, (_, index) => `chunk-${index.toString().padStart(2, "0")}\n`);
    const fileContent = chunks.join("");

    const initResponse = await fetch(`${baseUrl}/api/reduce-logs/upload/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        analysisName: "Muitos chunks",
        files: [
          {
            fileName: "TraceInstructions.log",
            sizeBytes: Buffer.byteLength(fileContent),
            logType: "TraceInstructions",
          },
        ],
      }),
    });

    const initPayload = await initResponse.json();
    const remoteFile = initPayload.files[0] as { fileId: string };

    for (let index = 0; index < chunks.length; index += 1) {
      const chunkResponse = await fetch(
        `${baseUrl}/api/reduce-logs/upload/chunk?sessionId=${encodeURIComponent(initPayload.sessionId)}&fileId=${encodeURIComponent(remoteFile.fileId)}&chunkIndex=${index}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
          },
          body: Buffer.from(chunks[index], "utf-8"),
        },
      );

      expect(chunkResponse.status).toBe(200);
    }

    const completeResponse = await fetch(`${baseUrl}/api/reduce-logs/upload/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: initPayload.sessionId,
        analysisName: "Muitos chunks",
        files: [
          {
            fileId: remoteFile.fileId,
            fileName: "TraceInstructions.log",
            sizeBytes: Buffer.byteLength(fileContent),
            logType: "TraceInstructions",
            chunkCount: chunks.length,
          },
        ],
      }),
    });

    const completePayload = await completeResponse.json();
    expect(completeResponse.status).toBe(200);
    expect(completePayload.job.jobId).toBe("job-many-chunks");
    expect(mockStoragePutExact).toHaveBeenCalled();
    expect(storageObjects.has("reduce-logs-cache/7/by-name/traceinstructions.log.json")).toBe(true);

    const startedInput = mockStartAnalysisJob.mock.calls.at(-1)?.[0] as StartedJobInput;
    expect(startedInput.logFiles[0]).toEqual(expect.objectContaining({
      fileName: "TraceInstructions.log",
      logType: "TraceInstructions",
      sizeBytes: Buffer.byteLength(fileContent),
      uploadSessionId: initPayload.sessionId,
      uploadFileId: remoteFile.fileId,
      uploadChunkCount: chunks.length,
      uploadedByUserId: 7,
    }));
  });

  it("mantém compatibilidade com chunk por PUT para sessões já iniciadas", async () => {
    const fileContent = "VirtualProtect\nSleep\n";

    const initResponse = await fetch(`${baseUrl}/api/reduce-logs/upload/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        analysisName: "Compatibilidade PUT",
        files: [
          {
            fileName: "TraceInstructions.log",
            sizeBytes: Buffer.byteLength(fileContent),
            logType: "TraceInstructions",
          },
        ],
      }),
    });

    const initPayload = await initResponse.json();
    const remoteFile = initPayload.files[0] as { fileId: string };

    const putChunkResponse = await fetch(
      `${baseUrl}/api/reduce-logs/upload/chunk?sessionId=${encodeURIComponent(initPayload.sessionId)}&fileId=${encodeURIComponent(remoteFile.fileId)}&chunkIndex=0`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: Buffer.from(fileContent, "utf-8"),
      },
    );

    const putPayload = await putChunkResponse.json();
    expect(putChunkResponse.status).toBe(200);
    expect(putPayload.chunkIndex).toBe(0);
  });
});
