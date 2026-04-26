import DashboardLayout from "@/components/DashboardLayout";
import {
  AlertDialog,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatDateTimeShort } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import type { inferRouterOutputs } from "@trpc/server";
import { KeyRound, Pencil, Shield, Trash2, UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type UserRow = inferRouterOutputs<AppRouter>["admin"]["listUsers"][number];

export default function AdminUsers() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const list = trpc.admin.listUsers.useQuery(undefined, { enabled: user?.role === "admin" });

  const updateUser = trpc.admin.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário actualizado.");
      void utils.admin.listUsers.invalidate();
      void utils.auth.me.invalidate();
      setEditOpen(false);
      setEditRow(null);
    },
    onError: e => toast.error(e.message),
  });

  const setDefaultPw = trpc.admin.setPasswordToDefault.useMutation({
    onSuccess: () => {
      toast.success("Senha definida como 123456. O usuário deverá alterá-la no próximo acesso.");
      void utils.admin.listUsers.invalidate();
      setDefaultOpen(false);
      setDefaultTarget(null);
    },
    onError: e => toast.error(e.message),
  });

  const deleteUserM = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário removido.");
      void utils.admin.listUsers.invalidate();
      setDeleteOpen(false);
      setDeleteTarget(null);
    },
    onError: e => toast.error(e.message),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"user" | "admin">("user");

  const [defaultOpen, setDefaultOpen] = useState(false);
  const [defaultTarget, setDefaultTarget] = useState<UserRow | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  useEffect(() => {
    if (editRow) {
      setEditName(editRow.name ?? "");
      setEditEmail(editRow.email ?? "");
      setEditRole(editRow.role);
    }
  }, [editRow]);

  if (!loading && user && user.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Não tem permissão para aceder à área de administração de usuários.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--auth-brand)]">Administração</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl flex items-center gap-2">
              <UserCog className="size-7 text-[var(--auth-brand)]" />
              Usuários
            </h1>
            <p className="text-sm text-muted-foreground">
              Editar dados, redefinir com senha padrão <strong>123456</strong> (obriga troca no próximo acesso) ou
              excluir conta.
            </p>
          </div>
        </div>

        <Card className="border-border/60 bg-card/80 shadow-lg dark:border-white/10 dark:bg-slate-950/60">
          <CardHeader>
            <CardTitle className="text-lg">Todas as contas</CardTitle>
            <CardDescription>Modo local: redefinir aplica 123456 e a flag de troca obrigatória.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0 sm:p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="text-right w-[200px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map(u => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        {u.role === "admin" ? (
                          <Shield className="size-4 text-amber-500 shrink-0" aria-hidden />
                        ) : null}
                        <span className="font-medium">{u.name ?? "—"}</span>
                        {u.mustChangePassword ? (
                          <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
                            Trocar senha
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs max-w-[200px] truncate">
                      {u.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          u.role === "admin"
                            ? "border-amber-500/50 text-amber-500"
                            : "border-border text-muted-foreground"
                        }
                      >
                        {u.role === "admin" ? "Admin" : "Usuário"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.hasLocalPassword ? "local" : u.loginMethod ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDateTimeShort(u.lastSignedIn)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Editar"
                          onClick={() => {
                            setEditRow(u);
                            setEditOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[var(--auth-brand)]"
                          title="Redefinir com senha 123456"
                          disabled={u.id === user?.id}
                          onClick={() => {
                            setDefaultTarget(u);
                            setDefaultOpen(true);
                          }}
                        >
                          <KeyRound className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          title="Excluir"
                          disabled={u.id === user?.id}
                          onClick={() => {
                            setDeleteTarget(u);
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {list.data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum usuário.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog
          open={editOpen}
          onOpenChange={o => {
            setEditOpen(o);
            if (!o) setEditRow(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar usuário</DialogTitle>
              <DialogDescription>Altere nome, email e perfil. O email deve ser único.</DialogDescription>
            </DialogHeader>
            {editRow ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="en">Nome</Label>
                  <Input id="en" value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ee">Email</Label>
                  <Input id="ee" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Perfil</Label>
                  <Select value={editRole} onValueChange={v => setEditRole(v as "user" | "admin")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Usuário</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  if (!editRow) return;
                  updateUser.mutate({
                    userId: editRow.id,
                    name: editName.trim(),
                    email: editEmail.trim().toLowerCase(),
                    role: editRole,
                  });
                }}
                disabled={updateUser.isPending}
              >
                {updateUser.isPending ? "A guardar…" : "Guardar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={defaultOpen}
          onOpenChange={o => {
            setDefaultOpen(o);
            if (!o) setDefaultTarget(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Senha padrão 123456</DialogTitle>
              <DialogDescription>
                O usuário <strong>{defaultTarget?.email}</strong> passará a usar a senha <strong>123456</strong> e será
                obrigado a definir uma nova no próximo login. Continuar?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDefaultOpen(false);
                  setDefaultTarget(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="bg-[var(--auth-brand)] hover:bg-[var(--auth-brand-hover)]"
                onClick={() => {
                  if (!defaultTarget) return;
                  setDefaultPw.mutate({ userId: defaultTarget.id });
                }}
                disabled={setDefaultPw.isPending}
              >
                {setDefaultPw.isPending ? "A aplicar…" : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={deleteOpen}
          onOpenChange={o => {
            setDeleteOpen(o);
            if (!o) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação remove <strong>{deleteTarget?.email}</strong> e anula a associação a lotes de análise. Não pode
                ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteUserM.isPending}
                onClick={() => {
                  if (deleteTarget) {
                    deleteUserM.mutate({ userId: deleteTarget.id });
                  }
                }}
              >
                {deleteUserM.isPending ? "A remover…" : "Excluir"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
