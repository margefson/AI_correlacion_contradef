import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import { Clock, TrendingUp, RotateCcw, CheckCircle, Download, FileText } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  phishing: "Phishing",
  malware: "Malware",
  brute_force: "Força Bruta",
  ddos: "DDoS",
  vazamento_de_dados: "Vazamento",
  unknown: "Desconhecido",
};

const CATEGORY_COLORS: Record<string, string> = {
  phishing: "#ef4444",
  malware: "#a855f7",
  brute_force: "#f97316",
  ddos: "#eab308",
  vazamento_de_dados: "#06b6d4",
  unknown: "#6b7280",
};

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
  color: "cyan" | "green" | "orange" | "red";
}) {
  const c = {
    cyan:   { bg: "bg-cyan-500/10",    border: "border-cyan-500/20",    text: "text-cyan-400" },
    green:  { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400" },
    orange: { bg: "bg-orange-500/10",  border: "border-orange-500/20",  text: "text-orange-400" },
    red:    { bg: "bg-red-500/10",     border: "border-red-500/20",     text: "text-red-400" },
  }[color];
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between">
      <div>
        <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold text-foreground font-mono">{value}</p>
        {sub && <p className="text-xs text-muted-foreground font-mono mt-0.5">{sub}</p>}
      </div>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.bg} border ${c.border}`}>
        <Icon className={`w-4 h-4 ${c.text}`} />
      </div>
    </div>
  );
}

export default function ResolutionMetrics() {
  const { data: metrics, isLoading } = trpc.analytics.resolutionMetrics.useQuery();
  const { data: csvData, isLoading: csvLoading } = trpc.analytics.exportHistoryCsv.useQuery();

  const handleDownloadCsv = () => {
    if (!csvData?.csv) return;
    const blob = new Blob(["\uFEFF" + csvData.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvData.filename ?? "historico_incidentes.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const avgData = (metrics?.avgByCategory ?? []).map((r) => ({
    name: CATEGORY_LABELS[r.category] ?? r.category,
    horas: Math.round(r.avgHours * 10) / 10,
    count: r.count,
    color: CATEGORY_COLORS[r.category] ?? "#6b7280",
  }));

  const trendData = (metrics?.monthlyTrend ?? []).map((r) => ({
    mes: r.month,
    total: r.total,
    resolvidos: r.resolved,
    taxa: r.total > 0 ? Math.round((r.resolved / r.total) * 100) : 0,
  }));

  const totalResolved = metrics?.totalResolved ?? 0;
  const reopenedCount = metrics?.reopenedCount ?? 0;
  const reopenRate = totalResolved > 0 ? ((reopenedCount / totalResolved) * 100).toFixed(1) : "0.0";
  const avgAll = avgData.length > 0
    ? (avgData.reduce((s, r) => s + r.horas, 0) / avgData.length).toFixed(1)
    : "—";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground font-mono">Métricas de Resolução</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Tempo médio, tendências mensais e taxa de reabertura</p>
          </div>
          <button
            onClick={handleDownloadCsv}
            disabled={csvLoading || !csvData?.csv}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-foreground text-sm font-mono font-semibold hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {csvLoading ? "Gerando..." : "Exportar Histórico CSV"}
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Clock}       label="Tempo Médio"   value={avgAll === "—" ? "—" : `${avgAll}h`}    sub="média geral"           color="cyan"   />
          <StatCard icon={CheckCircle} label="Resolvidos"    value={totalResolved}                           sub="total histórico"        color="green"  />
          <StatCard icon={RotateCcw}   label="Reabertos"     value={reopenedCount}                           sub={`${reopenRate}% dos resolvidos`} color="orange" />
          <StatCard icon={TrendingUp}  label="Categorias"    value={avgData.length}                          sub="com dados de resolução" color="red"    />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Avg resolution time by category */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground font-mono">Tempo Médio de Resolução por Categoria</h3>
            </div>
            {isLoading ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
            ) : avgData.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
                <Clock className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm font-mono">Nenhum incidente resolvido ainda</p>
                <p className="text-xs mt-1">Resolva incidentes para ver métricas de tempo</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={avgData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.24 0.02 240)" />
                  <XAxis dataKey="name" tick={{ fill: "oklch(0.58 0.02 240)", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                  <YAxis tick={{ fill: "oklch(0.58 0.02 240)", fontSize: 10, fontFamily: "JetBrains Mono" }} unit="h" />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.15 0.018 240)", border: "1px solid oklch(0.24 0.02 240)", borderRadius: "8px", fontFamily: "JetBrains Mono", fontSize: "11px" }}
                    formatter={(v: number) => [`${v}h`, "Tempo médio"]}
                  />
                  <Bar dataKey="horas" fill="#22d3ee" radius={[4, 4, 0, 0]} name="Horas" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Monthly trend */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground font-mono">Tendência Mensal — Últimos 6 Meses</h3>
            </div>
            {isLoading ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
            ) : trendData.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
                <TrendingUp className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm font-mono">Nenhum dado mensal disponível</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.24 0.02 240)" />
                  <XAxis dataKey="mes" tick={{ fill: "oklch(0.58 0.02 240)", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                  <YAxis tick={{ fill: "oklch(0.58 0.02 240)", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.15 0.018 240)", border: "1px solid oklch(0.24 0.02 240)", borderRadius: "8px", fontFamily: "JetBrains Mono", fontSize: "11px" }}
                  />
                  <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: "11px" }} />
                  <Line type="monotone" dataKey="total" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} name="Total" />
                  <Line type="monotone" dataKey="resolvidos" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} name="Resolvidos" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Category breakdown table */}
        {avgData.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground font-mono">Detalhamento por Categoria</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-muted-foreground py-2 pr-4 font-medium">Categoria</th>
                    <th className="text-right text-muted-foreground py-2 pr-4 font-medium">Incidentes Resolvidos</th>
                    <th className="text-right text-muted-foreground py-2 pr-4 font-medium">Tempo Médio</th>
                    <th className="text-left text-muted-foreground py-2 font-medium">Barra</th>
                  </tr>
                </thead>
                <tbody>
                  {avgData.map((row) => {
                    const maxHours = Math.max(...avgData.map((r) => r.horas), 1);
                    const pct = Math.round((row.horas / maxHours) * 100);
                    return (
                      <tr key={row.name} className="border-b border-border/50">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                            <span className="text-foreground">{row.name}</span>
                          </div>
                        </td>
                        <td className="text-right py-2.5 pr-4 text-muted-foreground">{row.count}</td>
                        <td className="text-right py-2.5 pr-4 text-foreground font-semibold">{row.horas}h</td>
                        <td className="py-2.5">
                          <div className="w-full bg-muted/30 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: row.color }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CSV export info */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-mono font-semibold text-foreground">Exportação do Histórico Completo</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                O arquivo CSV inclui todas as alterações de status, reclassificações e atualizações de notas,
                com informações de quem realizou cada mudança, quando e de qual valor para qual.
                Ideal para auditorias e conformidade com políticas de segurança.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {["ID Histórico", "ID Incidente", "Título", "Categoria", "Ação", "Valor Anterior", "Novo Valor", "Alterado Por", "Data/Hora"].map((col) => (
                  <span key={col} className="text-xs font-mono px-2 py-0.5 rounded bg-muted/30 border border-border text-muted-foreground">{col}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
