import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PlusCircle, Pencil, Trash2, ShieldAlert, Tag } from "lucide-react";

type Category = {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  createdAt: Date;
};

const DEFAULT_COLORS = [
  "#22d3ee", "#f87171", "#fb923c", "#fbbf24",
  "#34d399", "#a78bfa", "#f472b6", "#60a5fa",
];

export default function AdminCategories() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formColor, setFormColor] = useState("#22d3ee");

  const { data: categories, isLoading } = trpc.categories.list.useQuery();

  const createMutation = trpc.categories.create.useMutation({
    onSuccess: () => {
      toast.success("Categoria criada com sucesso!");
      utils.categories.list.invalidate();
      setShowCreate(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.categories.update.useMutation({
    onSuccess: () => {
      toast.success("Categoria atualizada!");
      utils.categories.list.invalidate();
      setEditTarget(null);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.categories.delete.useMutation({
    onSuccess: () => {
      toast.success("Categoria removida.");
      utils.categories.list.invalidate();
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setFormName("");
    setFormDesc("");
    setFormColor("#22d3ee");
  }

  function openEdit(cat: Category) {
    setEditTarget(cat);
    setFormName(cat.name);
    setFormDesc(cat.description ?? "");
    setFormColor(cat.color ?? "#22d3ee");
  }

  function openCreate() {
    resetForm();
    setShowCreate(true);
  }

  if (user?.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-mono text-sm">Acesso restrito a administradores.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground font-mono">Categorias de Incidentes</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {categories?.length ?? 0} categoria(s) ativa(s)
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2 font-mono text-xs">
            <PlusCircle className="w-4 h-4" /> Nova Categoria
          </Button>
        </div>

        {/* Default categories info */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
          <p className="text-xs text-muted-foreground font-mono">
            <span className="text-primary font-semibold">Categorias padrão do sistema:</span>{" "}
            Phishing, Malware, Força Bruta, DDoS, Vazamento de Dados. Você pode adicionar categorias personalizadas abaixo.
          </p>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Categoria</th>
                <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Descrição</th>
                <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Cor</th>
                <th className="text-left px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Criada em</th>
                <th className="text-right px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground font-mono text-sm">
                    Carregando...
                  </td>
                </tr>
              ) : !categories || categories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <Tag className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">Nenhuma categoria cadastrada</p>
                    <p className="text-xs text-muted-foreground mt-1">Clique em "Nova Categoria" para começar</p>
                  </td>
                </tr>
              ) : (
                categories.map((cat) => (
                  <tr key={cat.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ background: cat.color ?? "#22d3ee" }}
                        />
                        <span className="font-medium text-foreground font-mono capitalize">
                          {cat.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {cat.description ?? <span className="italic text-muted-foreground/50">Sem descrição</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded border border-border"
                          style={{ background: cat.color ?? "#22d3ee" }}
                        />
                        <span className="text-xs font-mono text-muted-foreground">
                          {cat.color ?? "#22d3ee"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-muted-foreground">
                        {new Date(cat.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(cat as Category)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(cat as Category)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground">Nova Categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm text-muted-foreground font-mono">Nome *</Label>
              <Input
                placeholder="Ex: Ransomware, Engenharia Social..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="mt-1.5 bg-input border-border font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground font-mono">Descrição</Label>
              <Textarea
                placeholder="Descreva brevemente esta categoria..."
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="mt-1.5 bg-input border-border font-mono text-sm"
                rows={3}
              />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground font-mono">Cor de identificação</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {DEFAULT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      formColor === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-6 h-6 rounded border border-border" style={{ background: formColor }} />
                <Input
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="w-32 bg-input border-border font-mono text-xs"
                  placeholder="#22d3ee"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="font-mono">
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate({ name: formName, description: formDesc.trim() || "", color: formColor })}
              disabled={createMutation.isPending || !formName.trim()}
              className="font-mono"
            >
              {createMutation.isPending ? "Criando..." : "Criar Categoria"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground">Editar Categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm text-muted-foreground font-mono">Nome *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="mt-1.5 bg-input border-border font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground font-mono">Descrição</Label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="mt-1.5 bg-input border-border font-mono text-sm"
                rows={3}
              />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground font-mono">Cor de identificação</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {DEFAULT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      formColor === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-6 h-6 rounded border border-border" style={{ background: formColor }} />
                <Input
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="w-32 bg-input border-border font-mono text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} className="font-mono">
              Cancelar
            </Button>
            <Button
              onClick={() => editTarget && updateMutation.mutate({
                id: editTarget.id,
                name: formName,
                description: formDesc.trim() || "",
                color: formColor,
              })}
              disabled={updateMutation.isPending || !formName.trim()}
              className="font-mono"
            >
              {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-foreground text-red-400">Excluir Categoria Permanentemente</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground space-y-2">
              <span className="block">
                Tem certeza que deseja <strong className="text-destructive">excluir permanentemente</strong> a categoria{" "}
                <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span>?
              </span>
              <span className="block text-xs">
                O registro será removido fisicamente do banco de dados. Esta ação não pode ser desfeita.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              className="bg-red-600 hover:bg-red-700 font-mono"
            >
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
