import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import {
  Shield, Cpu, Lock, Activity, ArrowRight, CheckCircle,
  AlertTriangle, TrendingUp, BarChart2, FileText, Users, Brain
} from "lucide-react";

const CATEGORIES = [
  { label: "Phishing",          color: "#ef4444", desc: "E-mails e links fraudulentos" },
  { label: "Malware",           color: "#a855f7", desc: "Vírus, ransomware, trojans" },
  { label: "Força Bruta",       color: "#f97316", desc: "Tentativas de login excessivas" },
  { label: "DDoS",              color: "#eab308", desc: "Negação de serviço distribuída" },
  { label: "Vazamento de Dados",color: "#06b6d4", desc: "Exposição de dados sensíveis" },
];

const FEATURES = [
  {
    icon: Cpu,
    title: "Classificação ML",
    desc: "TF-IDF + Naive Bayes classifica incidentes automaticamente em 5 categorias com 97% de acurácia em cross-validation e 78% no dataset de avaliação independente.",
    color: "#22c55e",
    badge: "DATASET: 2000 amostras",
  },
  {
    icon: Lock,
    title: "Segurança Robusta",
    desc: "Autenticação bcrypt (12 rounds), JWT HttpOnly, rate limiting, CORS, Helmet e proteção IDOR — todos os requisitos de segurança implementados e testados.",
    color: "#06b6d4",
    badge: "6 controles ativos",
  },
  {
    icon: Activity,
    title: "Análise de Risco",
    desc: "Score de risco automático por categoria, recomendações contextualizadas de segurança e dashboard de estatísticas em tempo real com gráficos interativos.",
    color: "#a855f7",
    badge: "4 níveis de risco",
  },
  {
    icon: FileText,
    title: "Relatórios PDF",
    desc: "Exportação de relatórios em PDF com filtros por categoria, risco e período. Disponível para usuários e administradores com layouts distintos.",
    color: "#f97316",
    badge: "Exportação CSV + PDF",
  },
  {
    icon: Users,
    title: "Controle de Acesso",
    desc: "Dois papéis: usuário (vê apenas seus incidentes) e administrador (visão global, reclassificação, gestão de usuários e categorias).",
    color: "#eab308",
    badge: "RBAC implementado",
  },
  {
    icon: Brain,
    title: "Painel Admin ML",
    desc: "Retreinamento do modelo com novos dados, avaliação independente com dataset de 100 amostras, métricas por categoria e download dos datasets.",
    color: "#ec4899",
    badge: "Eval: 78% acurácia",
  },
];

const SECURITY = [
  "Segredos via variáveis de ambiente",
  "Hash bcrypt (12 rounds)",
  "Cookie seguro (httpOnly, sameSite lax)",
  "Proteção IDOR (404 em vez de 403)",
  "Rate limiting (100/15min global)",
  "CORS + Helmet configurados",
  "Timing attack prevention",
  "572 testes automatizados",
];

const STATS = [
  { icon: AlertTriangle, label: "Categorias",  value: "5",   color: "cyan"   },
  { icon: Shield,        label: "Testes",       value: "572", color: "green"  },
  { icon: TrendingUp,    label: "Acurácia CV",  value: "97%", color: "yellow" },
  { icon: BarChart2,     label: "Acurácia Eval","value": "78%", color: "red" },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
  cyan:   { bg: "bg-cyan-500/10",    border: "border-cyan-500/20",    text: "text-cyan-400" },
  red:    { bg: "bg-red-500/10",     border: "border-red-500/20",     text: "text-red-400" },
  yellow: { bg: "bg-yellow-500/10",  border: "border-yellow-500/20",  text: "text-yellow-400" },
  green:  { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400" },
};

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  if (!loading && isAuthenticated) {
    window.location.href = "/dashboard";
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar — same as DashboardLayout header */}
      <header className="h-12 border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <span className="font-bold text-sm font-mono text-foreground">Incident Sec</span>
          <span className="text-xs text-muted-foreground font-mono hidden sm:inline">/ Security System</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-mono font-semibold hidden sm:inline">LIVE</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">

          {/* Hero section */}
          <div className="bg-card border border-border rounded-xl p-6 md:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-xs text-emerald-400 font-mono font-semibold tracking-wider">SISTEMA ATIVO · MODO SEGURO</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground font-mono leading-tight mb-3">
                  Sistema de Gerenciamento de<br />
                  <span className="text-primary">Incidentes de Segurança</span>
                </h1>
                <p className="text-sm text-muted-foreground max-w-lg leading-relaxed mb-5">
                  Plataforma SOC com classificação automática por Machine Learning (TF-IDF + Naive Bayes),
                  controle de acesso individual, análise de risco em tempo real e exportação de relatórios PDF.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => navigate("/login")}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-mono font-semibold text-sm hover:bg-primary/90 transition-colors"
                  >
                    <Lock className="w-4 h-4" /> Acessar Sistema <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate("/register")}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-muted/50 border border-border text-foreground font-mono font-semibold text-sm hover:bg-muted transition-colors"
                  >
                    Criar Conta
                  </button>
                </div>
              </div>
              {/* Mini stat cards on the right */}
              <div className="grid grid-cols-2 gap-3 lg:w-72 shrink-0">
                {STATS.map(({ icon: Icon, label, value, color }) => {
                  const c = COLOR_MAP[color];
                  return (
                    <div key={label} className="bg-background border border-border rounded-xl p-4 flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1">{label}</p>
                        <p className="text-2xl font-bold text-foreground font-mono">{value}</p>
                      </div>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.bg} border ${c.border}`}>
                        <Icon className={`w-4 h-4 ${c.text}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Feature grid */}
          <div>
            <h2 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-3">Funcionalidades</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map(({ icon: Icon, title, desc, color, badge }) => (
                <div key={title} className="bg-card border border-border rounded-xl p-4 hover:border-border/80 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18`, border: `1px solid ${color}35` }}>
                        <Icon className="w-4 h-4" style={{ color }} />
                      </div>
                      <span className="font-semibold text-sm text-foreground font-mono">{title}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{desc}</p>
                  <span className="inline-block text-xs font-mono px-2 py-0.5 rounded" style={{ color, background: `${color}14`, border: `1px solid ${color}30` }}>
                    {badge}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Categories + Security checklist */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Categories */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-4">Categorias de Ameaça Detectadas</p>
              <div className="space-y-3">
                {CATEGORIES.map(({ label, color, desc }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-mono font-semibold text-foreground">{label}</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded shrink-0" style={{ color, background: `${color}14`, border: `1px solid ${color}30` }}>
                          ativo
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Security checklist */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-4">Requisitos de Segurança Implementados</p>
              <div className="grid grid-cols-1 gap-2.5">
                {SECURITY.map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-sm text-muted-foreground font-mono">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ML Methodology banner */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                  <Brain className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-mono font-semibold text-foreground">Metodologia ML Científica</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Separação rigorosa entre dataset de treino e avaliação</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 sm:ml-auto">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-xs font-mono text-blue-400 font-semibold">TREINO: 2.000 amostras</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs font-mono text-emerald-400 font-semibold">AVALIAÇÃO: 100 amostras</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <span className="w-2 h-2 rounded-full bg-violet-400" />
                  <span className="text-xs font-mono text-violet-400 font-semibold">Modelo: TF-IDF + Naive Bayes</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-4 md:px-6 py-3 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground font-mono">
            React · tRPC · Drizzle · MySQL · bcryptjs · TF-IDF · Naive Bayes · Flask
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-xs text-emerald-400 font-mono">Sistema operacional</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
