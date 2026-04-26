import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldAlert, Users, ShieldCheck, User, Crown, Pencil, Trash2, KeyRound, ShieldHalf } from "lucide-react";

type UserRole = "admin" | "security-analyst" | "user";

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  loginMethod: string;
  isActive: boolean;
  createdAt: Date;
  lastSignedIn: Date;
};

function RoleBadge({ role }: { role: UserRole }) {
  if (role === "admin") {
    return (
      <Badge className="bg-yellow-400/10 text-yellow-400 border-yellow-400/30 font-mono text-xs">
        <Crown className="w-3 h-3 mr-1" /> Admin
      </Badge>
    );
  }
  if (role === "security-analyst") {
    return (
      <Badge className="bg-blue-400/10 text-blue-400 border-blue-400/30 font-mono text-xs">
        <ShieldHalf className="w-3 h-3 mr-1" /> Security Analyst
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
      <User className="w-3 h-3 mr-1" /> Usuário
    </Badge>
  );
}

function RoleIcon({ role }: { role: UserRole }) {
  if (role === "admin") return <Crown className="w-3.5 h-3.5 text-yellow-400" />;
  if (role === "security-analyst") return <ShieldHalf className="w-3.5 h-3.5 text-blue-400" />;
  return <User className="w-3.5 h-3.5 text-primary" />;
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();

  const [roleTarget, setRoleTarget] = useState<{ user: UserRow; newRole: UserRole } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const { data: users, isLoading } = trpc.admin.listUsers.useQuery();

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("Perfil do usuário atualizado com sucesso!");
      utils.admin.listUsers.invalidate();
      setRoleTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateUserMutation = trpc.admin.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Dados do usuário atualizados!");
      utils.admin.listUsers.invalidate();
      setEditTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteUserMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário excluído com sucesso!");
      utils.admin.listUsers.invalidate();
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const resetPasswordMutation = trpc.admin.resetUserPassword.useMutation({
    onSuccess: () => {
      toast.success('Senha resetada para "Security2026@"!');
      setResetTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const openEdit = (u: UserRow) => {
    setEditTarget(u);
    setEditName(u.name ?? "");
    setEditEmail(u.email ?? "");
  };

  if (currentUser?.role !== "admin") {
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

  const adminCount = users?.filter((u) => u.role === "admin").length ?? 0;
  const analystCount = users?.filter((u) => u.role === "security-analyst").length ?? 0;
  const userCount = users?.filter((u) => u.role === "user").length ?? 0;

  // Helper: next promotion target for a user
  const getPromoteAction = (u: UserRow): { label: string; newRole: UserRole; className: string } | null => {
    if (u.role === "user") {
      return { label: "→ Analyst", newRole: "security-analyst", className: "h-7 text-xs font-mono border-blue-400/30 text-blue-400 hover:bg-blue-400/10" };
    }
    if (u.role === "security-analyst") {
      return { label: "→ Admin", newRole: "admin", className: "h-7 text-xs font-mono border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10" };
    }
    return null; // admin cannot be promoted further
  };

  const getDemoteAction = (u: UserRow): { label: string; newRole: UserRole; className: string } | null => {
    if (u.role === "admin") {
      return { label: "← Analyst", newRole: "security-analyst", className: "h-7 text-xs font-mono border-blue-400/30 text-blue-400 hover:bg-blue-400/10" };
    }
    if (u.role === "security-analyst") {
      return { label: "← Usuário", newRole: "user", className: "h-7 text-xs font-mono border-red-400/30 text-red-400 hover:bg-red-400/10" };
    }
    return null; // user cannot be demoted further
  };

  const roleLabel = (role: UserRole) => {
    if (role === "admin") return "Administrador";
    if (role === "security-analyst") return "Security Analyst";
    return "Usuário";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-mono font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Gerenciamento de Usuários
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-1">
              Gerencie perfis, permissões e credenciais. Somente admins podem promover usuários.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="bg-card border border-border rounded-lg px-3 py-2 text-center">
              <p className="text-lg font-mono font-bold text-yellow-400">{adminCount}</p>
              <p className="text-xs text-muted-foreground font-mono">Admins</p>
            </div>
            <div className="bg-card border border-border rounded-lg px-3 py-2 text-center">
              <p className="text-lg font-mono font-bold text-blue-400">{analystCount}</p>
              <p className="text-xs text-muted-foreground font-mono">Analysts</p>
            </div>
            <div className="bg-card border border-border rounded-lg px-3 py-2 text-center">
              <p className="text-lg font-mono font-bold text-primary">{userCount}</p>
              <p className="text-xs text-muted-foreground font-mono">Usuários</p>
            </div>
          </div>
        </div>

        {/* RBAC Info */}
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3">
          <p className="text-xs font-mono text-blue-400 font-semibold mb-1 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Hierarquia de Perfis
          </p>
          <div className="flex flex-wrap gap-4 text-xs font-mono text-muted-foreground">
            <span><span className="text-muted-foreground font-semibold">Usuário</span> — Abre e visualiza incidentes</span>
            <span className="text-muted-foreground">→</span>
            <span><span className="text-blue-400 font-semibold">Security Analyst</span> — Muda status (Em Andamento / Concluído), reclassifica</span>
            <span className="text-muted-foreground">→</span>
            <span><span className="text-yellow-400 font-semibold">Admin</span> — Acesso total, gerencia usuários e ML</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground uppercase tracking-wider">Usuário</th>
                  <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground uppercase tracking-wider">Perfil</th>
                  <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground uppercase tracking-wider">Método Login</th>
                  <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground uppercase tracking-wider">Último Acesso</th>
                  <th className="text-right px-4 py-3 font-mono text-xs text-muted-foreground uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">
                      Carregando usuários...
                    </td>
                  </tr>
                ) : !users?.length ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground font-mono text-xs">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  (users as UserRow[]).map((u) => {
                    const promoteAction = getPromoteAction(u);
                    const demoteAction = getDemoteAction(u);
                    return (
                      <tr key={u.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                              <RoleIcon role={u.role} />
                            </div>
                            <span className="font-mono text-sm text-foreground">
                              {u.name ?? "—"}
                              {u.id === currentUser?.id && (
                                <span className="ml-1 text-xs text-muted-foreground">(você)</span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-muted-foreground">{u.email ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <RoleBadge role={u.role} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-muted-foreground capitalize">{u.loginMethod}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-muted-foreground">
                            {u.lastSignedIn
                              ? new Date(u.lastSignedIn).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {u.id !== currentUser?.id ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEdit(u)}
                                  className="h-7 w-7 p-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted/20"
                                  title="Editar usuário"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setResetTarget(u)}
                                  className="h-7 w-7 p-0 border-blue-400/30 text-blue-400 hover:bg-blue-400/10"
                                  title="Resetar senha"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                </Button>
                                {promoteAction && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setRoleTarget({ user: u, newRole: promoteAction.newRole })}
                                    className={promoteAction.className}
                                    title={`Promover para ${roleLabel(promoteAction.newRole)}`}
                                  >
                                    {promoteAction.label}
                                  </Button>
                                )}
                                {demoteAction && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setRoleTarget({ user: u, newRole: demoteAction.newRole })}
                                    className={demoteAction.className}
                                    title={`Rebaixar para ${roleLabel(demoteAction.newRole)}`}
                                  >
                                    {demoteAction.label}
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setDeleteTarget(u)}
                                  className="h-7 w-7 p-0 border-red-400/30 text-red-400 hover:bg-red-400/10"
                                  title="Excluir usuário"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground/50 font-mono">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-muted/20 border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground font-mono">
            <span className="text-primary font-semibold">Nota:</span>{" "}
            A senha padrão de reset é{" "}
            <span className="text-yellow-400 font-semibold">Security2026@</span> — oriente o usuário a alterá-la no primeiro acesso.
            A exclusão de um usuário remove permanentemente todos os seus incidentes e histórico.
          </p>
        </div>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              Editar Usuário
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Atualize os dados de <span className="font-semibold text-foreground">"{editTarget?.name}"</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-muted-foreground">Nome</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="font-mono text-sm bg-muted/20 border-border"
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-muted-foreground">Email</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="font-mono text-sm bg-muted/20 border-border"
                placeholder="email@exemplo.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} className="font-mono">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!editTarget) return;
                updateUserMutation.mutate({ userId: editTarget.id, name: editName || undefined, email: editEmail || undefined });
              }}
              disabled={updateUserMutation.isPending}
              className="font-mono bg-primary hover:bg-primary/90"
            >
              {updateUserMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password */}
      <AlertDialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-foreground flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-400" />
              Resetar Senha
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              A senha de <span className="font-semibold text-foreground">"{resetTarget?.name}"</span> será redefinida para{" "}
              <span className="font-mono text-yellow-400 font-semibold">Security2026@</span>.
              O usuário deverá alterar a senha no próximo acesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetTarget && resetPasswordMutation.mutate({ userId: resetTarget.id })}
              className="bg-blue-600 hover:bg-blue-700 font-mono"
            >
              {resetPasswordMutation.isPending ? "Resetando..." : "Confirmar Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-foreground flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-400" />
              Excluir Usuário
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Tem certeza que deseja excluir{" "}
              <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span>?
              Esta ação é <span className="text-red-400 font-semibold">irreversível</span> e removerá
              todos os incidentes e histórico deste usuário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteUserMutation.mutate({ userId: deleteTarget.id })}
              className="bg-red-600 hover:bg-red-700 font-mono"
            >
              {deleteUserMutation.isPending ? "Excluindo..." : "Excluir Permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Role Change */}
      <AlertDialog open={!!roleTarget} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-foreground">
              Alterar Perfil: {roleLabel(roleTarget?.newRole ?? "user")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Alterar o perfil de{" "}
              <span className="font-semibold text-foreground">"{roleTarget?.user.name}"</span>{" "}
              de <span className="font-semibold">{roleLabel(roleTarget?.user.role ?? "user")}</span>{" "}
              para{" "}
              <span className={`font-semibold ${
                roleTarget?.newRole === "admin" ? "text-yellow-400" :
                roleTarget?.newRole === "security-analyst" ? "text-blue-400" : "text-green-400"
              }`}>
                {roleLabel(roleTarget?.newRole ?? "user")}
              </span>?
              {roleTarget?.newRole === "security-analyst" && (
                <span className="block mt-1 text-xs">
                  O usuário poderá alterar o status de incidentes (Em Andamento / Concluído) e reclassificar categorias.
                </span>
              )}
              {roleTarget?.newRole === "admin" && (
                <span className="block mt-1 text-xs text-yellow-400">
                  Atenção: este usuário terá acesso total ao painel admin, incluindo gerenciamento de usuários e ML.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => roleTarget && updateRoleMutation.mutate({ userId: roleTarget.user.id, role: roleTarget.newRole })}
              className={
                roleTarget?.newRole === "admin" ? "bg-yellow-600 hover:bg-yellow-700 font-mono" :
                roleTarget?.newRole === "security-analyst" ? "bg-blue-600 hover:bg-blue-700 font-mono" :
                "bg-red-600 hover:bg-red-700 font-mono"
              }
            >
              {updateRoleMutation.isPending ? "Atualizando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
