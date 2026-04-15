import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TrpcContext } from "./_core/context";

const {
  mockStartAnalysisJob,
  mockGetAnalysisJobDetail,
  mockSyncAnalysisJob,
  mockSyncActiveAnalysisJobs,
  mockListAnalysisJobs,
} = vi.hoisted(() => ({
  mockStartAnalysisJob: vi.fn(),
  mockGetAnalysisJobDetail: vi.fn(),
  mockSyncAnalysisJob: vi.fn(),
  mockSyncActiveAnalysisJobs: vi.fn(),
  mockListAnalysisJobs: vi.fn(),
}));

vi.mock("./analysisService", () => ({
  startAnalysisJob: mockStartAnalysisJob,
  getAnalysisJobDetail: mockGetAnalysisJobDetail,
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

import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: AuthenticatedUser["role"] = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 7,
    openId: "analyst-user",
    email: "analyst@example.com",
    name: role === "admin" ? "Admin User" : "Analyst User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
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

  it("encaminha a submissão do job com o usuário autenticado", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    mockStartAnalysisJob.mockResolvedValue({ jobId: "job-123", status: "queued" });

    const result = await caller.analysis.submit({
      archiveName: "sample.7z",
      archiveBase64: Buffer.from("demo").toString("base64"),
      focusFunction: "IsDebuggerPresent",
      focusTerms: ["IsDebuggerPresent", "VirtualProtect"],
      focusRegexes: ["Zw.*InformationProcess"],
      origin: "https://example.com",
    });

    expect(mockStartAnalysisJob).toHaveBeenCalledWith({
      archiveName: "sample.7z",
      archiveBase64: Buffer.from("demo").toString("base64"),
      focusFunction: "IsDebuggerPresent",
      focusTerms: ["IsDebuggerPresent", "VirtualProtect"],
      focusRegexes: ["Zw.*InformationProcess"],
      origin: "https://example.com",
      createdByUserId: 7,
    });
    expect(result).toEqual({ jobId: "job-123", status: "queued" });
  });

  it("lista jobs com os filtros informados", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const createdFrom = new Date("2026-04-10T00:00:00.000Z");
    const createdTo = new Date("2026-04-14T23:59:59.999Z");

    mockListAnalysisJobs.mockResolvedValue([{ jobId: "job-1" }, { jobId: "job-2" }]);

    const result = await caller.analysis.list({
      sampleName: "Full-Execution-Sample-1",
      focusFunction: "IsDebuggerPresent",
      createdFrom,
      createdTo,
      status: ["completed"],
      limit: 25,
    });

    expect(mockListAnalysisJobs).toHaveBeenCalledWith({
      sampleName: "Full-Execution-Sample-1",
      focusFunction: "IsDebuggerPresent",
      createdFrom,
      createdTo,
      status: ["completed"],
      limit: 25,
    });
    expect(result).toEqual([{ jobId: "job-1" }, { jobId: "job-2" }]);
  });

  it("retorna o detalhe agregado do job", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const detail = {
      job: { jobId: "job-123", status: "completed" },
      events: [],
      artifacts: [],
      insight: { title: "Resumo" },
      commit: { status: "completed" },
      graph: { nodes: [], edges: [] },
    };

    mockGetAnalysisJobDetail.mockResolvedValue(detail);

    const result = await caller.analysis.detail({ jobId: "job-123" });

    expect(mockGetAnalysisJobDetail).toHaveBeenCalledWith("job-123");
    expect(result).toEqual(detail);
  });

  it("sincroniza um job específico e retoma a sincronização dos jobs ativos", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    mockSyncAnalysisJob.mockResolvedValue({ job: { jobId: "job-123", status: "running" } });
    mockSyncActiveAnalysisJobs.mockResolvedValue(3);

    const syncResult = await caller.analysis.sync({ jobId: "job-123" });
    const resumeResult = await caller.analysis.resumeActiveSync();

    expect(mockSyncAnalysisJob).toHaveBeenCalledWith("job-123");
    expect(syncResult).toEqual({ job: { jobId: "job-123", status: "running" } });
    expect(mockSyncActiveAnalysisJobs).toHaveBeenCalledTimes(1);
    expect(resumeResult).toEqual({ resumedJobs: 3 });
  });

  it("bloqueia sincronização manual e retomada para usuários sem papel administrativo", async () => {
    const ctx = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    await expect(caller.analysis.sync({ jobId: "job-123" })).rejects.toMatchObject<Partial<TRPCError>>({
      code: "FORBIDDEN",
    });
    await expect(caller.analysis.resumeActiveSync()).rejects.toMatchObject<Partial<TRPCError>>({
      code: "FORBIDDEN",
    });

    expect(mockSyncAnalysisJob).not.toHaveBeenCalled();
    expect(mockSyncActiveAnalysisJobs).not.toHaveBeenCalled();
  });
});
