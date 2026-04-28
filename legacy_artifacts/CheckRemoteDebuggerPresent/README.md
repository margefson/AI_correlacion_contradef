# Artefatos `CheckRemoteDebuggerPresent` (Contradef)

Correlação entre **`FunctionInterceptor`**, **`TraceFcnCall.M1`** / **`TraceFcnCall.M2`**, **`TraceInstructions`**, **`TraceMemory`** e **`TraceDisassembly`**, com pivô **`CheckRemoteDebuggerPresent`** (`kernel32`) — segunda peça habitual da sequência anti‑debug descrita ao lado de **`IsDebuggerPresent`**.

## Conteúdo

| Ficheiro | Descrição |
|---|---|
| [`fluxo_checkremotedebuggerpresent_mapeado.md`](./fluxo_checkremotedebuggerpresent_mapeado.md) | Fluxo textual + diagrama Mermaid + tabelas |

## Ver também

- [`../isdebuggerpresent_flow/`](../isdebuggerpresent_flow/) — scripts, CSV de exemplo e diagramas ligados ao fluxo **`IsDebuggerPresent`**.  
- [`../LoadLibraryA/`](../LoadLibraryA/) — fluxo paralelo para **`LoadLibraryA`**.  
- [`../ZwQueryInformationProcess/`](../ZwQueryInformationProcess/) — fluxo **`ZwQueryInformationProcess`** / **`NtQueryInformationProcess`**.  
- [`../CreateThread/`](../CreateThread/) — **`CreateThread`**.  
- [`../FlsAlloc/`](../FlsAlloc/) — **`FlsAlloc`**.  
- [`../FlsGetValue/`](../FlsGetValue/).  
- [`../FlsSetValue/`](../FlsSetValue/).  
- [`../FreeEnvironmentStringsW/`](../FreeEnvironmentStringsW/).
