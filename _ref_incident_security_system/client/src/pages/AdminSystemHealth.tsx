import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Activity, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Server, Database, Clock, Wifi, RotateCcw, Cpu, FileText,
  Loader2, Terminal, ChevronDown, ChevronUp,
} from "lucide-react";

type ServiceStatus = "online" | "degraded" | "offline";

interface FlaskServiceRaw {
  name: string;
  port: number;
  status: ServiceStatus;
  latency: number | null;
  details?: Record<string, unknown>;
}

interface FlaskStatusResponse {
  overall: "online" | "offline";
  checked_at: string;
  services: FlaskServiceRaw[];
}

interface LogEntry {
  ts: string;
  port: number;
  type: "info" | "success" | "error" | "warn";
  message: string;
}

const STATUS_CONFIG: Record<ServiceStatus, { color: string; label: string; badge: string; border: string }> = {
  online:   { color: "text-green-400",  label: "Online",    badge: "bg-green-500/10 text-green-400 border-green-500/20",   border: "border-green-500/30" },
  degraded: { color: "text-yellow-400", label: "Degradado", badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", border: "border-yellow-500/30" },
  offline:  { color: "text-red-400",    label: "Offline",   badge: "bg-red-500/10 text-red-400 border-red-500/20",          border: "border-red-500/30" },
};

function extractPort(serviceName: string): number | null {
  const match = serviceName.match(/(\d{4,5})/);
  return match ? parseInt(match[1], 10) : null;
}

function ServiceIcon({ name }: { name: string }) {
  if (name.toLowerCase().includes("pdf")) return <FileText className="w-4 h-4 text-primary" />;
  return <Cpu className="w-4 h-4 text-primary" />;
}

function StatusIcon({ status, size = "md" }: { status: ServiceStatus; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  if (status === "online")   return <CheckCircle2 className={`${cls} text-green-400`} />;
  if (status === "degraded") return <AlertTriangle className={`${cls} text-yellow-400`} />;
  return <XCircle className={`${cls} text-red-400`} />;
}

const LOG_COLORS: Record<LogEntry["type"], string> = {
  info:    "text-blue-400",
  success: "text-green-400",
  error:   "text-red-400",
  warn:    "text-yellow-400",
};

export default function AdminSystemHealth() {
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [restartingPorts, setRestartingPorts] = useState<Set<number>>(new Set());
  const [flaskData, setFlaskData] = useState<FlaskStatusResponse | null>(null);
  const [flaskLoading, setFlaskLoading] = useState(true);
  const [flaskError, setFlaskError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const addLog = useCallback((port: number, type: LogEntry["type"], message: string) => {
    const entry: LogEntry = {
      ts: new Date().toLocaleTimeString("pt-BR"),
      port,
      type,
      message,
    };
    setLogs(prev => [...prev.slice(-49), entry]);
  }, []);

  // Busca o status via tRPC (getFlaskStatus é publicProcedure, sem auth)
  const flaskStatusQuery = trpc.admin.getFlaskStatus.useQuery(undefined, {
    staleTime: 30000, // dados válidos por 30s
    refetchInterval: 30000, // auto-refresh a cada 30s
  });

  const fetchFlaskStatus = useCallback(async (silent = true) => {
    if (!silent) setFlaskLoading(true);
    setFlaskError(null);
    try {
      const data = await flaskStatusQuery.refetch();
      if (data.data) {
        setFlaskData(data.data as FlaskStatusResponse);
        setLastRefresh(new Date().toLocaleString("pt-BR"));
        // Registrar no log
        for (const svc of data.data.services) {
          if (svc.status === "online") {
            addLog(svc.port, "success", `${svc.name} respondeu em ${svc.latency}ms`);
          } else if (svc.status === "offline") {
            addLog(svc.port, "error", `${svc.name} não responde`);
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[AdminSystemHealth] tRPC error:", err, msg);
      setFlaskError(msg);
      addLog(0, "error", `Falha ao consultar status Flask: ${msg}`);
    } finally {
      setFlaskLoading(false);
    }
  }, [addLog, flaskStatusQuery]);

  // Busca inicial - apenas uma vez ao montar o componente
  useEffect(() => {
    void fetchFlaskStatus(true);
  }, []);

  // Scroll automático no log
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, showLogs]);

  // Mutation tRPC para reiniciar serviço
  const restartMutation = trpc.admin.restartService.useMutation({
    onMutate: ({ port }) => {
      setRestartingPorts(prev => new Set([...Array.from(prev), port]));
      addLog(port, "info", `Iniciando reinício do serviço na porta ${port}...`);
      toast.info(`Reiniciando serviço na porta ${port}...`);
    },
    onSuccess: (result) => {
      setRestartingPorts(prev => {
        const s = new Set(Array.from(prev));
        s.delete(result.port);
        return s;
      });
      if (result.success) {
        addLog(result.port, "success", result.message);
        toast.success(result.message);
      } else {
        addLog(result.port, "warn", result.message);
        toast.warning(result.message);
      }
      void utils.admin.getFlaskStatus.invalidate();
    },
    onError: (err, { port }) => {
      setRestartingPorts(prev => {
        const s = new Set(Array.from(prev));
        s.delete(port);
        return s;
      });
      const msg = err.message || "Erro desconhecido";
      addLog(port, "error", `Erro ao reiniciar porta ${port}: ${msg}`);
      toast.error(`Erro ao reiniciar serviço na porta ${port}: ${msg}`);
    },
  });

  const handleRestart = (port: number) => {
    void restartMutation.mutate({ port });
  };

  if (!flaskData && flaskLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const overallStatus: ServiceStatus = flaskData?.overall === "online" ? "online" : "offline";
  const statusConfig = STATUS_CONFIG[overallStatus];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Saúde do Sistema</h1>
              <p className="text-sm text-muted-foreground">Monitoramento em tempo real dos servidores ML e serviços dependentes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Atualizado: {lastRefresh || "nunca"}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void fetchFlaskStatus()}
              disabled={flaskLoading}
            >
              <RefreshCw className={`w-4 h-4 ${flaskLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Status Geral */}
        <Card className={`border ${statusConfig.border}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <StatusIcon status={overallStatus} />
                Status Geral: <span className={statusConfig.color}>{statusConfig.label}</span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {overallStatus === "online"
                ? "Todos os serviços estão operacionais"
                : "Um ou mais serviços estão offline — clique em 'Reiniciar Serviço' para forçar reinício"}
            </p>
            {flaskError && (
              <p className="text-sm text-red-400 mt-2">Erro: {flaskError}</p>
            )}
          </CardContent>
        </Card>

        {/* Servidores de Machine Learning */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Servidores de Machine Learning</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {flaskData?.services.map(svc => {
              const cfg = STATUS_CONFIG[svc.status];
              const isRestarting = restartingPorts.has(svc.port);
              return (
                <Card key={svc.port} className={`border ${cfg.border}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ServiceIcon name={svc.name} />
                        <CardTitle className="text-base">{svc.name}</CardTitle>
                      </div>
                      <Badge className={cfg.badge}>
                        <StatusIcon status={svc.status} size="sm" />
                        <span className="ml-1">{cfg.label}</span>
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>Latencia: {svc.latency ? `${svc.latency}ms` : "N/A"}</span>
                    </div>
                    {svc.status === "online" && svc.details && (
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div>✓ Modelo carregado</div>
                      </div>
                    )}
                    {svc.status !== "online" && (
                      <p className="text-sm text-red-400">
                        Servico nao responde
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestart(svc.port)}
                      disabled={isRestarting}
                      className="w-full"
                    >
                      <RotateCcw className={`w-4 h-4 ${isRestarting ? "animate-spin" : ""}`} />
                      {isRestarting ? "Reiniciando..." : "Reiniciar Serviço"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Log de Eventos */}
        <Card>
          <CardHeader className="pb-3">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-primary" />
                <CardTitle>Log de Eventos</CardTitle>
                <Badge variant="outline">{logs.length}</Badge>
              </div>
              {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </CardHeader>
          {showLogs && (
            <CardContent>
              <div className="bg-black/50 rounded border border-border p-3 font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="text-muted-foreground">Nenhum evento registrado</div>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className={`${LOG_COLORS[log.type]}`}>
                      <span className="text-muted-foreground">{log.ts}</span>
                      {log.port > 0 && <span className="text-blue-400"> :{log.port}</span>}
                      <span> {log.message}</span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
