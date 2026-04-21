import { describe, expect, it } from "vitest";

import { buildMitreDefenseEvasion, listHeuristicsOutsideTa0005 } from "../shared/mitreDefenseEvasion";

describe("buildMitreDefenseEvasion", () => {
  it("refina VM vs checagem temporal em sub-técnicas distintas (T1497.001 e T1497.003)", () => {
    const result = buildMitreDefenseEvasion(["Detecção de VM", "Verificação de overhead"]);
    expect(result.tacticId).toBe("TA0005");
    expect(result.tacticTechniqueCount).toBe(47);
    const ids = result.techniques.map((t) => t.id).sort();
    expect(ids).toEqual(["T1497.001", "T1497.003"]);
  });

  it("mapeia GetProcAddress para T1027.007", () => {
    const result = buildMitreDefenseEvasion([], ["GetProcAddress", "VirtualProtect"]);
    expect(result.techniques.some((t) => t.id === "T1027.007")).toBe(true);
    expect(result.techniques.some((t) => t.id === "T1027")).toBe(true);
  });

  it("ignora heurísticas que não mapeiam para TA0005", () => {
    const result = buildMitreDefenseEvasion(["Comunicação de rede", "Anti-debug"]);
    expect(result.techniques.map((t) => t.id)).toEqual(["T1622"]);
  });
});

describe("listHeuristicsOutsideTa0005", () => {
  it("lista apenas tags sem mapeamento de evasão", () => {
    expect(listHeuristicsOutsideTa0005(["Anti-debug", "Persistência"]).sort()).toEqual(["Persistência"]);
  });
});
