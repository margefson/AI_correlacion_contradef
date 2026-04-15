/* @vitest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  jobs: [] as Array<Record<string, any>>,
  details: {} as Record<string, any>,
  authUserRole: "admin" as "admin" | "user",
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

vi.mock("@/lib/analysisUpload", () => ({
  MAX_ARCHIVE_BYTES: 64 * 1024 * 1024,
  GATEWAY_SINGLE_REQUEST_MAX_BYTES: 30 * 1024 * 1024,
  MAX_BATCH_UPLOAD_FILES: 10,
  inspectAnalysisArchive: (file: File) => mockState.inspectAnalysisArchive(file),
  uploadAnalysisArchiveBatch: (input: unknown, options: unknown) => mockState.uploadAnalysisArchiveBatch(input, options),
}));

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

import Home from "./Home";

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

  it("renderiza o histórico e atualiza o painel ao selecionar um job diferente", async () => {
    render(<Home />);

    expect(screen.getAllByText("Full-Execution-Sample-1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Live-Sample-2").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("Live-Sample-2")[0]!);

    await waitFor(() => {
      expect(screen.getAllByText("CreateRemoteThread").length).toBeGreaterThan(0);
      expect(screen.getByText(/stdout running/i)).toBeTruthy();
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
      expect(screen.getByText(/recompacte antes do envio/i)).toBeTruthy();
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

  it("expõe exportações explícitas e links publicados no painel de detalhes", () => {
    render(<Home />);

    expect(screen.getAllByText(/Exportar JSON/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Exportar Markdown/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Exportar DOCX/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/outputs\/correlation\.json/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/outputs\/summary\.md/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/outputs\/report\.docx/i).length).toBeGreaterThan(0);
  });
});
