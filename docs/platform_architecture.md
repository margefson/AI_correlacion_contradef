# Arquitetura da Plataforma de Análise Automatizada de Malware

## Visão geral

A aplicação web **AI Correlacion Web** será uma camada de orquestração e visualização sobre o pipeline já existente no repositório `AI_correlacion_contradef`. O backend web **não substituirá** o arquivo `cdf_realtime_api.py`; em vez disso, atuará como integrador, consumindo sua API para submissão de jobs, leitura de status, eventos progressivos e inventário de artefatos. A camada web adicionará persistência própria, autenticação, histórico navegável, experiência visual refinada, enriquecimento por LLM, notificações operacionais e automação de commit no GitHub.

## Componentes principais

| Camada | Responsabilidade | Implementação planejada |
| --- | --- | --- |
| Frontend React | Upload, dashboard em tempo real, histórico, grafo interativo, exportações e resumo interpretativo | React 19 + Tailwind 4 + tRPC client |
| Backend Express/tRPC | Orquestração de jobs, persistência, polling/SSE interno, integração com LLM, notificações e GitHub | Express 4 + tRPC 11 + Drizzle |
| Banco de dados | Registro de jobs, snapshots de progresso, artefatos, resumo LLM e auditoria de commit | MySQL/TiDB via Drizzle |
| Pipeline existente | Execução real da análise de CDF, extração, correlação e geração de artefatos | `cdf_realtime_api.py` + `run_generic_cdf_analysis.py` |
| Armazenamento | Retenção de uploads e artefatos derivados quando necessário | S3 via `storagePut` |

## Fluxo operacional

| Etapa | Descrição |
| --- | --- |
| 1. Configuração | O usuário seleciona o arquivo 7z e informa a função de interesse antes do envio. |
| 2. Upload | O frontend envia o pacote ao backend web, que valida extensão, tamanho e parâmetros. |
| 3. Disparo | O backend encaminha a submissão ao `cdf_realtime_api.py` e registra o job localmente. |
| 4. Acompanhamento | O backend consulta a API existente periodicamente, consolida status, eventos, logs e progresso e expõe isso ao frontend. |
| 5. Conclusão | Após sucesso, o backend registra artefatos, gera links de exportação, pede resumo interpretativo ao LLM e dispara notificação ao proprietário. |
| 6. Commit | Em jobs concluídos com sucesso, o backend prepara e executa o commit automático dos artefatos no repositório GitHub configurado. |
| 7. Exploração | O usuário reabre o job no histórico, navega no grafo, consulta a tabela de correlações e exporta JSON, Markdown e DOCX. |

## Modelo conceitual de dados

| Entidade | Finalidade | Campos iniciais |
| --- | --- | --- |
| `analysisJobs` | Registro mestre do job submetido | `id`, `jobId`, `sampleName`, `focusFunction`, `status`, `progress`, `stage`, `sourceArchiveUrl`, `pipelineJobPath`, `createdBy`, `createdAt`, `updatedAt`, `completedAt` |
| `analysisEvents` | Linha do tempo de progresso e logs | `id`, `jobId`, `eventType`, `message`, `payloadJson`, `progress`, `createdAt` |
| `analysisArtifacts` | Inventário de resultados exportáveis | `id`, `jobId`, `artifactType`, `label`, `relativePath`, `storageUrl`, `mimeType`, `sizeBytes`, `createdAt` |
| `analysisCorrelations` | Metadados do grafo e da tabela de relações | `id`, `jobId`, `nodeCount`, `edgeCount`, `summaryJson`, `createdAt` |
| `analysisInsights` | Resumo interpretativo por LLM | `id`, `jobId`, `modelName`, `summaryMarkdown`, `riskLevel`, `createdAt` |
| `analysisCommits` | Auditoria do commit automático | `id`, `jobId`, `repository`, `branch`, `commitHash`, `status`, `message`, `createdAt` |

## Estratégia de atualização em tempo real

A experiência em tempo real será implementada inicialmente por **polling otimizado** via tRPC, porque a API Python já expõe endpoints de status e eventos simples e isso reduz acoplamento na primeira versão. A modelagem manterá um serviço de atualização desacoplado para permitir futura troca por **SSE** sem quebrar o frontend. O frontend consultará o job ativo em intervalos curtos durante execução e reduzirá a frequência quando o job estiver concluído.

## Contratos de integração com a API existente

| Endpoint existente | Uso na plataforma |
| --- | --- |
| `POST /jobs/upload` | Submissão do arquivo 7z e parâmetros de função alvo |
| `GET /jobs` | Descoberta de jobs do pipeline quando necessário para reconciliação |
| `GET /jobs/{job_id}/status` | Leitura do estado, estágio e progresso do job |
| `GET /jobs/{job_id}/events` | Consumo da trilha progressiva de eventos e logs |
| `GET /jobs/{job_id}/artifacts` | Descoberta dos artefatos produzidos pelo pipeline |
| `GET /jobs/{job_id}/stdout` | Leitura de logs textuais detalhados |
| `GET /jobs/{job_id}/stderr` | Diagnóstico de falhas |

## Experiência visual

A interface adotará uma linguagem de **console analítico premium**, com fundo escuro sofisticado, acentos metálicos frios, tipografia de alto contraste, espaçamento amplo, cartões com profundidade suave e gráficos/diagramas com tratamento visual de laboratório forense moderno. O layout principal será baseado em dashboard com navegação lateral persistente, adequado ao caráter operacional e histórico da ferramenta.

## Decisões de implementação

| Decisão | Justificativa |
| --- | --- |
| Reutilizar `DashboardLayout` | A aplicação é um painel operacional e se beneficia da navegação lateral consistente. |
| Manter integração externa com o pipeline Python | Atende a restrição de preservar `cdf_realtime_api.py` e reduz retrabalho. |
| Persistir snapshots de progresso | Permite histórico, reconciliação e continuidade visual mesmo após reinício do frontend. |
| Gerar resumo interpretativo no backend | Mantém a chave do LLM protegida e centraliza a auditoria do resultado. |
| Notificar o proprietário no backend | Garante disparo confiável ao concluir o job, mesmo sem o usuário na tela. |
| Commit automático apenas após sucesso | Respeita o requisito funcional e evita versionar jobs incompletos ou com erro. |

## Próximos passos

A próxima etapa será modelar o banco de dados, criar os routers/procedures tRPC de jobs, eventos, artefatos e insights e preparar o serviço de integração que converse com a API Python existente.
