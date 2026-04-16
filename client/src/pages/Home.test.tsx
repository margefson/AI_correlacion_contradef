/* @vitest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  jobs: [] as Array<Record<string, any>>,
  details: {} as Record<string, any>,
  authUserRole: "admin" as "admin" | "user",
  useRealUpload: false,
  inspectAnalysisArchive: vi.fn(async (file: File) => ({
    ok: true,
    message: "Assinatura 7z validada. Upload pronto para análise.",
    remainingBytes: Math.max(0, 64 * 1024 * 1024 - file.size),
    chunkCount: file.size > 30 * 1024 * 1024 ? 2 : 1,
    usesChunkedTransport: file.size > 30 * 1024 * 1024,
  })),
  uploadAnalysisArchiveBatch: vi.fn(async (input?: any, options?: any) => {
    const files = (input?.files ?? []) as File[];
    const results: Array<{ file: File; result?: { jobId: string } }> = [];

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex]!;
      options?.onFileStart?.(file, fileIndex, files.length);
      options?.onFileProgress?.(file, 100, fileIndex, files.length);
      const result = { jobId: `job-upload-${fileIndex + 1}` };
      options?.onFileSuccess?.(file, result, fileIndex, files.length);
      results.push({ file, result });
    }

    return results;
  }),
  syncMutateAsync: vi.fn(async ({ jobId }: { jobId: string }) => ({ job: { jobId } })),
  resumeMutate: vi.fn(),
  resumeMutateAsync: vi.fn(async () => ({ resumedJobs: 1 })),
  invalidateList: vi.fn(async () => undefined),
  invalidateDetail: vi.fn(async () => undefined),
}));

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="dashboard-layout">{children}</div>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: () => <span>Status</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Analista", role: mockState.authUserRole },
    loading: false,
    error: null,
    isAuthenticated: true,
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/analysisUpload", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analysisUpload")>("@/lib/analysisUpload");

  return {
    ...actual,
    inspectAnalysisArchive: (file: File) => (
      mockState.useRealUpload ? actual.inspectAnalysisArchive(file) : mockState.inspectAnalysisArchive(file)
    ),
    uploadAnalysisArchiveBatch: (input: unknown, options: unknown) => (
      mockState.useRealUpload ? actual.uploadAnalysisArchiveBatch(input as any, options as any) : mockState.uploadAnalysisArchiveBatch(input, options)
    ),
  };
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      analysis: {
        list: { invalidate: mockState.invalidateList },
        detail: { invalidate: mockState.invalidateDetail },
      },
    }),
    analysis: {
      list: {
        useQuery: () => ({
          data: mockState.jobs,
          refetch: vi.fn(),
        }),
      },
      detail: {
        useQuery: ({ jobId }: { jobId: string }) => ({
          data: mockState.details[jobId] ?? undefined,
        }),
      },
      resumeActiveSync: {
        useMutation: () => ({
          mutate: mockState.resumeMutate,
          mutateAsync: mockState.resumeMutateAsync,
          isPending: false,
        }),
      },
      sync: {
        useMutation: () => ({
          mutateAsync: mockState.syncMutateAsync,
          isPending: false,
        }),
      },
    },
  },
}));

import {
  CHUNK_UPLOAD_HARD_MAX_BYTES,
  CHUNK_UPLOAD_MAX_BYTES,
} from "@/lib/analysisUpload";
import Home from "./Home";

const SEVEN_Z_SIGNATURE = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);

function createSevenZipFile(sizeBytes: number, name = "Full-Execution-Sample-1.7z") {
  const content = new Uint8Array(sizeBytes);
  content.set(SEVEN_Z_SIGNATURE, 0);
  return new File([content], name, {
    type: "application/x-7z-compressed",
    lastModified: 1713225600000,
  });
}

describe("Home dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    class MockEventSource {
      public url: string;

      constructor(url: string) {
        this.url = url;
      }

      addEventListener() {
        return undefined;
      }

      close() {
        return undefined;
      }
    }

    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    mockState.authUserRole = "admin";
    mockState.useRealUpload = false;

    mockState.inspectAnalysisArchive.mockImplementation(async (file: File) => ({
      ok: true,
      message: "Assinatura 7z validada. Upload pronto para análise.",
      remainingBytes: Math.max(0, 64 * 1024 * 1024 - file.size),
      chunkCount: file.size > 30 * 1024 * 1024 ? 2 : 1,
      usesChunkedTransport: file.size > 30 * 1024 * 1024,
    }));

    mockState.uploadAnalysisArchiveBatch.mockImplementation(async (input?: any, options?: any) => {
      const files = (input?.files ?? []) as File[];
      const results: Array<{ file: File; result?: { jobId: string } }> = [];

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex]!;
        options?.onFileStart?.(file, fileIndex, files.length);
        options?.onFileProgress?.(file, 100, fileIndex, files.length);
        const result = { jobId: `job-upload-${fileIndex + 1}` };
        options?.onFileSuccess?.(file, result, fileIndex, files.length);
        results.push({ file, result });
      }

      return results;
    });

    mockState.jobs = [
      {
        jobId: "job-1",
        sampleName: "Full-Execution-Sample-1",
        focusFunction: "IsDebuggerPresent",
        status: "completed",
        stage: "done",
        progress: 100,
        message: "Pipeline finalizado com sucesso.",
        createdAt: new Date("2026-04-14T18:30:00.000Z"),
        updatedAt: new Date("2026-04-14T18:45:00.000Z"),
        llmSummaryStatus: "completed",
        commitStatus: "completed",
        stdoutTail: "stdout",
        stderrTail: "",
      },
      {
        jobId: "job-2",
        sampleName: "Live-Sample-2",
        focusFunction: "CreateRemoteThread",
        status: "running",
        stage: "correlating",
        progress: 62,
        message: "Correlacionando chamadas relevantes.",
        createdAt: new Date("2026-04-14T19:00:00.000Z"),
        updatedAt: new Date("2026-04-14T19:05:00.000Z"),
        llmSummaryStatus: "pending",
        commitStatus: "pending",
        stdoutTail: "stdout running",
        stderrTail: "stderr running",
      },
    ];

    mockState.details = {
      "job-1": {
        job: mockState.jobs[0],
        events: [],
        artifacts: [
          {
            id: 10,
            jobId: "job-1",
            artifactType: "json",
            label: "correlation.json",
            relativePath: "outputs/correlation.json",
            sourcePath: "/tmp/correlation.json",
            storageUrl: "https://example.com/correlation.json",
            storageKey: "outputs/correlation.json",
            mimeType: "application/json",
            sizeBytes: 2048,
            createdAt: new Date("2026-04-14T18:45:00.000Z"),
          },
          {
            id: 11,
            jobId: "job-1",
            artifactType: "markdown",
            label: "summary.md",
            relativePath: "outputs/summary.md",
            sourcePath: "/tmp/summary.md",
            storageUrl: "https://example.com/summary.md",
            storageKey: "outputs/summary.md",
            mimeType: "text/markdown",
            sizeBytes: 512,
            createdAt: new Date("2026-04-14T18:45:00.000Z"),
          },
          {
            id: 12,
            jobId: "job-1",
            artifactType: "docx",
            label: "report.docx",
            relativePath: "outputs/report.docx",
            sourcePath: "/tmp/report.docx",
            storageUrl: "https://example.com/report.docx",
            storageKey: "outputs/report.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 4096,
            createdAt: new Date("2026-04-14T18:45:00.000Z"),
          },
        ],
        insight: {
          summaryMarkdown: "## Sumário\nA amostra destaca mecanismos de detecção de análise.",
        },
        commit: {
          repository: "margefson/AI_correlacion_contradef",
          branch: "main",
          commitHash: "abc123def456",
          status: "completed",
        },
        graph: {
          nodes: [
            { id: "IsDebuggerPresent", label: "IsDebuggerPresent", kind: "function" },
            { id: "VirtualProtect", label: "VirtualProtect", kind: "function" },
          ],
          edges: [
            {
              source: "IsDebuggerPresent",
              target: "VirtualProtect",
              relation: "correlates_with",
              weight: 0.94,
              evidence: "Relacionamento observado no fluxo consolidado.",
            },
          ],
        },
      },
      "job-2": {
        job: mockState.jobs[1],
        events: [],
        artifacts: [],
        insight: null,
        commit: null,
        graph: {
          nodes: [],
          edges: [],
        },
      },
    };
  });

  it("submete um novo arquivo 7z com os parâmetros atuais do formulário", async () => {
    const user = userEvent.setup();
    render(<Home />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake-binary"], "sample.7z", { type: "application/x-7z-compressed" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockState.inspectAnalysisArchive).toHaveBeenCalledWith(file);
    });

    await user.click(screen.getAllByRole("button", { name: /iniciar análise/i })[0]!);

    await waitFor(() => {
      expect(mockState.uploadAnalysisArchiveBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          files: [file],
          focusFunction: "IsDebuggerPresent",
          focusTerms: ["IsDebuggerPresent", "VirtualProtect", "CreateRemoteThread"],
        }),
        expect.objectContaining({
          onFileStart: expect.any(Function),
          onFileProgress: expect.any(Function),
          onFileSuccess: expect.any(Function),
        }),
      );
    });
  });

  it("cobre o envio real de um .7z grande pela interface, exibindo limite por parte e telemetria operacional", async () => {
    const user = userEvent.setup();
    mockState.useRealUpload = true;

    const file = createSevenZipFile(38 * 1024 * 1024);
    let chunkAttempt = 0;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/api/analysis/upload-sessions")) {
        return new Response(JSON.stringify({
          uploadId: "upload-real-1",
          archiveName: file.name,
          totalBytes: file.size,
          chunkSize: CHUNK_UPLOAD_MAX_BYTES,
          totalChunks: Math.ceil(file.size / CHUNK_UPLOAD_MAX_BYTES),
          maxArchiveBytes: 64 * 1024 * 1024,
          directTransportMaxBytes: 30 * 1024 * 1024,
          focusFunction: "IsDebuggerPresent",
          receivedChunkIndexes: [],
          updatedAt: Date.now(),
        }), { status: 200 });
      }

      if (url.includes("/api/analysis/upload-sessions/") && url.endsWith("/chunks")) {
        const chunk = init?.body as Blob;
        const chunkSize = chunk instanceof Blob ? chunk.size : 0;
        expect(chunkSize).toBeLessThan(CHUNK_UPLOAD_HARD_MAX_BYTES);
        expect(chunkSize).toBeLessThanOrEqual(CHUNK_UPLOAD_MAX_BYTES);
        expect(init?.headers).toMatchObject({
          "Content-Type": "application/octet-stream",
          "x-chunk-index": expect.any(String),
        });

        chunkAttempt += 1;
        if (chunkAttempt === 1) {
          throw new Error("fetch failed");
        }

        return new Response(JSON.stringify({
          uploadId: "upload-real-1",
          receivedChunks: Math.min(chunkAttempt - 1, Math.ceil(file.size / CHUNK_UPLOAD_MAX_BYTES)),
          totalChunks: Math.ceil(file.size / CHUNK_UPLOAD_MAX_BYTES),
        }), { status: 200 });
      }

      if (url.endsWith("/complete")) {
        return new Response(JSON.stringify({ jobId: "job-upload-real-1" }), { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    render(<Home />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/máximo efetivo por parte/i)).toBeTruthy();
      expect(screen.getByText(/teto rígido do parser/i)).toBeTruthy();
    });

    await user.click(screen.getAllByRole("button", { name: /iniciar análise/i })[0]!);

    await waitFor(() => {
      expect(chunkAttempt).toBeGreaterThan(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/analysis\/upload-sessions\/upload-real-1\/complete$/),
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getAllByText(/parte/i).length).toBeGreaterThan(0);
    });
  });

  it("permite reenvio manual após esgotar a etapa final e mantém métricas operacionais visíveis", async () => {
    const user = userEvent.setup();
    const file = new File(["fake-binary"], "retryable-sample.7z", { type: "application/x-7z-compressed" });

    mockState.uploadAnalysisArchiveBatch
      .mockImplementationOnce(async (input?: any, options?: any) => {
        const files = (input?.files ?? []) as File[];
        const currentFile = files[0]!;

        options?.onFileStart?.(currentFile, 0, files.length);
        options?.onFileProgress?.(currentFile, 50, 0, files.length);
        options?.onFileStageFailure?.(
          currentFile,
          "complete",
          new Error("Falha transitória na conclusão."),
          { attempt: 3, maxAttempts: 3, willRetry: false },
          0,
          files.length,
        );
        options?.onFileError?.(currentFile, new Error("Falha transitória na conclusão."), 0, files.length);

        return [{ file: currentFile, error: new Error("Falha transitória na conclusão.") }];
      })
      .mockImplementationOnce(async (input?: any, options?: any) => {
        const files = (input?.files ?? []) as File[];
        const currentFile = files[0]!;

        options?.onFileStart?.(currentFile, 0, files.length);
        options?.onFileProgress?.(currentFile, 100, 0, files.length);
        options?.onFileSuccess?.(currentFile, { jobId: "job-manual-retry-1" }, 0, files.length);

        return [{ file: currentFile, result: { jobId: "job-manual-retry-1" } }];
      });

    render(<Home />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockState.inspectAnalysisArchive).toHaveBeenCalledWith(file);
    });

    await user.click(screen.getAllByRole("button", { name: /iniciar análise/i })[0]!);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reenviar etapa falha/i })).toBeTruthy();
      expect(screen.getAllByText(/throughput/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/eta/i).length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole("button", { name: /reenviar etapa falha/i }));

    await waitFor(() => {
      expect(mockState.uploadAnalysisArchiveBatch).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("button", { name: /reenviar etapa falha/i })).toBeNull();
    });
  });

  it("renderiza o histórico e atualiza o painel ao selecionar um job diferente", async () => {
    render(<Home />);

    expect(screen.getAllByText("Full-Execution-Sample-1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Live-Sample-2").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("Live-Sample-2")[0]!);

    await waitFor(() => {
      expect(screen.getAllByText("CreateRemoteThread").length).toBeGreaterThan(0);
      expect(screen.getAllByText(/stdout running/i).length).toBeGreaterThan(0);
    });
  });

  it("mostra falha operacional agregada quando os arquivos válidos não conseguem abrir jobs", async () => {
    const user = userEvent.setup();
    mockState.uploadAnalysisArchiveBatch.mockImplementationOnce(async (input?: any, options?: any) => {
      const files = (input?.files ?? []) as File[];
      const file = files[0]!;
      const error = new Error("Backend indisponível temporariamente.");

      options?.onFileStart?.(file, 0, files.length);
      options?.onFileError?.(file, error, 0, files.length);

      return [{ file, error }];
    });

    render(<Home />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake-binary"], "sample.7z", { type: "application/x-7z-compressed" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockState.inspectAnalysisArchive).toHaveBeenCalledWith(file);
    });

    await user.click(screen.getAllByRole("button", { name: /iniciar análise/i })[0]!);

    await waitFor(() => {
      expect(screen.getByText(/os arquivos válidos da fila não conseguiram iniciar análise/i)).toBeTruthy();
      expect(screen.getAllByText(/Backend indisponível temporariamente\./i).length).toBeGreaterThan(0);
    });
  });

  it("expõe erro explícito quando o backend rejeita o upload por limite", async () => {
    const user = userEvent.setup();
    mockState.uploadAnalysisArchiveBatch.mockRejectedValueOnce(new Error("O arquivo excede o limite operacional de 64 MB por arquivo."));

    render(<Home />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake-binary"], "sample.7z", { type: "application/x-7z-compressed" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockState.inspectAnalysisArchive).toHaveBeenCalledWith(file);
    });

    await user.click(screen.getAllByRole("button", { name: /iniciar análise/i })[0]!);

    await waitFor(() => {
      expect(mockState.uploadAnalysisArchiveBatch).toHaveBeenCalled();
      expect(screen.getByText(/^O arquivo excede o limite operacional de 64 MB por arquivo\.$/i)).toBeTruthy();
    });
  });

  it("bloqueia no cliente arquivos acima do limite publicado antes de chamar o upload", async () => {
    const user = userEvent.setup();
    mockState.inspectAnalysisArchive.mockImplementation(async () => ({
      ok: false,
      message: "O arquivo excede o limite operacional de 64 MB por arquivo. Reduza o pacote ou recompacte antes do envio.",
      remainingBytes: 0,
      chunkCount: 0,
      usesChunkedTransport: false,
    }));

    render(<Home />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake-binary"], "oversized-sample.7z", { type: "application/x-7z-compressed" });
    Object.defineProperty(file, "size", { value: 65 * 1024 * 1024 });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getAllByText(/recompacte antes do envio/i).length).toBeGreaterThan(0);
    });

    expect(mockState.uploadAnalysisArchiveBatch).not.toHaveBeenCalled();
  });

  it("expõe orientação de triagem para o perfil não administrativo e mantém a matriz comparativa disponível", () => {
    mockState.authUserRole = "user";
    render(<Home />);

    expect(screen.getByText(/Analista de triagem/i)).toBeTruthy();
    expect(screen.getByText(/Modo de triagem com controles críticos bloqueados/i)).toBeTruthy();
    expect(screen.getAllByText(/Matriz comparativa/i).length).toBeGreaterThan(0);
  });

  it("mantém o contrato de artefatos publicados esperado para exportação", () => {
    render(<Home />);

    const publishedArtifacts = mockState.details["job-1"].artifacts as Array<{ relativePath: string; storageUrl?: string }>;
    expect(publishedArtifacts.map((artifact) => artifact.relativePath)).toEqual(expect.arrayContaining([
      "outputs/correlation.json",
      "outputs/summary.md",
      "outputs/report.docx",
    ]));
    expect(publishedArtifacts.every((artifact) => typeof artifact.storageUrl === "string" && artifact.storageUrl.length > 0)).toBe(true);
  });
});
