import { describe, expect, it } from "vitest";

import { harvestSha256FromNormalizedCorrelation, harvestSha256FromStoredEvents } from "./sampleSha256Harvest";

describe("harvestSha256FromNormalizedCorrelation", () => {
  it("acha hash em texto de evento correlacionado", () => {
    const h = "36685efcf34c7a7a6f6dd2e48199e4700b5ab8fe3945a50297703dd8daced74f";
    const got = harvestSha256FromNormalizedCorrelation(
      [{ message: `Processado ficheiro com digest ${h}` }],
      [{ keptLines: [{ text: "sem digest" }] }],
    );
    expect(got).toBe(h);
  });

  it("acha hash apenas em logs reduzidos", () => {
    const h = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(
      harvestSha256FromNormalizedCorrelation([{ message: "ok" }], [{ keptLines: [{ text: `sha=${h}` }] }]),
    ).toBe(h);
  });

  it("prioriza primeira ocorrência no buffer quando o score contextual empata", () => {
    const first = "1111111111111111111111111111111111111111111111111111111111111111";
    const second = "2222222222222222222222222222222222222222222222222222222222222222";
    expect(harvestSha256FromNormalizedCorrelation([{ message: first }], [{ keptLines: [{ text: second }] }])).toBe(
      first,
    );
  });

  it("prefere hash com «Arquivo analisado» a um hex sem contexto de amostra", () => {
    const ambient = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const alvo = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(
      harvestSha256FromNormalizedCorrelation(
        [{ message: `linha técnica ${ambient}` }],
        [{ keptLines: [{ text: `• Arquivo analisado: ${alvo}` }] }],
      ),
    ).toBe(alvo);
  });
});

describe("harvestSha256FromStoredEvents", () => {
  it("considera mensagem + payload JSON serializado", () => {
    const h = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(
      harvestSha256FromStoredEvents([
        { message: "evt", payloadJson: { nested: [`ref ${h}`] } },
      ]),
    ).toBe(h);
  });
});
