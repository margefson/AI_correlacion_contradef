import { Button } from "@/components/ui/button";
import { virusTotalGuiFileUrl } from "@shared/virusTotal";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

type Props = {
  /** 64 caracteres hex (minúsculas recomendadas). */
  sha256Lowercase: string;
  /** Texto curto por baixo do título (opcional). */
  helperText?: string;
  /** Estilo do contentor. */
  variant?: "cyan" | "emerald";
  className?: string;
};

export function ExplicitSha256Block({
  sha256Lowercase,
  helperText,
  variant = "cyan",
  className = "",
}: Props) {
  const [copied, setCopied] = useState(false);
  const vtUrl = virusTotalGuiFileUrl(sha256Lowercase);

  const border =
    variant === "emerald"
      ? "border-emerald-500/35 bg-emerald-500/5 dark:border-emerald-400/25"
      : "border-cyan-500/40 bg-background dark:border-cyan-400/30 dark:bg-slate-950/90";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(sha256Lowercase);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard pode falhar em contextos restritos */
    }
  }

  return (
    <div className={`rounded-xl border p-4 text-sm ${border} ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">SHA-256 — confirme no site do VirusTotal</p>
      {helperText ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{helperText}</p> : null}
      <p
        className="mt-3 select-all break-all font-mono text-[13px] leading-relaxed tracking-tight text-foreground sm:text-sm"
        translate="no"
      >
        {sha256Lowercase}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Ao abrir o VirusTotal, compare <span className="text-foreground/80">carácter a carácter</span> com o hash acima; a URL usa exatamente este valor.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="border-border bg-muted/50 dark:border-white/15 dark:bg-white/5" onClick={handleCopy}>
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied ? "Copiado" : "Copiar hash"}
        </Button>
        <a
          href={vtUrl}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
            variant === "emerald"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 hover:bg-emerald-500/20 dark:border-emerald-400/30 dark:text-emerald-200"
              : "border-cyan-500/40 bg-cyan-500/10 text-cyan-900 hover:bg-cyan-500/20 dark:border-cyan-400/30 dark:text-cyan-200"
          }`}
        >
          Abrir VirusTotal (este hash)
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
