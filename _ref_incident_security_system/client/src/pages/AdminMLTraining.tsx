import { useState, useRef, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Play, Square, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, Info, ChevronRight, BarChart3, Activity,
  Database, Cpu, FlaskConical, TrendingUp
} from "lucide-react";

type EventType = "start" | "log" | "progress" | "fold" | "warning" | "error" | "complete";

interface TrainEvent {
  id: number;
  type: EventType;
  ts: string;
  message: string;
  step?: number;
  total?: number;
  fold?: number;
  score?: number;
  train_accuracy?: number;
  cv_mean?: number;
  cv_std?: number;
  eval_accuracy?: number;
  dataset_size?: number;
  categories?: string[];
  per_category?: Record<string, { precision: number; recall: number; f1_score: number; support: number }>;
  confusion_matrix?: { labels: string[]; matrix: number[][] };
  details?: Record<string, number>;
}

interface FinalMetrics {
  train_accuracy: number;
  cv_accuracy: number;
  eval_accuracy: number | null;
  dataset_size: number;
  categories: string[];
  confusion_matrix?: { labels: string[]; matrix: number[][] };
}

const STEP_LABELS = [
  "",
  "Carregar Dataset",
  "Pré-processamento",
  "Construir Pipeline TF-IDF",
  "Treinar Modelo",
  "Validação Cruzada 5-fold",
  "Avaliação Independente",
  "Salvar Modelo",
  "Atualizar Memória",
];

const CATEGORY_COLORS: Record<string, string> = {
  brute_force: "bg-orange-500",
  ddos: "bg-red-500",
  malware: "bg-purple-500",
  phishing: "bg-yellow-500",
  vazamento_de_dados: "bg-blue-500",
};

function EventIcon({ type }: { type: EventType }) {
  switch (type) {
    case "start": return <Play className="w-3.5 h-3.5 text-cyan-400" />;
    case "complete": return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
    case "error": return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    case "warning": return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />;
    case "progress": return <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />;
    case "fold": return <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />;
    default: return <Info className="w-3.5 h-3.5 text-slate-400" />;
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR");
}

function AccuracyBar({ label, value, color = "bg-cyan-500" }: { label: string; value: number; color?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono font-semibold text-white">{pct}%</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function AdminMLTraining() {
  const [events, setEvents] = useState<TrainEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [foldScores, setFoldScores] = useState<number[]>([]);
  const [finalMetrics, setFinalMetrics] = useState<FinalMetrics | null>(null);
  const [trainAccuracy, setTrainAccuracy] = useState<number | null>(null);
  const [cvAccuracy, setCvAccuracy] = useState<number | null>(null);
  const [evalAccuracy, setEvalAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventIdRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const cvAccuracyRef = useRef<number | null>(null);
  useEffect(() => {
    cvAccuracyRef.current = cvAccuracy;
  }, [cvAccuracy]);

  const scrollToBottom = useCallback(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [events, scrollToBottom]);

  const addEvent = useCallback((ev: Omit<TrainEvent, "id">) => {
    setEvents(prev => [...prev, { ...ev, id: ++eventIdRef.current }]);
  }, []);

  const startTraining = useCallback(() => {
    if (running) return;
    setEvents([]);
    setFoldScores([]);
    setFinalMetrics(null);
    setTrainAccuracy(null);
    setCvAccuracy(null);
    setEvalAccuracy(null);
    setCurrentStep(0);
    setError(null);
    setRunning(true);

    const es = new EventSource("/api/ml-train-stream");
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data: TrainEvent = JSON.parse(e.data);
        addEvent(data);

        if (data.step) setCurrentStep(data.step);

        if (data.type === "fold" && data.score !== undefined) {
          setFoldScores(prev => [...prev, data.score!]);
        }
        if (data.type === "progress") {
          if (data.train_accuracy !== undefined) setTrainAccuracy(data.train_accuracy);
          if (data.cv_mean !== undefined) setCvAccuracy(data.cv_mean);
          if (data.eval_accuracy !== undefined) setEvalAccuracy(data.eval_accuracy);
        }
        if (data.type === "complete") {
          setFinalMetrics({
            train_accuracy: data.train_accuracy ?? 0,
            cv_accuracy: data.cv_mean ?? cvAccuracyRef.current ?? 0,
            eval_accuracy: data.eval_accuracy ?? null,
            dataset_size: data.dataset_size ?? 0,
            categories: data.categories ?? [],
          });
          setCurrentStep(8);
          setRunning(false);
          es.close();
          toast.success("Treinamento concluído!", {
            description: `Acurácia CV: ${((data.cv_mean ?? 0) * 100).toFixed(1)}%`,
          });
        }
        if (data.type === "error") {
          setError(data.message);
          setRunning(false);
          es.close();
          toast.error("Erro no treinamento", { description: data.message });
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setError("Conexão com o servidor ML perdida. Verifique se o Flask está rodando.");
      setRunning(false);
      es.close();
    };
  }, [running, addEvent, toast]);

  const stopTraining = useCallback(() => {
    esRef.current?.close();
    setRunning(false);
    addEvent({ type: "warning", ts: new Date().toISOString(), message: "Treinamento interrompido pelo usuário." });
  }, [addEvent]);

  const progressPct = currentStep > 0 ? Math.round((currentStep / 8) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Cpu className="w-6 h-6 text-cyan-400" />
              Treinamento em Tempo Real
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Acompanhe o progresso do treinamento do modelo TF-IDF + Naive Bayes ao vivo
            </p>
          </div>
          <div className="flex gap-2">
            {!running ? (
              <Button
                onClick={startTraining}
                className="bg-cyan-600 hover:bg-cyan-700 text-white gap-2"
              >
                <Play className="w-4 h-4" />
                Iniciar Treinamento
              </Button>
            ) : (
              <Button onClick={stopTraining} variant="destructive" className="gap-2">
                <Square className="w-4 h-4" />
                Interromper
              </Button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className={`w-4 h-4 ${running ? "text-cyan-400 animate-pulse" : "text-slate-500"}`} />
              <span className="text-sm font-medium text-white">
                {running
                  ? currentStep > 0
                    ? `Passo ${currentStep}/8: ${STEP_LABELS[currentStep]}`
                    : "Iniciando..."
                  : finalMetrics
                  ? "Treinamento concluído com sucesso"
                  : error
                  ? "Erro no treinamento"
                  : "Aguardando início"}
              </span>
            </div>
            <span className="text-sm font-mono text-slate-400">{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-2" />
          <div className="flex gap-1 flex-wrap">
            {STEP_LABELS.slice(1).map((label, i) => {
              const step = i + 1;
              const done = step < currentStep || (step <= currentStep && !running && finalMetrics !== null);
              const active = step === currentStep && running;
              return (
                <div
                  key={step}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-all ${
                    done
                      ? "bg-green-900/40 text-green-400 border border-green-700/50"
                      : active
                      ? "bg-cyan-900/40 text-cyan-400 border border-cyan-700/50 animate-pulse"
                      : "bg-slate-800 text-slate-500 border border-slate-700"
                  }`}
                >
                  {done ? <CheckCircle2 className="w-3 h-3" /> : active ? <ChevronRight className="w-3 h-3" /> : null}
                  {label}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Logs */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-700 rounded-lg flex flex-col" style={{ minHeight: "480px" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-white">Log de Treinamento</span>
                {running && (
                  <Badge variant="outline" className="text-cyan-400 border-cyan-700 text-xs animate-pulse">
                    AO VIVO
                  </Badge>
                )}
              </div>
              <span className="text-xs text-slate-500">{events.length} eventos</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs" style={{ maxHeight: "420px" }}>
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2 py-16">
                  <Cpu className="w-10 h-10 opacity-30" />
                  <p>Clique em "Iniciar Treinamento" para começar</p>
                </div>
              ) : (
                events.map((ev) => (
                  <div
                    key={ev.id}
                    className={`flex items-start gap-2 px-2 py-1 rounded ${
                      ev.type === "complete"
                        ? "bg-green-900/20 border border-green-800/40"
                        : ev.type === "error"
                        ? "bg-red-900/20 border border-red-800/40"
                        : ev.type === "warning"
                        ? "bg-yellow-900/20 border border-yellow-800/40"
                        : ev.type === "progress"
                        ? "bg-cyan-900/10 border border-cyan-800/20"
                        : ev.type === "fold"
                        ? "bg-indigo-900/10"
                        : ""
                    }`}
                  >
                    <span className="text-slate-600 shrink-0 mt-0.5">{formatTime(ev.ts)}</span>
                    <EventIcon type={ev.type} />
                    <span
                      className={
                        ev.type === "complete"
                          ? "text-green-400"
                          : ev.type === "error"
                          ? "text-red-400"
                          : ev.type === "warning"
                          ? "text-yellow-400"
                          : ev.type === "progress"
                          ? "text-cyan-300"
                          : ev.type === "fold"
                          ? "text-indigo-300"
                          : "text-slate-300"
                      }
                    >
                      {ev.message}
                      {ev.details && (
                        <span className="text-slate-500 ml-2">
                          {Object.entries(ev.details).map(([k, v]) => `${k}: ${v}`).join(", ")}
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* Métricas ao vivo */}
          <div className="space-y-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-white">Métricas ao Vivo</span>
              </div>
              <AccuracyBar label="Acurácia Treino" value={trainAccuracy ?? 0} color="bg-green-500" />
              <AccuracyBar label="Validação Cruzada (CV)" value={cvAccuracy ?? 0} color="bg-cyan-500" />
              <AccuracyBar label="Avaliação Independente" value={evalAccuracy ?? 0} color="bg-indigo-500" />
            </div>

            {foldScores.length > 0 && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-medium text-white">Folds CV</span>
                </div>
                <div className="space-y-1.5">
                  {foldScores.map((score, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-12">Fold {i + 1}</span>
                      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${score * 100}%` }} />
                      </div>
                      <span className="text-xs font-mono text-indigo-300 w-12 text-right">
                        {(score * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {finalMetrics && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">Dataset Utilizado</span>
                </div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total de amostras</span>
                    <span className="font-mono text-white">{finalMetrics.dataset_size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Categorias</span>
                    <span className="font-mono text-white">{finalMetrics.categories.length}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {finalMetrics.categories.map((cat) => (
                    <Badge
                      key={cat}
                      variant="outline"
                      className={`text-xs border-0 text-white ${CATEGORY_COLORS[cat] ?? "bg-slate-600"}`}
                    >
                      {cat.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Erro no treinamento</p>
                    <p className="text-xs text-red-300 mt-1">{error}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full gap-2 border-red-700 text-red-400 hover:bg-red-900/30"
                  onClick={startTraining}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tentar Novamente
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Confusion Matrix */}
        {finalMetrics?.confusion_matrix && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-medium text-white">Matriz de Confusão (Dataset de Avaliação)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs font-mono w-full">
                <thead>
                  <tr>
                    <th className="text-slate-500 text-left pr-3 pb-2">Real ↓ / Pred →</th>
                    {finalMetrics.confusion_matrix.labels.map((l) => (
                      <th key={l} className="text-slate-400 px-2 pb-2 text-center">{l.replace(/_/g, " ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {finalMetrics.confusion_matrix.matrix.map((row, i) => (
                    <tr key={i}>
                      <td className="text-slate-400 pr-3 py-1">{finalMetrics.confusion_matrix!.labels[i].replace(/_/g, " ")}</td>
                      {row.map((val, j) => (
                        <td
                          key={j}
                          className={`text-center px-2 py-1 rounded ${
                            i === j
                              ? val > 0 ? "bg-green-900/40 text-green-400 font-bold" : "bg-slate-700 text-slate-500"
                              : val > 0 ? "bg-red-900/30 text-red-400" : "text-slate-600"
                          }`}
                        >
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-600 text-center">
          Dataset de treino: <code>incidentes_cybersecurity_2000.xlsx</code> (2050 amostras) •
          Dataset de avaliação: <code>incidentes_cybersecurity_100.xlsx</code> (100 amostras independentes)
        </p>
      </div>
    </DashboardLayout>
  );
}
