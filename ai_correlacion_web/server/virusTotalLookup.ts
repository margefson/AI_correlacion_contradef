import axios from "axios";

import { extractBehaviourSnippet } from "../shared/virusTotalBehaviourSnippet";
import type {
  VirusTotalBehaviourPack,
  VirusTotalDomainLookupResult,
  VirusTotalIpLookupResult,
  VirusTotalJobLookupResult,
  VirusTotalUrlLookupResult,
} from "../shared/virusTotalReport";
import { virusTotalAnalysisStatsSchema } from "../shared/virusTotalReport";
import { virusTotalGuiFileUrl } from "../shared/virusTotal";
import { virusTotalUrlIdentifier } from "../shared/virusTotalUrlId";

import { extractVtReputationScanSummary } from "./virusTotalAttributesParse";
import { normalizeVirusTotalDomain, normalizeVirusTotalIp } from "./virusTotalNormalizeNetwork";

const VT_API_BASE = "https://www.virustotal.com/api/v3";
const VT_FILES_URL = `${VT_API_BASE}/files`;
const VT_URLS_ROUTE = `${VT_API_BASE}/urls`;
const VT_DOMAINS_ROUTE = `${VT_API_BASE}/domains`;
const VT_IP_ROUTE = `${VT_API_BASE}/ip_addresses`;

type UnknownRecordBody = Record<string, unknown>;

type VtEnvelope = {
  data?: {
    attributes?: UnknownRecordBody;
  };
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function extractVtHttpError(body: unknown, statusText: string): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const msg = (body as { error?: { message?: string } }).error?.message;
    if (typeof msg === "string" && msg.trim()) {
      return msg.trim();
    }
  }
  return statusText || "Erro VirusTotal.";
}

function vtAxiosErrorMessage(e: unknown): string {
  return axios.isAxiosError(e)
    ? e.message + (e.response?.status ? ` (${e.response.status})` : "")
    : e instanceof Error
      ? e.message
      : String(e);
}

async function vtGetJson(apiKey: string, url: string): Promise<{ ok: true; status: number; body: unknown }> {
  const response = await axios.get(url, {
    headers: { "x-apikey": apiKey },
    timeout: 45_000,
    validateStatus: () => true,
  });
  return { ok: true, status: response.status, body: response.data };
}

async function vtBehaviourPack(apiKey: string, sha256: string): Promise<VirusTotalBehaviourPack> {
  const url = `${VT_FILES_URL}/${encodeURIComponent(sha256)}/behaviour_summary`;

  try {
    const chunk = await vtGetJson(apiKey, url);
    const status = chunk.status;
    const body = chunk.body as VtEnvelope;

    if (status === 404) {
      return {
        state: "absent",
        detail: "Sem relatório comportamental público nesta data (nenhum sandbox agregado no índice VT para este hash).",
      };
    }

    if (status === 429) {
      return {
        state: "error",
        code: "rate_limit",
        message: extractVtHttpError(body, ""),
      };
    }

    if (status === 401 || status === 403) {
      return {
        state: "error",
        code: "unauthorized",
        message: extractVtHttpError(body, ""),
      };
    }

    /** VT devolve 200 mas sem envelope `data.attributes` esperado neste endpoint — não é erro de rede nem de chave. */
    if (status === 200 && !body?.data?.attributes) {
      return {
        state: "error",
        code: "upstream_error",
        message:
          "O servidor VirusTotal respondeu bem-sucedido (HTTP 200), mas esta resposta não inclui dados de comportamento úteis — situação comum quando ainda não há resumo de sandbox agregado público para este hash. Isso não indica problema com a sua API key.",
      };
    }

    if (status !== 200 || !body?.data?.attributes) {
      const msg =
        typeof body === "object" && body !== null && "error" in body
          ? extractVtHttpError(body, "")
          : `Pedido comportamental falhou (HTTP ${status}).`;
      return { state: "error", code: status === 404 ? "not_found" : "upstream_error", message: msg };
    }

    const snippet = extractBehaviourSnippet(body.data.attributes as UnknownRecordBody);
    return { state: "ok", snippet };
  } catch (e) {
    const msg = vtAxiosErrorMessage(e);
    return { state: "error", code: "upstream_error", message: `Pedido behaviour_summary falhou: ${msg}` };
  }
}

/**
 * Obtém relatório público agregado (GET `/files/{sha256}`) e resumo comportamental opcional (`/behaviour_summary`).
 *
 * Docs: [`/files`](https://docs.virustotal.com/reference/files), comportamento ([`behaviour_summary`](https://docs.virustotal.com/reference/file-behaviour-summary)).
 */
export async function virusTotalLookupFile(args: {
  sha256Lowercase: string;
  apiKey: string;
}): Promise<VirusTotalJobLookupResult> {
  const sha256 = args.sha256Lowercase;
  const guiUrl = virusTotalGuiFileUrl(sha256);
  const fileUrl = `${VT_FILES_URL}/${encodeURIComponent(sha256)}`;

  try {
    const [fileChunk, behaviour] = await Promise.all([
      vtGetJson(args.apiKey, fileUrl),
      vtBehaviourPack(args.apiKey, sha256),
    ]);

    const st = fileChunk.status;
    const response = fileChunk.body as VtEnvelope;

    if (st === 404) {
      return {
        ok: false,
        code: "not_found",
        message: "Amostra não encontrada neste índice VirusTotal — faça primeiro upload público ou aguarde indexação.",
      };
    }

    const errTxt = extractVtHttpError(response, "");

    if (st === 429) {
      return {
        ok: false,
        code: "rate_limit",
        message: `Quota ou limite de pedidos VirusTotal: ${errTxt || "Too Many Requests"}`,
      };
    }

    if (st === 401 || st === 403) {
      return {
        ok: false,
        code: "unauthorized",
        message: `Chave API rejeitada (${st}): ${errTxt}`,
      };
    }

    if (st !== 200) {
      return {
        ok: false,
        code: "upstream_error",
        message: `VirusTotal respondeu ${st}${errTxt ? `: ${errTxt}` : ""}`,
      };
    }

    const attrs = response?.data?.attributes ?? {};
    const statsParsed = virusTotalAnalysisStatsSchema.safeParse(attrs.last_analysis_stats);
    const stats = statsParsed.success ? statsParsed.data : null;

    return {
      ok: true,
      kind: "ok",
      sha256,
      guiUrl,
      lastAnalysisDate: num(attrs.last_analysis_date),
      meaningfulName: str(attrs.meaningful_name),
      sizeBytes: num(attrs.size),
      stats,
      typeDescription: str(attrs.type_description ?? attrs.description),
      behaviour,
    };
  } catch (e) {
    const msg = axios.isAxiosError(e)
      ? (e.response?.status
          ? `${e.response.status} ${typeof e.response.data === "string" ? e.response.data : JSON.stringify(e.response.data)?.slice(0, 280)}`
          : e.message)
      : e instanceof Error
        ? e.message
        : String(e);
    return {
      ok: false,
      code: "upstream_error",
      message: `Pedido VirusTotal falhou: ${msg}`,
    };
  }
}

/**
 * GET `/urls/{url_id}` — relatório público VT para um URL (consulta manual, independente do job).
 *
 * Identifier: RFC 4648-inspired URL-safe Base64 sem padding conforme referência VirusTotal developers.
 */
export async function virusTotalLookupPublicUrl(args: {
  canonicalUrl: string;
  apiKey: string;
}): Promise<VirusTotalUrlLookupResult> {
  const url = args.canonicalUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, code: "bad_request", message: "Informe um URL público válido iniciado por http:// ou https://." };
  }

  const id = virusTotalUrlIdentifier(url);
  const vtUrl = `${VT_URLS_ROUTE}/${encodeURIComponent(id)}`;
  const guiSearchUrl = `https://www.virustotal.com/gui/url/${encodeURIComponent(id)}`;

  try {
    const chunk = await vtGetJson(args.apiKey, vtUrl);

    const st = chunk.status;
    const body = chunk.body as VtEnvelope;

    if (st === 404) {
      return {
        ok: false,
        code: "not_found",
        message: "Este URL ainda não consta neste índice VirusTotal — primeira submissão pública pode ser necessária.",
      };
    }

    const errTxt = extractVtHttpError(body, "");

    if (st === 429) {
      return {
        ok: false,
        code: "rate_limit",
        message: `Quota ou limite de pedidos VirusTotal: ${errTxt || "Too Many Requests"}`,
      };
    }

    if (st === 401 || st === 403) {
      return {
        ok: false,
        code: "unauthorized",
        message: `Chave API rejeitada (${st}): ${errTxt}`,
      };
    }

    if (st !== 200 || !body?.data?.attributes) {
      return {
        ok: false,
        code: "upstream_error",
        message: `VirusTotal respondeu ${st}${errTxt ? `: ${errTxt}` : ""}`,
      };
    }

    const attrs = body.data.attributes ?? {};
    const summary = extractVtReputationScanSummary(attrs);
    const urlSeen = str(attrs.url) ?? url;

    return {
      ok: true,
      kind: "ok",
      urlId: id,
      guiSearchUrl,
      url: urlSeen,
      stats: summary.stats,
      lastAnalysisDate: summary.lastAnalysisDate,
      threatNamesSample: summary.threatNamesSample,
      categoriesSample: summary.categoriesSample,
    };
  } catch (e) {
    return {
      ok: false,
      code: "upstream_error",
      message: `Pedido VirusTotal falhou: ${vtAxiosErrorMessage(e)}`,
    };
  }
}

/**
 * GET `/domains/{domain}` — relatório público VT do domínio (consulta manual).
 * [Docs](https://developers.virustotal.com/reference/domain-info)
 */
export async function virusTotalLookupDomain(args: {
  rawInput: string;
  apiKey: string;
}): Promise<VirusTotalDomainLookupResult> {
  const norm = normalizeVirusTotalDomain(args.rawInput);
  if (!norm.ok) {
    return { ok: false, code: "bad_request", message: norm.message };
  }

  const domain = norm.domain;
  const vtUrl = `${VT_DOMAINS_ROUTE}/${encodeURIComponent(domain)}`;
  const guiUrl = `https://www.virustotal.com/gui/domain/${encodeURIComponent(domain)}`;

  try {
    const chunk = await vtGetJson(args.apiKey, vtUrl);

    const st = chunk.status;
    const body = chunk.body as VtEnvelope;

    if (st === 404) {
      return {
        ok: false,
        code: "not_found",
        message: `O domínio «${domain}» ainda não tem ficha pública suficiente no índice VirusTotal.`,
      };
    }

    const errTxt = extractVtHttpError(body, "");

    if (st === 429) {
      return {
        ok: false,
        code: "rate_limit",
        message: `Quota ou limite de pedidos VirusTotal: ${errTxt || "Too Many Requests"}`,
      };
    }

    if (st === 401 || st === 403) {
      return {
        ok: false,
        code: "unauthorized",
        message: `Chave API rejeitada (${st}): ${errTxt}`,
      };
    }

    if (st !== 200 || !body?.data?.attributes) {
      return {
        ok: false,
        code: "upstream_error",
        message: `VirusTotal respondeu ${st}${errTxt ? `: ${errTxt}` : ""}`,
      };
    }

    const attrs = body.data.attributes ?? {};
    const summary = extractVtReputationScanSummary(attrs);

    return {
      ok: true,
      kind: "ok",
      domain,
      guiUrl,
      stats: summary.stats,
      lastAnalysisDate: summary.lastAnalysisDate,
      threatNamesSample: summary.threatNamesSample,
      categoriesSample: summary.categoriesSample,
      reputation: num(attrs.reputation),
    };
  } catch (e) {
    return {
      ok: false,
      code: "upstream_error",
      message: `Pedido VirusTotal falhou: ${vtAxiosErrorMessage(e)}`,
    };
  }
}

/**
 * GET `/ip_addresses/{ip}` — relatório público VT do IP (consulta manual).
 * [Docs](https://developers.virustotal.com/reference/ip-info)
 */
export async function virusTotalLookupIp(args: {
  rawInput: string;
  apiKey: string;
}): Promise<VirusTotalIpLookupResult> {
  const norm = normalizeVirusTotalIp(args.rawInput);
  if (!norm.ok) {
    return { ok: false, code: "bad_request", message: norm.message };
  }

  const ip = norm.ip;
  const vtUrl = `${VT_IP_ROUTE}/${encodeURIComponent(ip)}`;
  const guiUrl = `https://www.virustotal.com/gui/ip-address/${encodeURIComponent(ip)}`;

  try {
    const chunk = await vtGetJson(args.apiKey, vtUrl);

    const st = chunk.status;
    const body = chunk.body as VtEnvelope;

    if (st === 404) {
      return {
        ok: false,
        code: "not_found",
        message: `O endereço IP «${ip}» ainda não tem ficha pública suficiente no índice VirusTotal.`,
      };
    }

    const errTxt = extractVtHttpError(body, "");

    if (st === 429) {
      return {
        ok: false,
        code: "rate_limit",
        message: `Quota ou limite de pedidos VirusTotal: ${errTxt || "Too Many Requests"}`,
      };
    }

    if (st === 401 || st === 403) {
      return {
        ok: false,
        code: "unauthorized",
        message: `Chave API rejeitada (${st}): ${errTxt}`,
      };
    }

    if (st !== 200 || !body?.data?.attributes) {
      return {
        ok: false,
        code: "upstream_error",
        message: `VirusTotal respondeu ${st}${errTxt ? `: ${errTxt}` : ""}`,
      };
    }

    const attrs = body.data.attributes ?? {};
    const summary = extractVtReputationScanSummary(attrs);
    let country =
      str(attrs.country)
      ?? null;
    /** VT por vezes expõe apenas `continent`; é um fallback superficial para navegação humana na GUI VT. */
    if (!country) {
      country = str(attrs.continent);
    }

    return {
      ok: true,
      kind: "ok",
      ip,
      guiUrl,
      stats: summary.stats,
      lastAnalysisDate: summary.lastAnalysisDate,
      threatNamesSample: summary.threatNamesSample,
      categoriesSample: summary.categoriesSample,
      reputation: num(attrs.reputation),
      asn: num(attrs.asn),
      country,
    };
  } catch (e) {
    return {
      ok: false,
      code: "upstream_error",
      message: `Pedido VirusTotal falhou: ${vtAxiosErrorMessage(e)}`,
    };
  }
}
