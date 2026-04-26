import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  BarChart3,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  phishing: "Phishing",
  malware: "Malware",
  brute_force: "Força Bruta",
  ddos: "DDoS",
  vazamento_de_dados: "Vazamento",
  unknown: "Desconhecido",
};

const CATEGORY_COLORS: Record<string, string> = {
  phishing: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  malware: "bg-red-500/20 text-red-400 border-red-500/30",
  brute_force: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  ddos: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  vazamento_de_dados: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  unknown: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-green-500/20 text-green-400 border-green-500/30",
};

const RISK_LABELS: Record<string, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};

export default function AnalystDashboard() {
  const { data: metrics, isLoading, refetch } = trpc.incidents.analystDashboard.useQuery(undefined, {
    refetchInterval: 30000, // atualiza a cada 30s
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted/30 rounded animate-pulse w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted/30 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const categoryEntries = Object.entries(metrics?.categoryDistribution ?? {}).sort((a, b) => b[1] - a[1]);
  const riskEntries = Object.entries(metrics?.riskDistribution ?? {}).sort((a, b) => b[1] - a[1]);
  const maxCategoryCount = Math.max(...categoryEntries.map(([, v]) => v), 1);
  const maxRiskCount = Math.max(...riskEntries.map(([, v]) => v), 1);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-cyan-400" />
            Dashboard do Analista
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visão geral dos incidentes de segurança em tempo real
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Link href="/analyst/incidents">
            <Button size="sm" className="gap-2 bg-cyan-600 hover:bg-cyan-700">
              Ver Incidentes
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Em Andamento</p>
                <p className="text-3xl font-bold text-yellow-400 mt-1">{metrics?.inProgress ?? 0}</p>
              </div>
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Activity className="h-5 w-5 text-yellow-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">incidentes ativos</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Resolvidos Hoje</p>
                <p className="text-3xl font-bold text-green-400 mt-1">{metrics?.resolvedToday ?? 0}</p>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">concluídos hoje</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Aguardando</p>
                <p className="text-3xl font-bold text-blue-400 mt-1">{metrics?.totalOpen ?? 0}</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10">
                <AlertTriangle className="h-5 w-5 text-blue-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">incidentes abertos</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Tempo Médio</p>
                <p className="text-3xl font-bold text-cyan-400 mt-1">
                  {metrics?.avgResolutionHours ?? 0}
                  <span className="text-base font-normal text-muted-foreground ml-1">h</span>
                </p>
              </div>
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <Clock className="h-5 w-5 text-cyan-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">resolução média</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Distribuição por Categoria (Em Andamento) */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-cyan-400" />
              Categorias em Andamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoryEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhum incidente em andamento
              </div>
            ) : (
              <div className="space-y-3">
                {categoryEntries.map(([cat, count]) => (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <Badge
                        variant="outline"
                        className={`text-xs ${CATEGORY_COLORS[cat] ?? "bg-muted/20 text-muted-foreground"}`}
                      >
                        {CATEGORY_LABELS[cat] ?? cat}
                      </Badge>
                      <span className="text-muted-foreground font-mono">{count}</span>
                    </div>
                    <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500/70 rounded-full transition-all"
                        style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Distribuição por Risco (Abertos) */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              Risco dos Incidentes Abertos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riskEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhum incidente aberto
              </div>
            ) : (
              <div className="space-y-3">
                {riskEntries.map(([risk, count]) => (
                  <div key={risk} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <Badge
                        variant="outline"
                        className={`text-xs ${RISK_COLORS[risk] ?? "bg-muted/20 text-muted-foreground"}`}
                      >
                        {RISK_LABELS[risk] ?? risk}
                      </Badge>
                      <span className="text-muted-foreground font-mono">{count}</span>
                    </div>
                    <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-orange-500/70 rounded-full transition-all"
                        style={{ width: `${(count / maxRiskCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <Card className="border-border/50 bg-card/50">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-muted-foreground">Total de incidentes:</span>
              <span className="font-semibold text-foreground">{metrics?.total ?? 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-muted-foreground">Total resolvidos:</span>
              <span className="font-semibold text-foreground">{metrics?.totalResolved ?? 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-400" />
              <span className="text-muted-foreground">Em andamento:</span>
              <span className="font-semibold text-foreground">{metrics?.inProgress ?? 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-muted-foreground">Abertos:</span>
              <span className="font-semibold text-foreground">{metrics?.totalOpen ?? 0}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
