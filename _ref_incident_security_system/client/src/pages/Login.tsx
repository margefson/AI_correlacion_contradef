import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Lock, Mail, Eye, EyeOff, Copy, ExternalLink, AlertTriangle } from "lucide-react";
import { getLoginUrl } from "@/const";

/**
 * Prevent copy/cut/paste on a password field.
 * Fires a toast warning so the user understands why it was blocked.
 */
function blockClipboard(e: React.ClipboardEvent | React.KeyboardEvent) {
  // Keyboard shortcut check (Ctrl/Cmd + C, X, V)
  if ("key" in e) {
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && ["c", "x", "v"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      toast.warning("Copiar/colar não é permitido no campo de senha por segurança.");
      return;
    }
  }
  // Clipboard events (right-click menu)
  if ("clipboardData" in e) {
    e.preventDefault();
    toast.warning("Copiar/colar não é permitido no campo de senha por segurança.");
  }
}

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [inBandLink, setInBandLink] = useState<string | null>(null);
  const [inBandNote, setInBandNote] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      toast.success("Login realizado com sucesso!");
      await utils.auth.me.invalidate();
      if (data.mustChangePassword) {
        // Redirect to profile page to force password change
        window.location.href = "/profile?mustChangePassword=1";
      } else {
        window.location.href = "/dashboard";
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const forgotMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: (data) => {
      setForgotSent(true);
      // If the email could not be delivered, show the link directly in the UI
      if (data.linkInBand && data.resetUrl) {
        setInBandLink(data.resetUrl);
        setInBandNote(data.deliveryNote ?? null);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleForgot = () => {
    if (!forgotEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) {
      toast.error("Informe um endereço de e-mail válido.");
      return;
    }
    forgotMutation.mutate({ email: forgotEmail, origin: window.location.origin });
  };

  const copyLink = () => {
    if (inBandLink) {
      navigator.clipboard.writeText(inBandLink).then(() => {
        toast.success("Link copiado para a área de transferência!");
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-primary/3 rounded-full blur-3xl" />
      </div>
      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground font-mono">Incident Security System</h1>
          <p className="text-muted-foreground text-sm mt-1">Plataforma de Gerenciamento de Incidentes</p>
        </div>

        {!showForgot ? (
          /* ── Login Form ── */
          <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground mb-6">Acesso ao Sistema</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-sm text-muted-foreground">Email</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="pl-9 bg-input border-border"
                    autoComplete="email"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="password" className="text-sm text-muted-foreground">Senha</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pl-9 pr-9 bg-input border-border"
                    autoComplete="current-password"
                    /* Security: block copy/cut/paste */
                    onCopy={blockClipboard}
                    onCut={blockClipboard}
                    onPaste={blockClipboard}
                    onKeyDown={e => {
                      blockClipboard(e);
                      if (e.key === "Enter") loginMutation.mutate({ email, password });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Copiar/colar desabilitado por segurança
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => loginMutation.mutate({ email, password })}
                disabled={loginMutation.isPending || !email || !password}
              >
                {loginMutation.isPending ? "Autenticando..." : "Entrar"}
              </Button>
            </div>

            {/* Forgot password link */}
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="text-xs text-primary hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-center text-sm text-muted-foreground">
                Não tem conta?{" "}
                <button onClick={() => navigate("/register")} className="text-primary hover:underline font-medium">
                  Criar conta
                </button>
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-center text-xs text-muted-foreground mb-2">Ou acesse via OAuth institucional</p>
              <Button variant="outline" className="w-full" onClick={() => window.location.href = getLoginUrl()}>
                Entrar com OAuth
              </Button>
            </div>
          </div>
        ) : (
          /* ── Forgot Password Form ── */
          <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground mb-2">Redefinir Senha</h2>
            {!forgotSent ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Informe o e-mail cadastrado na sua conta. Enviaremos um link de redefinição válido por{" "}
                  <strong className="text-foreground">10 minutos</strong>.
                </p>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="forgot-email" className="text-sm text-muted-foreground">E-mail cadastrado</Label>
                    <div className="relative mt-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        className="pl-9 bg-input border-border"
                        autoComplete="email"
                        onKeyDown={e => e.key === "Enter" && handleForgot()}
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleForgot}
                    disabled={forgotMutation.isPending || !forgotEmail}
                  >
                    {forgotMutation.isPending ? "Enviando..." : "Enviar Link de Redefinição"}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => setShowForgot(false)}>
                    Voltar ao Login
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                {/* In-band link display (when email could not be delivered) */}
                {inBandLink ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-300">Link gerado com sucesso</p>
                        <p className="text-xs text-yellow-400/80 mt-1">
                          {inBandNote ?? "O e-mail não pôde ser entregue automaticamente. Use o link abaixo para redefinir sua senha."}
                        </p>
                      </div>
                    </div>

                    <div className="bg-muted/30 border border-border rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-2 font-mono uppercase tracking-wider">
                        Link de Redefinição (válido por 10 min)
                      </p>
                      <p className="text-xs font-mono text-primary break-all leading-relaxed mb-3">
                        {inBandLink}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 gap-2" onClick={copyLink}>
                          <Copy className="w-3 h-3" />
                          Copiar Link
                        </Button>
                        <Button size="sm" className="flex-1 gap-2" onClick={() => window.location.href = inBandLink}>
                          <ExternalLink className="w-3 h-3" />
                          Abrir Link
                        </Button>
                      </div>
                    </div>

                    <Button variant="outline" className="w-full" onClick={() => {
                      setShowForgot(false);
                      setForgotSent(false);
                      setForgotEmail("");
                      setInBandLink(null);
                      setInBandNote(null);
                    }}>
                      Voltar ao Login
                    </Button>
                  </div>
                ) : (
                  /* Normal success (email was delivered) */
                  <div className="text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto">
                      <Mail className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                      <p className="text-foreground font-medium">E-mail enviado!</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Se o endereço <strong className="text-foreground">{forgotEmail}</strong> estiver cadastrado,
                        você receberá um link de redefinição em instantes.
                      </p>
                      <p className="text-xs text-yellow-400 mt-2 font-medium">
                        ⚠ O link expira em 10 minutos. Verifique também a pasta de spam.
                      </p>
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => {
                      setShowForgot(false);
                      setForgotSent(false);
                      setForgotEmail("");
                    }}>
                      Voltar ao Login
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">
          ICOMP 2026.1 · Segurança da Informação · Grupo ISS
        </p>
      </div>
    </div>
  );
}
