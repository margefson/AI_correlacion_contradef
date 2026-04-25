import type { LucideIcon } from "lucide-react";

export function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-500/35 hover:shadow-md dark:border-white/10 dark:bg-gradient-to-br dark:from-white/10 dark:via-white/5 dark:to-transparent dark:hover:border-cyan-400/20 dark:hover:shadow-cyan-950/20">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}
