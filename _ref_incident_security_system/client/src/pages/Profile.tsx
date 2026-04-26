/**
 * Profile.tsx — Página de Perfil do Usuário
 * Exibe informações do usuário logado e estatísticas de incidentes.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  User, Mail, Shield, Calendar, Activity,
  AlertTriangle, CheckCircle2, Clock, Lock, Eye, EyeOff,
} from "lucide-react";
import { useState } from "react";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

function blockClipboard(e: React.ClipboardEvent | React.KeyboardEvent) {
  if ("key" in e) {
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && ["c", "x", "v"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      toast.warning("Copiar/colar não é permitido no campo de senha por segurança.");
      return;
    }
  }
  if ("clipboardData" in e) {
    e.preventDefault();
    toast.warning("Copiar/colar não é permitido no campo de senha por segurança.");
  }
}

export default function Profile() {
  const { user } = useAuth();
  const search = useSearch();
  const mustChangePwd = new URLSearchParams(search).get("mustChangePassword") === "1";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const utils = trpc.useUtils();
  const changePasswordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Senha alterada com sucesso!");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      window.history.replaceState({}, "", "/profile");
      utils.auth.me.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const handleChangePassword = () => {
    if (!currentPassword) { toast.error("Informe a senha atual."); return; }
    if (newPassword.length < 8) { toast.error("A nova senha deve ter no mínimo 8 caracteres."); return; }
    if (newPassword !== confirmPassword) { toast.error("As senhas não coincidem."); return; }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };
  const statsQuery = trpc.incidents.stats.useQuery();
  const incidentsQuery = trpc.incidents.list.useQuery();
  const statusStatsQuery = trpc.incidents.statusStats.useQuery();

  const stats = statsQuery.data;
  const incidents = incidentsQuery.data ?? [];

  // Compute personal stats
  const total = incidents.length;
  const critical = incidents.filter((i) => i.riskLevel === "critical").length;
  const high = incidents.filter((i) => i.riskLevel === "high").length;
  const open = statusStatsQuery.data?.open ?? 0;
  const resolved = statusStatsQuery.data?.resolved ?? 0;

  // Most recent incident
  const recent = incidents.length > 0 ? incidents[0] : null;

  const formatDate = (d: Date | string | null | undefined) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  };

  const RISK_COLORS: Record<string, string> = {
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };

  const RISK_LABELS: Record<string, string> = {
    critical: "Crítico", high: "Alto", medium: "Médio", low: "Baixo",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="soc-page-title flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Meu Perfil
          </h1>
          <p className="soc-page-sub">Informações da sua conta e estatísticas de atividade</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Informações do usuário */}
          <Card className="bg-card border-border lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Dados da Conta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3 py-4 border-b border-border/50">
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <span className="text-2xl font-mono font-bold text-primary">
                    {(user?.name ?? user?.email ?? "U").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-center">
                  <p className="font-mono font-semibold text-foreground text-sm">
                    {user?.name ?? "Usuário"}
                  </p>
                  <Badge
                    variant="outline"
                    className={`mt-1 text-xs font-mono ${
                      user?.role === "admin"
                        ? "border-yellow-400/30 text-yellow-400"
                        : user?.role === "security-analyst"
                        ? "border-blue-400/30 text-blue-400"
                        : "border-muted-foreground/30 text-muted-foreground"
                    }`}
                  >
                    {user?.role === "admin" ? "Administrador" : user?.role === "security-analyst" ? "Security Analyst" : "Usuário"}
                  </Badge>
                </div>
              </div>

              {/* Campos */}
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-mono text-muted-foreground">Nome</p>
                    <p className="text-sm font-mono text-foreground">{user?.name ?? "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-mono text-muted-foreground">E-mail</p>
                    <p className="text-sm font-mono text-foreground break-all">{user?.email ?? "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-mono text-muted-foreground">Membro desde</p>
                    <p className="text-sm font-mono text-foreground">
                      {formatDate(user?.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Estatísticas pessoais */}
          <div className="lg:col-span-2 space-y-4">
            {/* Cards de contagem */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-card border-border">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-4 h-4 text-primary" />
                    <span className="text-xs font-mono text-muted-foreground">Total</span>
                  </div>
                  <p className="text-2xl font-mono font-bold text-foreground">{total}</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-mono text-muted-foreground">Críticos</span>
                  </div>
                  <p className="text-2xl font-mono font-bold text-red-400">{critical}</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs font-mono text-muted-foreground">Em Aberto</span>
                  </div>
                  <p className="text-2xl font-mono font-bold text-yellow-400">{open}</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-mono text-muted-foreground">Resolvidos</span>
                  </div>
                  <p className="text-2xl font-mono font-bold text-green-400">{resolved}</p>
                </CardContent>
              </Card>
            </div>

            {/* Distribuição por risco */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono font-semibold text-foreground">
                  Distribuição por Nível de Risco
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground font-mono">Carregando...</p>
                ) : total === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono">Nenhum incidente registrado ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {(["critical", "high", "medium", "low"] as const).map((level) => {
                      const count = incidents.filter((i) => i.riskLevel === level).length;
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={level} className="flex items-center gap-3">
                          <span className={`text-xs font-mono px-2 py-0.5 rounded border w-20 text-center ${RISK_COLORS[level]}`}>
                            {RISK_LABELS[level]}
                          </span>
                          <div className="flex-1 bg-muted/30 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                            {count} ({pct}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Incidente mais recente */}
            {recent && (
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono font-semibold text-foreground">
                    Incidente Mais Recente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-medium text-foreground truncate">
                        {recent.title}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">
                        {formatDate(recent.createdAt)} · {recent.category ?? "Sem categoria"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs font-mono shrink-0 ${RISK_COLORS[recent.riskLevel ?? "low"]}`}
                    >
                      {RISK_LABELS[recent.riskLevel ?? "low"]}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* ── Alterar Senha ── */}
      <div className="mt-6">
        {mustChangePwd && (
          <div className="mb-4 flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-300">Troca de senha obrigatória</p>
              <p className="text-xs text-yellow-400/80 mt-0.5">
                Sua senha foi redefinida pelo administrador. Por segurança, você deve criar uma nova senha antes de continuar.
              </p>
            </div>
          </div>
        )}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              Alterar Senha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Senha Atual</Label>
                <div className="relative mt-1">
                  <Input
                    type={showCurrent ? "text" : "password"}
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="pr-9 bg-input border-border text-sm"
                    autoComplete="current-password"
                    onCopy={blockClipboard} onCut={blockClipboard} onPaste={blockClipboard} onKeyDown={blockClipboard}
                  />
                  <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Nova Senha</Label>
                <div className="relative mt-1">
                  <Input
                    type={showNew ? "text" : "password"}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="pr-9 bg-input border-border text-sm"
                    autoComplete="new-password"
                    onCopy={blockClipboard} onCut={blockClipboard} onPaste={blockClipboard} onKeyDown={blockClipboard}
                  />
                  <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Confirmar Nova Senha</Label>
                <div className="relative mt-1">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="pr-9 bg-input border-border text-sm"
                    autoComplete="new-password"
                    onCopy={blockClipboard} onCut={blockClipboard} onPaste={blockClipboard} onKeyDown={blockClipboard}
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Copiar/colar desabilitado nos campos de senha por segurança.
            </p>
            <Button
              className="mt-4"
              onClick={handleChangePassword}
              disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
            >
              {changePasswordMutation.isPending ? "Salvando..." : "Alterar Senha"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
