# Artefatos `FlsSetValue` (Contradef)

Correlação entre **`FunctionInterceptor`**, **`TraceFcnCall.M1`** / **`TraceFcnCall.M2`**, **`TraceInstructions`**, **`TraceMemory`** e **`TraceDisassembly`**, com pivô **`FlsSetValue`** — escrita no *slot* FLS (**`dwFlsIndex`**, **`lpValue`**) tipicamente após **`FlsAlloc`** e antes de **`FlsGetValue`** / **`FlsFree`**.

## Conteúdo

| Ficheiro | Descrição |
|---|---|
| [`fluxo_flssetvalue_mapeado.md`](./fluxo_flssetvalue_mapeado.md) | Fluxo textual + diagrama Mermaid + tabelas |

## Ver também

- [`../FlsAlloc/`](../FlsAlloc/) — índice FLS.  
- [`../FlsGetValue/`](../FlsGetValue/) — leitura do *slot*.  
- [`../CreateThread/`](../CreateThread/).  
- [`../isdebuggerpresent_flow/`](../isdebuggerpresent_flow/).  
- [`../FreeEnvironmentStringsW/`](../FreeEnvironmentStringsW/) — variáveis de ambiente.  
- [`../GetACP/`](../GetACP/) — code page ANSI.
