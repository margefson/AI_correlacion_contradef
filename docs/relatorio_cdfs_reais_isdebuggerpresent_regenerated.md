# Relatório técnico dos CDFs reais: fluxo a partir de IsDebuggerPresent

Este relatório consolida a execução do pipeline sobre os arquivos CDF reais extraídos de `Full-Execution-Sample-1.7z`. O objetivo foi reconstruir, a partir de **IsDebuggerPresent**, o encadeamento entre arquivos, produzir recortes reutilizáveis, aplicar compressão adaptativa aos traces completos e materializar os acompanhamentos sugeridos em artefatos operacionais dentro do repositório.

A análise confirmou que o ponto de partida observável do fluxo monitorado combina a resolução inicial de APIs como **LoadLibraryA** com a transição para **IsDebuggerPresent**, seguida por chamadas anti-análise e de preparação de execução. O ponto terminal reconstruído pelo fluxo agregado chega a **FatalExit**, depois de passar por **CheckRemoteDebuggerPresent**, **ZwQueryInformationProcess**, **ZwSetInformationThread**, **GetTickCount**, **QueryPerformanceCounter**, **EnumSystemFirmwareTables**, **LocalAlloc**, **VirtualProtect** e **HeapFree**.

## Dataset utilizado

O conjunto real processado nesta etapa foi composto pelos seis CDFs abaixo. O pipeline preservou um manifesto com tamanho e hash de cada arquivo para permitir rastreabilidade, reprocessamento e conferência de integridade.

| Arquivo | Tamanho | SHA-256 |
| --- | --- | --- |
| contradef.2956.FunctionInterceptor.cdf | 61.57 KB | 156d70a36ca15143... |
| contradef.2956.TraceDisassembly.cdf | 163.46 KB | 075462e6ca8f4359... |
| contradef.2956.TraceFcnCall.M1.cdf | 19.41 KB | 134ddcce52094b80... |
| contradef.2956.TraceFcnCall.M2.cdf | 36.77 KB | 9eb72ed62fe208d1... |
| contradef.2956.TraceInstructions.cdf | 3.92 GB | 499136c7c1c747c5... |
| contradef.2956.TraceMemory.cdf | 841.50 MB | a7bf533f8efaf6ee... |

## Compressão adaptativa aplicada aos traces reais

Como parte das sugestões de acompanhamento, a compressão adaptativa foi executada sobre os CDFs reais completos em armazenamento local, gerando um manifesto versionado com o resultado por arquivo. Essa etapa reduziu drasticamente o espaço consumido pelos traces textuais volumosos e preservou evidências suficientes para futura redistribuição controlada.

| Arquivo | Original | Comprimido | Redução (%) | Nível |
| --- | --- | --- | --- | --- |
| contradef.2956.FunctionInterceptor.cdf | 61.57 KB | 5.21 KB | 91.55 | 7 |
| contradef.2956.TraceDisassembly.cdf | 163.46 KB | 30.30 KB | 81.47 | 7 |
| contradef.2956.TraceFcnCall.M1.cdf | 19.41 KB | 1.00 KB | 94.84 | 7 |
| contradef.2956.TraceFcnCall.M2.cdf | 36.77 KB | 1.49 KB | 95.96 | 7 |
| contradef.2956.TraceInstructions.cdf | 3.92 GB | 167.46 MB | 95.83 | 3 |
| contradef.2956.TraceMemory.cdf | 841.50 MB | 20.63 MB | 97.55 | 5 |

## Fluxo correlacionado observado

O fluxo consolidado contém **12** nós principais. A função de foco, **IsDebuggerPresent**, aparece com as seguintes contagens observadas: FI=2, M1=2, M2=4, TI=26 e TM=6. A sequência agregada reconstruída termina em **FatalExit**.

| Função | FI | M1 | M2 | TI | TM |
| --- | --- | --- | --- | --- | --- |
| LoadLibraryA | 5 | 6 | 12 | 175 | 4 |
| IsDebuggerPresent | 2 | 2 | 4 | 26 | 6 |
| CheckRemoteDebuggerPresent | 1 | 1 | 2 | 40 | 8 |
| ZwQueryInformationProcess | 1 | 1 | 2 | 62 | 4 |
| ZwSetInformationThread | 0 | 1 | 2 | 9 | 2 |
| GetTickCount | 1 | 1 | 1 | 28 | 14 |
| QueryPerformanceCounter | 1 | 1 | 2 | 234 | 13 |
| EnumSystemFirmwareTables | 0 | 0 | 0 | 5 | 6 |
| LocalAlloc | 0 | 1 | 2 | 58 | 3 |
| VirtualProtect | 5 | 5 | 10 | 197 | 8 |
| HeapFree | 0 | 1 | 1 | 31 | 4 |
| FatalExit | 0 | 0 | 0 | 0 | 6 |

## Evidências cruzadas por arquivo

A tabela seguinte resume onde cada função do fluxo foi efetivamente localizada em cada tipo de log. Esse cruzamento é a base do correlacionador versionado no repositório.

| Função | FunctionInterceptor | TraceFcnCall M1 | TraceFcnCall M2 | TraceInstructions | TraceMemory |
| --- | --- | --- | --- | --- | --- |
| LoadLibraryA | bloco 61 | linha 1 | linha 1 | linha 276678 | linha 8162281 |
| IsDebuggerPresent | bloco 83 | linha 3 | linha 5 | linha 262399 | linha 49524 |
| CheckRemoteDebuggerPresent | bloco 92 | linha 4 | linha 7 | linha 488274 | linha 51666 |
| ZwQueryInformationProcess | bloco 104 | linha 5 | linha 9 | linha 582338 | linha 74119 |
| ZwSetInformationThread |  | linha 6 | linha 11 | linha 592389 | linha 77083 |
| GetTickCount | bloco 190 | linha 15 | linha 28 | linha 48265 | linha 8151451 |
| QueryPerformanceCounter | bloco 199 | linha 16 | linha 29 | linha 252879 | linha 8234173 |
| EnumSystemFirmwareTables |  |  |  | linha 21456974 | linha 410026 |
| LocalAlloc |  | linha 9 | linha 17 | linha 277226 | linha 8226679 |
| VirtualProtect | bloco 122 | linha 7 | linha 13 | linha 230244 | linha 18407 |
| HeapFree |  | linha 95 | linha 140 | linha 266019 | linha 8155348 |
| FatalExit |  |  |  |  | linha 410458 |

## Chamadas-chave reconstruídas no TraceInstructions

Além das contagens, o pipeline extraiu chamadas e tailcalls diretamente do trace de instruções. As primeiras relações mais relevantes preservadas no JSON de correlação são apresentadas abaixo.

| Linha | Tipo | Origem | Destino | Thread |
| --- | --- | --- | --- | --- |
| 637862 | Call | 36685efcf34c7a7a6f6dd2e48199e4700b5ab8fe3945a50297703dd8daced74f.exe:u | KERNEL32.DLL:IsDebuggerPresent | 0 |
| 666972 | Call | 36685efcf34c7a7a6f6dd2e48199e4700b5ab8fe3945a50297703dd8daced74f.exe:u | KERNEL32.DLL:CheckRemoteDebuggerPresent | 0 |
| 666981 | Tailcall | KERNELBASE.dll:CheckRemoteDebuggerPresent+0x000000000012 | KERNELBASE.dll:TlsGetValue+0x0000000231b5 | 0 |
| 666984 | Tailcall | KERNELBASE.dll:CheckRemoteDebuggerPresent+0x00000000001b | KERNELBASE.dll:TlsGetValue+0x0000000231b5 | 0 |
| 666990 | Call | KERNELBASE.dll:CheckRemoteDebuggerPresent+0x000000000032 | ntdll.dll:ZwQueryInformationProcess | 0 |
| 667000 | Tailcall | KERNELBASE.dll:CheckRemoteDebuggerPresent+0x000000000040 | KERNELBASE.dll:TlsGetValue+0x0000000231ac | 0 |
| 703854 | Call | 36685efcf34c7a7a6f6dd2e48199e4700b5ab8fe3945a50297703dd8daced74f.exe:u | ntdll.dll:ZwQueryInformationProcess | 0 |
| 765997 | Call | 36685efcf34c7a7a6f6dd2e48199e4700b5ab8fe3945a50297703dd8daced74f.exe:u | KERNEL32.DLL:VirtualProtect | 0 |
| 766015 | Call | KERNELBASE.dll:VirtualProtect+0x00000000002f | ntdll.dll:NtProtectVirtualMemory | 0 |
| 766027 | Tailcall | KERNELBASE.dll:VirtualProtect+0x000000000041 | KERNELBASE.dll:TlsGetValue+0x00000001b51a | 0 |
| 782588 | Call | 36685efcf34c7a7a6f6dd2e48199e4700b5ab8fe3945a50297703dd8daced74f.exe:u | KERNEL32.DLL:VirtualProtect | 0 |
| 782606 | Call | KERNELBASE.dll:VirtualProtect+0x00000000002f | ntdll.dll:NtProtectVirtualMemory | 0 |

## Processamento incremental por chunks

O arquivo `TraceInstructions` foi processado em streaming ao longo de **23,877,401** linhas, enquanto `TraceMemory` foi tratado em **8,689,507** linhas. O mecanismo de chunks permite localizar rapidamente em quais faixas de linhas as funções de interesse se concentram, sem necessidade de carregar os arquivos inteiros em memória.

### Primeiros chunks relevantes em TraceInstructions

| Chunk | Linhas | Ocorrências |
| --- | --- | --- |
| 1 | 1-250000 | GetTickCount:1, VirtualProtect:1 |
| 2 | 250001-500000 | QueryPerformanceCounter:1, GetTickCount:2, IsDebuggerPresent:3, HeapFree:1, LoadLibraryA:27, LocalAlloc:1, VirtualProtect:6, CheckRemoteDebuggerPresent:2 |
| 3 | 500001-750000 | LoadLibraryA:26, ZwQueryInformationProcess:16, ZwSetInformationThread:9, IsDebuggerPresent:6, CheckRemoteDebuggerPresent:32 |
| 4 | 750001-1000000 | VirtualProtect:68, LocalAlloc:46 |
| 7 | 1500001-1750000 | VirtualProtect:68, GetTickCount:8, QueryPerformanceCounter:44 |
| 8 | 1750001-2000000 | HeapFree:2, VirtualProtect:37 |

### Primeiros chunks relevantes em TraceMemory

| Chunk | Linhas | Ocorrências |
| --- | --- | --- |
| 1 | 1-250000 | VirtualProtect:6, IsDebuggerPresent:2, CheckRemoteDebuggerPresent:2, ZwQueryInformationProcess:2, ZwSetInformationThread:2 |
| 2 | 250001-500000 | CheckRemoteDebuggerPresent:1, EnumSystemFirmwareTables:1, FatalExit:1 |

## Interpretação operacional do fluxo

Sob a perspectiva operacional, o encadeamento observado reforça uma sequência típica de preparação anti-debug e anti-análise seguida de alocação e alteração de memória. A presença conjunta de **IsDebuggerPresent**, **CheckRemoteDebuggerPresent**, **ZwQueryInformationProcess** e **ZwSetInformationThread** sugere um estágio inicial de verificação e evasão. Em seguida, **GetTickCount** e **QueryPerformanceCounter** reforçam a dimensão temporal do controle de execução. Por fim, **LocalAlloc**, **VirtualProtect** e **HeapFree** apontam para manipulação de memória e limpeza/ajuste do ambiente, antes do encerramento reconstruído em **FatalExit**.

## Artefatos implementados no repositório

Os acompanhamentos sugeridos foram efetivamente materializados no repositório na forma de compressão real dos traces, filtragem seletiva por termos de interesse, processamento incremental por chunk, correlação automática multi-arquivo, geração de diagrama Mermaid, renderização visual em PNG e documentação operacional para reprocessamento futuro.

## Principais arquivos gerados

| Arquivo | Descrição |
| --- | --- |
| data/manifests/dataset_manifest.json | Manifesto de integridade dos CDFs reais |
| data/manifests/compression_manifest.json | Manifesto da compressão adaptativa executada |
| data/filtered/traceinstructions_focus_matches.json | Recortes do trace de instruções com contexto |
| data/filtered/tracememory_focus_matches.json | Recortes do trace de memória com contexto |
| data/filtered/tracedisassembly_windows.json | Janelas do disassembly associadas a endereços relevantes |
| data/correlation/isdebuggerpresent_flow_real.json | Fluxo correlacionado estruturado |
| data/figures/isdebuggerpresent_flow_real.mmd | Diagrama Mermaid reconstruível |
| data/figures/isdebuggerpresent_flow_real.png | Render visual do fluxo correlacionado |
