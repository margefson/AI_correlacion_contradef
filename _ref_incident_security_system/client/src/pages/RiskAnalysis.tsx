import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Shield, AlertTriangle, TrendingUp, Activity, CheckCircle, Info } from "lucide-react";

// RISK_CONFIG: maps risk levels to display properties (used by design system tests)
const RISK_CONFIG: Record<string, { label: string; color: string; badge: string }> = {
  critical: { label: "Crítico",  color: "#f87171", badge: "text-red-400 bg-red-400/10 border-red-400/30" },
  high:     { label: "Alto",     color: "#fb923c", badge: "text-orange-400 bg-orange-400/10 border-orange-400/30" },
  medium:   { label: "Médio",    color: "#fbbf24", badge: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" },
  low:      { label: "Baixo",    color: "#34d399", badge: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" },
};

const RISK_COLORS: Record<string, string> = {
  critical: "#f87171",
  high:     "#fb923c",
  medium:   "#fbbf24",
  low:      "#34d399",
};

const RISK_BADGE: Record<string, string> = {
  critical: "text-red-400 bg-red-400/10 border-red-400/30",
  high:     "text-orange-400 bg-orange-400/10 border-orange-400/30",
  medium:   "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  low:      "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
};

const PRIORITY_ICON: Record<string, React.ReactNode> = {
  critical: <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />,
  high:     <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-orange-400" />,
  medium:   <Info className="w-4 h-4 mt-0.5 shrink-0 text-yellow-400" />,
  low:      <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />,
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Crítico",
  high:     "Alto",
  medium:   "Médio",
  low:      "Baixo",
};

import React from "react";

export default function RiskAnalysis() {
  const { data: stats } = trpc.incidents.stats.useQuery();

  const riskData = stats?.byRisk
    ? Object.entries(stats.byRisk).map(([name, value]) => ({ name, value: value as number }))
    : [];

  const criticalCount = stats?.byRisk?.critical ?? 0;
  const highCount = stats?.byRisk?.high ?? 0;
  const totalCount = stats?.total ?? 0;
  const riskScore = totalCount > 0
    ? Math.round(((criticalCount * 4 + highCount * 3) / (totalCount * 4)) * 100)
    : 0;

  // Recomendações contextualizadas por categoria (seção 7.5)
  const contextualRecs = stats?.recommendations ?? [];

  // Fallback: recomendações genéricas por nível de risco quando não há categorias reconhecidas
  const genericRecs: { level: string; text: string }[] = [];
  if (contextualRecs.length === 0) {
    if (criticalCount > 0) genericRecs.push({ level: "critical", text: `${criticalCount} incidente(s) crítico(s) requerem atenção imediata.` });
    if (highCount > 0) genericRecs.push({ level: "high", text: `${highCount} incidente(s) de alto risco devem ser investigados.` });
    if (genericRecs.length === 0) genericRecs.push({ level: "low", text: "Nenhum incidente crítico ou de alto risco no momento. Continue monitorando." });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground font-mono soc-page-title">Análise de Risco</h1>
          <p className="text-sm text-muted-foreground mt-0.5 soc-page-sub">Visão consolidada dos níveis de risco e recomendações de segurança</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Score de Risco", value: `${riskScore}%`, icon: TrendingUp, color: riskScore > 60 ? "text-red-400" : riskScore > 30 ? "text-yellow-400" : "text-emerald-400" },
            { label: "Críticos", value: criticalCount, icon: AlertTriangle, color: "text-red-400" },
            { label: "Alto Risco", value: highCount, icon: Shield, color: "text-orange-400" },
            { label: "Total", value: totalCount, icon: Activity, color: "text-cyan-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="soc-card bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{label}</p>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Risk Distribution Chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground font-mono mb-4">Distribuição por Nível de Risco</h3>
          {riskData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={riskData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.24 0.02 240)" />
                <XAxis dataKey="name" tick={{ fill: "oklch(0.58 0.02 240)", fontSize: 11, fontFamily: "JetBrains Mono" }} />
                <YAxis tick={{ fill: "oklch(0.58 0.02 240)", fontSize: 11, fontFamily: "JetBrains Mono" }} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.15 0.018 240)",
                    border: "1px solid oklch(0.24 0.02 240)",
                    borderRadius: "8px",
                    fontFamily: "JetBrains Mono",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {riskData.map((entry, i) => (
                    <Cell key={i} fill={RISK_COLORS[entry.name] ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Nenhum dado disponível
            </div>
          )}
        </div>

        {/* Contextualized Security Recommendations (Section 7.5) */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground font-mono">Recomendações de Segurança</h3>
            {contextualRecs.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary font-mono">
                {contextualRecs.length} ativa{contextualRecs.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {contextualRecs.length > 0 ? (
            <div className="space-y-4" data-testid="security-recommendations">
              {contextualRecs.map((rec: {
                category: string;
                count: number;
                title: string;
                description: string;
                priority: string;
                action: string;
              }, i: number) => (
                <div
                  key={i}
                  className={`rounded-lg border p-4 space-y-2 ${RISK_BADGE[rec.priority] ?? RISK_BADGE.low}`}
                  data-category={rec.category}
                  data-priority={rec.priority}
                >
                  <div className="flex items-start gap-3">
                    {PRIORITY_ICON[rec.priority] ?? PRIORITY_ICON.low}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-semibold font-mono">{rec.title}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full border font-mono capitalize">
                          {PRIORITY_LABEL[rec.priority] ?? rec.priority}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted/30 border border-border text-muted-foreground font-mono">
                          {rec.count} incidente{rec.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <p className="text-sm opacity-90">{rec.description}</p>
                      <div className="mt-2 pt-2 border-t border-current/20">
                        <p className="text-xs font-mono opacity-75">
                          <span className="font-semibold">Ação recomendada:</span> {rec.action}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {genericRecs.map((rec, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${RISK_BADGE[rec.level] ?? RISK_BADGE.low}`}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-sm">{rec.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
