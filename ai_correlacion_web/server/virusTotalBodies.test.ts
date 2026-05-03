import { describe, expect, it } from "vitest";

import {
  extractBestNormalizedSha256FromBodies,
  extractFirstNormalizedSha256FromBodies,
} from "../shared/virusTotal";

describe("extractBestNormalizedSha256FromBodies", () => {
  const strong = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const weak = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  it("prioriza o hash no nome Contradef (ReduceLogs) acima dos hex nos corpos", () => {
    const analysisName = `Redução Logs Contradef ${strong}`;
    expect(
      extractBestNormalizedSha256FromBodies([`eco ${weak}`, `Arquivo analisado: ${weak}`], { analysisName }),
    ).toBe(strong);
  });

  it("aceita opcional literal sha256 antes do hex no nome da análise", () => {
    const analysisName = `Redução Logs Contradef sha256 ${strong}`;
    expect(extractBestNormalizedSha256FromBodies([`outro ${weak}`], { analysisName })).toBe(strong);
  });

  it("prefere «Arquivo analisado» a um hex nu à cabeceira do texto", () => {
    const md = `
${weak}

• Arquivo analisado: ${strong}
tipo: Trojan`;
    expect(extractBestNormalizedSha256FromBodies([md])).toBe(strong);
  });

  it("deprioriza hex em contexto de fingerprint/chunk relativamente ao de amostra", () => {
    const fingerprinted = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    const sampleLine = strong;
    const body =
      `multipart chunk uploadSession xyz fingerprint ${fingerprinted}\n` +
      `Arquivo analisado: ${sampleLine}`;
    expect(extractBestNormalizedSha256FromBodies([body])).toBe(sampleLine);
  });
});

describe("extractFirstNormalizedSha256FromBodies", () => {
  it("captura SHA-256 após texto estilo relatório Contradef", () => {
    const md = `Dados Quantitativos\n• Arquivo analisado: 36685efCF34c7a7a6f6dd2e48199e4700b5ab8fe3945a50297703dd8daced74f\nTipo: Trojan`;
    expect(extractFirstNormalizedSha256FromBodies([md])).toBe(
      "36685efcf34c7a7a6f6dd2e48199e4700b5ab8fe3945a50297703dd8daced74f",
    );
  });

  it("respeita a ordem das fontes (primeira fonte sem match procura seguinte)", () => {
    const a = "Nenhuma assinatura com 64 hex isolados.";
    const b = "\n\n36685efcf34c7a7a6f6dd2e48199e4700b5ab8fe3945a50297703dd8daced74f\n";
    expect(extractFirstNormalizedSha256FromBodies([a, b])).toBe(
      "36685efcf34c7a7a6f6dd2e48199e4700b5ab8fe3945a50297703dd8daced74f",
    );
  });

  it("sem token válido devolve null", () => {
    expect(extractFirstNormalizedSha256FromBodies(["Sem digest aqui 123.", null, undefined])).toBe(null);
  });
});
