# Artefatos `FlsAlloc` (Contradef)

Correlação entre **`FunctionInterceptor`**, **`TraceFcnCall.M1`** / **`TraceFcnCall.M2`**, **`TraceInstructions`**, **`TraceMemory`** e **`TraceDisassembly`**, com pivô **`FlsAlloc`** — alocação de **índice FLS** (*Fiber Local Storage*) e ligação típica a **`FlsSetValue`**, **`FlsGetValue`**, **`ConvertThreadToFiber`** / **`CreateFiber`**.

## Conteúdo

| Ficheiro | Descrição |
|---|---|
| [`fluxo_flsalloc_mapeado.md`](./fluxo_flsalloc_mapeado.md) | Fluxo textual + diagrama Mermaid + tabelas |

## Ver também

- [`../isdebuggerpresent_flow/`](../isdebuggerpresent_flow/) — scripts e exemplos.  
- [`../CreateThread/`](../CreateThread/) — *threads* vs *fibers*.  
- [`../LoadLibraryA/`](../LoadLibraryA/) — carga de *runtime*.  
- [`../FlsGetValue/`](../FlsGetValue/) — **`FlsGetValue`** (leitura do *slot*).  
- [`../FlsSetValue/`](../FlsSetValue/) — **`FlsSetValue`** (escrita no *slot*).
