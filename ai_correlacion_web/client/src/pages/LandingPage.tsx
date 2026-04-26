import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { APP_NAME, appDocumentTitle } from "@/lib/brand";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  FileArchive,
  FileDown,
  LucideIcon,
  UserCog,
  Users,
  Zap,
} from "lucide-react";
import { useEffect } from "react";
import { Link } from "wouter";

function isLocalAuthMode() {
  const m = String(import.meta.env.VITE_AUTH_MODE ?? "")
    .trim()
    .toLowerCase();
  return m === "local" || m === "password";
}

function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent: "cyan" | "emerald" | "amber" | "violet";
}) {
  const accentRing =
    accent === "cyan"
      ? "border-cyan-500/25 bg-cyan-500/5"
      : accent === "emerald"
        ? "border-emerald-500/25 bg-emerald-500/5"
        : accent === "amber"
          ? "border-amber-500/25 bg-amber-500/5"
          : "border-violet-500/25 bg-violet-500/5";
  return (
    <div className={cn("rounded-2xl border p-4 backdrop-blur-sm", accentRing)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{hint}</p>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
  badge,
  badgeClass,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  badge: string;
  badgeClass: string;
}) {
  return (
    <Card className="border-border/60 bg-card/40 shadow-md backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/50">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="rounded-xl border border-[var(--auth-brand)]/30 bg-[var(--auth-brand)]/10 p-2.5">
            <Icon className="size-5 text-[var(--auth-brand)]" strokeWidth={1.75} />
          </div>
          <Badge variant="outline" className={cn("text-[10px] font-normal", badgeClass)}>
            {badge}
          </Badge>
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{desc}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const analysisTypes = [
  { name: "Logs de defesa / amostras", dot: "bg-cyan-400", status: "ativo" },
  { name: "Arquivos e lotes ZIP", dot: "bg-emerald-400", status: "ativo" },
  { name: "Correlação por função e termos", dot: "bg-amber-400", status: "ativo" },
  { name: "Redução heurística de volume", dot: "bg-violet-400", status: "ativo" },
  { name: "Artefatos e exportação local", dot: "bg-rose-400", status: "ativo" },
];

const securityItems = [
  "Sessões com cookie httpOnly (servidor)",
  "Palavra-passe com bcrypt (contas locais)",
  "API tRPC com contexto de utilizador",
  "Base PostgreSQL com Drizzle ORM",
  "Forçar troca de senha após redefinição (admin)",
];

export default function LandingPage() {
  const local = isLocalAuthMode();
  const loginHref = getLoginUrl();

  useEffect(() => {
    document.title = appDocumentTitle("Início");
  }, []);

  return (
    <div className="min-h-svh bg-[#030712] text-foreground">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,211,238,0.14),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_60%,rgba(59,130,246,0.06),transparent_45%)]"
        aria-hidden
      />

      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/favicon.svg" alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-xl" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight sm:text-base">{APP_NAME}</p>
              <p className="truncate text-[11px] text-muted-foreground sm:text-xs">Redução e análise de logs</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              LIVE
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <section className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-10">
          <div className="space-y-6">
            <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              SISTEMA ACTIVO — MODO SEGURO
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.35rem] lg:leading-[1.15]">
              Plataforma de análise e correlação de logs para a defesa
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Pipeline de{" "}
              <span className="text-slate-200">redução de logs</span>,{" "}
              <span className="text-slate-200">interpretação consolidada</span> e{" "}
              <span className="text-slate-200">investigação</span> em lote. Monitore estados, exporte artefatos e
              mantenha o controlo de acesso por perfil (utilizador / administrador).
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-[var(--auth-brand)] px-6 text-base font-semibold text-white shadow-lg shadow-cyan-950/40 hover:bg-[var(--auth-brand-hover)]"
              >
                <a href={loginHref}>
                  Acessar sistema
                  <ArrowRight className="ml-2 size-4" />
                </a>
              </Button>
              {local ? (
                <Button asChild size="lg" variant="outline" className="rounded-full border-white/15 bg-white/5 hover:bg-white/10">
                  <Link href="/register">Criar conta</Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <StatTile label="Pipeline" value="5 fases" hint="Do envio ao relatório" accent="cyan" />
            <StatTile label="Estados" value="5+ estados" hint="Fila, execução, conclusão…" accent="emerald" />
            <StatTile label="Redução" value="Heurística" hint="Volume alinhado ao foco" accent="amber" />
            <StatTile label="Acesso" value="RBAC" hint="Admin e utilizador" accent="violet" />
          </div>
        </section>

        <section className="mt-20 space-y-6">
          <div className="text-center space-y-2 sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--auth-brand)]">Funcionalidades</p>
            <h2 className="text-2xl font-bold text-white sm:text-3xl">O que o Contradef oferece</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Ideado para equipas que precisam de processar grandes volumes de logs com rastreabilidade e um fluxo claro
              de análise.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={FileArchive}
              title="Redução de logs"
              desc="Envio em lote, deduplicação e redução orientada ao contexto operacional."
              badge="Upload e cache"
              badgeClass="border-cyan-500/40 text-cyan-300 bg-cyan-500/10"
            />
            <FeatureCard
              icon={BrainCircuit}
              title="Interpretação consolidada"
              desc="Vista agregada por lote: eventos, timeline e exploração do que foi extraído."
              badge="Por jobId"
              badgeClass="border-blue-500/40 text-blue-300 bg-blue-500/10"
            />
            <FeatureCard
              icon={Zap}
              title="Análise focada"
              desc="Filtros por função, termos e regexes para aproximar a investigação ao alvo."
              badge="Foco configurável"
              badgeClass="border-violet-500/40 text-violet-300 bg-violet-500/10"
            />
            <FeatureCard
              icon={FileDown}
              title="Artefatos e downloads"
              desc="Acesso a ficheiros gerados e comparação com o original quando disponível no servidor."
              badge="Sob permissão"
              badgeClass="border-amber-500/40 text-amber-200 bg-amber-500/10"
            />
            <FeatureCard
              icon={Users}
              title="Controlo de acesso"
              desc="Perfis de utilizador e administrador, com política de redefinição de senha."
              badge="Contas"
              badgeClass="border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
            />
            <FeatureCard
              icon={UserCog}
              title="Administração"
              desc="Gestão de contas, senha padrão com troca obrigatório e manutenção de utilizadores."
              badge="Admin"
              badgeClass="border-rose-500/40 text-rose-200 bg-rose-500/10"
            />
          </div>
        </section>

        <section className="mt-20 grid gap-8 lg:grid-cols-2">
          <Card className="border-border/50 bg-card/30 backdrop-blur-sm dark:border-white/10">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Tipos de log e contexto</h3>
              <ul className="space-y-3">
                {analysisTypes.map(item => (
                  <li
                    key={item.name}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={cn("size-2 rounded-full shrink-0", item.dot)} />
                      <span className="text-sm text-slate-200 truncate">{item.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {item.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/30 backdrop-blur-sm dark:border-white/10">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Requisitos e boas práticas
              </h3>
              <ul className="space-y-2.5">
                {securityItems.map(text => (
                  <li key={text} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    {text}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <section className="mt-12 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 via-slate-950/60 to-slate-950/80 p-6 sm:p-8">
          <h3 className="text-sm font-semibold text-cyan-200/90">Arquitectura de processamento</h3>
          <p className="mt-2 text-sm text-slate-400 max-w-3xl">
            Lotes orquestrados com estados rastreáveis, fila de análise e ligação a armazenamento de artefatos. Ideal
            para ciclos de análise repetíveis e auditoria.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge className="border-cyan-500/40 bg-cyan-500/15 text-cyan-100">Análise</Badge>
            <Badge className="border-slate-500/40 bg-slate-500/10 text-slate-200">Upload em chunks (reduzir logs)</Badge>
            <Badge className="border-violet-500/40 bg-violet-500/10 text-violet-200">Estado: queued → concluído</Badge>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 bg-black/30 px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-6xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-[11px] text-muted-foreground">
          <p className="font-mono text-[10px] sm:text-xs leading-relaxed text-slate-500">
            React · Vite · tRPC · Express · PostgreSQL · Drizzle · Recharts
          </p>
          <p className="text-slate-500">Sistema operacional</p>
        </div>
      </footer>
    </div>
  );
}
