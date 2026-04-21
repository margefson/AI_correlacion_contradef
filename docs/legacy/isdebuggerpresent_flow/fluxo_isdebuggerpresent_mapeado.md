# Fluxo mapeado a partir de `IsDebuggerPresent`

## Escopo e premissa analítica

Este documento reconstrói o fluxo que parte da função **`IsDebuggerPresent`** e se propaga pelos artefatos de trace descritos no material fornecido pelo usuário. Como os arquivos brutos `*.cdf` não foram disponibilizados no ambiente, o mapeamento abaixo foi elaborado a partir do relatório-resumo anexado, preservando uma separação clara entre o que está **explicitamente observado** no documento e o que pode ser **inferido com alta confiança** a partir da relação entre os módulos de rastreamento [1].

> O documento-base afirma que, a partir do `FunctionInterceptor`, foi possível identificar: inicialização por carregamento de bibliotecas, chamadas de **detecção de ambiente** como `IsDebuggerPresent` e `CheckRemoteDebuggerPresent`, técnicas de evasão temporal, manipulação de memória com `VirtualProtect` e `LocalAlloc`, e finalização com `HeapFree` e `FatalExit` [1].

## Ponto de partida: `IsDebuggerPresent`

O ponto de partida solicitado é a chamada a **`IsDebuggerPresent`**, que no contexto do relatório representa um dos primeiros marcos explícitos da fase de **anti-debug**. Em termos forenses, essa chamada funciona como um pivô de correlação porque permite ligar o evento de alto nível capturado na interceptação de APIs ao local de chamada, à instrução executada, aos acessos de memória associados e ao caminho de controle tomado depois do teste [1].

| Camada | Papel de `IsDebuggerPresent` | Nível de confiança | Base |
|---|---|---:|---|
| `FunctionInterceptor.cdf` | Marca explícita do evento anti-debug | Alto | Observado em [1] |
| `TraceFcnCall.M1.cdf` | Possível resolução da origem por chamada direta (`call`) | Médio | Inferido da função do arquivo em [1] |
| `TraceFcnCall.M2.cdf` | Possível resolução por salto indireto ou API dinâmica | Médio | Inferido da função do arquivo em [1] |
| `TraceInstructions.cdf` | Determinação da instrução exata e do desvio subsequente | Alto | Relação entre módulos descrita em [1] |
| `TraceMemory.cdf` | Verificação de dados e buffers afetados antes e depois do teste | Médio | Relação entre módulos descrita em [1] |
| `TraceDisassembly.cdf` | Enquadramento do bloco e do caminho de execução após a checagem | Alto | Relação entre módulos descrita em [1] |

## Mapeamento do fluxo entre todos os arquivos

A correlação a partir de `IsDebuggerPresent` pode ser estruturada como uma cadeia dirigida. Primeiro, o evento aparece como chamada de API no `FunctionInterceptor`. Em seguida, o analista precisa localizar **de onde** essa chamada se originou usando `TraceFcnCall.M1` e `TraceFcnCall.M2`. Depois, `TraceInstructions` posiciona a execução no nível da instrução. Na sequência, `TraceMemory` mostra o contexto de dados daquela região de código, e `TraceDisassembly` revela o bloco básico e o caminho lógico adotado. Essa cadeia é a base para seguir o restante do comportamento até a caracterização do malware [1].

| Ordem lógica | Arquivo | O que deve ser mapeado a partir de `IsDebuggerPresent` | Resultado esperado |
|---|---|---|---|
| 1 | `FunctionInterceptor.cdf` | Registro cronológico da chamada `IsDebuggerPresent` | Confirmação do marco anti-debug |
| 2 | `TraceFcnCall.M1.cdf` | Identificação da chamada direta à API, se a amostra usar importação tradicional | Endereço de origem ou bloco chamador |
| 3 | `TraceFcnCall.M2.cdf` | Identificação da resolução dinâmica via salto indireto, se houver ofuscação | Endereço resolvido em tempo de execução |
| 4 | `TraceInstructions.cdf` | Instrução exata da chamada e teste do valor de retorno | Branch condicional ligado à presença de depurador |
| 5 | `TraceMemory.cdf` | Valores ou buffers associados ao teste e à sequência anti-debug | Evidência contextual do estado consultado ou modificado |
| 6 | `TraceDisassembly.cdf` | Bloco de código anterior e posterior ao teste | Caminho seguido após o resultado da checagem |

## Fluxo correlacionado reconstruído

O documento-base não fornece offsets, timestamps nem argumentos completos por chamada. Ainda assim, ele permite reconstruir um fluxo coerente e tecnicamente consistente. A sequência mais forte é a seguinte: o processo inicia, carrega bibliotecas essenciais, entra em sua fase de detecção de ambiente, chama `IsDebuggerPresent`, amplia a verificação com `CheckRemoteDebuggerPresent` e `NtQueryInformationProcess(ProcessInformationClass=30)`, mede latência com `GetTickCount` e `QueryPerformanceCounter`, confirma se está em ambiente físico por meio de `EnumSystemFirmwareTables` e chamadas WMI, prepara memória com `LocalAlloc`, altera permissões com `VirtualProtect` e por fim executa o código desempacotado antes de encerrar com `HeapFree` e `FatalExit` [1].

| Etapa | Evento principal | Arquivos envolvidos | Situação probatória |
|---|---|---|---|
| 1 | Carregamento de `kernel32.dll` e `ntdll.dll` | `FunctionInterceptor` | Observado em [1] |
| 2 | Chamada a `IsDebuggerPresent` | `FunctionInterceptor` -> `TraceFcnCall.M1/M2` -> `TraceInstructions` | Observado na API, inferido na origem e instrução [1] |
| 3 | Encadeamento para `CheckRemoteDebuggerPresent` | `FunctionInterceptor` -> `TraceFcnCall` -> `TraceInstructions` | Observado na API, correlação inferida [1] |
| 4 | Encadeamento para `NtQueryInformationProcess(30)` | `FunctionInterceptor` -> `TraceFcnCall` -> `TraceInstructions` -> `TraceMemory` | Observado na API, memória inferida [1] |
| 5 | Verificação temporal com `GetTickCount` e `QueryPerformanceCounter` | `FunctionInterceptor` -> `TraceInstructions` | Observado em [1] |
| 6 | Verificação anti-VM com `EnumSystemFirmwareTables` e WMI | `FunctionInterceptor` -> `TraceFcnCall.M2` -> `TraceInstructions` | Observado em [1] |
| 7 | Alocação de memória com `LocalAlloc` | `FunctionInterceptor` -> `TraceInstructions` -> `TraceMemory` | Observado em [1] |
| 8 | Mudança de proteção com `VirtualProtect` de **RW** para **RX** | `FunctionInterceptor` -> `TraceInstructions` -> `TraceMemory` -> `TraceDisassembly` | Observado como padrão de unpacking em [1] |
| 9 | Transferência para o código desempacotado | `TraceFcnCall.M2` -> `TraceDisassembly` -> `TraceInstructions` | Inferido com alta confiança a partir do padrão descrito em [1] |
| 10 | Encerramento com `HeapFree` e `FatalExit` | `FunctionInterceptor` -> `TraceInstructions` | Observado em [1] |

## Como `IsDebuggerPresent` se propaga analiticamente nos arquivos

No **`FunctionInterceptor`**, a função aparece como evento de API e delimita o começo explícito da fase anti-debug. Nos **`TraceFcnCall.M1` e `TraceFcnCall.M2`**, o objetivo é descobrir qual instrução ou salto conduziu à chamada. Isso é importante porque amostras protegidas por **VMProtect** podem alternar entre chamadas convencionais e resoluções indiretas, o que foi exatamente apontado no documento [1].

Em **`TraceInstructions`**, o analista consegue localizar a instrução exata que invoca `IsDebuggerPresent` e, logo depois, o teste do valor retornado. Esse ponto é crítico porque a decisão de fluxo após a chamada separa pelo menos dois caminhos: um caminho de **evasão ou abortamento** quando o ambiente é considerado hostil, e um caminho de **continuidade do desempacotamento** quando o ambiente parece seguro. O documento reforça esse padrão ao afirmar que o malware verifica o ambiente, desempacota o código em memória e então altera a proteção da página para executá-lo [1].

Em **`TraceMemory`**, a correlação deve buscar buffers, flags ou regiões de memória cujo conteúdo se altere nas proximidades da decisão anti-debug e, mais adiante, durante o desempacotamento. Embora o documento não traga os bytes concretos dessas regiões, ele declara explicitamente que `VirtualProtect` e `LocalAlloc` participam do processo de desempacotamento, o que torna essa camada essencial para provar a transição de dados para código executável [1].

Por fim, em **`TraceDisassembly`**, a chamada a `IsDebuggerPresent` deve ser situada dentro do bloco de código que antecede a fase de evasão e preparação de memória. Quando correlacionado com `TraceFcnCall.M2`, esse arquivo ajuda a mostrar a provável transição do stub protegido para o código já liberado na memória, encerrando a cadeia que liga a verificação anti-debug à execução do payload [1].

## Ponto inicial, ponto intermediário e ponto final da cadeia

A partir do foco em `IsDebuggerPresent`, o **ponto inicial contextual** continua sendo o carregamento de bibliotecas do processo. O **ponto inicial analítico específico** passa a ser a entrada na fase anti-debug, marcada por `IsDebuggerPresent`. O **ponto intermediário decisivo** é a sequência `LocalAlloc` -> `VirtualProtect`, que materializa o desempacotamento em memória. O **ponto final de execução** é a finalização com `HeapFree` e `FatalExit`, enquanto o **ponto final de identificação** é anterior a isso: ele ocorre quando a cadeia completa demonstra anti-debug, anti-VM, evasão temporal e unpacking protegido por VMProtect [1].

| Tipo de marco | Evento | Interpretação |
|---|---|---|
| Inicial contextual | Carregamento de bibliotecas do Windows | Início do processo monitorado |
| Inicial específico | `IsDebuggerPresent` | Início da fase anti-debug usada como pivô da análise |
| Intermediário decisivo | `LocalAlloc` -> `VirtualProtect` | Evidência de preparação e execução do código desempacotado |
| Final de execução | `HeapFree` -> `FatalExit` | Encerramento da instância rastreada |
| Final de identificação | Convergência anti-debug + anti-VM + anti-overhead + unpacking | Momento de classificação segura como malware |

## Implementação das sugestões de acompanhamento

Com base nas recomendações do documento-base, foram implementados artefatos de acompanhamento para uso futuro assim que os traces brutos forem disponibilizados. Esses artefatos cobrem quatro frentes complementares: **compressão adaptativa de traces**, **filtragem seletiva por função, região ou palavra-chave**, **processamento incremental em chunks** e **correlação automática com visualização do fluxo**. Todos esses itens foram estruturados como scripts reutilizáveis, acompanhados de manual de uso, para que a equipe consiga operacionalizar a mesma metodologia assim que exportar os `*.cdf` para formatos textuais tabulares [1].

## Limitação metodológica

A ausência dos arquivos `contradef.2956.*.cdf` impede confirmar, no ambiente atual, os endereços reais, offsets, argumentos e timestamps relacionados a `IsDebuggerPresent`. Portanto, o fluxo entregue aqui é **mapeado e pronto para operacionalização**, mas ainda não constitui uma extração byte a byte dos traces originais. Assim que os logs brutos forem fornecidos, os scripts implementados podem ser executados para transformar esta reconstrução lógica em uma linha do tempo forense totalmente evidenciada.

## Referências

[1]: Documento fornecido pelo usuário. *Análise dos Resultados de Execução - Full-Execution-Sample-1.docx*.
