/**
 * AdminML.tsx — Painel de Machine Learning (Admin Only)
 * Sessão 11: Separação Metodológica Dataset Treino / Avaliação
 *
 * Metodologia:
 *  - Dataset de TREINAMENTO: dataset_cybersecurity_5000_amostras.xlsx (5000 amostras)
 *    → Usado para treinar o modelo TF-IDF + Naive Bayes
 *  - Dataset de AVALIAÇÃO: incidentes_cybersecurity_100.xlsx (100 amostras)
 *    → Conjunto independente para avaliar o modelo em produção
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Brain, Download, RefreshCw, Plus, Trash2, BarChart2,
  CheckCircle2, AlertTriangle, Database, Cpu, ExternalLink,
  FlaskConical, BookOpen, PlayCircle, Table2, Upload, FileSpreadsheet,
} from "lucide-react";

type RiskLevel = "critical" | "high" | "medium" | "low";

interface NewSample {
  title: string;
  description: string;
  category: string;
  riskLevel: RiskLevel;
}

const RISK_COLORS: Record<RiskLevel, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};

export default function AdminML() {
  const [samples, setSamples] = useState<NewSample[]>([
    { title: "", description: "", category: "", riskLevel: "medium" },
  ]);
  const [retrainResult, setRetrainResult] = useState<{
    success: boolean;
    message: string;
    metrics?: Record<string, unknown>;
  } | null>(null);
  const [evalResult, setEvalResult] = useState<{
    success: boolean;
    evaluation: {
      dataset: string;
      dataset_size: number;
      eval_accuracy: number;
      per_category: Record<string, { precision: number; recall: number; f1_score: number; support: number }>;
      macro_avg: { precision: number; recall: number; f1_score: number };
      weighted_avg: { precision: number; recall: number; f1_score: number };
      confusion_matrix: { labels: string[]; matrix: number[][] };
      evaluated_at: string;
    };
  } | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "training" | "evaluation">("overview");

  // Upload de dataset
  const [uploadTrainFile, setUploadTrainFile] = useState<File | null>(null);
  const [uploadEvalFile, setUploadEvalFile] = useState<File | null>(null);
  const [isDraggingTrain, setIsDraggingTrain] = useState(false);
  const [isDraggingEval, setIsDraggingEval] = useState(false);

  const metricsQuery = trpc.admin.getMLMetrics.useQuery();
  const datasetQuery = trpc.admin.getDataset.useQuery();
  const evalDatasetQuery = trpc.admin.getEvalDataset.useQuery();

  const retrainMutation = trpc.admin.retrainModel.useMutation({
    onSuccess: (data: { success: boolean; message: string; metrics: Record<string, unknown> }) => {
      setRetrainResult(data);
      toast.success(data.message);
      void metricsQuery.refetch();
    },
    onError: (err: { message: string }) => {
      toast.error(`Erro ao retreinar: ${err.message}`);
    },
  });

  const uploadTrainMutation = trpc.admin.uploadTrainDataset.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setUploadTrainFile(null);
      void datasetQuery.refetch();
    },
    onError: (err: { message: string }) => {
      const isOffline = err.message.includes('offline') || err.message.includes('indisponível');
      toast.error(isOffline
        ? 'Serviço ML offline. Acesse Saúde do Sistema para reiniciar o Flask.'
        : `Erro no upload: ${err.message}`,
        { description: isOffline ? 'Menu Admin → Saúde do Sistema → Reiniciar Serviço' : undefined, duration: 8000 }
      );
    },
  });

  const uploadEvalMutation = trpc.admin.uploadEvalDataset.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setUploadEvalFile(null);
      void evalDatasetQuery.refetch();
    },
    onError: (err: { message: string }) => {
      const isOffline = err.message.includes('offline') || err.message.includes('indisponível');
      toast.error(isOffline
        ? 'Serviço ML offline. Acesse Saúde do Sistema para reiniciar o Flask.'
        : `Erro no upload: ${err.message}`,
        { description: isOffline ? 'Menu Admin → Saúde do Sistema → Reiniciar Serviço' : undefined, duration: 8000 }
      );
    },
  });

  const handleUploadTrain = async () => {
    if (!uploadTrainFile) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadTrainMutation.mutate({ fileBase64: base64, filename: uploadTrainFile.name });
    };
    reader.readAsDataURL(uploadTrainFile);
  };

  const handleUploadEval = async () => {
    if (!uploadEvalFile) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadEvalMutation.mutate({ fileBase64: base64, filename: uploadEvalFile.name });
    };
    reader.readAsDataURL(uploadEvalFile);
  };

  const evaluateMutation = trpc.admin.evaluateModel.useMutation({
    onSuccess: (data) => {
      setEvalResult(data);
      toast.success(`Avaliação concluída! Acurácia: ${Math.round(data.evaluation.eval_accuracy * 100)}%`);
      void metricsQuery.refetch();
      setActiveTab("evaluation");
    },
    onError: (err: { message: string }) => {
      toast.error(`Erro na avaliação: ${err.message}`);
    },
  });

  const DATASET_CDN_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663148675640/KjT4emSwzjBHV8i56oSYsp/incidentes_cybersecurity_2000_1070ebab.xlsx";
  const EVAL_DATASET_CDN_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663148675640/KjT4emSwzjBHV8i56oSYsp/incidentes_cybersecurity_100_9671eb41.xlsx";
  const ONLINE_VIEWER_URL = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(DATASET_CDN_URL)}`;

  const handleDownloadDataset = () => {
    const a = document.createElement("a");
    a.href = DATASET_CDN_URL;
    a.download = "dataset_cybersecurity_5000_amostras.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Download iniciado: dataset_cybersecurity_5000_amostras.xlsx (5000 amostras)");
  };

  const handleDownloadEvalDataset = () => {
    const a = document.createElement("a");
    a.href = EVAL_DATASET_CDN_URL;
    a.download = "incidentes_cybersecurity_100.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Download iniciado: incidentes_cybersecurity_100.xlsx");
  };

  const addSample = () => {
    setSamples((prev) => [...prev, { title: "", description: "", category: "", riskLevel: "medium" }]);
  };

  const removeSample = (index: number) => {
    setSamples((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSample = (index: number, field: keyof NewSample, value: string) => {
    setSamples((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const handleRetrain = () => {
    const validSamples = samples.filter((s) => s.description.trim() && s.category.trim());
    const risk_map: Record<string, RiskLevel> = {};
    for (const s of validSamples) {
      risk_map[s.category.toLowerCase().replace(/\s+/g, "_")] = s.riskLevel;
    }
    retrainMutation.mutate({
      samples: validSamples.map((s) => ({
        title: s.title || undefined,
        description: s.description,
        category: s.category.toLowerCase().replace(/\s+/g, "_"),
      })),
      risk_map,
      includeAllIncidents: true,
    });
  };

  const metrics = metricsQuery.data;
  const dataset = datasetQuery.data;
  const evalDataset = evalDatasetQuery.data;

  // Métricas de treino e avaliação
  const trainingMetrics = metrics?.training;
  const evaluationMetrics = metrics?.evaluation ?? evalResult?.evaluation ?? null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header com indicadores de dataset */}
        <div>
          <h1 className="soc-page-title flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Machine Learning
          </h1>
          <p className="soc-page-sub">
            Classificação automática de incidentes via TF-IDF + Naive Bayes
          </p>
        </div>

        {/* Tabs de navegação */}
        <div className="flex gap-1 border-b border-border">
          {[
            { id: "overview", label: "Visão Geral", icon: BarChart2 },
            { id: "training", label: "Treinamento", icon: BookOpen },
            { id: "evaluation", label: "Avaliação", icon: FlaskConical },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ─── ABA: VISÃO GERAL ─────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Cards de métricas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-card border-border">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu className="w-4 h-4 text-primary" />
                    <span className="text-xs font-mono text-muted-foreground">Método</span>
                  </div>
                  <p className="text-sm font-mono font-medium text-foreground">
                    TF-IDF + Naive Bayes
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-mono text-muted-foreground">Acurácia Treinamento</span>
                  </div>
                  <p className="text-2xl font-mono font-bold text-blue-400">
                    {metricsQuery.isLoading ? "..." : `${Math.round((trainingMetrics?.train_accuracy ?? metrics?.train_accuracy ?? 0) * 100)}%`}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">CV: {metricsQuery.isLoading ? "..." : `${Math.round((trainingMetrics?.cv_accuracy_mean ?? metrics?.cv_accuracy_mean ?? 0) * 100)}%`}</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <FlaskConical className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-mono text-muted-foreground">Acurácia Avaliação</span>
                  </div>
                  {evaluationMetrics ? (
                    <>
                      <p className="text-2xl font-mono font-bold text-purple-400">
                        {Math.round(evaluationMetrics.eval_accuracy * 100)}%
                      </p>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">
                        F1: {Math.round((evaluationMetrics.weighted_avg?.f1_score ?? 0) * 100)}%
                      </p>
                    </>
                  ) : (
                    <div>
                      <p className="text-sm font-mono text-muted-foreground">Não avaliado</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-mono text-xs gap-1 mt-1 h-6"
                        onClick={() => evaluateMutation.mutate()}
                        disabled={evaluateMutation.isPending}
                      >
                        <PlayCircle className="w-3 h-3" />
                        Avaliar agora
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-mono text-muted-foreground">Datasets</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <span className="text-xs font-mono text-foreground">
                        {trainingMetrics?.dataset_size ?? metrics?.dataset_size ?? 2000} treino
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-purple-400" />
                      <span className="text-xs font-mono text-foreground">
                        {evalDataset?.total_samples ?? 100} avaliação
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Categorias e Distribuição */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" />
                    Categorias do Modelo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {metricsQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground font-mono">Carregando...</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(dataset?.category_distribution ?? trainingMetrics?.category_distribution ?? metrics?.category_distribution ?? {}).length > 0
                        ? Object.keys(dataset?.category_distribution ?? trainingMetrics?.category_distribution ?? {})
                        : (metrics?.categories ?? [])
                      ).map((cat: string) => (
                        <Badge key={cat} variant="outline" className="font-mono text-xs">
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-blue-400" />
                    Distribuição — Dataset de Treino
                    <Badge variant="outline" className="text-xs font-mono border-blue-500/30 text-blue-400">
                      {Object.values(trainingMetrics?.category_distribution ?? metrics?.category_distribution ?? {}).reduce((acc, v) => acc + Number(v), 0) || (trainingMetrics?.dataset_size ?? metrics?.dataset_size ?? 0)} amostras
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {metricsQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground font-mono">Carregando...</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(trainingMetrics?.category_distribution ?? metrics?.category_distribution ?? {}).map(([cat, count]) => {
                        const c = Number(count);
                        const total = trainingMetrics?.dataset_size ?? metrics?.dataset_size ?? 1;
                        return (
                          <div key={cat} className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground w-32 truncate">{cat}</span>
                            <div className="flex-1 bg-muted/30 rounded-full h-1.5">
                              <div
                                className="bg-blue-400 h-1.5 rounded-full"
                                style={{ width: `${Math.round((c / total) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono text-foreground w-8 text-right">{c}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>



            {/* Botão de avaliação rápida */}
            <Card className="bg-card border-border border-purple-500/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
                      <FlaskConical className="w-4 h-4 text-purple-400" />
                      Avaliar Modelo com Dataset Independente
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-1">
                      Executa a avaliação do modelo usando as{" "}
                      <span className="text-purple-400 font-semibold">100 amostras de avaliação</span>{" "}
                      (nunca usadas no treino). Retorna acurácia, F1-score e matriz de confusão.
                    </p>
                    {metrics?.last_evaluated && (
                      <p className="text-xs font-mono text-muted-foreground mt-1">
                        Última avaliação:{" "}
                        <span className="text-foreground">
                          {new Date(metrics.last_evaluated).toLocaleString("pt-BR")}
                        </span>
                      </p>
                    )}
                  </div>
                  <Button
                    className="font-mono text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => evaluateMutation.mutate()}
                    disabled={evaluateMutation.isPending}
                  >
                    {evaluateMutation.isPending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PlayCircle className="w-3.5 h-3.5" />
                    )}
                    {evaluateMutation.isPending ? "Avaliando..." : "Executar Avaliação"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── ABA: TREINAMENTO ─────────────────────────────────────────── */}
        {activeTab === "training" && (
          <div className="space-y-6">
            {/* Dataset de Treinamento */}
            <Card className="bg-card border-border border-blue-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-400" />
                  Dataset de Treinamento
                  <Badge className="text-xs font-mono bg-blue-500/20 text-blue-400 border-blue-500/30">TREINO</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-xs font-mono text-muted-foreground">
                      Arquivo: <button onClick={handleDownloadDataset} className="text-blue-400 font-semibold hover:text-blue-300 underline underline-offset-2 cursor-pointer">incidentes_cybersecurity_2000.xlsx</button>
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">
                      Total: <span className="text-foreground">{dataset?.total_samples ?? metrics?.dataset_size ?? "2000"} amostras</span>
                      {" · "}
                      Categorias:{" "}
                      <span className="text-foreground font-medium">
                        {dataset?.category_distribution
                          ? Object.keys(dataset.category_distribution).length
                          : metrics?.categories?.length ?? "5"}
                      </span>
                      {" · "}
                      <span className="text-blue-400 font-semibold">Usado para treinar o modelo</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="font-mono text-xs gap-1.5" onClick={handleDownloadDataset}>
                      <Download className="w-3.5 h-3.5" />
                      Download XLSX
                    </Button>
                    <Button size="sm" variant="outline" className="font-mono text-xs gap-1.5" onClick={() => window.open(ONLINE_VIEWER_URL, "_blank")}>
                      <ExternalLink className="w-3.5 h-3.5" />
                      Visualizar Online
                    </Button>
                  </div>
                </div>

                {dataset?.preview && dataset.preview.length > 0 && (
                  <div>
                    <p className="text-xs font-mono text-muted-foreground mb-2">Prévia das primeiras amostras:</p>
                    <div className="border border-border rounded-md overflow-hidden">
                      <table className="soc-table w-full text-xs font-mono">
                        <thead>
                          <tr className="bg-blue-500/5">
                            <th className="px-3 py-2 text-left text-muted-foreground font-medium">Título</th>
                            <th className="px-3 py-2 text-left text-muted-foreground font-medium">Descrição</th>
                            <th className="px-3 py-2 text-left text-muted-foreground font-medium">Categoria</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dataset.preview.slice(0, 5).map((row: { title: string; description: string; category: string }, i: number) => (
                            <tr key={i} className="border-t border-border/50">
                              <td className="px-3 py-2 text-foreground truncate max-w-[150px]">{row.title || "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{row.description}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-400">{row.category}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upload de Dataset de Treino */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  Substituir Dataset de Treinamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs font-mono text-muted-foreground">
                  Envie um novo arquivo <span className="text-foreground font-semibold">.xlsx</span> para substituir o dataset de treinamento atual.
                  Após o upload, execute o retreinamento para aplicar as mudanças.
                </p>
                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                    isDraggingTrain ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingTrain(true); }}
                  onDragLeave={() => setIsDraggingTrain(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingTrain(false);
                    const file = e.dataTransfer.files[0];
                    if (file && file.name.endsWith(".xlsx")) setUploadTrainFile(file);
                    else toast.error("Apenas arquivos .xlsx são aceitos");
                  }}
                  onClick={() => document.getElementById("upload-train-input")?.click()}
                >
                  <input
                    id="upload-train-input"
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setUploadTrainFile(file);
                    }}
                  />
                  {uploadTrainFile ? (
                    <div className="flex items-center justify-center gap-2 text-sm font-mono text-foreground">
                      <FileSpreadsheet className="w-4 h-4 text-green-400" />
                      <span>{uploadTrainFile.name}</span>
                      <span className="text-muted-foreground">({(uploadTrainFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <Upload className="w-6 h-6 mx-auto mb-1 opacity-50" />
                      <p className="text-xs font-mono">Arraste um arquivo .xlsx ou clique para selecionar</p>
                    </div>
                  )}
                </div>
                {uploadTrainFile && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="font-mono text-xs gap-1.5"
                      onClick={handleUploadTrain}
                      disabled={uploadTrainMutation.isPending}
                    >
                      {uploadTrainMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {uploadTrainMutation.isPending ? "Enviando..." : "Enviar Dataset"}
                    </Button>
                    <Button size="sm" variant="ghost" className="font-mono text-xs" onClick={() => setUploadTrainFile(null)}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Retreinamento */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-primary" />
                    Retreinar Modelo com Novas Categorias
                  </CardTitle>
                  {metrics?.last_updated ? (
                    <span className="text-xs font-mono text-muted-foreground">
                      Último treino:{" "}
                      <span className="text-foreground font-medium">
                        {new Date(metrics.last_updated).toLocaleString("pt-BR")}
                      </span>
                    </span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-xs font-mono text-blue-400 font-semibold mb-1 flex items-center gap-1.5">
                    <Table2 className="w-3.5 h-3.5" />
                    Dataset de Treino: incidentes_cybersecurity_2000.xlsx
                  </p>
                  <p className="text-xs font-mono text-muted-foreground">
                    O retreinamento usa as <span className="text-blue-400 font-semibold">2000 amostras de treino</span> + incidentes do banco de dados + amostras manuais abaixo.
                    O <span className="text-purple-400 font-semibold">dataset de avaliação (100 amostras) nunca é incluído no treino</span>, garantindo avaliação independente.
                  </p>
                </div>

                <div className="space-y-3">
                  {samples.map((sample, index) => (
                    <div key={index} className="border border-border/50 rounded-lg p-3 space-y-2 bg-muted/5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-muted-foreground">Amostra #{index + 1}</span>
                        {samples.length > 1 && (
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => removeSample(index)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs font-mono text-muted-foreground">Título (opcional)</Label>
                          <Input className="h-8 text-xs font-mono mt-1" placeholder="Ex: Email de phishing detectado" value={sample.title} onChange={(e) => updateSample(index, "title", e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-xs font-mono text-muted-foreground">Categoria <span className="text-destructive">*</span></Label>
                          <Input className="h-8 text-xs font-mono mt-1" placeholder="Ex: engenharia_social" value={sample.category} onChange={(e) => updateSample(index, "category", e.target.value)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="md:col-span-2">
                          <Label className="text-xs font-mono text-muted-foreground">Descrição <span className="text-destructive">*</span></Label>
                          <Textarea className="text-xs font-mono mt-1 min-h-[60px] resize-none" placeholder="Descreva o incidente..." value={sample.description} onChange={(e) => updateSample(index, "description", e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-xs font-mono text-muted-foreground">Nível de Risco</Label>
                          <Select value={sample.riskLevel} onValueChange={(v) => updateSample(index, "riskLevel", v)}>
                            <SelectTrigger className="h-8 text-xs font-mono mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(["critical", "high", "medium", "low"] as RiskLevel[]).map((r) => (
                                <SelectItem key={r} value={r} className="text-xs font-mono">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-mono border ${RISK_COLORS[r]}`}>{RISK_LABELS[r]}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="font-mono text-xs gap-1.5" onClick={addSample}>
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Amostra
                  </Button>
                  <Button size="sm" className="font-mono text-xs gap-1.5" onClick={handleRetrain} disabled={retrainMutation.isPending}>
                    {retrainMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                    {retrainMutation.isPending ? "Retreinando..." : "Retreinar Modelo"}
                  </Button>
                </div>

                {retrainResult && (
                  <div className={`border rounded-lg p-3 ${retrainResult.success ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {retrainResult.success ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
                      <span className="text-xs font-mono font-medium text-foreground">
                        {retrainResult.success ? "Retreinamento concluído" : "Erro no retreinamento"}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground">{retrainResult.message}</p>
                    {retrainResult.metrics && (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                        <div><span className="text-muted-foreground">Amostras treino: </span><span className="text-blue-400">{String(retrainResult.metrics.dataset_size)}</span></div>
                        <div><span className="text-muted-foreground">Acurácia treino: </span><span className="text-green-400">{Math.round(Number(retrainResult.metrics.train_accuracy) * 100)}%</span></div>
                        <div><span className="text-muted-foreground">Validação Cruzada (CV): </span><span className="text-blue-400">{Math.round(Number(retrainResult.metrics.cv_accuracy_mean) * 100)}% ±{Math.round(Number(retrainResult.metrics.cv_accuracy_std) * 100)}%</span></div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── ABA: AVALIAÇÃO ───────────────────────────────────────────── */}
        {activeTab === "evaluation" && (
          <div className="space-y-6">
            {/* Dataset de Avaliação */}
            <Card className="bg-card border-border border-purple-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-purple-400" />
                  Dataset de Avaliação
                  <Badge className="text-xs font-mono bg-purple-500/20 text-purple-400 border-purple-500/30">AVALIAÇÃO</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-xs font-mono text-muted-foreground">
                      Arquivo: <button onClick={handleDownloadEvalDataset} className="text-purple-400 font-semibold hover:text-purple-300 underline underline-offset-2 cursor-pointer">incidentes_cybersecurity_100.xlsx</button>
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">
                      Total: <span className="text-foreground">{evalDataset?.total_samples ?? "100"} amostras</span>
                      {" · "}
                      <span className="text-purple-400 font-semibold">Conjunto independente — nunca usado no treino</span>
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="font-mono text-xs gap-1.5" onClick={handleDownloadEvalDataset}>
                    <Download className="w-3.5 h-3.5" />
                    Download XLSX
                  </Button>
                </div>

                {evalDataset?.preview && evalDataset.preview.length > 0 && (
                  <div>
                    <p className="text-xs font-mono text-muted-foreground mb-2">Prévia das primeiras amostras:</p>
                    <div className="border border-border rounded-md overflow-hidden">
                      <table className="soc-table w-full text-xs font-mono">
                        <thead>
                          <tr className="bg-purple-500/5">
                            <th className="px-3 py-2 text-left text-muted-foreground font-medium">Título</th>
                            <th className="px-3 py-2 text-left text-muted-foreground font-medium">Descrição</th>
                            <th className="px-3 py-2 text-left text-muted-foreground font-medium">Categoria</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evalDataset.preview.slice(0, 5).map((row: { title: string; description: string; category: string }, i: number) => (
                            <tr key={i} className="border-t border-border/50">
                              <td className="px-3 py-2 text-foreground truncate max-w-[150px]">{row.title || "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{row.description}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400">{row.category}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upload de Dataset de Avaliação */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
                  <Upload className="w-4 h-4 text-purple-400" />
                  Substituir Dataset de Avaliação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs font-mono text-muted-foreground">
                  Envie um novo arquivo <span className="text-foreground font-semibold">.xlsx</span> para substituir o dataset de avaliação atual.
                  Após o upload, execute a avaliação para ver as novas métricas.
                </p>
                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                    isDraggingEval ? "border-purple-400 bg-purple-500/5" : "border-border hover:border-purple-500/50"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingEval(true); }}
                  onDragLeave={() => setIsDraggingEval(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingEval(false);
                    const file = e.dataTransfer.files[0];
                    if (file && file.name.endsWith(".xlsx")) setUploadEvalFile(file);
                    else toast.error("Apenas arquivos .xlsx são aceitos");
                  }}
                  onClick={() => document.getElementById("upload-eval-input")?.click()}
                >
                  <input
                    id="upload-eval-input"
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setUploadEvalFile(file);
                    }}
                  />
                  {uploadEvalFile ? (
                    <div className="flex items-center justify-center gap-2 text-sm font-mono text-foreground">
                      <FileSpreadsheet className="w-4 h-4 text-green-400" />
                      <span>{uploadEvalFile.name}</span>
                      <span className="text-muted-foreground">({(uploadEvalFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <Upload className="w-6 h-6 mx-auto mb-1 opacity-50" />
                      <p className="text-xs font-mono">Arraste um arquivo .xlsx ou clique para selecionar</p>
                    </div>
                  )}
                </div>
                {uploadEvalFile && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="font-mono text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={handleUploadEval}
                      disabled={uploadEvalMutation.isPending}
                    >
                      {uploadEvalMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {uploadEvalMutation.isPending ? "Enviando..." : "Enviar Dataset"}
                    </Button>
                    <Button size="sm" variant="ghost" className="font-mono text-xs" onClick={() => setUploadEvalFile(null)}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Botão de avaliação */}
            <div className="flex items-center gap-3">
              <Button
                className="font-mono text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => evaluateMutation.mutate()}
                disabled={evaluateMutation.isPending}
              >
                {evaluateMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                {evaluateMutation.isPending ? "Avaliando..." : "Executar Avaliação com 100 Amostras"}
              </Button>
              {metrics?.last_evaluated && (
                <span className="text-xs font-mono text-muted-foreground">
                  Última avaliação: <span className="text-foreground">{new Date(metrics.last_evaluated).toLocaleString("pt-BR")}</span>
                </span>
              )}
            </div>

            {/* Resultado da avaliação */}
            {evaluationMetrics && (
              <div className="space-y-4">
                {/* Métricas gerais */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-card border-purple-500/20">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs font-mono text-muted-foreground">Acurácia Geral</p>
                      <p className="text-3xl font-mono font-bold text-purple-400 mt-1">
                        {Math.round(evaluationMetrics.eval_accuracy * 100)}%
                      </p>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">
                        {evaluationMetrics.dataset_size} amostras avaliadas
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card border-border">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs font-mono text-muted-foreground">F1-Score (Macro)</p>
                      <p className="text-3xl font-mono font-bold text-green-400 mt-1">
                        {Math.round((evaluationMetrics.macro_avg?.f1_score ?? 0) * 100)}%
                      </p>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">
                        Precisão: {Math.round((evaluationMetrics.macro_avg?.precision ?? 0) * 100)}%
                        {" · "}
                        Recall: {Math.round((evaluationMetrics.macro_avg?.recall ?? 0) * 100)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card border-border">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs font-mono text-muted-foreground">F1-Score (Ponderado)</p>
                      <p className="text-3xl font-mono font-bold text-blue-400 mt-1">
                        {Math.round((evaluationMetrics.weighted_avg?.f1_score ?? 0) * 100)}%
                      </p>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">
                        Precisão: {Math.round((evaluationMetrics.weighted_avg?.precision ?? 0) * 100)}%
                        {" · "}
                        Recall: {Math.round((evaluationMetrics.weighted_avg?.recall ?? 0) * 100)}%
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Por categoria */}
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono font-semibold text-foreground">
                      Métricas por Categoria
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="border border-border rounded-md overflow-hidden">
                      <table className="soc-table w-full text-xs font-mono">
                        <thead>
                          <tr className="bg-muted/20">
                            <th className="px-3 py-2 text-left text-muted-foreground font-medium">Categoria</th>
                            <th className="px-3 py-2 text-right text-muted-foreground font-medium">Precisão</th>
                            <th className="px-3 py-2 text-right text-muted-foreground font-medium">Recall</th>
                            <th className="px-3 py-2 text-right text-muted-foreground font-medium">F1-Score</th>
                            <th className="px-3 py-2 text-right text-muted-foreground font-medium">Suporte</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(evaluationMetrics.per_category ?? {}).map(([cat, m]) => (
                            <tr key={cat} className="border-t border-border/50">
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400">{cat}</Badge>
                              </td>
                              <td className="px-3 py-2 text-right text-foreground">{Math.round(m.precision * 100)}%</td>
                              <td className="px-3 py-2 text-right text-foreground">{Math.round(m.recall * 100)}%</td>
                              <td className="px-3 py-2 text-right text-green-400 font-semibold">{Math.round(m.f1_score * 100)}%</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{m.support}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Matriz de confusão */}
                {evaluationMetrics.confusion_matrix && (
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-mono font-semibold text-foreground">
                        Matriz de Confusão
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="text-xs font-mono border-collapse">
                          <thead>
                            <tr>
                              <th className="px-2 py-1 text-muted-foreground text-left">Real \ Pred</th>
                              {evaluationMetrics.confusion_matrix.labels.map((lbl) => (
                                <th key={lbl} className="px-2 py-1 text-purple-400 text-center min-w-[70px]">{lbl}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {evaluationMetrics.confusion_matrix.matrix.map((row, i) => (
                              <tr key={i}>
                                <td className="px-2 py-1 text-blue-400 font-semibold">{evaluationMetrics.confusion_matrix.labels[i]}</td>
                                {row.map((val, j) => (
                                  <td
                                    key={j}
                                    className={`px-2 py-1 text-center rounded ${
                                      i === j
                                        ? "bg-green-500/20 text-green-400 font-bold"
                                        : val > 0
                                        ? "bg-red-500/10 text-red-400"
                                        : "text-muted-foreground"
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
                      <p className="text-xs font-mono text-muted-foreground mt-2">
                        Diagonal principal (verde) = classificações corretas. Fora da diagonal (vermelho) = erros.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {!evaluationMetrics && !evaluateMutation.isPending && (
              <div className="text-center py-12 text-muted-foreground">
                <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-mono">Nenhuma avaliação realizada ainda.</p>
                <p className="text-xs font-mono mt-1">Clique em "Executar Avaliação" para avaliar o modelo com as 100 amostras independentes.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
