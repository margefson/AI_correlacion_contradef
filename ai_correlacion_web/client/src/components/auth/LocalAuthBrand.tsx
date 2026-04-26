import { cn } from "@/lib/utils";
import { Shield } from "lucide-react";

type LocalAuthBrandProps = {
  className?: string;
  /** Predefinição: Contradef. */
  title?: string;
  subtitle?: string;
};

export function LocalAuthBrand({
  className,
  title = "Contradef",
  subtitle = "Plataforma de análise e correlação de defesa",
}: LocalAuthBrandProps) {
  return (
    <div className={cn("flex flex-col items-center text-center space-y-3", className)}>
      <div className="size-[3.5rem] rounded-2xl border-2 border-[var(--auth-brand)]/45 bg-gradient-to-b from-card/80 to-card/40 flex items-center justify-center shadow-sm ring-1 ring-[var(--auth-brand)]/20">
        <Shield className="size-[1.75rem] text-[var(--auth-brand)]" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">{subtitle}</p>
      </div>
    </div>
  );
}
