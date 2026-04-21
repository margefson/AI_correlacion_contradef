import { describe, expect, it } from "vitest";

import { computeSha256HexFromFile } from "./fileHash";

describe("computeSha256HexFromFile", () => {
  it("produz SHA-256 em hex minúsculo conhecido para 'test\\n'", async () => {
    const file = new File([new TextEncoder().encode("test\n")], "sample.bin", { type: "application/octet-stream" });
    const hex = await computeSha256HexFromFile(file);
    expect(hex).toBe("f2ca1bb6c7e907d06dafe4687e579fce76b37e4e93b7605022da52e6ccc26fd2");
    expect(hex).toMatch(/^[a-f0-9]{64}$/);
  });
});
