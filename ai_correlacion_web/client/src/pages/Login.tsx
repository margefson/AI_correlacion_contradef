import { LocalAuthBrand } from "@/components/auth/LocalAuthBrand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { getInstitutionalOAuthUrl } from "@/const";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

const isLocalAuth = () =>
  String(import.meta.env.VITE_AUTH_MODE ?? "")
    .trim()
    .toLowerCase() === "local" ||
  String(import.meta.env.VITE_AUTH_MODE ?? "")
    .trim()
    .toLowerCase() === "password";

const blockClipboard = (e: React.ClipboardEvent) => {
  e.preventDefault();
  toast.info("Copiar e colar da palavra-passe estão desactivados por segurança.");
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const login = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success("Sessão iniciada.");
      window.location.href = "/";
    },
    onError: err => {
      toast.error(err.message);
    },
  });

  const oauthUrl = typeof window !== "undefined" ? getInstitutionalOAuthUrl() : null;

  if (!isLocalAuth()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <p className="text-muted-foreground text-sm text-center max-w-md">
          O login com email e palavra-passe requer a build com{" "}
          <code className="text-foreground">VITE_AUTH_MODE=local</code> e o servidor com{" "}
          <code className="text-foreground">AUTH_MODE=local</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-background via-background to-[var(--auth-brand-muted)]/25">
      <div className="w-full max-w-md space-y-8">
        <LocalAuthBrand />

        <Card className="border-border/50 shadow-xl shadow-black/20 bg-card/95 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-2 text-center sm:text-left">
            <CardTitle className="text-xl font-semibold">Acesso ao Sistema</CardTitle>
            <CardDescription className="text-sm">
              Indique o email e a palavra-passe da sua conta local.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form
              className="space-y-4"
              onSubmit={e => {
                e.preventDefault();
                login.mutate({ email, password });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="email" className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Email
                </Label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                    aria-hidden
                  />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="pl-10 h-11 bg-input/80 border-border/60"
                    placeholder="seu@email.com"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Senha
                </Label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                    aria-hidden
                  />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onPaste={blockClipboard}
                    onCopy={blockClipboard}
                    onCut={blockClipboard}
                    className="pl-10 pr-11 h-11 bg-input/80 border-border/60"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Lock className="size-3 shrink-0 opacity-70" aria-hidden />
                  Copiar e colar desactivados à palavra-passe por segurança.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold text-white shadow-md border-0 bg-[var(--auth-brand)] hover:bg-[var(--auth-brand-hover)]"
                disabled={login.isPending}
              >
                {login.isPending ? "A entrar…" : "Entrar"}
              </Button>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => toast.info("Recuperação de palavra-passe ainda não está configurada.")}
                  className="text-[var(--auth-brand)] hover:underline text-left sm:text-center"
                >
                  Esqueci a minha senha
                </button>
                <p className="text-muted-foreground sm:text-right">
                  Não tem conta?{" "}
                  <Link href="/register" className="text-[var(--auth-brand)] font-medium hover:underline">
                    Criar conta
                  </Link>
                </p>
              </div>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <span className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                <span className="bg-card px-3 text-muted-foreground">Ou aceda via OAuth institucional</span>
              </div>
            </div>

            {oauthUrl ? (
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-border/80 bg-background/50 hover:bg-muted/30"
                onClick={() => {
                  window.location.href = oauthUrl;
                }}
              >
                Entrar com OAuth
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-dashed border-border/60 text-muted-foreground"
                disabled
                title="Indisponível com login local (email e senha). Configure OIDC ou WebDev noutro modo."
              >
                Entrar com OAuth
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
