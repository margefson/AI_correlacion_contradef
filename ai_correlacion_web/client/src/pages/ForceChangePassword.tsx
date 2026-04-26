import { LocalAuthBrand } from "@/components/auth/LocalAuthBrand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { checkPasswordCriteria } from "@shared/authLocalValidation";
import { useLocation } from "wouter";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function ForceChangePassword() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const me = trpc.auth.me.useQuery();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      toast.success("Palavra-passe alterada. A redireccionar…");
      await utils.auth.me.invalidate();
      setLocation("/");
    },
    onError: e => toast.error(e.message),
  });

  const crit = useMemo(() => checkPasswordCriteria(newPw), [newPw]);
  const newPwOk = useMemo(() => Object.values(crit).every(Boolean), [crit]);
  const canChange = Boolean(me.data?.canChangePassword);

  return (
    <div className="min-h-svh flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-background via-background to-[var(--auth-brand-muted)]/25">
      <div className="w-full max-w-md space-y-8">
        <LocalAuthBrand />
        <Card className="border-border/50 shadow-xl bg-card/95 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Altere a palavra-passe</CardTitle>
            <CardDescription>
              Por segurança, deve definir uma nova palavra-passe (não a senha provisória) antes de utilizar o sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canChange ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="f-cur">Palavra-passe actual (provisória)</Label>
                  <Input
                    id="f-cur"
                    type="password"
                    autoComplete="current-password"
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-n1">Nova palavra-passe</Label>
                  <Input
                    id="f-n1"
                    type="password"
                    autoComplete="new-password"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                  />
                </div>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li className={crit.minLength && crit.maxLength ? "text-emerald-500" : ""}>8–128 caracteres</li>
                  <li className={crit.lowercase && crit.uppercase ? "text-emerald-500" : ""}>Maiúscula e minúscula</li>
                  <li className={crit.digit && crit.special ? "text-emerald-500" : ""}>Número e símbolo</li>
                </ul>
                <div className="space-y-2">
                  <Label htmlFor="f-n2">Confirmar nova</Label>
                  <Input
                    id="f-n2"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="secondary" onClick={() => void logout()}>
                    Terminar sessão
                  </Button>
                  <Button
                    type="button"
                    className="bg-[var(--auth-brand)] hover:bg-[var(--auth-brand-hover)]"
                    onClick={() => {
                      if (newPw !== confirmPw) {
                        toast.error("A confirmação não coincide.");
                        return;
                      }
                      if (!newPwOk) {
                        toast.error("A nova palavra-passe não cumpre os requisitos.");
                        return;
                      }
                      changePassword.mutate({ currentPassword: currentPw, newPassword: newPw });
                    }}
                    disabled={changePassword.isPending}
                  >
                    {changePassword.isPending ? "A actualizar…" : "Definir nova palavra-passe"}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Esta conta não possui palavra-passe local. Termine a sessão e use um método de login suportado, ou
                contacte o administrador.
              </p>
            )}
            {!canChange ? (
              <Button type="button" variant="secondary" onClick={() => void logout()}>
                Terminar sessão
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
