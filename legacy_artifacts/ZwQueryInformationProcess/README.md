# Artefatos `ZwQueryInformationProcess` (Contradef)

Correlação entre **`FunctionInterceptor`**, **`TraceFcnCall.M1`** / **`TraceFcnCall.M2`**, **`TraceInstructions`**, **`TraceMemory`** e **`TraceDisassembly`**, com pivô **`ZwQueryInformationProcess`** (`ntdll`) — nivelamento típico após **`CheckRemoteDebuggerPresent`** no relatório que encadeia **`ProcessInformationClass=30`** (e variantes anti‑debug) [1].

Nos registos pode aparecer o par **`NtQueryInformationProcess`**; ver o documento principal para tratar **`Zw`/`Nt`** como mesmo marco lógico.

## Conteúdo

| Ficheiro | Descrição |
|---|---|
| [`fluxo_zwqueryinformationprocess_mapeado.md`](./fluxo_zwqueryinformationprocess_mapeado.md) | Fluxo textual + diagrama Mermaid + tabelas |

## Ver também

- [`../isdebuggerpresent_flow/`](../isdebuggerpresent_flow/) — scripts CSV e exemplos.  
- [`../CheckRemoteDebuggerPresent/`](../CheckRemoteDebuggerPresent/) — elo anterior na cadeia anti‑debug.  
- [`../LoadLibraryA/`](../LoadLibraryA/) — outro fluxo multi‑arte.
