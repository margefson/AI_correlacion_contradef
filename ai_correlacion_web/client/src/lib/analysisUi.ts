/** Classes Tailwind para Badge de status de job/arquivo (borda + fundo). */
export function jobStatusBadgeClass(status?: string | null): string {
  switch (status) {
    case "completed":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-300";
    case "running":
    case "uploading":
      return "border-cyan-400/25 bg-cyan-500/10 text-cyan-300";
    case "queued":
      return "border-amber-400/25 bg-amber-500/10 text-amber-300";
    case "failed":
      return "border-rose-400/25 bg-rose-500/10 text-rose-200";
    case "cancelled":
      return "border-zinc-400/25 bg-zinc-500/10 text-zinc-300";
    default:
      return "border-white/10 bg-white/5 text-zinc-300";
  }
}

/** Badge de nível de risco (dashboard / Reduzir Logs). */
export function riskLevelBadgeClass(risk?: string | null): string {
  switch (risk) {
    case "critical":
      return "bg-rose-500/15 text-rose-300 border-rose-400/25";
    case "high":
      return "bg-amber-500/15 text-amber-300 border-amber-400/25";
    case "medium":
      return "bg-cyan-500/15 text-cyan-300 border-cyan-400/25";
    default:
      return "bg-emerald-500/15 text-emerald-300 border-emerald-400/25";
  }
}
