import DashboardLayout from "@/components/DashboardLayout";
import { MermaidBlock } from "@/components/MermaidBlock";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ExternalLink, FolderGit2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const GITHUB_LEGACY_TREE =
  "https://github.com/margefson/AI_correlacion_contradef/tree/main/legacy_artifacts";

function FuncoesMapeadasContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [planilhaDialogOpen, setPlanilhaDialogOpen] = useState(false);
  const [editingFuncao, setEditingFuncao] = useState<string | null>(null);
  const [formFuncao, setFormFuncao] = useState("");
  const [formFluxoUrl, setFormFluxoUrl] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const catalog = trpc.legacyArtifacts.catalog.useQuery();
  const detail = trpc.legacyArtifacts.detail.useQuery(
    { slug: selectedSlug! },
    { enabled: Boolean(selectedSlug) },
  );
  const planilha = trpc.legacyArtifacts.fluxosSpreadsheet.list.useQuery();
  const meta = trpc.legacyArtifacts.meta.useQuery();

  const utils = trpc.useUtils();

  const upsertRow = trpc.legacyArtifacts.fluxosSpreadsheet.upsertRow.useMutation({
    onSuccess: async () => {
      toast.success("Planilha actualizada.");
      await utils.legacyArtifacts.catalog.invalidate();
      await utils.legacyArtifacts.fluxosSpreadsheet.list.invalidate();
      if (selectedSlug) await utils.legacyArtifacts.detail.invalidate({ slug: selectedSlug });
      setPlanilhaDialogOpen(false);
      setEditingFuncao(null);
    },
    onError: err => toast.error(err.message),
  });

  const deleteRow = trpc.legacyArtifacts.fluxosSpreadsheet.deleteRow.useMutation({
    onSuccess: async () => {
      toast.success("Linha removida.");
      await utils.legacyArtifacts.catalog.invalidate();
      await utils.legacyArtifacts.fluxosSpreadsheet.list.invalidate();
      if (selectedSlug) await utils.legacyArtifacts.detail.invalidate({ slug: selectedSlug });
      setDeleteTarget(null);
    },
    onError: err => toast.error(err.message),
  });

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const raw = catalog.data?.items ?? [];
    if (!q.length) return raw;
    return raw.filter(i => i.slug.toLowerCase().includes(q));
  }, [catalog.data?.items, search]);

  useEffect(() => {
    if (selectedSlug) return;
    const first = filteredItems[0]?.slug;
    if (first) setSelectedSlug(first);
  }, [filteredItems, selectedSlug]);

  const openNewRow = () => {
    setEditingFuncao(null);
    setFormFuncao("");
    setFormFluxoUrl("");
    setPlanilhaDialogOpen(true);
  };

  const openEditRow = (funcao: string, url: string | null) => {
    setEditingFuncao(funcao);
    setFormFuncao(funcao);
    setFormFluxoUrl(url ?? "");
    setPlanilhaDialogOpen(true);
  };

  const submitPlanilhaForm = () => {
    upsertRow.mutate({
      funcao: formFuncao.trim(),
      fluxoUrl: formFluxoUrl.trim() ? formFluxoUrl.trim() : "",
    });
  };

  const selectedGithub =
    filteredItems.find(i => i.slug === selectedSlug)?.suggestedGithubUrl ??
    `${GITHUB_LEGACY_TREE}/${encodeURIComponent(selectedSlug ?? "")}`;

  return (
    <div className="space-y-6 pb-10">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Funções mapeadas</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Vista de esboço: catálogo alinhado a{" "}
          <a
            href={GITHUB_LEGACY_TREE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--auth-brand)] hover:underline"
          >
            legacy_artifacts no GitHub
          </a>{" "}
          (repo local relativamente ao servidor). Ao seleccionar uma função carrega‑se o Markdown de método e diagramas
          Mermaid extraídos dos ficheiros. A folha Excel «Fluxo gerado» serve de backlog CRUD — apenas administradores podem gravar linhas nesta primeira versão.
        </p>
        {meta.data ? (
          <p className="text-[11px] text-muted-foreground/90">
            Caminho efectivo das pastas:&nbsp;
            <code className="rounded bg-muted/60 px-1 py-0.5">{meta.data.legacyRootResolved}</code>
            {!catalog.data?.rootReachable ? (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                (pasta inacessível — defina LEGACY_ARTIFACTS_ROOT se o clone estiver noutro sítio)
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="grid min-h-[480px] gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
        <Card className="flex min-h-0 flex-col border-border/80 dark:border-white/10">
          <CardHeader className="shrink-0 pb-2">
            <CardTitle className="text-sm font-medium">Funções &amp; pastas</CardTitle>
            <CardDescription className="text-xs">Pastas em disco + nomes na planilha (backlog).</CardDescription>
            <div className="relative pt-2">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-8 text-sm"
                placeholder="Filtrar…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0 pb-4">
            {catalog.isLoading ? (
              <p className="px-6 text-xs text-muted-foreground">A carregar catálogo…</p>
            ) : (
              <ScrollArea className="h-[min(60vh,520px)]">
                <ul className="space-y-0.5 px-3">
                  {filteredItems.map(it => (
                    <li key={it.slug}>
                      <button
                        type="button"
                        onClick={() => setSelectedSlug(it.slug)}
                        className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                          selectedSlug === it.slug
                            ? "bg-[var(--auth-brand)]/15 text-foreground"
                            : "hover:bg-muted/60 dark:hover:bg-white/5"
                        }`}
                      >
                        <span className="truncate font-medium">{it.slug}</span>
                        <span className="flex shrink-0 flex-wrap gap-1">
                          {it.hasFolderOnDisk ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Pasta
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-300">
                              Só planilha
                            </Badge>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                  {filteredItems.length === 0 ? (
                    <li className="px-3 py-4 text-xs text-muted-foreground">Nenhuma entrada coincide com o filtro.</li>
                  ) : null}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col border-border/80 dark:border-white/10">
          {!selectedSlug ? (
            <CardHeader>
              <CardTitle className="text-sm">Seleccione uma função</CardTitle>
            </CardHeader>
          ) : (
            <>
              <CardHeader className="shrink-0 space-y-1 border-b border-border/60 pb-4 dark:border-white/10">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg font-semibold">{selectedSlug}</CardTitle>
                    <CardDescription className="text-xs">
                      {detail.data?.markdownRelative ?? "Sem ficheiro de fluxo encontrado"}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" asChild>
                      <a href={selectedGithub} target="_blank" rel="noopener noreferrer">
                        <FolderGit2 className="h-3.5 w-3.5" /> GitHub
                        <ExternalLink className="h-3 w-3 opacity-70" />
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" asChild>
                      <a href={GITHUB_LEGACY_TREE} target="_blank" rel="noopener noreferrer">
                        Árvore <ExternalLink className="h-3 w-3 opacity-70" />
                      </a>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 p-4">
                {detail.isFetching ? (
                  <p className="text-xs text-muted-foreground">A carregar conteúdo…</p>
                ) : (
                  <Tabs defaultValue="diagram" className="w-full">
                    <TabsList className="mb-3 h-9">
                      <TabsTrigger value="diagram" className="text-xs">
                        Diagrama ({detail.data?.mermaidCharts?.length ?? 0})
                      </TabsTrigger>
                      <TabsTrigger value="markdown" className="text-xs">
                        Markdown integral
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="diagram" className="min-h-[280px] space-y-3">
                      {detail.data?.mermaidCharts?.length ? (
                        detail.data.mermaidCharts.map((src, idx) => (
                          <div
                            key={`${selectedSlug}-${idx}`}
                            className="rounded-xl border border-border/70 bg-muted/20 p-3 dark:border-white/10 dark:bg-black/35"
                          >
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Bloco {idx + 1}
                            </p>
                            <MermaidBlock chart={src} className="mermaid-svg-wrap overflow-auto [&_svg]:max-w-full [&_svg]:h-auto" />
                          </div>
                        ))
                      ) : (
                        <p className="rounded-lg border border-dashed border-muted-foreground/30 p-6 text-xs text-muted-foreground">
                          Sem código Mermaid extraído nesta entrada (só há narrativa textual, ou a pasta ainda está em backlog).
                          Pode sempre abrir a pasta em GitHub.
                        </p>
                      )}
                    </TabsContent>
                    <TabsContent value="markdown" className="min-h-[280px]">
                      <pre className="max-h-[min(55vh,640px)] overflow-auto rounded-xl border border-border/70 bg-black/35 p-3 text-[11px] leading-relaxed text-muted-foreground dark:border-white/10">
                        {detail.data?.markdown?.trim() ??
                          "// Nenhum ficheiro Markdown local foi encontrado para esta entrada."}
                      </pre>
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>

      <Card className="border-border/80 dark:border-white/10">
        <CardHeader className="flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
          <div className="space-y-1">
            <CardTitle className="text-base">
              Planilha <code className="text-sm font-normal">fluxos_mapeados.xlsx</code>{" "}
              <span className="font-normal text-muted-foreground">(folha M1)</span>
            </CardTitle>
            <CardDescription className="text-xs max-w-xl">
              Colunas modelo: <strong>Funcao</strong> e <strong>Fluxo gerado?</strong>. Use para registar próximos pivôs ou ligações à pasta já publicada.
              Gravação física no servidor espera este repositório ao lado (<code>.xlsx</code> sob <code>legacy_artifacts/</code>) ou <code>LEGACY_ARTIFACTS_ROOT</code> correcto em produção.
            </CardDescription>
          </div>
          {isAdmin ? (
            <Button size="sm" className="h-9 gap-1 shrink-0" onClick={openNewRow}>
              <Plus className="h-4 w-4" /> Nova linha
            </Button>
          ) : (
            <Badge variant="outline" className="w-fit text-[10px]">
              Administrador pode editar
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {planilha.isLoading ? (
            <p className="text-xs text-muted-foreground">A ler planilha…</p>
          ) : (
            <div className="rounded-lg border border-border/60 overflow-hidden dark:border-white/10">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[220px]">Funcao</TableHead>
                    <TableHead>Fluxo gerado?</TableHead>
                    {isAdmin ? <TableHead className="text-right">Acções</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(planilha.data?.rows ?? []).map(row => (
                    <TableRow key={row.funcao}>
                      <TableCell className="align-top font-mono text-xs font-medium">{row.funcao}</TableCell>
                      <TableCell className="max-w-xl align-top">
                        {row.fluxoUrl ? (
                          <a
                            href={row.fluxoUrl}
                            className="break-all text-xs text-[var(--auth-brand)] hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {row.fluxoUrl}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">Backlog · sem URL definida</span>
                        )}
                      </TableCell>
                      {isAdmin ? (
                        <TableCell className="text-right align-top">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEditRow(row.funcao, row.fluxoUrl)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title="Eliminar linha da planilha"
                              onClick={() => setDeleteTarget(row.funcao)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={planilhaDialogOpen} onOpenChange={setPlanilhaDialogOpen}>
        <DialogContent className="max-w-md border-border bg-background dark:border-white/10">
          <DialogHeader>
            <DialogTitle>{editingFuncao ? "Actualizar entrada" : "Nova função"}</DialogTitle>
            <DialogDescription>
              Nome deve coincidir com a pasta quando houver código em <code>legacy_artifacts/</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="funcao-plane">Nome (API / pivô)</Label>
              <Input
                id="funcao-plane"
                disabled={Boolean(editingFuncao)}
                value={formFuncao}
                onChange={e => setFormFuncao(e.target.value)}
                placeholder="Ex.: GetCommandLineW"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fluxo-url">Fluxo gerado (URL GitHub opcional)</Label>
              <Textarea
                id="fluxo-url"
                className="min-h-[72px] text-xs font-mono"
                value={formFluxoUrl}
                onChange={e => setFormFluxoUrl(e.target.value)}
                placeholder={`${GITHUB_LEGACY_TREE}/`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanilhaDialogOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={upsertRow.isPending || !formFuncao.trim()} onClick={submitPlanilhaForm}>
              Guardar na planilha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover &quot;{deleteTarget}&quot; da planilha?</AlertDialogTitle>
            <AlertDialogDescription>
              Isto apenas remove a linha do Excel — não apaga pastas nem ficheiros do repositório.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteRow.isPending}
              onClick={() => deleteTarget && deleteRow.mutate({ funcao: deleteTarget })}
            >
              Eliminar linha
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function FuncoesMapeadas() {
  return (
    <DashboardLayout>
      <FuncoesMapeadasContent />
    </DashboardLayout>
  );
}
