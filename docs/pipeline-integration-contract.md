# Contrato de Integração com o Pipeline Python Existente

## Objetivo

Este documento registra como a aplicação **AI Correlacion Web** integra o backend Python já existente em `scripts/cdf_realtime_api.py`, preservando seus endpoints e encapsulando-os na camada de servidor da interface web. A intenção é **integrar sem substituir** o pipeline legado, mantendo o processamento especializado em Python e acrescentando persistência, histórico, resumo interpretativo por LLM, notificações e auditoria de commits na aplicação web.

## Endpoints legados identificados

| Endpoint legado | Método | Finalidade | Resposta principal |
| --- | --- | --- | --- |
| `/jobs` | `GET` | Lista jobs existentes no diretório monitorado pelo pipeline Python | `{ jobs: [{ job_id, status }] }` |
| `/jobs/upload` | `POST` | Recebe um arquivo `.7z`, `focus_terms` e `focus_regexes`, cria o job e dispara o processamento assíncrono | `{ job_id, status_url, events_url, artifacts_url }` |
| `/jobs/{job_id}/status` | `GET` | Retorna o estado atual do job | `state`, `progress`, `stage`, `message`, `archive`, `focus_terms`, `focus_regexes`, `updated_at` |
| `/jobs/{job_id}/events` | `GET` | Retorna o histórico de eventos do job | `{ job_id, events: [...] }` |
| `/jobs/{job_id}/artifacts` | `GET` | Lista artefatos gerados pelo processamento | `{ job_id, artifact_count, artifacts: [...] }` |
| `/jobs/{job_id}/stdout` | `GET` | Retorna o log padrão do processo | `{ job_id, stdout }` |
| `/jobs/{job_id}/stderr` | `GET` | Retorna o log de erro do processo | `{ job_id, stderr }` |

## Comportamento observado na API Python

A API Python recebe um pacote `.7z`, valida sua extensão, decompõe `focus_terms` e `focus_regexes` em listas separadas por vírgula, cria um `job_id` exclusivo e grava um `status.json` inicial com estado `queued`. Em seguida, ela executa de forma assíncrona o script `run_generic_cdf_analysis.py`, que alimenta o diretório do job com arquivos de status, eventos e artefatos.

A plataforma web deverá considerar a API Python como **motor de execução**. A camada Node/tRPC atuará como **orquestradora**, sincronizando o estado do job para o banco, distribuindo os dados para a interface, gerando o resumo interpretativo por LLM, enviando a notificação ao proprietário e iniciando o commit automático no repositório GitHub somente quando a análise terminar com sucesso.

## Modelo de persistência adotado na aplicação web

| Tabela | Papel | Origem principal dos dados |
| --- | --- | --- |
| `analysisJobs` | Registro mestre do job, status, função analisada, progresso, integração e auditoria de execução | submissão inicial + sincronização do endpoint `/status` |
| `analysisEvents` | Linha do tempo operacional do job | endpoint `/events` |
| `analysisArtifacts` | Índice de artefatos gerados, com caminhos relativos e metadados | endpoint `/artifacts` |
| `analysisInsights` | Resumo interpretativo produzido por LLM | pós-processamento após conclusão do job |
| `analysisCommits` | Auditoria do commit automático no GitHub | etapa final pós-conclusão bem-sucedida |

## Mapeamento entre o legado e a plataforma web

| Dado legado | Campo persistido na web app | Observação |
| --- | --- | --- |
| `job_id` | `analysisJobs.jobId` | Identificador externo e chave lógica principal |
| `archive` | `analysisJobs.sourceArchiveUrl` / `sourceArchiveName` | o nome e a origem do pacote submetido devem ser preservados |
| `focus_terms` | `analysisJobs.focusTermsJson` | lista original usada pelo pipeline |
| `focus_regexes` | `analysisJobs.focusRegexesJson` | filtros complementares opcionais |
| `state` | `analysisJobs.status` | convertido para o enum interno da aplicação |
| `progress` | `analysisJobs.progress` | percentual utilizado no dashboard em tempo real |
| `stage` | `analysisJobs.stage` | etapa atual exibida na interface |
| `message` | `analysisJobs.message` | mensagem operacional amigável |
| `updated_at` | `analysisJobs.updatedAt` | manter coerência temporal para ordenação e histórico |
| `events[]` | `analysisEvents` | cada evento vira um registro persistido |
| `artifacts[]` | `analysisArtifacts` | cada artefato passa a ter tipo, rótulo, caminho e tamanho |

## Fluxo de sincronização previsto

1. A interface envia o `.7z` e os parâmetros de análise à camada tRPC da aplicação web.
2. O servidor grava o arquivo em armazenamento, cria um registro inicial em `analysisJobs` e encaminha a submissão para `POST /jobs/upload` da API Python.
3. O `job_id` retornado pelo pipeline é persistido como chave de correlação externa.
4. Um mecanismo de sincronização consulta periodicamente `/status`, `/events` e `/artifacts` até a finalização do job.
5. Quando o job for concluído com sucesso, a aplicação agrega os artefatos, gera o resumo interpretativo por LLM, envia a notificação ao proprietário e registra a tentativa de commit automático no GitHub.
6. A interface web consome apenas a camada tRPC, não acessando diretamente a API Python.

## Decisões de implementação

| Decisão | Justificativa |
| --- | --- |
| Preservar a API Python como serviço externo configurável | evita reescrever a lógica analítica especializada e respeita a restrição do usuário |
| Persistir o estado do job no banco | permite histórico, filtros, auditoria, notificações e interface resiliente |
| Desacoplar os artefatos do diretório físico | possibilita exportação, cache, indexação e referências estáveis na UI |
| Executar resumo LLM apenas após `completed` | reduz custo, evita sumarização parcial e mantém consistência dos resultados |
| Liberar commit automático apenas em sucesso | atende explicitamente ao requisito funcional informado pelo usuário |

## Próximos passos técnicos

A próxima etapa é implementar a camada de servidor responsável por submeter jobs, sincronizar o pipeline Python, normalizar eventos e artefatos, produzir o resumo interpretativo, registrar a auditoria de commit e expor tudo isso para o frontend por meio de procedimentos tipados.
