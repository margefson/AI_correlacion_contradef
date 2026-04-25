import DashboardLayout from "@/components/DashboardLayout";
import { MetricCard } from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { jobStatusBadgeClass } from "@/lib/analysisUi";
import { formatDateTimeShort, formatPercentRounded } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Activity, FileSearch, Link as LinkIcon, Radar, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

type StatusFilter = "all" | "queued" | "running" | "completed" | "failed" | "cancelled";

export default function Home() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sampleFilter, setSampleFilter] = useState("");

  const jobsQuery = trpc.analysis.list.useQuery(
    {
      sampleName: sampleFilter.trim() || undefined,
      status: statusFilter === "all" ? undefined : [statusFilter],
      limit: 50,
    },
    {
      refetchInterval: 5000,
    },
  );

  const dashboardMetrics = useMemo(() => {
    const jobs = jobsQuery.data ?? [];
    const completed = jobs.filter((job) => job.status === "completed").length;
    const running = jobs.filter((job) => job.status === "running").length;
    const failed = jobs.filter((job) => job.status === "failed").length;
    const progressAverage = jobs.length
      ? Math.round(jobs.reduce((sum, job) => sum + (job.progress ?? 0), 0) / jobs.length)
      : 0;
    return { total: jobs.length, completed, running, failed, progressAverage };
  }, [jobsQuery.data]);

  return (
    <DashboardLayout>
      <div className="w-full min-w-0 space-y-6 text-foreground">
        <section>
          <Card className="border-border bg-card text-card-foreground shadow-md dark:border-white/10 dark:bg-slate-950/80 dark:shadow-2xl dark:shadow-cyan-950/20">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-cyan-500/35 bg-cyan-500/15 text-cyan-800 dark:border-cyan-400/25 dark:bg-cyan-500/10 dark:text-cyan-300">
                  Dashboard
                </Badge>
              </div>
              <CardTitle className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Plataforma web para redução, interpretação e acompanhamento de logs de malware evasivo
              </CardTitle>
              <CardDescription className="text-base leading-7 text-muted-foreground">
                Envie os logs do Contradef, reduza o volume por heurística, acompanhe o fluxo do malware em timeline ou grafo e receba um veredito interpretável com suporte de LLM. Na <span className="text-foreground/90">Fila e histórico</span> abaixo, o botão{" "}
                <span className="font-medium text-foreground/90">Interpretação</span> abre a página com o <span className="font-medium text-foreground/90">ID do lote (job)</span> na URL, para a análise corresponder a esse registo. Também pode abrir a página diretamente com{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-sm text-foreground/90 dark:bg-white/10">/interpretacao-consolidada?job=…</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={FileSearch} label="Análises registradas" value={String(dashboardMetrics.total)} helper="Histórico consultável pelo analista" />
              <MetricCard icon={Activity} label="Execuções em andamento" value={String(dashboardMetrics.running)} helper="Atualização automática do status" />
              <MetricCard icon={ShieldCheck} label="Concluídas" value={String(dashboardMetrics.completed)} helper="Jobs com veredito disponível" />
              <MetricCard icon={Radar} label="Progresso médio" value={`${dashboardMetrics.progressAverage}%`} helper={dashboardMetrics.failed ? `${dashboardMetrics.failed} falha(s) registradas` : "Sem falhas registradas"} />
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="min-w-0 border-border bg-card text-card-foreground shadow-md dark:border-white/10 dark:bg-slate-950/80 dark:shadow-xl dark:shadow-slate-950/30">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Fila e histórico</CardTitle>
                </div>
                <Badge className={jobStatusBadgeClass(statusFilter === "all" ? undefined : statusFilter)}>{statusFilter === "all" ? "Todos" : statusFilter}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr,180px]">
                <Input
                  placeholder="Filtrar por nome da amostra"
                  value={sampleFilter}
                  onChange={(event) => setSampleFilter(event.target.value)}
                  className="border-border bg-background dark:bg-slate-950/80"
                />
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  <SelectTrigger className="border-border bg-background dark:bg-slate-950/80">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ScrollArea className="h-[560px] pr-4">
                <div className="space-y-3">
                  {(jobsQuery.data ?? []).map((job) => {
                    return (
                      <div
                        key={job.jobId}
                        className="w-full rounded-2xl border border-border bg-muted/40 p-4 transition duration-200 dark:border-white/10 dark:bg-white/5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-semibold text-foreground">{job.sampleName}</p>
                            <p className="text-xs text-muted-foreground">{job.jobId}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                            <Badge className={jobStatusBadgeClass(job.status)}>{job.status}</Badge>
                            <Link
                              href={`/interpretacao-consolidada?job=${encodeURIComponent(job.jobId)}`}
                              title={`Interpretação consolidada — lote ${job.jobId}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-900 transition hover:bg-cyan-500/20 dark:border-cyan-400/35 dark:text-cyan-100"
                            >
                              <LinkIcon className="h-3.5 w-3.5" aria-hidden />
                              Interpretação
                            </Link>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{job.stage}</span>
                            <span>{formatPercentRounded(job.progress)}</span>
                          </div>
                          <Progress value={job.progress} className="h-1.5" />
                          <p className="text-sm text-muted-foreground">{job.message ?? "Sem mensagem adicional."}</p>
                          <p className="text-xs text-muted-foreground">Atualizado em {formatDateTimeShort(job.updatedAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                  {jobsQuery.data?.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/5">
                      Nenhuma análise foi registrada ainda. Faça upload dos logs para criar o primeiro caso.
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>
      </div>
    </DashboardLayout>
  );
}
