# Mapeamento da Redução Heurística Atual e das Propostas Técnicas

## Situação atual da pipeline

A pipeline atual da área **Reduzir Logs** opera em duas camadas distintas. A primeira camada é a **ingestão robusta**, agora baseada em upload em partes com persistência em armazenamento compartilhado e fechamento assíncrono do lote. A segunda camada é a **redução heurística pós-coleta**, executada no serviço analítico depois que o job é criado.

Isso significa que, no estado atual, o sistema **não altera ainda a instrumentação nativa do Contradef/TOMWare durante a geração do log**. Em vez disso, ele recebe os arquivos já gerados, identifica sinais críticos, preserva contexto relevante e produz uma versão reduzida para interpretação, correlação de fluxo e apoio à decisão do analista.

## Como a redução heurística é feita hoje

A redução atual é orientada por **gatilhos, APIs sensíveis, tags de técnica e contexto vizinho**. O backend processa cada arquivo linha a linha e calcula métricas individuais de preservação e descarte.

| Aspecto | Implementação atual |
| --- | --- |
| Entrada | `FunctionInterceptor`, `TraceFcnCall`, `TraceMemory`, `TraceInstructions`, `TraceDisassembly` |
| Detecção principal | Correspondência textual de APIs sensíveis, endereços, padrões de evasão, desempacotamento, persistência e exfiltração |
| Preservação obrigatória | Linhas iniciais, linhas finais, gatilhos críticos, linhas suspeitas, contexto anterior e posterior |
| Métricas por arquivo | Linhas antes/depois, bytes antes/depois, percentual reduzido, eventos suspeitos e gatilhos preservados |
| Saída operacional | Tabela por arquivo, painel operacional, eventos por etapa, relatório resumido, grafo e JSON reduzido |

### Regras de preservação hoje

A rotina atual preserva o conteúdo considerado mais analiticamente útil. Em termos práticos, o coletor mantém as primeiras linhas do arquivo para contexto estrutural, as últimas linhas para fechamento do fluxo, as linhas que contenham APIs sensíveis ou tags relevantes e também o contexto imediatamente anterior e posterior aos gatilhos. Assim, a redução é feita com foco em **preservar o fluxo do malware**, e não apenas em cortar volume bruto.

### APIs e sinais priorizados hoje

As heurísticas já priorizam ocorrências como **`VirtualProtect`**, **`VirtualAlloc`**, **`WriteProcessMemory`**, **`CreateRemoteThread`**, **`IsDebuggerPresent`**, **`NtQueryInformationProcess`**, **`Sleep`**, **`WriteFile`**, **`URLDownloadToFile`**, **`WinHttpSendRequest`**, **`InternetOpenUrl`**, **`RegSetValue`**, **`CreateFile`** e **`DeleteFile`**. Esses sinais são usados para inferir estágios como evasão, desempacotamento, persistência, execução e exfiltração.

### O que o analista verá por arquivo

Depois que o job sair da fila e a etapa heurística terminar, a tela **Reduzir Logs** passa a exibir, para cada arquivo, os campos **Tamanho antes**, **Tamanho depois**, **Redução**, **Sinais críticos**, **Etapa atual**, **Próxima leitura do analista** e **Última mensagem operacional**. Isso vale tanto na tabela principal do lote quanto no painel operacional por arquivo.

Além disso, quando o detalhe do job estiver disponível, a mesma rota passa a concentrar um bloco de **interpretação do lote** (categoria estimada, nível de risco, fase comportamental), **fluxo resumido** (nós e relações do grafo correlacionado), **lista de artefatos** gerados e **resumo interpretativo** em Markdown — espelhando o que o dashboard principal oferece por abas, sem exigir trocar de tela para uma leitura consolidada do último envio.

## Comparação com o documento técnico anexado

A tabela abaixo diferencia o que já existe, o que está parcial e o que ainda não foi implementado.

| Proposta | Estado | Observação técnica |
| --- | --- | --- |
| Proposta 1 — Rastreamento seletivo baseado em heurística | **Parcial** | A preservação heurística por gatilhos e contexto já existe na fase de análise dos logs, mas ainda **não há ativação seletiva de `TraceInstructions` e `TraceMemory` na origem**, dentro do coletor C++/DBI. |
| Proposta 2 — Compressão e formato binário com Protocol Buffers + zstd | **Não implementada** | A pipeline atual continua recebendo logs textuais. Não há schema binário, compressão zstd nem parsing estruturado em protobuf. |
| Proposta 3 — Mitigação de Hardware Performance Counters / RDPMC | **Não implementada** | Não há interceptação de `RDPMC`, mascaramento de contadores ou sincronização com contramedidas desse tipo na plataforma atual. |
| Proposta 4 — Ocultação dinâmica de artefatos em memória / VAD / páginas isca | **Não implementada** | A aplicação web não modifica o runtime instrumentado do agente para ocultar regiões de memória ou criar decoys. |
| Proposta 5 — Detecção de AI-Gated Execution | **Não implementada** | Ainda não há módulo para capturar e classificar tráfego para endpoints de LLM durante a execução monitorada. |
| Proposta 6 — Telemetria envenenada / defesa adversarial | **Não implementada** | Ainda não existe mecanismo de injeção de telemetria enganosa para confundir o modelo do atacante. |

## Interpretação correta do estado atual

A leitura correta é a seguinte: o sistema atual **já implementa uma redução heurística útil para investigação**, com preservação de contexto, métricas por arquivo, classificação preliminar, grafo de fluxo e acompanhamento operacional. No entanto, ele **ainda não implementa as melhorias estruturais de coleta e contramedida nativa** descritas no documento técnico, especialmente as ligadas ao runtime do Contradef/TOMWare, à compressão binária e aos módulos de resistência contra malware adversarial.

## Próximos passos mais coerentes

Para evoluir a solução sem perder rastreabilidade, a ordem mais coerente é: primeiro consolidar a ingestão robusta e a visibilidade dos resultados por arquivo; em seguida, implementar **parser por tipo de log e correlação temporal**; depois, introduzir **rastreamento seletivo na origem** e, só então, avançar para compressão binária, AI-gated execution e mecanismos de adversarial defense.
