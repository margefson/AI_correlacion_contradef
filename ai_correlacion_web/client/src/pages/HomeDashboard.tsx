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
import { Activity, AlertCircle, FileSearch, Link as LinkIcon, ShieldCheck, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type StatusFilter = "all" | "queued" | "running" | "completed" | "failed" | "cancelled";

const STATUS_PIE_COLORS: Record<string, string> = {
  queued: "#94a3b8",
  running: "#22d3ee",
  completed: "#34d399",
  failed: "#f87171",
  cancelled: "#a78bfa",
};

const CHART_TOOLTIP_STYLE = { backgroundColor: "oklch(0.2 0.02 255 / 0.95)", border: "1px solid oklch(0.35 0.02 255 / 0.5)" };

function formatShortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export default function HomeDashboard() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sampleFilter, setSampleFilter] = useState("");

  const statsQuery = trpc.analysis.dashboardStats.useQuery(undefined, {
    refetchInterval: 15_000,
  });

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

  const s = statsQuery.data;
  const by = s?.byStatus;

  const pieData = useMemo(() => {
    if (!by) return [];
    return (Object.keys(by) as Array<keyof typeof by>)
      .map(name => ({ name, value: by[name] }))
      .filter(d => d.value > 0);
  }, [by]);

  const lineData = useMemo(
    () =>
      (s?.createdLast7Days ?? []).map(d => ({
        ...d,
        label: formatShortDate(d.date),
      })),
    [s?.createdLast7Days],
  );

  const listProgressAvg = useMemo(() => {
    const jobs = jobsQuery.data ?? [];
    return jobs.length
      ? Math.round(jobs.reduce((sum, job) => sum + (job.progress ?? 0), 0) / jobs.length)
      : 0;
  }, [jobsQuery.data]);

  const listRunning = useMemo(() => {
    const jobs = jobsQuery.data ?? [];
    return jobs.filter(j => j.status === "running" || j.status === "queued").length;
  }, [jobsQuery.data]);

  return (
    <DashboardLayout>
      <div className="w-full min-w-0 space-y-6 text-foreground">
        <section className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Visão geral dos lotes de análise e dos logs processados no Contradef. Os totais e gráficos seguem o seu
            âmbito: todos os lotes se for administrador; caso contrário, só os que submeteu.
          </p>
        </section>

        <section>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={FileSearch}
              label="Total de lotes"
              value={s != null ? String(s.totalJobs) : "—"}
              helper="Análises registadas na base"
            />
            <MetricCard
              icon={ShieldCheck}
              label="Concluídos"
              value={by != null ? String(by.completed) : "—"}
              helper="Com resultado disponível"
            />
            <MetricCard
              icon={Activity}
              label="Em curso / fila"
              value={by != null ? String((by.running ?? 0) + (by.queued ?? 0)) : "—"}
              helper="Running + aguardam processamento"
            />
            <MetricCard
              icon={by != null && by.failed > 0 ? AlertCircle : TrendingUp}
              label="Falhas"
              value={by != null ? String(by.failed) : "—"}
              helper="Jobs terminados com erro"
            />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3 min-w-0">
          <Card className="min-w-0 border-border/60 bg-card/90 shadow-lg dark:border-white/10 dark:bg-slate-950/60 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Lotes criados — últimos 7 dias</CardTitle>
              <CardDescription>Volume de novas análises por dia (data de criação do lote).</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px] min-w-0 pl-0">
              {lineData.length && lineData.some(d => d.count > 0) ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={lineData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorLotes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: "hsl(var(--foreground))" }} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Lotes"
                      stroke="#22d3ee"
                      strokeWidth={2}
                      fill="url(#colorLotes)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sem dados no período — envie análises para ver a tendência.
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="min-w-0 border-border/60 bg-card/90 shadow-lg dark:border-white/10 dark:bg-slate-950/60">
            <CardHeader>
              <CardTitle className="text-base">Por estado</CardTitle>
              <CardDescription>Distribuição dos lotes (totais agregados).</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px] min-w-0">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {pieData.map((e, i) => (
                        <Cell key={e.name} fill={STATUS_PIE_COLORS[e.name] ?? `hsl(${(i * 50) % 360} 60% 55%)`} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      formatter={value => <span className="text-xs capitalize text-foreground/90">{String(value)}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Nenhum dado</div>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-border bg-card text-card-foreground shadow-md dark:border-white/10 dark:bg-slate-950/80 dark:shadow-2xl dark:shadow-cyan-950/20">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-cyan-500/35 bg-cyan-500/15 text-cyan-800 dark:border-cyan-400/25 dark:bg-cyan-500/10 dark:text-cyan-300">
                  Plataforma
                </Badge>
              </div>
              <CardTitle className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Redução, interpretação e acompanhamento de logs (Contradef)
              </CardTitle>
              <CardDescription className="text-base leading-7 text-muted-foreground">
                Envie os logs, reduza o volume por heurística e acompanhe o fluxo em timeline ou grafo. Na fila abaixo,{" "}
                <span className="font-medium text-foreground/90">Interpretação</span> abre a página com o{" "}
                <span className="font-medium text-foreground/90">ID do lote</span> (
                <code className="rounded bg-muted px-1 py-0.5 text-sm">/interpretacao-consolidada?job=…</code>).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                icon={FileSearch}
                label="Nesta lista (máx. 50)"
                value={String((jobsQuery.data ?? []).length)}
                helper="Com os filtros actuais"
              />
              <MetricCard
                icon={Activity}
                label="Fila + running (lista)"
                value={String(listRunning)}
                helper="Nesta vista filtrada"
              />
              <MetricCard
                icon={ShieldCheck}
                label="Concluídos (lista)"
                value={String((jobsQuery.data ?? []).filter(j => j.status === "completed").length)}
                helper="Subconjunto exibido"
              />
              <MetricCard
                icon={AlertCircle}
                label="Progresso médio (lista)"
                value={`${listProgressAvg}%`}
                helper="Média dos itens listados"
              />
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="min-w-0 border-border bg-card text-card-foreground shadow-md dark:border-white/10 dark:bg-slate-950/80 dark:shadow-xl dark:shadow-slate-950/30">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Incidentes recentes — fila e histórico</CardTitle>
                  <CardDescription className="mt-1">Lotes de análise (logs Contradef)</CardDescription>
                </div>
                <Badge className={jobStatusBadgeClass(statusFilter === "all" ? undefined : statusFilter)}>{statusFilter === "all" ? "Todos" : statusFilter}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr,180px]">
                <Input
                  placeholder="Filtrar por nome da amostra"
                  value={sampleFilter}
                  onChange={event => setSampleFilter(event.target.value)}
                  className="border-border bg-background dark:bg-slate-950/80"
                />
                <Select value={statusFilter} onValueChange={value => setStatusFilter(value as StatusFilter)}>
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
              <ScrollArea className="h-[520px] pr-4">
                <div className="space-y-3">
                  {(jobsQuery.data ?? []).map(job => {
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
                      Nenhuma análise na lista. Ajuste os filtros ou submeta um lote em &quot;Reduzir logs&quot;.
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
