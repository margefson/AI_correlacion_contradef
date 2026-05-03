import { describe, expect, it } from "vitest";

import { extractBehaviourSnippet } from "../shared/virusTotalBehaviourSnippet";
import { virusTotalUrlIdentifier } from "../shared/virusTotalUrlId";

describe("virusTotalUrlIdentifier", () => {
  it("codifica texto UTF-8 em Base64 URL-safe sem padding, como VT /urls/", () => {
    expect(virusTotalUrlIdentifier("http://malware.news/updates")).toMatch(/^[a-zA-Z0-9_-]{1,512}$/u);
  });

  it("é diferente só por mudança não significativa esperada quando o texto muda materialmente", () => {
    const a = virusTotalUrlIdentifier("https:// exemplo.com/");
    const b = virusTotalUrlIdentifier("https://exemplo.com/");
    expect(a).not.toBe(b);
  });
});

describe("extractBehaviourSnippet", () => {
  it("captura IPs, URLs HTTP, comandos e ficheiros gravados segundo o formato VT", () => {
    const snippet = extractBehaviourSnippet({
      analysis_date: 1_671_810_990,
      sandbox_name: "VirusTotal Sandbox X",
      behash: "e77446099f5d2fe3278cd6613bc70a76",
      calls_highlighted: ["GetTickCount"],
      tags: ["DIRECT_CPU_CLOCK_ACCESS"],
      command_executions: ["cmd.exe /c whoami"],
      files_written: ["c:\\\\temp\\\\drop.dll"],
      ip_traffic: [{ destination_ip: "203.0.113.42", destination_port: 443 }],
      http_conversations: [{ url: "https://assets.example.com/config.json", request_method: "GET" }],
      files_dropped: [{ sha256: "ab".repeat(32), path: "c:\\\\x\\\\y.dll" }],
      processes_tree: [{ name: "parent.exe", process_id: "1" }, { name: "child.exe", process_id: "2" }],
    });

    expect(snippet.sandboxName).toBe("VirusTotal Sandbox X");
    expect(snippet.callsHighlightedSample).toContain("GetTickCount");
    expect(snippet.ipsFromTrafficSample).toContain("203.0.113.42");
    expect(snippet.httpUrlsSample.some((u) => u.includes("assets.example.com"))).toBe(true);
    expect(snippet.droppedSha256Sample).toContain("ab".repeat(32));
    expect(snippet.processesSample.some((p) => p.includes("parent.exe"))).toBe(true);
  });
});
