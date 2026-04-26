import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { ShieldAlert, Tag, Users, Brain, FileText } from "lucide-react";
import ExportPdfWithFilters from "@/components/ExportPdfWithFilters";
import { trpc } from "@/lib/trpc";

export default function Admin() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const statsQuery = trpc.admin.stats.useQuery(undefined, { enabled: user?.role === "admin" });

  if (user?.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-mono">Acesso restrito a administradores.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const cards = [
    { icon: Tag,   label: "Categorias",      desc: "Gerenciar categorias de incidentes", path: "/admin/categories", color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20" },
    { icon: Users, label: "Usuários",         desc: "Gerenciar usuários do sistema",      path: "/admin/users",      color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
    { icon: Brain, label: "Machine Learning", desc: "Métricas e retreinamento do modelo", path: "/admin/ml",         color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  ];

  const stats = statsQuery.data;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="soc-page-title">Painel Administrativo</h1>
          <p className="soc-page-sub">Gerenciamento do sistema</p>
        </div>

        {/* Stats rápidas */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Incidentes", value: stats.totalIncidents ?? 0, color: "text-primary" },
              { label: "Usuários",         value: stats.totalUsers ?? 0,     color: "text-purple-400" },
              { label: "Críticos",    value: stats.byRisk.find(r => r.riskLevel === "critical")?.count ?? 0, color: "text-red-400" },
              { label: "Categorias",  value: stats.byCategory.length, color: "text-emerald-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs font-mono text-muted-foreground mb-1">{label}</p>
                <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Cards de navegação */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map(({ icon: Icon, label, desc, path, color }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="bg-card border border-border rounded-xl p-5 text-left hover:border-border/80 hover:bg-muted/20 transition-all group"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center border mb-4 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-foreground font-mono text-sm mb-1">{label}</h3>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </button>
          ))}
        </div>

        {/* Relatório Consolidado */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground font-mono text-sm">Relatório Consolidado</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Exportar PDF com todos os incidentes do sistema (
                {stats ? `${stats.totalIncidents ?? 0} incidentes` : "carregando..."}).
                Inclui dados de usuário, categoria, risco e confiança.
              </p>
            </div>
            <ExportPdfWithFilters
              adminMode={true}
              buttonLabel="Exportar PDF com Filtros"
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
