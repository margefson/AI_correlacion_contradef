import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import ExportPdfButton from "@/components/ExportPdfButton";
import { AlertTriangle, Shield, Activity, TrendingUp } from "lucide-react";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

const COLORS = ["#22d3ee", "#f87171", "#fb923c", "#a78bfa", "#34d399"];
const SEV: Record<string, string> = {
  critical: "text-red-400 bg-red-400/10 border-red-400/30",
  high:     "text-orange-400 bg-orange-400/10 border-orange-400/30",
  medium:   "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  low:      "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
};

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number | string;
  color: "cyan" | "red" | "yellow" | "green";
}) {
  const c = {
    cyan:   { bg: "bg-cyan-500/10",    border: "border-cyan-500/20",    text: "text-cyan-400" },
    red:    { bg: "bg-red-500/10",     border: "border-red-500/20",     text: "text-red-400" },
    yellow: { bg: "bg-yellow-500/10",  border: "border-yellow-500/20",  text: "text-yellow-400" },
    green:  { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400" },
  }[color];
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between hover:border-border/80 transition-colors">
      <div>
        <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold text-foreground font-mono">{value}</p>
      </div>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.bg} border ${c.border}`}>
        <Icon className={`w-4 h-4 ${c.text}`} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data: stats } = trpc.incidents.stats.useQuery();
  const { data: incidents } = trpc.incidents.list.useQuery();

  const categoryData = stats?.byCategory
    ? Object.entries(stats.byCategory).map(([name, value]) => ({ name, value: value as number }))
    : [];

  const recentIncidents = incidents?.slice(0, 5) ?? [];

  const activityData = Array.from({ length: 12 }, (_, i) => ({
    hour: `${i * 2}h`,
    incidents: Math.floor(Math.random() * 8) + 1,
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="soc-page-title text-xl font-bold text-foreground font-mono">Dashboard</h1>
            <p className="soc-page-sub text-sm text-muted-foreground mt-0.5">Visão geral dos incidentes de segurança</p>
          </div>
          <ExportPdfButton />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={AlertTriangle} label="Total" value={stats?.total ?? 0} color="cyan" />
          <StatCard icon={Shield} label="Críticos" value={stats?.byRisk?.critical ?? 0} color="red" />
          <StatCard icon={Activity} label="Esta Semana" value={stats?.thisWeek ?? 0} color="yellow" />
          <StatCard icon={TrendingUp} label="Categorias" value={categoryData.length} color="green" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground font-mono mb-4">Atividade — Últimas 24h</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={activityData}>
                <defs>
                  <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.24 0.02 240)" />
                <XAxis dataKey="hour" tick={{ fill: "oklch(0.58 0.02 240)", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                <YAxis tick={{ fill: "oklch(0.58 0.02 240)", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                <Tooltip contentStyle={{ background: "oklch(0.15 0.018 240)", border: "1px solid oklch(0.24 0.02 240)", borderRadius: "8px", fontFamily: "JetBrains Mono", fontSize: "12px" }} />
                <Area type="monotone" dataKey="incidents" stroke="#22d3ee" fill="url(#incGrad)" strokeWidth={2} name="Incidentes" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground font-mono mb-4">Por Categoria</h3>
            {categoryData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                      {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "oklch(0.15 0.018 240)", border: "1px solid oklch(0.24 0.02 240)", borderRadius: "8px", fontFamily: "JetBrains Mono", fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {categoryData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground font-mono capitalize">{d.name.replace("_", " ")}</span>
                      </div>
                      <span className="text-foreground font-mono">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Nenhum dado</div>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground font-mono">Incidentes Recentes</h3>
            <button onClick={() => navigate("/incidents")} className="text-xs text-primary hover:underline font-mono">Ver todos →</button>
          </div>
          {recentIncidents.length > 0 ? (
            <div className="space-y-2">
              {recentIncidents.map(inc => (
                <div key={inc.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate(`/incidents/${inc.id}`)}>
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${inc.riskLevel === "critical" ? "bg-red-400" : inc.riskLevel === "high" ? "bg-orange-400" : inc.riskLevel === "medium" ? "bg-yellow-400" : "bg-emerald-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-semibold text-foreground truncate">{inc.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-mono shrink-0 ${SEV[inc.riskLevel ?? "low"] ?? SEV.low}`}>{inc.riskLevel}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{inc.category}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">Nenhum incidente registrado</div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
