import DashboardLayout from "@/components/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { checkPasswordCriteria } from "@shared/authLocalValidation";
import {
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  FileSearch,
  Loader2,
  Lock,
  Mail,
  Shield,
  User,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";

const STATUS_PIE_COLORS: Record<string, string> = {
  queued: "#94a3b8",
  running: "#22d3ee",
  completed: "#34d399",
  failed: "#f87171",
  cancelled: "#a78bfa",
};

const blockClipboard = (e: React.ClipboardEvent) => {
  e.preventDefault();
  toast.info("Copiar e colar dos campos de palavra-passe estão desactivados por segurança.");
};

function formatMemberSince(value?: Date | string | null) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function Profile() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const statsQuery = trpc.analysis.dashboardStats.useQuery(undefined, {
    refetchInterval: 20_000,
  });
  const [name, setName] = useState("");

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Perfil actualizado.");
      void utils.auth.me.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Palavra-passe alterada.");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    },
    onError: e => toast.error(e.message),
  });

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (me.data?.name) setName(me.data.name);
  }, [me.data?.name]);

  const crit = useMemo(() => checkPasswordCriteria(newPw), [newPw]);
  const newPwOk = useMemo(() => Object.values(crit).every(Boolean), [crit]);
  const canChange = Boolean(me.data?.canChangePassword);

  const s = statsQuery.data;
  const by = s?.byStatus;
  const total = s?.totalJobs ?? 0;
  const emProcessamento = (by?.queued ?? 0) + (by?.running ?? 0);
  const concluidos = by?.completed ?? 0;
  const falhas = by?.failed ?? 0;

  const pieData = useMemo(() => {
    if (!by) return [];
    return (Object.keys(by) as Array<keyof typeof by>)
      .map(name => ({ name, value: by[name] }))
      .filter(d => d.value > 0);
  }, [by]);

  const isAdmin = me.data?.role === "admin";

  return (
    <DashboardLayout>
      <div className="w-full min-w-0 space-y-6">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Conta</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Meu Perfil</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Informações da sua conta e estatísticas de actividade{" "}
            {isAdmin ? "em todos os lotes de análise do sistema" : "nos lotes de análise que submeteu"}.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <Card className="border-border/60 bg-card/80 shadow-lg dark:border-white/10 dark:bg-slate-950/60 lg:col-span-4">
            <CardHeader>
              <CardTitle className="text-lg">Dados da Conta</CardTitle>
              <CardDescription>Identificação e dados de acesso</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-24 w-24 border-2 border-border/60 shadow-md">
                  <AvatarFallback className="text-3xl font-semibold bg-[var(--auth-brand)]/15 text-[var(--auth-brand)]">
                    {(me.data?.name ?? me.data?.email ?? "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="mt-4 text-lg font-semibold leading-tight">{me.data?.name || "—"}</p>
                <Badge
                  variant="outline"
                  className={
                    isAdmin
                      ? "mt-2 border-amber-500/50 text-amber-500"
                      : "mt-2 border-border text-muted-foreground"
                  }
                >
                  {isAdmin ? (
                    <>
                      <Shield className="size-3 mr-1" />
                      Administrador
                    </>
                  ) : (
                    "Usuário"
                  )}
                </Badge>
              </div>

              <div className="space-y-4 pt-2 border-t border-border/50">
                <div className="flex gap-3">
                  <User className="size-4 shrink-0 text-[var(--auth-brand)] mt-0.5" aria-hidden />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Nome</p>
                    <Input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      minLength={2}
                      className="h-9 bg-background/80"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="mt-1"
                      onClick={() => updateProfile.mutate({ name: name.trim() })}
                      disabled={updateProfile.isPending || name.trim().length < 2}
                    >
                      {updateProfile.isPending ? "A guardar…" : "Guardar nome"}
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Mail className="size-4 shrink-0 text-[var(--auth-brand)] mt-0.5" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">E-mail</p>
                    <p className="text-sm font-mono text-foreground/90 break-all pt-0.5">{me.data?.email ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">O email não pode ser alterado aqui.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Calendar className="size-4 shrink-0 text-[var(--auth-brand)] mt-0.5" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">Membro desde</p>
                    <p className="text-sm text-foreground pt-0.5 tabular-nums">
                      {formatMemberSince(me.data?.createdAt ?? null)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6 lg:col-span-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-border/80 bg-muted/30 p-3 dark:border-white/10 dark:bg-gradient-to-br dark:from-white/10 dark:via-white/5 dark:to-transparent">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total</p>
                  <FileSearch className="size-4 text-[var(--auth-brand)]" />
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{total}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Lotes de análise</p>
              </div>
              <div className="rounded-2xl border border-border/80 bg-muted/30 p-3 dark:border-white/10 dark:bg-gradient-to-br dark:from-amber-950/20 dark:via-white/5 dark:to-transparent">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Em processo</p>
                  <Loader2 className="size-4 text-amber-500" />
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {emProcessamento}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Fila e execução</p>
              </div>
              <div className="rounded-2xl border border-border/80 bg-muted/30 p-3 dark:border-white/10 dark:bg-gradient-to-br dark:from-emerald-950/25 dark:via-white/5 dark:to-transparent">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Concluídos</p>
                  <CheckCircle2 className="size-4 text-emerald-500" />
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {concluidos}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Com sucesso</p>
              </div>
              <div className="rounded-2xl border border-border/80 bg-muted/30 p-3 dark:border-white/10 dark:bg-gradient-to-br dark:from-red-950/20 dark:via-white/5 dark:to-transparent">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Falhas</p>
                  <XCircle className="size-4 text-destructive" />
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-destructive">{falhas}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Lotes com erro</p>
              </div>
            </div>

            <Card className="border-border/60 bg-card/80 shadow-lg dark:border-white/10 dark:bg-slate-950/60">
              <CardHeader>
                <CardTitle className="text-base">Distribuição por estado dos lotes</CardTitle>
                <CardDescription>
                  {isAdmin
                    ? "Visão global do pipeline de análise (todos os usuários)"
                    : "Apenas lotes que submeteu com esta conta"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {total === 0 || pieData.length === 0 ? (
                  <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum lote de análise registado ainda
                  </div>
                ) : (
                  <div className="h-[240px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={86}
                          paddingAngle={2}
                        >
                          {pieData.map(entry => (
                            <Cell
                              key={entry.name}
                              fill={STATUS_PIE_COLORS[entry.name] ?? "#94a3b8"}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => [v, "Lotes"]}
                          contentStyle={{
                            backgroundColor: "oklch(0.2 0.02 255 / 0.95)",
                            border: "1px solid oklch(0.35 0.02 255 / 0.5)",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                        <Legend
                          formatter={value => {
                            const map: Record<string, string> = {
                              queued: "Em fila",
                              running: "A correr",
                              completed: "Concluído",
                              failed: "Falhou",
                              cancelled: "Cancelado",
                            };
                            return map[String(value)] ?? String(value);
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {canChange ? (
          <Card className="border-border/60 bg-card/80 shadow-lg dark:border-white/10 dark:bg-slate-950/60">
            <CardHeader>
              <CardTitle>Alterar palavra-passe</CardTitle>
              <CardDescription>Actualize a palavra-passe da sua conta local.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="pp-cur" className="text-muted-foreground text-xs">
                    Palavra-passe actual
                  </Label>
                  <div className="relative">
                    <Input
                      id="pp-cur"
                      type={showCurrent ? "text" : "password"}
                      autoComplete="current-password"
                      value={currentPw}
                      onChange={e => setCurrentPw(e.target.value)}
                      onPaste={blockClipboard}
                      onCopy={blockClipboard}
                      onCut={blockClipboard}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showCurrent ? "Ocultar" : "Mostrar"}
                    >
                      {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pp-n" className="text-muted-foreground text-xs">
                    Nova palavra-passe
                  </Label>
                  <div className="relative">
                    <Input
                      id="pp-n"
                      type={showNew ? "text" : "password"}
                      autoComplete="new-password"
                      value={newPw}
                      onChange={e => setNewPw(e.target.value)}
                      onPaste={blockClipboard}
                      onCopy={blockClipboard}
                      onCut={blockClipboard}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showNew ? "Ocultar" : "Mostrar"}
                    >
                      {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pp-cf" className="text-muted-foreground text-xs">
                    Confirmar nova palavra-passe
                  </Label>
                  <div className="relative">
                    <Input
                      id="pp-cf"
                      type={showConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPw}
                      onChange={e => setConfirmPw(e.target.value)}
                      onPaste={blockClipboard}
                      onCopy={blockClipboard}
                      onCut={blockClipboard}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showConfirm ? "Ocultar" : "Mostrar"}
                    >
                      {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <ul className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5">
                <li className={crit.minLength && crit.maxLength ? "text-emerald-500" : ""}>8–128 caracteres</li>
                <li className={crit.lowercase && crit.uppercase ? "text-emerald-500" : ""}>Maiúscula e minúscula</li>
                <li className={crit.digit && crit.special ? "text-emerald-500" : ""}>Número e símbolo</li>
              </ul>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Lock className="size-3 shrink-0 opacity-70" aria-hidden />
                Copiar/colar desactivados nos campos de palavra-passe por segurança.
              </p>
              <div>
                <Button
                  type="button"
                  className="bg-[var(--auth-brand)] hover:bg-[var(--auth-brand-hover)] text-white"
                  onClick={() => {
                    if (newPw !== confirmPw) {
                      toast.error("A confirmação não coincide.");
                      return;
                    }
                    if (!newPwOk) {
                      toast.error("A nova palavra-passe não cumpre os requisitos.");
                      return;
                    }
                    changePassword.mutate({
                      currentPassword: currentPw,
                      newPassword: newPw,
                    });
                  }}
                  disabled={changePassword.isPending}
                >
                  {changePassword.isPending ? "A actualizar…" : "Alterar palavra-passe"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Alterar palavra-passe</CardTitle>
              <CardDescription>
                A alteração de palavra-passe só está disponível para contas com login local (email e palavra-passe) neste
                modo de autenticação.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
