# Artefatos `CreateThread` (Contradef)

Correlação entre **`FunctionInterceptor`**, **`TraceFcnCall.M1`** / **`TraceFcnCall.M2`**, **`TraceInstructions`**, **`TraceMemory`** e **`TraceDisassembly`**, com pivô **`CreateThread`** (`kernel32`) — criação de *thread* de utilizador, com ênfase em **`lpStartAddress`**, **`CREATE_SUSPENDED`** e encadeamentos como **`ResumeThread`**.

## Conteúdo

| Ficheiro | Descrição |
|---|---|
| [`fluxo_createthread_mapeado.md`](./fluxo_createthread_mapeado.md) | Fluxo textual + diagrama Mermaid + tabelas |

## Ver também

- [`../isdebuggerpresent_flow/`](../isdebuggerpresent_flow/) — scripts e exemplos.  
- [`../LoadLibraryA/`](../LoadLibraryA/), [`../ZwQueryInformationProcess/`](../ZwQueryInformationProcess/) — fluxos paralelos típicos antes ou em conjunto com **novas threads**.  
- [`../CheckRemoteDebuggerPresent/`](../CheckRemoteDebuggerPresent/) — cadeia anti‑debug relacionável.  
- [`../FlsAlloc/`](../FlsAlloc/) — **`FlsAlloc`** / FLS.  
- [`../FlsGetValue/`](../FlsGetValue/) — **`FlsGetValue`**.  
- [`../FlsSetValue/`](../FlsSetValue/) — **`FlsSetValue`**.  
- [`../FreeEnvironmentStringsW/`](../FreeEnvironmentStringsW/).
