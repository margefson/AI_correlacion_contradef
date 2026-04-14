# Fluxo operacional genérico para análise de amostras 7z com CDFs

Este documento descreve como operar o pipeline genérico quando uma nova amostra é recebida em um arquivo **7z** contendo traces CDF ou arquivos textuais equivalentes. O foco não está em uma função fixa, mas em qualquer **função de interesse** definida no momento da análise.

## Visão geral do fluxo

| Etapa | Objetivo | Saída principal |
| --- | --- | --- |
| Ingestão | Receber o `7z` e registrar um novo job | `data/jobs.../<job_id>/input/` |
| Extração | Descompactar o pacote em workspace isolado | `extracted/` |
| Descoberta | Inventariar e classificar arquivos relevantes | `output/manifests/dataset_manifest.json` |
| Compressão | Criar versão enxuta de arquivos textuais quando aplicável | `output/manifests/compression_manifest.json` |
| Filtragem | Extrair janelas contextuais para funções-alvo | `output/filtered/` |
| Correlação | Construir nós, arestas e evidências cruzadas | `output/correlation/generic_focus_correlation.json` |
| Visualização | Gerar Mermaid e relatórios | `output/figures/`, `docs/` |

## Execução por linha de comando

A forma mais direta de executar o pipeline é pela CLI genérica.

```bash
python3.11 scripts/run_generic_cdf_analysis.py \
  --archive /caminho/amostra.7z \
  --focus IsDebuggerPresent \
  --focus-regex 'Zw.*Process'
```

Se os arquivos já estiverem extraídos:

```bash
python3.11 scripts/run_generic_cdf_analysis.py \
  --input-dir /caminho/amostra_extraida \
  --focus VirtualProtect
```

## Execução com acompanhamento em tempo quase real

Quando for necessário observar o andamento enquanto a análise roda, inicie a API local.

```bash
python3.11 scripts/cdf_realtime_api.py --host 127.0.0.1 --port 8765
```

Depois, envie a amostra com `curl` ou pela interface HTML exposta em `/`.

```bash
curl -X POST \
  -F 'archive=@/caminho/amostra.7z' \
  -F 'focus_terms=IsDebuggerPresent,VirtualProtect' \
  http://127.0.0.1:8765/jobs/upload
```

A resposta retornará um identificador de job e URLs de acompanhamento.

## Como acompanhar a execução

| Recurso | Uso |
| --- | --- |
| `GET /jobs/{job_id}/status` | Progresso atual, etapa, mensagem e saídas principais |
| `GET /jobs/{job_id}/events` | Linha do tempo técnica da execução |
| `GET /jobs/{job_id}/artifacts` | Lista de artefatos já disponíveis |
| `GET /jobs/{job_id}/stdout` | Saída padrão do processo |
| `GET /jobs/{job_id}/stderr` | Erros e avisos |
| `status.json` | Espelho local do estado do job |
| `events.jsonl` | Registro incremental e persistente de eventos |

## Interpretação das etapas de status

| Etapa | Significado |
| --- | --- |
| `extracting_archive` | O pacote `7z` está sendo descompactado |
| `discovering_files` | Os arquivos estão sendo classificados por categoria |
| `compressing` | Os arquivos textuais estão passando por compressão adaptativa |
| `filtering` | Recortes de contexto estão sendo montados |
| `scanning_large_traces` | Traces grandes estão sendo varridos por streaming |
| `correlating` | O grafo entre funções está sendo consolidado |
| `completed` | O job foi concluído e os artefatos finais estão disponíveis |
| `failed` | O job terminou com erro e deve ser investigado pelos logs |

## Artefatos essenciais para a análise

| Arquivo | Interpretação |
| --- | --- |
| `generic_focus_correlation.json` | Grafo principal com nós, arestas e evidências |
| `generic_focus_correlation.mmd` | Visualização Mermaid do grafo |
| `generic_focus_matches.json` | Ocorrências contextuais em traces textuais |
| `function_interceptor_focus.csv` | Chamadas capturadas em blocos estruturados |
| `tracefcn_focus.csv` | Encadeamentos extraídos de TraceFcnCall |
| `generic_chunk_summaries.json` | Sumários por bloco durante varredura de traces grandes |
| `focus_config.json` | Configuração exata das funções-alvo usadas no job |

## Uso recomendado em produção operacional

Para um fluxo contínuo, o operador pode manter a API ativa e submeter cada nova amostra como um job separado. Dessa forma, cada `7z` gera um workspace isolado, com rastreabilidade própria, evitando mistura entre amostras diferentes. Em cenários mais críticos, recomenda-se armazenar externamente os `status.json`, `events.jsonl` e o `generic_focus_correlation.json` para auditoria posterior.

## Fechamento e documentação

Depois que o job terminar, gere documentação de saída para preservar o resultado da amostra analisada.

```bash
python3.11 scripts/generate_generic_report.py \
  --job-dir data/jobs_api/<job_id> \
  --output-md docs/generic_job_report.md

python3.11 scripts/generate_generic_docx.py \
  --job-dir data/jobs_api/<job_id> \
  --output-docx docs/Generic_CDF_Analysis_Report.docx
```

Esse fechamento transforma o resultado operacional do job em material reutilizável para análise forense, documentação interna e versionamento no repositório.
