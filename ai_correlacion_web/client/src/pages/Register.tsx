import { LocalAuthBrand } from "@/components/auth/LocalAuthBrand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { checkPasswordCriteria } from "@shared/authLocalValidation";
import { Lock, Mail, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
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

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const register = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Conta criada. Já pode entrar.");
      window.location.href = "/login";
    },
    onError: err => {
      toast.error(err.message);
    },
  });

  const criteria = useMemo(() => checkPasswordCriteria(password), [password]);
  const criteriaOk = useMemo(
    () => Object.values(criteria).every(Boolean),
    [criteria],
  );

  if (!isLocalAuth()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <p className="text-muted-foreground text-sm text-center max-w-md">
          O registo local requer <code className="text-foreground">VITE_AUTH_MODE=local</code> e{" "}
          <code className="text-foreground">AUTH_MODE=local</code> no servidor.
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
            <CardTitle className="text-xl font-semibold">Criar conta</CardTitle>
            <CardDescription className="text-sm">
              Senha forte: 8+ caracteres, maiúscula, minúscula, número e símbolo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={e => {
                e.preventDefault();
                if (!criteriaOk) {
                  toast.error("A palavra-passe não cumpre todos os requisitos.");
                  return;
                }
                register.mutate({ name, email, password });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="name" className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Nome
                </Label>
                <div className="relative">
                  <UserRound
                    className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                    aria-hidden
                  />
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="pl-10 h-11 bg-input/80 border-border/60"
                    minLength={2}
                    required
                  />
                </div>
              </div>
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
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onPaste={blockClipboard}
                    onCopy={blockClipboard}
                    onCut={blockClipboard}
                    className="pl-10 h-11 bg-input/80 border-border/60"
                    required
                  />
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Lock className="size-3 shrink-0 opacity-70" aria-hidden />
                  Copiar e colar desactivados à palavra-passe por segurança.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 pt-1">
                  <li className={criteria.minLength && criteria.maxLength ? "text-emerald-500" : ""}>
                    Comprimento 8–128 caracteres
                  </li>
                  <li className={criteria.lowercase && criteria.uppercase ? "text-emerald-500" : ""}>
                    Letras maiúsculas e minúsculas
                  </li>
                  <li className={criteria.digit && criteria.special ? "text-emerald-500" : ""}>
                    Número e carácter especial
                  </li>
                </ul>
              </div>
              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold text-white shadow-md border-0 bg-[var(--auth-brand)] hover:bg-[var(--auth-brand-hover)]"
                disabled={register.isPending || !criteriaOk}
              >
                {register.isPending ? "A criar…" : "Registar"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Já tem conta?{" "}
                <Link href="/login" className="text-[var(--auth-brand)] font-medium hover:underline">
                  Entrar
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
