import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowLeft, Trash2, Calendar, Tag, AlertTriangle, Activity,
  Shield, ClipboardList, CheckCircle2, Clock, Loader2, Save, History, User,
} from "lucide-react";

const SEV: Record<string, string> = {
  critical: "text-red-400 bg-red-400/10 border-red-400/30",
  high:     "text-orange-400 bg-orange-400/10 border-orange-400/30",
  medium:   "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  low:      "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
};

const STATUS_CONFIG = {
  open:        { label: "Em Aberto",    icon: Clock,         cls: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" },
  in_progress: { label: "Em Andamento", icon: Loader2,       cls: "text-blue-400 bg-blue-400/10 border-blue-400/30" },
  resolved:    { label: "Resolvido",    icon: CheckCircle2,  cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" },
} as const;

// Recomendações contextualizadas por categoria (seção 7.5)
const CATEGORY_RECOMMENDATIONS: Record<string, { title: string; description: string; priority: string; action: string }> = {
  malware: {
    title: "Isolamento de Sistemas Comprometidos",
    description: "Incidente de malware detectado. Verifique e isole imediatamente os sistemas comprometidos para evitar a propagação lateral na rede.",
    priority: "critical",
    action: "Isolar o sistema afetado da rede, executar varredura completa com antivírus atualizado e restaurar a partir de backup limpo.",
  },
  vazamento_de_dados: {
    title: "Notificação ao DPO e Avaliação LGPD",
    description: "Vazamento de dados identificado. É obrigatório notificar o Encarregado de Dados (DPO) e avaliar as obrigações previstas na LGPD (Art. 48).",
    priority: "critical",
    action: "Notificar o DPO em até 72h, registrar o incidente, avaliar notificação à ANPD e comunicar os titulares afetados.",
  },
  phishing: {
    title: "Reforço de Treinamento de Conscientização",
    description: "Ataque de phishing registrado. Reforce o treinamento de conscientização dos colaboradores e implemente filtros de e-mail mais rigorosos.",
    priority: "high",
    action: "Realizar campanha de phishing simulado, atualizar treinamentos de segurança e habilitar MFA em todas as contas corporativas.",
  },
  brute_force: {
    title: "Bloqueio Automático após Falhas de Login",
    description: "Tentativa de força bruta detectada. Implemente bloqueio automático de contas após múltiplas falhas consecutivas de autenticação.",
    priority: "high",
    action: "Configurar lockout após 5 tentativas, habilitar CAPTCHA nos formulários de login e revisar a política de senhas.",
  },
  ddos: {
    title: "Revisão de Rate Limiting e CDN",
    description: "Ataque DDoS identificado. Revise as configurações de rate limiting, WAF e CDN para mitigar o impacto de futuros ataques.",
    priority: "high",
    action: "Ativar proteção DDoS no CDN, revisar regras de rate limiting e configurar auto-scaling para absorver picos de tráfego.",
  },
};

const REC_BADGE: Record<string, string> = {
  critical: "text-red-400 bg-red-400/10 border-red-400/30",
  high:     "text-orange-400 bg-orange-400/10 border-orange-400/30",
  medium:   "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  low:      "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Crítica",
  high:     "Alta",
  medium:   "Média",
  low:      "Baixa",
};

export default function IncidentDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");
  const utils = trpc.useUtils();

  const { data: incident, isLoading } = trpc.incidents.getById.useQuery({ id });
  const [notes, setNotes] = useState<string>("");
  const [notesInitialized, setNotesInitialized] = useState(false);
  const [statusComment, setStatusComment] = useState("");

  // Initialize notes from incident data
  if (incident && !notesInitialized) {
    setNotes(incident.notes ?? "");
    setNotesInitialized(true);
  }

  // Fetch incident history from backend
  const { data: historyEntries, refetch: refetchHistory } = trpc.incidents.history.useQuery(
    { id },
    { enabled: !!incident }
  );

  const deleteMutation = trpc.incidents.delete.useMutation({
    onSuccess: () => {
      toast.success("Incidente excluído.");
      utils.incidents.list.invalidate();
      navigate("/incidents");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.incidents.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado com sucesso.");
      utils.incidents.getById.invalidate({ id });
      utils.incidents.list.invalidate();
      utils.incidents.statusStats.invalidate();
      utils.incidents.history.invalidate({ id });
      setStatusComment("");
    },
    onError: (e) => toast.error("Erro ao atualizar status: " + e.message),
  });

  const updateNotesMutation = trpc.incidents.updateNotes.useMutation({
    onSuccess: () => {
      toast.success("Notas salvas com sucesso.");
      utils.incidents.getById.invalidate({ id });
      utils.incidents.history.invalidate({ id });
    },
    onError: (e) => toast.error("Erro ao salvar notas: " + e.message),
  });

  if (isLoading) return <DashboardLayout><div className="text-muted-foreground p-8 text-center">Carregando...</div></DashboardLayout>;
  if (!incident) return <DashboardLayout><div className="text-muted-foreground p-8 text-center">Incidente não encontrado.</div></DashboardLayout>;

  const recommendation = incident.category ? CATEGORY_RECOMMENDATIONS[incident.category] : null;
  const currentStatus = (incident.status ?? "open") as "open" | "in_progress" | "resolved";
  const statusCfg = STATUS_CONFIG[currentStatus];
  const StatusIcon = statusCfg.icon;

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/incidents")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground font-mono truncate">{incident.title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5 font-mono">#{incident.id}</p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate({ id })} disabled={deleteMutation.isPending} className="gap-2 font-mono text-xs">
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </Button>
        </div>

        {/* Detalhes principais */}
        <Card className="bg-card border-border">
          <CardContent className="pt-6 space-y-5">
            <div className="flex flex-wrap gap-2">
              {incident.category && (
                <span className="text-xs px-2.5 py-1 rounded-full border font-mono capitalize text-primary bg-primary/10 border-primary/30">
                  <Tag className="w-3 h-3 inline mr-1" />{incident.category.replace(/_/g, " ")}
                </span>
              )}
              {incident.riskLevel && (
                <span className={`text-xs px-2.5 py-1 rounded-full border font-mono ${SEV[incident.riskLevel] ?? SEV.low}`}>
                  <AlertTriangle className="w-3 h-3 inline mr-1" />{incident.riskLevel}
                </span>
              )}
              {incident.confidence != null && (
                <span className={`text-xs px-2.5 py-1 rounded-full border font-mono ${
                  incident.confidence < 0.4
                    ? "text-yellow-400 bg-yellow-900/20 border-yellow-700/50"
                    : "text-muted-foreground bg-muted/30 border-border"
                }`}>
                  <Activity className="w-3 h-3 inline mr-1" />{Math.round(incident.confidence * 100)}% confiança
                </span>
              )}
              {incident.confidence != null && incident.confidence < 0.4 && (
                <span className="text-xs px-2.5 py-1 rounded-full border font-mono text-yellow-400 bg-yellow-900/20 border-yellow-700/50">
                  ⚠️ Classificação incerta — adicione uma descrição técnica
                </span>
              )}
              {/* Badge de status atual */}
              <span className={`text-xs px-2.5 py-1 rounded-full border font-mono ${statusCfg.cls}`}>
                <StatusIcon className="w-3 h-3 inline mr-1" />{statusCfg.label}
              </span>
            </div>

            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Descrição</p>
              <p className="text-sm text-foreground leading-relaxed">{incident.description}</p>
            </div>

            <div className="pt-4 border-t border-border grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Registrado em</p>
                <p className="text-sm text-foreground font-mono flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  {new Date(incident.createdAt).toLocaleString("pt-BR")}
                </p>
              </div>
              {incident.resolvedAt && (
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Resolvido em</p>
                  <p className="text-sm text-emerald-400 font-mono flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {new Date(incident.resolvedAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Acompanhamento: Status ─────────────────────────────────────────── */}
        <Card className="bg-card border-border" data-testid="status-section">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              Acompanhamento — Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(["open", "in_progress", "resolved"] as const).map((s) => {
                const cfg = STATUS_CONFIG[s];
                const Icon = cfg.icon;
                const isActive = currentStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => updateStatusMutation.mutate({ id, status: s, comment: statusComment || undefined })}
                    disabled={isActive || updateStatusMutation.isPending}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-mono transition-all
                      ${isActive ? cfg.cls + " cursor-default" : "text-muted-foreground border-border hover:border-primary/50 hover:text-foreground bg-transparent"}
                    `}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {cfg.label}
                    {isActive && <span className="ml-1 text-[10px] opacity-70">(atual)</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 space-y-2">
              <Input
                value={statusComment}
                onChange={(e) => setStatusComment(e.target.value)}
                placeholder="Comentário opcional sobre a mudança de status..."
                className="bg-background border-border font-mono text-xs h-8"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground font-mono">
                Selecione um status acima para registrar a alteração. O comentário será salvo no histórico.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Acompanhamento: Notas ─────────────────────────────────────────── */}
        <Card className="bg-card border-border" data-testid="notes-section">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              Acompanhamento — Notas e Observações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Registre observações, ações tomadas, contatos realizados, evidências coletadas..."
              className="font-mono text-sm bg-background border-border resize-none min-h-[120px]"
              maxLength={5000}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">{notes.length}/5000 caracteres</span>
              <Button
                size="sm"
                onClick={() => updateNotesMutation.mutate({ id, notes })}
                disabled={updateNotesMutation.isPending}
                className="gap-2 font-mono text-xs"
              >
                {updateNotesMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Salvar Notas
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Histórico Detalhado de Alterações ────────────────────────────── */}
        <Card className="bg-card border-border" data-testid="history-section">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Histórico de Alterações
              {historyEntries && historyEntries.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground font-mono">{historyEntries.length} evento(s)</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative pl-4 space-y-4">
              {/* Linha vertical */}
              <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />

              {/* Evento de criação (sempre presente) */}
              <div className="relative flex items-start gap-3">
                <div className="absolute -left-[3px] w-3 h-3 rounded-full bg-primary border-2 border-background mt-0.5" />
                <div className="ml-4">
                  <p className="text-xs font-mono font-semibold text-foreground">Incidente Registrado</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {new Date(incident.createdAt).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Categoria:{" "}
                    <span className="text-primary font-mono">{incident.category?.replace(/_/g, " ") ?? "desconhecido"}</span>
                    {" · "}Risco:{" "}
                    <Badge variant="outline" className={`text-[10px] font-mono px-1.5 py-0 ${SEV[incident.riskLevel ?? "low"]}`}>
                      {incident.riskLevel ?? "low"}
                    </Badge>
                  </p>
                </div>
              </div>

              {/* Entradas do histórico do backend */}
              {historyEntries && historyEntries.length > 0 ? (
                [...historyEntries].reverse().map((entry) => {
                  const actionColors: Record<string, string> = {
                    status_changed: "bg-blue-400",
                    notes_updated: "bg-purple-400",
                    category_changed: "bg-orange-400",
                    risk_changed: "bg-red-400",
                    created: "bg-primary",
                  };
                  const actionLabels: Record<string, string> = {
                    status_changed: "Status Alterado",
                    notes_updated: "Notas Atualizadas",
                    category_changed: "Categoria Alterada",
                    risk_changed: "Risco Alterado",
                    created: "Criado",
                  };
                  const dotColor = actionColors[entry.action] ?? "bg-muted-foreground";
                  return (
                    <div key={entry.id} className="relative flex items-start gap-3">
                      <div className={`absolute -left-[3px] w-3 h-3 rounded-full ${dotColor} border-2 border-background mt-0.5`} />
                      <div className="ml-4 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-mono font-semibold text-foreground">
                            {actionLabels[entry.action] ?? entry.action}
                          </p>
                          {(entry.userName || entry.userId === 0) && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                              <User className="w-2.5 h-2.5" />{entry.userId === 0 ? "Sistema Automático" : entry.userName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString("pt-BR")}
                        </p>
                        {entry.fromValue && entry.toValue && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <span className="line-through opacity-60 font-mono">{entry.fromValue}</span>
                            {" → "}
                            <span className="text-foreground font-mono font-semibold">{entry.toValue}</span>
                          </p>
                        )}
                        {entry.comment && (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            "{entry.comment}"
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-[3px] w-3 h-3 rounded-full bg-yellow-400 border-2 border-background mt-0.5 animate-pulse" />
                  <div className="ml-4">
                    <p className="text-xs font-mono font-semibold text-yellow-400">Aguardando Ações</p>
                    <p className="text-xs font-mono text-muted-foreground">Nenhuma alteração registrada ainda.</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recomendação contextualizada por categoria (seção 7.5) */}
        {recommendation && (
          <div
            className={`rounded-xl border p-5 space-y-3 ${REC_BADGE[recommendation.priority] ?? REC_BADGE.low}`}
            data-testid="incident-recommendation"
            data-category={incident.category}
          >
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 shrink-0" />
              <h3 className="text-sm font-semibold font-mono">Recomendação de Segurança</h3>
              <span className="text-xs px-2 py-0.5 rounded-full border font-mono ml-auto">
                Prioridade {PRIORITY_LABEL[recommendation.priority] ?? recommendation.priority}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold font-mono mb-1">{recommendation.title}</p>
              <p className="text-sm opacity-90">{recommendation.description}</p>
            </div>
            <div className="pt-2 border-t border-current/20">
              <p className="text-xs font-mono opacity-75">
                <span className="font-semibold">Ação recomendada:</span> {recommendation.action}
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
