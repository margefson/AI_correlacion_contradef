import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Lock, Eye, EyeOff, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

/**
 * Prevent copy/cut/paste on password fields for security.
 */
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

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "Mínimo 8 caracteres", ok: password.length >= 8 },
    { label: "Letra maiúscula", ok: /[A-Z]/.test(password) },
    { label: "Letra minúscula", ok: /[a-z]/.test(password) },
    { label: "Número", ok: /\d/.test(password) },
    { label: "Caractere especial (@#$!...)", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1">
      {checks.map(c => (
        <div key={c.label} className="flex items-center gap-2">
          {c.ok
            ? <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
            : <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />}
          <span className={`text-xs ${c.ok ? "text-green-400" : "text-muted-foreground"}`}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const tokenQuery = trpc.auth.validateResetToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const confirmMutation = trpc.auth.confirmPasswordReset.useMutation({
    onSuccess: () => {
      setDone(true);
      toast.success("Senha redefinida com sucesso!");
    },
    onError: (e) => toast.error(e.message),
  });

  const isPasswordValid =
    newPassword.length >= 8 &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /\d/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword);

  const handleSubmit = () => {
    if (!isPasswordValid) {
      toast.error("A senha não atende aos requisitos mínimos de segurança.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    confirmMutation.mutate({ token, newPassword });
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl p-8 max-w-md w-full text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Link inválido</h2>
          <p className="text-sm text-muted-foreground mb-4">Este link de redefinição é inválido ou está incompleto.</p>
          <Button onClick={() => navigate("/login")} className="w-full">Voltar ao Login</Button>
        </div>
      </div>
    );
  }

  if (tokenQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm font-mono">Validando link...</div>
      </div>
    );
  }

  if (!tokenQuery.data?.valid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Link expirado ou inválido</h2>
          <p className="text-sm text-muted-foreground mb-1">
            {tokenQuery.data?.reason ?? "Este link não é mais válido."}
          </p>
          <p className="text-xs text-yellow-400 mb-4">
            Os links de redefinição expiram em 10 minutos. Solicite um novo link.
          </p>
          <Button onClick={() => navigate("/login")} className="w-full">Solicitar Novo Link</Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Senha redefinida!</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Sua senha foi atualizada com sucesso. Faça login com a nova senha.
          </p>
          <Button onClick={() => navigate("/login")} className="w-full">Ir para o Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>
      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground font-mono">Incident Security System</h1>
          <p className="text-muted-foreground text-sm mt-1">Redefinição de Senha</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-foreground mb-1">Nova Senha</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Crie uma senha segura. Copiar/colar está desabilitado por segurança.
          </p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="new-password" className="text-sm text-muted-foreground">Nova Senha</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="new-password"
                  type={showNew ? "text" : "password"}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="pl-9 pr-9 bg-input border-border"
                  autoComplete="new-password"
                  onCopy={blockClipboard}
                  onCut={blockClipboard}
                  onPaste={blockClipboard}
                  onKeyDown={blockClipboard}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordStrength password={newPassword} />
            </div>

            <div>
              <Label htmlFor="confirm-password" className="text-sm text-muted-foreground">Confirmar Nova Senha</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="pl-9 pr-9 bg-input border-border"
                  autoComplete="new-password"
                  onCopy={blockClipboard}
                  onCut={blockClipboard}
                  onPaste={blockClipboard}
                  onKeyDown={e => {
                    blockClipboard(e);
                    if ("key" in e && e.key === "Enter") handleSubmit();
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> As senhas não coincidem
                </p>
              )}
              {confirmPassword && newPassword === confirmPassword && (
                <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Senhas coincidem
                </p>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={confirmMutation.isPending || !isPasswordValid || newPassword !== confirmPassword}
            >
              {confirmMutation.isPending ? "Salvando..." : "Redefinir Senha"}
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          ICOMP 2026.1 · Segurança da Informação · Grupo ISS
        </p>
      </div>
    </div>
  );
}
