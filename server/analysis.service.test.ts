import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const serviceState = vi.hoisted(() => ({
  jobs: {} as Record<string, any>,
  artifacts: {} as Record<string, any[]>,
  mockAddAnalysisEvent: vi.fn(async () => undefined),
  mockCreateAnalysisJob: vi.fn(async () => null),
  mockGetAnalysisCommit: vi.fn(async () => null),
  mockGetAnalysisInsight: vi.fn(async () => null),
  mockGetAnalysisJobByJobId: vi.fn(async (jobId: string) => serviceState.jobs[jobId] ?? null),
  mockListAnalysisArtifacts: vi.fn(async (jobId: string) => serviceState.artifacts[jobId] ?? []),
  mockListAnalysisEvents: vi.fn(async () => []),
  mockListAnalysisJobs: vi.fn(async () => Object.values(serviceState.jobs)),
  mockReplaceAnalysisArtifacts: vi.fn(async (jobId: string, artifacts: any[]) => {
    serviceState.artifacts[jobId] = artifacts.map((artifact, index) => ({
      id: index + 1,
      jobId,
      createdAt: new Date("2026-04-15T00:00:00.000Z"),
      ...artifact,
    }));
  }),
  mockUpdateAnalysisJob: vi.fn(async (jobId: string, updates: Record<string, unknown>) => {
    serviceState.jobs[jobId] = {
      ...serviceState.jobs[jobId],
      ...updates,
    };
    return serviceState.jobs[jobId];
  }),
  mockUpsertAnalysisCommit: vi.fn(async () => undefined),
  mockUpsertAnalysisInsight: vi.fn(async () => undefined),
  mockNotifyOwner: vi.fn(async () => true),
  mockStoragePut: vi.fn(async (relKey: string) => ({
    key: relKey,
    url: `https://storage.example/${encodeURIComponent(relKey)}`,
  })),
}));

vi.mock("./db", () => ({
  addAnalysisEvent: (...args: any[]) => serviceState.mockAddAnalysisEvent(...args),
  createAnalysisJob: (...args: any[]) => serviceState.mockCreateAnalysisJob(...args),
  getAnalysisCommit: (...args: any[]) => serviceState.mockGetAnalysisCommit(...args),
  getAnalysisInsight: (...args: any[]) => serviceState.mockGetAnalysisInsight(...args),
  getAnalysisJobByJobId: (jobId: string) => serviceState.mockGetAnalysisJobByJobId(jobId),
  listAnalysisArtifacts: (jobId: string) => serviceState.mockListAnalysisArtifacts(jobId),
  listAnalysisEvents: (jobId: string, limit: number) => serviceState.mockListAnalysisEvents(jobId, limit),
  listAnalysisJobs: () => serviceState.mockListAnalysisJobs(),
  replaceAnalysisArtifacts: (jobId: string, artifacts: any[]) => serviceState.mockReplaceAnalysisArtifacts(jobId, artifacts),
  updateAnalysisJob: (jobId: string, updates: Record<string, unknown>) => serviceState.mockUpdateAnalysisJob(jobId, updates),
  upsertAnalysisCommit: (...args: any[]) => serviceState.mockUpsertAnalysisCommit(...args),
  upsertAnalysisInsight: (...args: any[]) => serviceState.mockUpsertAnalysisInsight(...args),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({
    model: "mock-model",
    choices: [{ message: { content: JSON.stringify({ title: "Resumo", riskLevel: "medium", summaryMarkdown: "ok", keyFunctions: [], confidenceNotes: [] }) } }],
  })),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: (...args: any[]) => serviceState.mockNotifyOwner(...args),
}));

vi.mock("./storage", () => ({
  storagePut: (...args: any[]) => serviceState.mockStoragePut(...args),
}));

vi.mock("node:child_process", () => ({
  execFile: (_command: string, args: string[], callback: (error: Error | null, stdout?: string, stderr?: string) => void) => {
    try {
      const outputPath = args[1];
      if (outputPath) {
        require("node:fs").writeFileSync(outputPath, "mock-png-binary");
      }
      callback(null, "", "");
    } catch (error) {
      callback(error as Error, "", "");
    }
    return {};
  },
}));

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as Response;
}

describe("analysis service", () => {
  let tempRepoPath = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    tempRepoPath = await fs.mkdtemp(path.join(os.tmpdir(), "analysis-service-"));
    process.env.CDF_PIPELINE_REPO_PATH = tempRepoPath;
    process.env.CDF_PIPELINE_API_URL = "http://pipeline.test";

    serviceState.jobs = {
      "job-running": {
        jobId: "job-running",
        status: "running",
        progress: 35,
        stage: "processing",
        message: "Processando amostra.",
        sampleName: "sample-running",
        focusFunction: "TraceFcnCall.M1::ALL_FUNCTIONS",
        sourceArchiveUrl: "https://storage.example/sample-running.7z",
        resultPath: "/jobs/job-running",
        llmSummaryStatus: "pending",
        commitStatus: "pending",
        stdoutTail: "",
        stderrTail: "",
        completedAt: null,
      },
      "job-completed-backfill": {
        jobId: "job-completed-backfill",
        status: "completed",
        progress: 100,
        stage: "done",
        message: "Concluído com sucesso.",
        sampleName: "sample-completed-backfill",
        focusFunction: "TraceFcnCall.M1::ALL_FUNCTIONS",
        sourceArchiveUrl: "https://storage.example/sample-completed-backfill.7z",
        resultPath: "/jobs/job-completed-backfill",
        llmSummaryStatus: "completed",
        commitStatus: "completed",
        stdoutTail: "",
        stderrTail: "",
        completedAt: new Date("2026-04-15T00:00:00.000Z"),
      },
      "job-completed-ready": {
        jobId: "job-completed-ready",
        status: "completed",
        progress: 100,
        stage: "done",
        message: "Concluído com artefatos já publicados.",
        sampleName: "sample-completed-ready",
        focusFunction: "IsDebuggerPresent",
        sourceArchiveUrl: "https://storage.example/sample-completed-ready.7z",
        resultPath: "/jobs/job-completed-ready",
        llmSummaryStatus: "completed",
        commitStatus: "completed",
        stdoutTail: "",
        stderrTail: "",
        completedAt: new Date("2026-04-15T00:00:00.000Z"),
      },
    };

    serviceState.artifacts = {
      "job-completed-ready": [
        {
          id: 1,
          jobId: "job-completed-ready",
          artifactType: "json",
          label: "Fluxo existente",
          relativePath: "output/function_flows/isdebuggerpresent/fluxo_isdebuggerpresent.json",
          sourcePath: "/tmp/existing-flow.json",
          storageUrl: "https://storage.example/existing-flow.json",
          storageKey: "existing-flow.json",
          mimeType: "application/json",
          sizeBytes: 128,
          createdAt: new Date("2026-04-15T00:00:00.000Z"),
        },
      ],
    };

    const extractedDir = path.join(
      tempRepoPath,
      "data",
      "jobs_api",
      "job-completed-backfill",
      "extracted",
      "Sample",
    );
    await fs.mkdir(extractedDir, { recursive: true });
    await fs.writeFile(
      path.join(extractedDir, "contradef.2956.TraceFcnCall.M1.cdf"),
      [
        "7ffb4a4204f0   T[0]  C:\\Windows\\System32\\KERNEL32.DLL:IsDebuggerPresent",
        "7ffb4a401250   T[0]  C:\\Windows\\System32\\KERNEL32.DLL:CheckRemoteDebuggerPresent",
        "7ffb4a41bfb0   T[0]  C:\\Windows\\System32\\KERNEL32.DLL:VirtualProtect",
        "7ffb4a4204f0   T[0]  C:\\Windows\\System32\\KERNEL32.DLL:IsDebuggerPresent",
      ].join("\n"),
      "utf-8",
    );

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const href = String(url);

      if (href.endsWith("/job-running/status")) {
        return jsonResponse({ state: "running", progress: 58, stage: "processing", message: "Pipeline em execução." });
      }
      if (href.endsWith("/job-running/events")) {
        return jsonResponse({ job_id: "job-running", events: [] });
      }
      if (href.endsWith("/job-running/artifacts")) {
        return jsonResponse({ job_id: "job-running", artifacts: [] });
      }
      if (href.endsWith("/job-running/stdout")) {
        return jsonResponse({ job_id: "job-running", stdout: "stdout running" });
      }
      if (href.endsWith("/job-running/stderr")) {
        return jsonResponse({ job_id: "job-running", stderr: "" });
      }

      if (href.endsWith("/job-completed-backfill/status")) {
        return jsonResponse({ state: "completed", progress: 100, stage: "done", message: "Pipeline concluído." });
      }
      if (href.endsWith("/job-completed-backfill/events")) {
        return jsonResponse({ job_id: "job-completed-backfill", events: [] });
      }
      if (href.endsWith("/job-completed-backfill/artifacts")) {
        return jsonResponse({ job_id: "job-completed-backfill", artifacts: [] });
      }
      if (href.endsWith("/job-completed-backfill/stdout")) {
        return jsonResponse({ job_id: "job-completed-backfill", stdout: "stdout completed" });
      }
      if (href.endsWith("/job-completed-backfill/stderr")) {
        return jsonResponse({ job_id: "job-completed-backfill", stderr: "" });
      }

      throw new Error(`URL não mockada no teste: ${href}`);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CDF_PIPELINE_REPO_PATH;
    delete process.env.CDF_PIPELINE_API_URL;
  });

  it("retoma jobs ativos e também faz backfill de jobs concluídos sem fluxos por função", async () => {
    const { syncActiveAnalysisJobs } = await import("./analysisService");

    const resumedJobs = await syncActiveAnalysisJobs();

    expect(resumedJobs).toBe(2);

    const backfilledArtifacts = serviceState.artifacts["job-completed-backfill"] ?? [];
    const relativePaths = backfilledArtifacts.map((artifact) => artifact.relativePath);

    expect(relativePaths).toEqual(expect.arrayContaining([
      "output/function_flows/function_flow_index.json",
      "output/function_flows/isdebuggerpresent/fluxo_isdebuggerpresent.json",
      "output/function_flows/isdebuggerpresent/fluxo_isdebuggerpresent.png",
      "output/function_flows/checkremotedebuggerpresent/fluxo_checkremotedebuggerpresent.json",
      "output/function_flows/checkremotedebuggerpresent/fluxo_checkremotedebuggerpresent.png",
      "output/function_flows/virtualprotect/fluxo_virtualprotect.json",
      "output/function_flows/virtualprotect/fluxo_virtualprotect.png",
    ]));

    expect(serviceState.mockStoragePut).toHaveBeenCalled();
    expect(serviceState.artifacts["job-completed-ready"]).toHaveLength(1);
  });
});
