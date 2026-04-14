// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  jobs: [] as Array<Record<string, any>>,
  details: {} as Record<string, any>,
  submitMutateAsync: vi.fn(async () => ({ jobId: "job-1" })),
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
      submit: {
        useMutation: () => ({
          mutateAsync: mockState.submitMutateAsync,
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

    class MockFileReader {
      public result: string | ArrayBuffer | null = null;
      public onload: null | (() => void) = null;
      public onerror: null | (() => void) = null;

      readAsDataURL(file: File) {
        this.result = `data:application/x-7z-compressed;base64,${btoa(file.name)}`;
        this.onload?.();
      }
    }

    vi.stubGlobal("FileReader", MockFileReader as unknown as typeof FileReader);
  });

  it("submete um novo arquivo 7z com os parâmetros atuais do formulário", async () => {
    const user = userEvent.setup();
    render(<Home />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake-binary"], "sample.7z", { type: "application/x-7z-compressed" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await user.click(screen.getByRole("button", { name: /iniciar análise/i }));

    await waitFor(() => {
      expect(mockState.submitMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          archiveName: "sample.7z",
          focusFunction: "IsDebuggerPresent",
          focusTerms: ["IsDebuggerPresent", "VirtualProtect", "CreateRemoteThread"],
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
