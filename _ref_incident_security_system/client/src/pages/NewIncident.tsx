import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Zap } from "lucide-react";

const SEV: Record<string, string> = {
  critical: "text-red-400 bg-red-400/10 border-red-400/30",
  high:     "text-orange-400 bg-orange-400/10 border-orange-400/30",
  medium:   "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  low:      "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
};

export default function NewIncident() {
  const [, navigate] = useLocation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<{ category: string; riskLevel: string; confidence: number } | null>(null);

  const { data: categories } = trpc.categories.list.useQuery();

  const createMutation = trpc.incidents.create.useMutation({
    onSuccess: (inc) => {
      toast.success("Incidente registrado com sucesso!");
      navigate(`/incidents/${inc.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const classifyMutation = trpc.incidents.classify.useMutation({
    onSuccess: (result) => setPreview(result),
    onError: () => setPreview(null),
  });

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    if (val.length > 20) {
      classifyMutation.mutate({ description: val });
    } else {
      setPreview(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/incidents")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground font-mono">Novo Incidente</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Registre e classifique automaticamente</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <div>
            <Label className="text-sm text-muted-foreground font-mono">Título do Incidente</Label>
            <Input placeholder="Ex: Tentativa de phishing via email corporativo" value={title} onChange={e => setTitle(e.target.value)} className="mt-1.5 bg-input border-border font-mono text-sm" />
          </div>
          <div>
            <Label className="text-sm text-muted-foreground font-mono">Descrição Detalhada</Label>
            <Textarea placeholder="Descreva o incidente em detalhes para a classificação automática..." value={description} onChange={e => handleDescriptionChange(e.target.value)} className="mt-1.5 bg-input border-border font-mono text-sm min-h-[140px]" />
            <p className="text-xs text-muted-foreground mt-1">A classificação ML é ativada automaticamente após 20 caracteres.</p>
          </div>

          {preview && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground font-mono">Classificação Automática (ML)</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground font-mono mb-1">Categoria</p>
                  <span className="text-xs px-2 py-0.5 rounded border font-mono capitalize text-primary bg-primary/10 border-primary/30">{preview.category.replace("_", " ")}</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-mono mb-1">Risco</p>
                  <span className={`text-xs px-2 py-0.5 rounded border font-mono ${SEV[preview.riskLevel] ?? SEV.low}`}>{preview.riskLevel}</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-mono mb-1">Confiança</p>
                  <span className="text-xs font-mono text-foreground">{Math.round(preview.confidence * 100)}%</span>
                </div>
              </div>
            </div>
          )}

          {categories && categories.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground font-mono mb-2">Categorias disponíveis:</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map(cat => (
                  <span key={cat.id} className="text-xs px-2 py-0.5 rounded border font-mono text-muted-foreground bg-muted/30 border-border">{cat.name}</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={() => createMutation.mutate({ title, description })} disabled={createMutation.isPending || !title || !description} className="font-mono">
              {createMutation.isPending ? "Registrando..." : "Registrar Incidente"}
            </Button>
            <Button variant="outline" onClick={() => navigate("/incidents")} className="font-mono">Cancelar</Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
