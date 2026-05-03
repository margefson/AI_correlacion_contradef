import { VirusTotalSampleCard } from "@/components/VirusTotalSampleCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes, formatDateTimeManaus } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import type { VirusTotalAnalysisStats, VirusTotalBehaviourPack } from "@shared/virusTotalReport";
import { skipToken } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Props = {
  jobId: string;
  sampleSha256?: string | null;
};

function isPublicHttpUrl(value: string) {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeVtDomainQuery(s: string) {
  const t = s.trim();
  if (t.length < 3) return false;
  if (/^https?:\/\//i.test(t)) return isPublicHttpUrl(t);
  return !/[#/?]/.test(t);
}

function looksLikeVtIpQuery(s: string) {
  const t = s.trim();
  if (t.length < 3 || /\s/.test(t)) return false;
  return t.includes(":") || (t.includes(".") && /^[\d.]+$/i.test(t));
}

function humanVtErrorTitle(code: string): string {
  switch (code) {
    case "unconfigured":
      return "Servidor sem chave VirusTotal";
    case "no_hash":
      return "SHA-256 não disponível";
    case "not_found":
      return "Sem ficha neste índice VT";
    case "rate_limit":
      return "Limite VirusTotal ou quota esgotada";
    case "unauthorized":
      return "Credenciais VirusTotal inválidas";
    case "upstream_error":
      return "Erro VirusTotal ou rede";
    case "bad_request":
      return "Consulta não permitida";
    default:
      return "Resposta VirusTotal";
  }
}

/** Soma de todos os valores numéricos em `last_analysis_stats` (engines participantes nos vários buckets). */
function vtLastAnalysisStatsTotal(stats: VirusTotalAnalysisStats): number {
  return Object.values(stats).reduce<number>((acc, v) => {
    return typeof v === "number" && Number.isFinite(v) ? acc + v : acc;
  }, 0);
}

function formatShareOfEngines(part: number, total: number): string | null {
  if (total <= 0 || part <= 0) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(part / total);
}

function statLine(
  label: string,
  value: number | undefined,
  tone: "muted" | "risk" | "ok",
  opts?: { engineTotal?: number },
) {
  const n = typeof value === "number" ? value : 0;
  const toneCls =
    tone === "risk" ? "text-rose-200" : tone === "ok" ? "text-emerald-200/95" : "text-muted-foreground";
  const share =
    typeof opts?.engineTotal === "number" && opts.engineTotal > 0 ? formatShareOfEngines(n, opts.engineTotal) : null;

  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
        <span className={`font-medium ${toneCls}`}>{n}</span>
        {share !== null ? <span className="text-[11px] font-normal text-muted-foreground">{share}</span> : null}
      </span>
    </div>
  );
}

function StatsBlock({ stats }: { stats: VirusTotalAnalysisStats | null }) {
  if (!stats) {
    return <p className="text-sm text-muted-foreground">Não há contagens das engines nesta resposta VT.</p>;
  }
  const engineTotal = vtLastAnalysisStatsTotal(stats);
  const timeoutFailures = (stats.timeout ?? 0) + (stats.failure ?? 0) + (stats.confirmed_timeout ?? 0);

  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 dark:border-white/10 dark:bg-slate-950/60">
      <div className="divide-y divide-border/60 dark:divide-white/10">
        {statLine("Maliciosas", stats.malicious, "risk", { engineTotal })}
        {statLine("Suspeitas", stats.suspicious, "risk", { engineTotal })}
        {statLine("Harmless", stats.harmless, "ok", { engineTotal })}
        {statLine("Não detectado", stats.undetected, "muted", { engineTotal })}
        {statLine("Timeout / falhas", timeoutFailures, "muted", { engineTotal })}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border/70 py-1.5 text-sm font-semibold dark:border-white/15">
        <span className="text-foreground">
          Total de engines (<code className="rounded px-1 text-xs font-normal">last_analysis_stats</code>)
        </span>
        <span className="tabular-nums text-foreground">{engineTotal}</span>
      </div>
    </div>
  );
}

function StringListBlock({ heading, rows }: { heading: string; rows: readonly string[] }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{heading}</p>
      {rows.length ? (
        <ul className="max-h-32 overflow-auto rounded-lg border border-border/80 bg-muted/24 px-2 py-1.5 text-[11px] leading-snug dark:border-white/10 dark:bg-black/35">
          {rows.map((row, idx) => (
            <li key={`${heading}-${idx}`} className="font-mono break-all text-foreground">
              {row}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">—</p>
      )}
    </div>
  );
}

function BehaviourPackBlock({ pack }: { pack: VirusTotalBehaviourPack }) {
  if (pack.state === "absent") {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground dark:border-white/12 dark:bg-slate-950/50">
        <p className="font-medium text-foreground">Comportamento na sandbox VT</p>
        <p className="mt-2 leading-relaxed">{pack.detail ?? "Sem relatório comportamental público para este digest."}</p>
      </div>
    );
  }

  if (pack.state === "error") {
    return (
      <div className="rounded-xl border border-amber-500/35 bg-amber-950/20 p-4 text-xs text-amber-100/95 dark:bg-amber-950/35">
        <p className="font-medium text-amber-50">Comportamento (`behaviour_summary`) indisponível ou vazio nesta chamada</p>
        <p className="mt-2 leading-relaxed text-amber-100/95">{pack.message}</p>
        <p className="mt-2 leading-relaxed text-amber-200/85">
          Apenas falhou esta extensão (resumo comportamental VT). Os motores antivírus, contagens e metadados do ficheiro na
          secção acima — quando existirem na resposta principal — continuam válidos.
        </p>
      </div>
    );
  }

  const sn = pack.snippet;
  return (
    <div className="space-y-3 rounded-xl border border-cyan-500/35 bg-cyan-950/[0.12] p-4 dark:border-cyan-500/28 dark:bg-cyan-950/25">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cyan-200/95">Comportamento (VT `behaviour_summary`)</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Excerto agregado de sandboxes públicas VT — correlacione chamadas/redes/processos com o que aparece nos vossos logs.
          </p>
        </div>
      </div>
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sandbox / data</p>
          <p className="mt-1 text-foreground">
            {sn.sandboxName ?? "—"}
            {sn.analysisDate != null ? (
              <>
                {" "}
                · <span className="tabular-nums">{formatDateTimeManaus(sn.analysisDate * 1000)}</span>
                <span className="text-xs text-muted-foreground"> (Manaus)</span>
              </>
            ) : null}
          </p>
          {sn.behash ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">behash · {sn.behash}</p> : null}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tags VT</p>
          <p className="mt-1 leading-relaxed text-foreground">{sn.tagsSample.length ? sn.tagsSample.join(" · ") : "—"}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <StringListBlock heading="Chamadas em destaque" rows={sn.callsHighlightedSample} />
        <StringListBlock heading="Comandos executados (amostra)" rows={sn.commandExecutionsSample} />
        <StringListBlock heading="URLs HTTP observados (amostra)" rows={sn.httpUrlsSample} />
        <StringListBlock heading="IPs observados (`ip_traffic`)" rows={sn.ipsFromTrafficSample} />
        <StringListBlock heading="Ficheiros escritos (amostra)" rows={sn.filesWrittenSample} />
        <StringListBlock heading="Módulos carregados" rows={sn.modulesLoadedSample} />
        <StringListBlock heading="Chaves de registo abertas (amostra)" rows={sn.registryKeysOpenedSample} />
        <StringListBlock heading="Processos (`processes_tree`)" rows={sn.processesSample} />
        <StringListBlock heading="SHA-256 libertados pelo binário (`files_dropped`)" rows={sn.droppedSha256Sample} />
      </div>
    </div>
  );
}

function ManualUrlVtBlock() {
  const [draftUrl, setDraftUrl] = useState("");
  const [committedUrl, setCommittedUrl] = useState("");

  const urlQueryArgs = committedUrl.trim() && isPublicHttpUrl(committedUrl) ? { url: committedUrl.trim() } : skipToken;

  const urlReport = trpc.analysis.virusTotalUrlReport.useQuery(urlQueryArgs, {
    staleTime: 120_000,
    gcTime: 30 * 60_000,
  });

  function runLookup() {
    const t = draftUrl.trim();
    if (!isPublicHttpUrl(t)) {
      toast.error("URL inválido", { description: "Use http(s) completo — ex.: https://example.com/caminho?q=…" });
      return;
    }
    setCommittedUrl(t);
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/25 p-4 dark:border-white/12 dark:bg-slate-950/55">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Consultar URL completo na VirusTotal</p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          URL público completo incluindo <span className="font-medium text-foreground">scheme + caminho + querystring</span> quando
          forem relevantes nos logs (<span className="font-mono text-foreground">VIRUSTOTAL_API_KEY</span> apenas no servidor). Para só
          o hostname prefira «Consultar domínio».
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Input
          value={draftUrl}
          onChange={(e) => setDraftUrl(e.target.value)}
          placeholder="https://exemplo.invalido/indicadores"
          className="grow border-border bg-background font-mono text-xs dark:bg-slate-950/80"
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runLookup();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="whitespace-nowrap border-border shrink-0"
          disabled={urlReport.isFetching}
          onClick={runLookup}
        >
          {urlReport.isFetching ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              A pedir...
            </>
          ) : (
            <>
              Consultar URL
              <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-85" aria-hidden />
            </>
          )}
        </Button>
      </div>

      {urlReport.error ? (
        <div className="flex gap-2 rounded-lg border border-rose-500/35 bg-rose-950/30 p-2 text-xs text-rose-50">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Erro tRPC/cliente ({urlReport.error.message}).</span>
        </div>
      ) : null}

      {urlReport.data?.ok === false ? (
        <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-2 text-xs dark:border-white/10">
          <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <div>
            <p className="font-medium text-foreground">{humanVtErrorTitle(urlReport.data.code)}</p>
            <p className="mt-1 text-muted-foreground">{urlReport.data.message}</p>
          </div>
        </div>
      ) : null}

      {urlReport.data?.ok === true ? (
        <div className="space-y-3 rounded-lg border border-border bg-background/60 p-3 text-sm dark:border-white/10 dark:bg-slate-950/65">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Resumo público VT do URL</p>
            <a
              href={urlReport.data.guiSearchUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 px-2 py-1 text-[11px] text-cyan-800 hover:bg-cyan-500/10 dark:border-cyan-400/35 dark:text-cyan-100 dark:hover:bg-cyan-950/55"
            >
              Abrir na GUI VT <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
          <p className="break-all font-mono text-[11px] text-foreground">{urlReport.data.url}</p>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Última análise</p>
              <p className="mt-0.5 tabular-nums">
                {urlReport.data.lastAnalysisDate != null ? formatDateTimeManaus(urlReport.data.lastAnalysisDate * 1000) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Categorias (chaves VT)</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground">
                {urlReport.data.categoriesSample.length ? urlReport.data.categoriesSample.join(" · ") : "—"}
              </p>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Motores (`last_analysis_stats`)</p>
            <StatsBlock stats={urlReport.data.stats} />
          </div>
          <StringListBlock heading="Detecções / nomeações pelas engines (amostra)" rows={urlReport.data.threatNamesSample} />
        </div>
      ) : null}
    </div>
  );
}

function ManualDomainVtBlock() {
  const [draft, setDraft] = useState("");
  const [committed, setCommitted] = useState("");

  const q =
    committed.trim() && looksLikeVtDomainQuery(committed.trim())
      ? { domain: committed.trim() }
      : skipToken;

  const domainReport = trpc.analysis.virusTotalDomainReport.useQuery(q, {
    staleTime: 120_000,
    gcTime: 30 * 60_000,
  });

  function runLookup() {
    const t = draft.trim();
    if (!looksLikeVtDomainQuery(t)) {
      toast.error("Domínio inválido", {
        description: "Use hostname com TLD (ex.: news.evil.invalid) ou URL completa com http(s)://.",
      });
      return;
    }
    setCommitted(t);
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/25 p-4 dark:border-white/12 dark:bg-slate-950/55">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Consultar domínio na VirusTotal</p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Corresponde a{" "}
          <span className="font-mono text-[10px] text-foreground">
            GET /api/v3/domains/{"{"}domain{"}"}
          </span>{" "}
          — útil quando os logs só trazem o hostname (Beacon, TLS SNI, etc.).
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="evil.invalid ou https://subdominio.evil.invalid/caminho"
          className="grow border-border bg-background font-mono text-xs dark:bg-slate-950/80"
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runLookup();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="whitespace-nowrap border-border shrink-0"
          disabled={domainReport.isFetching}
          onClick={runLookup}
        >
          {domainReport.isFetching ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              A pedir...
            </>
          ) : (
            <>
              Consultar domínio
              <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-85" aria-hidden />
            </>
          )}
        </Button>
      </div>

      {domainReport.error ? (
        <div className="flex gap-2 rounded-lg border border-rose-500/35 bg-rose-950/30 p-2 text-xs text-rose-50">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Erro tRPC/cliente ({domainReport.error.message}).</span>
        </div>
      ) : null}

      {domainReport.data?.ok === false ? (
        <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-2 text-xs dark:border-white/10">
          <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <div>
            <p className="font-medium text-foreground">{humanVtErrorTitle(domainReport.data.code)}</p>
            <p className="mt-1 text-muted-foreground">{domainReport.data.message}</p>
          </div>
        </div>
      ) : null}

      {domainReport.data?.ok === true ? (
        <div className="space-y-3 rounded-lg border border-border bg-background/60 p-3 text-sm dark:border-white/10 dark:bg-slate-950/65">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Resumo público VT do domínio</p>
            <a
              href={domainReport.data.guiUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 px-2 py-1 text-[11px] text-cyan-800 hover:bg-cyan-500/10 dark:border-cyan-400/35 dark:text-cyan-100 dark:hover:bg-cyan-950/55"
            >
              Abrir na GUI VT <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
          <p className="break-all font-mono text-[11px] text-foreground">{domainReport.data.domain}</p>
          {typeof domainReport.data.reputation === "number" ? (
            <p className="text-[11px] text-muted-foreground">
              Reputation <span className="font-semibold tabular-nums text-foreground">{domainReport.data.reputation}</span> · segundo o
              índice público VT.
            </p>
          ) : null}
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Última análise</p>
              <p className="mt-0.5 tabular-nums">
                {domainReport.data.lastAnalysisDate != null ? formatDateTimeManaus(domainReport.data.lastAnalysisDate * 1000) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Categorias (chaves VT)</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground">
                {domainReport.data.categoriesSample.length ? domainReport.data.categoriesSample.join(" · ") : "—"}
              </p>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Motores (`last_analysis_stats`)</p>
            <StatsBlock stats={domainReport.data.stats} />
          </div>
          <StringListBlock heading="Detecções / nomeações pelas engines (amostra)" rows={domainReport.data.threatNamesSample} />
        </div>
      ) : null}
    </div>
  );
}

function ManualIpVtBlock() {
  const [draft, setDraft] = useState("");
  const [committed, setCommitted] = useState("");

  const q =
    committed.trim() && looksLikeVtIpQuery(committed.trim())
      ? { ip: committed.trim() }
      : skipToken;

  const ipReport = trpc.analysis.virusTotalIpReport.useQuery(q, {
    staleTime: 120_000,
    gcTime: 30 * 60_000,
  });

  function runLookup() {
    const t = draft.trim();
    if (!looksLikeVtIpQuery(t)) {
      toast.error("IP inválido", { description: "IPv4 pontuado ou IPv6 — ex.: 203.0.113.4 ou 2001:db8::1" });
      return;
    }
    setCommitted(t);
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/25 p-4 dark:border-white/12 dark:bg-slate-950/55">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Consultar endereço IP na VirusTotal</p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Corresponde a{" "}
          <span className="font-mono text-[10px] text-foreground">
            GET /api/v3/ip_addresses/{"{"}ip{"}"}
          </span>
          · para destinos apenas numéricos vistos em `ip_traffic`, firewalls ou amostragens de PCAP resumidas.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="203.0.113.4 ou 2001:db8::1"
          className="grow border-border bg-background font-mono text-xs dark:bg-slate-950/80"
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runLookup();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="whitespace-nowrap border-border shrink-0"
          disabled={ipReport.isFetching}
          onClick={runLookup}
        >
          {ipReport.isFetching ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              A pedir...
            </>
          ) : (
            <>
              Consultar IP
              <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-85" aria-hidden />
            </>
          )}
        </Button>
      </div>

      {ipReport.error ? (
        <div className="flex gap-2 rounded-lg border border-rose-500/35 bg-rose-950/30 p-2 text-xs text-rose-50">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Erro tRPC/cliente ({ipReport.error.message}).</span>
        </div>
      ) : null}

      {ipReport.data?.ok === false ? (
        <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-2 text-xs dark:border-white/10">
          <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <div>
            <p className="font-medium text-foreground">{humanVtErrorTitle(ipReport.data.code)}</p>
            <p className="mt-1 text-muted-foreground">{ipReport.data.message}</p>
          </div>
        </div>
      ) : null}

      {ipReport.data?.ok === true ? (
        <div className="space-y-3 rounded-lg border border-border bg-background/60 p-3 text-sm dark:border-white/10 dark:bg-slate-950/65">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Resumo público VT do IP</p>
            <a
              href={ipReport.data.guiUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 px-2 py-1 text-[11px] text-cyan-800 hover:bg-cyan-500/10 dark:border-cyan-400/35 dark:text-cyan-100 dark:hover:bg-cyan-950/55"
            >
              Abrir na GUI VT <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
          <p className="break-all font-mono text-[11px] text-foreground">{ipReport.data.ip}</p>
          <div className="grid gap-2 md:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Última análise</p>
              <p className="mt-0.5 tabular-nums">
                {ipReport.data.lastAnalysisDate != null ? formatDateTimeManaus(ipReport.data.lastAnalysisDate * 1000) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">ASN</p>
              <p className="mt-0.5 tabular-nums">{ipReport.data.asn ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">País / contexto VT</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-foreground">{ipReport.data.country ?? "—"}</p>
            </div>
          </div>
          {typeof ipReport.data.reputation === "number" ? (
            <p className="text-[11px] text-muted-foreground">
              Reputation <span className="font-semibold tabular-nums text-foreground">{ipReport.data.reputation}</span> · segundo o
              índice público VT.
            </p>
          ) : null}
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Motores (`last_analysis_stats`)</p>
            <StatsBlock stats={ipReport.data.stats} />
          </div>
          <StringListBlock heading="Detecções / nomeações pelas engines (amostra)" rows={ipReport.data.threatNamesSample} />
        </div>
      ) : null}
    </div>
  );
}

function ManualVtManualIndicators() {
  return (
    <div className="space-y-4">
      <ManualUrlVtBlock />
      <ManualDomainVtBlock />
      <ManualIpVtBlock />
    </div>
  );
}

export function VirusTotalIntegratedPanel({ jobId: _jobId, sampleSha256 }: Props) {
  const hasHash = typeof sampleSha256 === "string" && sampleSha256.length === 64;

  const report = trpc.analysis.virusTotalJobReport.useQuery(
    { jobId: _jobId },
    {
      enabled: hasHash,
      staleTime: 5 * 60_000,
      gcTime: 15 * 60_000,
    },
  );

  if (!hasHash) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
          Não há SHA-256 registado neste job para correlacionar com o VirusTotal. Quando o ficheiro analisado tiver hash de 64 hex
          no job, a API sobre o <span className="font-medium text-foreground">ficheiro</span> e os links ficam disponíveis.
        </div>
        <ManualVtManualIndicators />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <VirusTotalSampleCard sampleSha256={sampleSha256} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 dark:border-white/10">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Relatório do ficheiro + comportamento (API v3)
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-border bg-muted/40 dark:border-white/15 dark:bg-white/5"
          onClick={() => void report.refetch()}
          disabled={report.isFetching}
        >
          {report.isFetching ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          )}
          Atualizar
        </Button>
      </div>

      {report.isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground dark:border-white/10">
          <Loader2 className="h-4 w-4 animate-spin" />
          A pedir relatório do ficheiro e resumo comportamental (`behaviour_summary`) ao servidor…
        </div>
      ) : null}

      {report.error ? (
        <div className="flex gap-2 rounded-xl border border-rose-500/35 bg-rose-950/35 p-3 text-sm text-rose-50 dark:bg-rose-950/45">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
          <span>Falhou a consulta ao servidor ({report.error.message}). Repita quando a rede/VirusTotal responder.</span>
        </div>
      ) : null}

      {!report.error && report.data?.ok === false ? (
        <div
          className={`flex gap-2 rounded-xl border p-3 text-sm ${
            report.data.code === "unconfigured"
              ? "border-amber-500/40 bg-amber-950/35 text-amber-50 dark:bg-amber-950/35"
              : "border-border bg-muted/45 text-muted-foreground dark:border-white/15 dark:bg-slate-950/70 dark:text-muted-foreground"
          }`}
        >
          <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 opacity-85" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium text-foreground">{humanVtErrorTitle(report.data.code)}</p>
            <p className="leading-relaxed text-muted-foreground dark:text-muted-foreground">{report.data.message}</p>
          </div>
        </div>
      ) : null}

      {!report.error && report.data?.ok === true ? (
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Nome sugerido (VT)</p>
                <p className="mt-1 font-medium text-foreground">{report.data.meaningfulName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Tipo / formato</p>
                <p className="mt-1 text-foreground">{report.data.typeDescription ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Tamanho (VT)</p>
                <p className="mt-1 tabular-nums text-foreground">
                  {report.data.sizeBytes != null ? formatBytes(report.data.sizeBytes) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Última análise VT (ficheiro)</p>
                <p className="mt-1 tabular-nums text-foreground">
                  {report.data.lastAnalysisDate != null ? formatDateTimeManaus(report.data.lastAnalysisDate * 1000) : "—"}{" "}
                  <span className="text-xs text-muted-foreground">(horário Manaus)</span>
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Motores (`last_analysis_stats`)</p>
              <StatsBlock stats={report.data.stats} />
            </div>
          </div>

          <BehaviourPackBlock pack={report.data.behaviour} />

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Dados vindos dos servidores da app (chave VirusTotal apenas no servidor). Os números e excertos comportamentais são
            agregações públicas VT à data das respetivas fichas — não são vereditos desta ferramenta.
          </p>
        </div>
      ) : null}

      <ManualVtManualIndicators />
    </div>
  );
}
