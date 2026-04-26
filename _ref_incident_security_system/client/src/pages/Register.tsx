import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, User, Mail, Lock, Check, X } from "lucide-react";

const PASSWORD_CRITERIA = [
  { key: "minLength", label: "Mínimo 8 caracteres",    test: (p: string) => p.length >= 8 },
  { key: "hasLower",  label: "Letra minúscula (a-z)",  test: (p: string) => /[a-z]/.test(p) },
  { key: "hasUpper",  label: "Letra maiúscula (A-Z)",  test: (p: string) => /[A-Z]/.test(p) },
  { key: "hasNumber", label: "Número (0-9)",            test: (p: string) => /[0-9]/.test(p) },
  { key: "hasSpecial",label: "Caractere especial",      test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
];

export default function Register() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const criteria = useMemo(
    () => PASSWORD_CRITERIA.map((c) => ({ ...c, met: password.length > 0 && c.test(password) })),
    [password]
  );
  const allMet = criteria.every((c) => c.met);

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Conta criada! Faça login para continuar.");
      navigate("/login");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground font-mono">Incident Security System</h1>
          <p className="text-muted-foreground text-sm mt-1">Criar nova conta de operador</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-foreground mb-6">Novo Operador</h2>
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Nome Completo</Label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Seu nome completo" value={name} onChange={e => setName(e.target.value)} className="pl-9 bg-input border-border" />
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="email" placeholder="usuario@email.com" value={email} onChange={e => setEmail(e.target.value)} className="pl-9 bg-input border-border" />
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Senha</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="pl-9 bg-input border-border" />
              </div>
              {password.length > 0 && (
                <div className="mt-2 p-3 bg-muted/30 rounded-lg border border-border/50 space-y-1">
                  {criteria.map((c) => (
                    <div key={c.key} className="flex items-center gap-1.5 text-xs">
                      {c.met ? <Check className="w-3 h-3 text-emerald-400" /> : <X className="w-3 h-3 text-muted-foreground" />}
                      <span className={c.met ? "text-emerald-400" : "text-muted-foreground"}>{c.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button className="w-full" onClick={() => registerMutation.mutate({ name, email, password })} disabled={registerMutation.isPending || !name || !email || !allMet}>
              {registerMutation.isPending ? "Criando conta..." : "Criar Conta"}
            </Button>
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-center text-sm text-muted-foreground">
              Já tem conta?{" "}
              <button onClick={() => navigate("/login")} className="text-primary hover:underline font-medium">Fazer login</button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
