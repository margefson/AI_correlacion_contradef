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
      ? "border-emerald-400/25 bg-emerald-500/5"
      : "border-cyan-400/30 bg-slate-950/90";

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
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">SHA-256 — confirme no site do VirusTotal</p>
      {helperText ? <p className="mt-2 text-xs leading-relaxed text-zinc-400">{helperText}</p> : null}
      <p
        className="mt-3 select-all break-all font-mono text-[13px] leading-relaxed tracking-tight text-zinc-100 sm:text-sm"
        translate="no"
      >
        {sha256Lowercase}
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        Ao abrir o VirusTotal, compare <span className="text-zinc-400">carácter a carácter</span> com o hash acima; a URL usa exatamente este valor.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="border-white/15 bg-white/5" onClick={handleCopy}>
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-400" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied ? "Copiado" : "Copiar hash"}
        </Button>
        <a
          href={vtUrl}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
            variant === "emerald"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
              : "border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
          }`}
        >
          Abrir VirusTotal (este hash)
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
