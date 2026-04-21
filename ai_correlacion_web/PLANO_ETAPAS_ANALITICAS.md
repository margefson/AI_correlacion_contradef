# Plano das próximas etapas analíticas

> **Estado integrado (melhorias fases 0–3):** a ingestão robusta (incluindo fallback local), o monitoramento por arquivo na rota **Reduzir Logs**, os relatórios Python genéricos, a API FastAPI com eventos incrementais e a documentação de arquitetura já estão alinhados ao backlog em `melhorias/`. A tela **Reduzir Logs** também expõe interpretação consolidada, fluxo resumido e artefatos do job corrente, complementando o dashboard principal. Itens abaixo permanecem como **roadmap** (parser por tipo ainda mais explícito na UI, SSE, grafo com layout dedicado, etc.).

O estágio atual do produto ainda está concentrado na **ingestão confiável** do lote de logs. A próxima evolução precisa transformar o sistema em uma superfície operacional de análise, permitindo ao analista observar em tempo real o que já foi recebido, o que já foi reduzido, quais sinais foram encontrados e qual hipótese comportamental está emergindo do conjunto analisado.

A priorização recomendada parte do princípio de que o valor para o analista não está apenas em concluir a redução, mas em **entregar contexto acionável enquanto o processamento ainda está em andamento**. Isso exige separar claramente as etapas de transporte, preparação, extração de evidências, correlação de eventos, classificação comportamental e apresentação operacional.

| Prioridade | Etapa funcional | Objetivo operacional | Entrega visível ao analista |
| --- | --- | --- | --- |
| 1 | Ingestão robusta e rastreável | Garantir upload estável, remontagem correta e abertura do job analítico | Barra de envio confiável, status por arquivo, confirmação de lote recebido |
| 2 | Normalização e parser por tipo de log | Converter TraceInstructions, TraceFcnCall, TraceMemory, TraceDisassembly e FunctionInterceptor em eventos estruturados | Contadores por tipo, linhas válidas, erros de parsing e taxa de aproveitamento |
| 3 | Correlação temporal do fluxo | Reconstruir a sequência de execução do malware a partir dos eventos extraídos | Timeline viva com chamadas, memória, desvios, instruções e marcos relevantes |
| 4 | Categorização comportamental | Agrupar trechos em táticas como evasão, descoberta, persistência, anti-debug, injeção e movimentação | Etiquetas por evento e por trecho do fluxo, com justificativa rastreável |
| 5 | Classificação e semáforo de risco | Produzir hipóteses interpretáveis sobre família, comportamento dominante e severidade | Painel de risco, confiança, hipótese principal e critérios observados |
| 6 | Acompanhamento em tempo real | Atualizar o analista durante a execução sem esperar o término do job | Cards vivos, progressão por etapa, alertas e recomendação operacional |
| 7 | Consolidação investigativa | Fechar o lote com resumo executivo, achados e artefatos navegáveis | Resumo final, fluxo consolidado, evidências e links para artefatos |

## Sequência técnica recomendada

A etapa imediatamente seguinte ao upload deve ser um **pipeline de normalização por tipo de log**, pois sem isso o sistema não consegue sustentar classificação ou reconstrução do fluxo. Cada arquivo precisa ser transformado em eventos estruturados mínimos, com campos como timestamp relativo, tipo de evento, origem, destino, indicador comportamental, severidade preliminar e evidência textual original.

Na sequência, o sistema deve alimentar uma **camada de correlação** capaz de unir eventos de arquivos diferentes em uma narrativa única. Essa narrativa deve responder perguntas operacionais centrais, como quais APIs sensíveis foram chamadas, quais decisões condicionais sugerem anti-análise, que mudanças de memória antecederam execução indireta e em que ponto houve escalada ou persistência.

Por fim, a camada de apresentação precisa expor isso em duas formas complementares. A primeira é uma **visão ao vivo**, voltada a acompanhamento, com progresso, alertas, semáforos e eventos em ordem temporal. A segunda é uma **visão investigativa consolidada**, voltada a decisão e documentação, com resumo interpretável, categorias comportamentais, classificação e explicações rastreáveis até as linhas ou blocos originais.

## Backlog funcional imediato

| Ordem | Implementação recomendada | Resultado esperado |
| --- | --- | --- |
| 1 | Criar estrutura comum de eventos normalizados no backend | Base única para timeline, filtros e classificação |
| 2 | Adicionar estágio explícito de parsing por arquivo no monitoramento | Analista passa a ver quando cada arquivo saiu do upload e entrou em interpretação |
| 3 | Persistir eventos intermediários e marcos analíticos no backend | Atualização em tempo real mais confiável e auditável |
| 4 | Exibir timeline incremental na interface do lote atual | Acompanhamento vivo do fluxo do malware |
| 5 | Implementar categorização inicial por regras heurísticas | Rótulos como evasão, anti-debug, memória e execução |
| 6 | Implementar classificação consolidada com justificativas | Hipótese interpretável para tomada de decisão |

## Critério de sucesso da próxima fase

A próxima fase estará madura quando o analista conseguir subir um lote e, antes mesmo do encerramento total, visualizar **o que já foi processado, quais sinais críticos apareceram, qual trecho do fluxo está sendo reconstruído e qual interpretação preliminar já pode orientar a investigação**.
