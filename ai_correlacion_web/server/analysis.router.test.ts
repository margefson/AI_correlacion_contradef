import { describe, beforeEach, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const {
  mockStartAnalysisJob,
  mockGetAnalysisJobDetail,
  mockGetReductionBaselineMetrics,
  mockSyncAnalysisJob,
  mockSyncActiveAnalysisJobs,
  mockListAnalysisJobs,
  mockRemoveLocalJobWorkspace,
} = vi.hoisted(() => ({
  mockStartAnalysisJob: vi.fn(),
  mockGetAnalysisJobDetail: vi.fn(),
  mockGetReductionBaselineMetrics: vi.fn(),
  mockSyncAnalysisJob: vi.fn(),
  mockSyncActiveAnalysisJobs: vi.fn(),
  mockListAnalysisJobs: vi.fn(),
  mockRemoveLocalJobWorkspace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./analysisService", () => ({
  startAnalysisJob: mockStartAnalysisJob,
  getAnalysisJobDetail: mockGetAnalysisJobDetail,
  getReductionBaselineMetrics: mockGetReductionBaselineMetrics,
  syncAnalysisJob: mockSyncAnalysisJob,
  syncActiveAnalysisJobs: mockSyncActiveAnalysisJobs,
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    listAnalysisJobs: mockListAnalysisJobs,
  };
});

vi.mock("./artifactLocalStore", () => ({
  removeLocalJobWorkspace: mockRemoveLocalJobWorkspace,
}));

import { buildMitreDefenseEvasion } from "../shared/analysis";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userOverrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 7,
    openId: "analyst-user",
    email: "analyst@example.com",
    name: "Analyst User",
    loginMethod: "oauth",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...userOverrides,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("analysis router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("encaminha a submissão da análise com múltiplos logs e o usuário autenticado", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    mockStartAnalysisJob.mockResolvedValue({ job: { jobId: "job-123", status: "queued" } });

    const result = await caller.analysis.submit({
      analysisName: "Sample Contradef",
      logFiles: [
        {
          fileName: "FunctionInterceptor.log",
          base64: Buffer.from("demo").toString("base64"),
          logType: "FunctionInterceptor",
        },
        {
          fileName: "TraceMemory.log",
          base64: Buffer.from("demo-2").toString("base64"),
          logType: "TraceMemory",
        },
      ],
      focusTerms: ["IsDebuggerPresent", "VirtualProtect"],
      focusRegexes: ["VirtualProtect.*RW.*RX"],
      origin: "https://example.com",
    });

    expect(mockStartAnalysisJob).toHaveBeenCalledWith({
      analysisName: "Sample Contradef",
      logFiles: [
        {
          fileName: "FunctionInterceptor.log",
          base64: Buffer.from("demo").toString("base64"),
          logType: "FunctionInterceptor",
        },
        {
          fileName: "TraceMemory.log",
          base64: Buffer.from("demo-2").toString("base64"),
          logType: "TraceMemory",
        },
      ],
      focusTerms: ["IsDebuggerPresent", "VirtualProtect"],
      focusRegexes: ["VirtualProtect.*RW.*RX"],
      origin: "https://example.com",
      createdByUserId: 7,
      sampleSha256: null,
    });
    expect(result).toEqual({ job: { jobId: "job-123", status: "queued" } });
  });

  it("lista jobs com os filtros informados", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const createdFrom = new Date("2026-04-10T00:00:00.000Z");
    const createdTo = new Date("2026-04-14T23:59:59.999Z");

    mockListAnalysisJobs.mockResolvedValue([{ jobId: "job-1" }, { jobId: "job-2" }]);

    const result = await caller.analysis.list({
      sampleName: "Full-Execution-Sample-1",
      focusFunction: "Contradef",
      createdFrom,
      createdTo,
      status: ["completed"],
      limit: 25,
    });

    expect(mockListAnalysisJobs).toHaveBeenCalledWith({
      sampleName: "Full-Execution-Sample-1",
      focusFunction: "Contradef",
      createdFrom,
      createdTo,
      status: ["completed"],
      limit: 25,
      createdByUserId: 7,
    });
    expect(result).toEqual([{ jobId: "job-1" }, { jobId: "job-2" }]);
  });

  it("lista jobs sem filtrar por autor (admin vê o histórico global)", async () => {
    const ctx = createAuthContext({ role: "admin" });
    const caller = appRouter.createCaller(ctx);
    mockListAnalysisJobs.mockResolvedValue([]);

    await caller.analysis.list({ limit: 20 });

    const listArg = mockListAnalysisJobs.mock.calls[0][0];
    expect(listArg).toMatchObject({ limit: 20 });
    expect(listArg).not.toHaveProperty("createdByUserId");
  });

  it("retorna o detalhe agregado do job", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await import("./db");
    const getJobSpy = vi.spyOn(db, "getAnalysisJobByJobId").mockResolvedValue({
      jobId: "job-123",
      createdByUserId: 7,
    } as Awaited<ReturnType<typeof db.getAnalysisJobByJobId>>);
    const detail = {
      job: { jobId: "job-123", status: "completed" },
      events: [],
      artifacts: [],
      insight: { title: "Resumo" },
      flowGraph: { nodes: [], edges: [] },
      metrics: {
        originalLineCount: 10,
        reducedLineCount: 4,
        originalBytes: 100,
        reducedBytes: 40,
        reductionPercent: 60,
        suspiciousEventCount: 2,
        triggerCount: 1,
        uploadedFileCount: 2,
      },
      fileMetrics: [
        {
          fileName: "TraceInstructions.log",
          logType: "TraceInstructions",
          originalLineCount: 8,
          reducedLineCount: 3,
          originalBytes: 80,
          reducedBytes: 30,
          suspiciousEventCount: 2,
          triggerCount: 1,
        },
      ],
      suspiciousApis: ["VirtualProtect"],
      techniques: ["Anti-debug"],
      mitreDefenseEvasion: buildMitreDefenseEvasion(["Anti-debug"], ["VirtualProtect"]),
      recommendations: ["Revisar o ponto de desempacotamento."],
      classification: "Trojan",
      riskLevel: "high",
      currentPhase: "Desempacotamento",
    };

    mockGetAnalysisJobDetail.mockResolvedValue(detail);

    const result = await caller.analysis.detail({ jobId: "job-123" });

    expect(getJobSpy).toHaveBeenCalledWith("job-123");
    expect(mockGetAnalysisJobDetail).toHaveBeenCalledWith("job-123");
    expect(result).toEqual(detail);
    getJobSpy.mockRestore();
  });

  it("recusa o detalhe de lote submetido por outro utilizador", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await import("./db");
    const getJobSpy = vi.spyOn(db, "getAnalysisJobByJobId").mockResolvedValue({
      jobId: "job-alien",
      createdByUserId: 99,
    } as Awaited<ReturnType<typeof db.getAnalysisJobByJobId>>);

    await expect(caller.analysis.detail({ jobId: "job-alien" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mockGetAnalysisJobDetail).not.toHaveBeenCalled();
    getJobSpy.mockRestore();
  });

  it("retoma sync ativo: admin chama a listagem de jobs ativos sem filtro de autor", async () => {
    const ctx = createAuthContext({ role: "admin" });
    const caller = appRouter.createCaller(ctx);
    mockSyncActiveAnalysisJobs.mockResolvedValue(["j1"]);

    const resumeResult = await caller.analysis.resumeActiveSync();

    expect(mockSyncActiveAnalysisJobs).toHaveBeenCalledWith(undefined);
    expect(resumeResult).toEqual({ resumedJobs: ["j1"] });
  });

  it("retorna as métricas validadas do teste de redução em C++", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const reductionMetrics = {
      available: true,
      errorMessage: null,
      trigger_address: "0x10A0",
      files: [
        {
          file: "TraceInstructions_sample.csv",
          original_lines: 9,
          reduced_lines: 6,
          original_bytes: 696,
          reduced_bytes: 405,
        },
      ],
      combined: {
        original_lines: 9,
        reduced_lines: 6,
        original_bytes: 696,
        reduced_bytes: 405,
        reduction_percent: 41.81,
      },
      sampleSelectiveTest: {
        available: true,
        errorMessage: null,
        trigger_address: "0x10A0",
        files: [
          {
            file: "TraceInstructions_sample.csv",
            original_lines: 9,
            reduced_lines: 6,
            original_bytes: 696,
            reduced_bytes: 405,
          },
        ],
        combined: {
          original_lines: 9,
          reduced_lines: 6,
          original_bytes: 696,
          reduced_bytes: 405,
          reduction_percent: 41.81,
        },
      },
      realDatasetCompression: {
        available: true,
        errorMessage: null,
        dataset_directory: "/home/ubuntu/work_real_cdfs/extracted/Full-Execution-Sample-1",
        file_count: 6,
        total_original_size: 5096911203,
        total_compressed_size: 197261750,
        reduction_percent: 96.13,
        source_files_materialized: false,
        compressed_files_materialized: false,
        artifacts: [
          {
            file: "contradef.2956.TraceInstructions.cdf",
            original_size: 4214246529,
            compressed_size: 175592788,
            reduction_percent: 95.83,
            compression_level: 3,
            source_path: "/home/ubuntu/work_real_cdfs/extracted/Full-Execution-Sample-1/contradef.2956.TraceInstructions.cdf",
            compressed_path: "/home/ubuntu/work_real_cdfs/compressed_real_cdfs/contradef.2956.TraceInstructions.cdf.gz",
            source_available_in_workspace: false,
            compressed_available_in_workspace: false,
            source_sha256: "499136c7c1c747c54cef69bfc874f279db8d6ea703d8f3247fb58422c0263924",
            compressed_sha256: "062f336c0f357caed2e323091923b4b7ac8892d3d3fe71349bbb0ccb4fc435db",
          },
        ],
      },
    };

    mockGetReductionBaselineMetrics.mockResolvedValue(reductionMetrics);

    const result = await caller.analysis.reductionBaseline();

    expect(mockGetReductionBaselineMetrics).toHaveBeenCalledTimes(1);
    expect(result).toEqual(reductionMetrics);
  });

  it("sincroniza um job específico e retoma a sincronização dos jobs ativos", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await import("./db");
    const getJobSpy = vi.spyOn(db, "getAnalysisJobByJobId").mockResolvedValue({
      jobId: "job-123",
      createdByUserId: 7,
    } as Awaited<ReturnType<typeof db.getAnalysisJobByJobId>>);

    mockSyncAnalysisJob.mockResolvedValue({ job: { jobId: "job-123", status: "running" } });
    mockSyncActiveAnalysisJobs.mockResolvedValue(["job-1", "job-2"]);

    const syncResult = await caller.analysis.sync({ jobId: "job-123" });
    const resumeResult = await caller.analysis.resumeActiveSync();

    expect(mockSyncAnalysisJob).toHaveBeenCalledWith("job-123");
    expect(syncResult).toEqual({ job: { jobId: "job-123", status: "running" } });
    expect(mockSyncActiveAnalysisJobs).toHaveBeenCalledWith({ createdByUserId: 7 });
    expect(resumeResult).toEqual({ resumedJobs: ["job-1", "job-2"] });
    getJobSpy.mockRestore();
  });

  it("deleteJob: apaga no servidor (dono) e chama remoção de workspace local", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await import("./db");
    const getSpy = vi.spyOn(db, "getAnalysisJobByJobId").mockResolvedValue({
      jobId: "ctr-test-job",
      createdByUserId: 7,
    } as Awaited<ReturnType<typeof db.getAnalysisJobByJobId>>);
    const delSpy = vi.spyOn(db, "deleteAnalysisJobAndRelatedData").mockResolvedValue(true);

    const result = await caller.analysis.deleteJob({ jobId: "ctr-test-job" });

    expect(result).toEqual({ ok: true });
    expect(getSpy).toHaveBeenCalledWith("ctr-test-job");
    expect(delSpy).toHaveBeenCalledWith("ctr-test-job");
    expect(mockRemoveLocalJobWorkspace).toHaveBeenCalledWith("ctr-test-job");

    getSpy.mockRestore();
    delSpy.mockRestore();
  });

  it("deleteJob: recusa lote de outro utilizador (não chama apagar na BD)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await import("./db");
    const getSpy = vi.spyOn(db, "getAnalysisJobByJobId").mockResolvedValue({
      jobId: "ctr-other",
      createdByUserId: 999,
    } as Awaited<ReturnType<typeof db.getAnalysisJobByJobId>>);
    const delSpy = vi.spyOn(db, "deleteAnalysisJobAndRelatedData").mockResolvedValue(true);

    await expect(caller.analysis.deleteJob({ jobId: "ctr-other" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(delSpy).not.toHaveBeenCalled();
    getSpy.mockRestore();
    delSpy.mockRestore();
  });

  it("deleteJob: recusa lote sem createdByUserId (legado)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await import("./db");
    const getSpy = vi.spyOn(db, "getAnalysisJobByJobId").mockResolvedValue({
      jobId: "ctr-legacy",
      createdByUserId: null,
    } as Awaited<ReturnType<typeof db.getAnalysisJobByJobId>>);
    const delSpy = vi.spyOn(db, "deleteAnalysisJobAndRelatedData").mockResolvedValue(true);

    await expect(caller.analysis.deleteJob({ jobId: "ctr-legacy" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(delSpy).not.toHaveBeenCalled();
    getSpy.mockRestore();
    delSpy.mockRestore();
  });
});
