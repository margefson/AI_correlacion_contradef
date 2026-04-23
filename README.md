# AI_correlacion_contradef

Este repositório evoluiu de uma análise centrada em **IsDebuggerPresent** para um pipeline **genérico** de correlação entre funções observadas em traces CDF. A versão atual aceita **pacotes 7z contendo CDFs ou arquivos textuais equivalentes**, descobre automaticamente os arquivos relevantes, executa correlação parametrizada por função e produz artefatos reutilizáveis para **acompanhamento progressivo** e **documentação técnica**.

## Objetivo do projeto

O objetivo prático do projeto é permitir que novas amostras sejam analisadas sem reescrever o pipeline. Em vez de depender de um conjunto fixo de arquivos e de uma única função-alvo, a arquitetura agora suporta **múltiplas funções literais**, **expressões regulares**, **novas amostras compactadas** e uma camada de acompanhamento quase em tempo real baseada em jobs.

| Capacidade | Situação atual |
| --- | --- |
| Ingestão de amostras | Aceita `7z` via CLI e via API local |
| Descoberta de arquivos | Recursiva e genérica, sem depender de uma única amostra |
| Correlação por função | Parametrizada com `--focus` e `--focus-regex` |
| Compressão adaptativa | Implementada para arquivos textuais relevantes |
| Recortes filtrados | Implementados por contexto, função e evidência |
| Processamento progressivo | Implementado com `status.json`, `events.jsonl` e saídas parciais |
| Operação em tempo quase real | Implementada com API FastAPI para upload e acompanhamento |
| Relatórios | Geração em Markdown e DOCX para jobs genéricos |

## Dataset utilizado nas validações desta versão

Nesta iteração, a validação funcional foi realizada com o conjunto real extraído de `Full-Execution-Sample-1.7z`, contendo os arquivos abaixo. O repositório, porém, não está mais limitado a esse dataset.

| Arquivo | Papel na análise |
| --- | --- |
| `contradef.2956.FunctionInterceptor.cdf` | Blocos estruturados de chamadas interceptadas e metadados |
| `contradef.2956.TraceDisassembly.cdf` | Disassembly textual com endereços e instruções |
| `contradef.2956.TraceFcnCall.M1.cdf` | Cadeia resumida de chamadas resolvidas |
| `contradef.2956.TraceFcnCall.M2.cdf` | Cadeia ampliada com redirecionamentos adicionais |
| `contradef.2956.TraceInstructions.cdf` | Trace massivo de instruções executadas |
| `contradef.2956.TraceMemory.cdf` | Trace massivo de acessos e referências de memória |

## Estrutura do repositório

| Caminho | Conteúdo |
| --- | --- |
| `scripts/process_real_cdfs.py` | Pipeline legado específico da amostra já analisada |
| `scripts/cdf_analysis_core.py` | Núcleo reutilizável da análise genérica |
| `scripts/run_generic_cdf_analysis.py` | CLI para processar `7z` ou diretórios extraídos |
| `scripts/cdf_realtime_api.py` | API local para upload de `7z` e acompanhamento por job |
| `scripts/generate_generic_report.py` | Geração de relatório Markdown para jobs genéricos |
| `scripts/generate_generic_docx.py` | Geração de relatório DOCX para jobs genéricos |
| `scripts/build_mermaid_from_json.py` | Reconstrução de diagramas Mermaid a partir do JSON |
| `docs/` | Toda a documentação do repositório (web em `docs/web/`, melhorias em `docs/melhorias/`, legado em `docs/legacy/`) |
| `ai_correlacion_web/` | Aplicação Node/React (código; documentação da app em `docs/web/`) |
| `data/jobs/` | Jobs gerados pela CLI genérica |
| `data/jobs_api/` | Jobs gerados pela API local |
| `data/derived/`, `data/filtered/`, `data/correlation/`, `data/figures/` | Artefatos específicos do pipeline anterior e saídas consolidadas |

## Pipeline genérico por linha de comando

A CLI genérica foi criada para processar **qualquer amostra compatível**. Ela aceita um pacote compactado ou um diretório já extraído.

### Exemplo com pacote 7z

```bash
python3.11 scripts/run_generic_cdf_analysis.py \
  --archive /caminho/amostra.7z \
  --focus IsDebuggerPresent \
  --focus VirtualProtect \
  --jobs-root data/jobs
```

### Exemplo com diretório extraído

```bash
python3.11 scripts/run_generic_cdf_analysis.py \
  --input-dir /caminho/traces_extraidos \
  --focus CreateRemoteThread \
  --focus-regex 'Zw.*Process'
```

Ao final, a CLI produz um diretório de job com manifestos, saídas parciais, correlação, Mermaid e resumo geral.

| Arquivo do job | Finalidade |
| --- | --- |
| `status.json` | Estado atual ou final do job |
| `events.jsonl` | Eventos append-only da execução |
| `output/manifests/dataset_manifest.json` | Manifesto dos arquivos descobertos |
| `output/manifests/focus_config.json` | Configuração das funções-alvo |
| `output/manifests/compression_manifest.json` | Compressão adaptativa aplicada |
| `output/derived/function_interceptor_focus.csv` | Recortes de foco em FunctionInterceptor |
| `output/derived/tracefcn_focus.csv` | Recortes de foco em TraceFcnCall |
| `output/filtered/generic_focus_matches.json` | Contextos textuais relevantes |
| `output/correlation/generic_focus_correlation.json` | Grafo principal de correlação |
| `output/figures/generic_focus_correlation.mmd` | Diagrama Mermaid do grafo |

## Acompanhamento em tempo quase real via API

Quando a necessidade é operacional, com submissão do pacote e leitura do progresso durante o processamento, use a API local.

```bash
python3.11 scripts/cdf_realtime_api.py --host 127.0.0.1 --port 8765
```

A API oferece uma página HTML simples em `/` para upload do `7z` e os endpoints abaixo para acompanhamento.

| Endpoint | Método | Finalidade |
| --- | --- | --- |
| `/` | `GET` | Formulário simples de submissão |
| `/jobs/upload` | `POST` | Recebe o pacote e inicia o job |
| `/jobs` | `GET` | Lista jobs conhecidos |
| `/jobs/{job_id}/status` | `GET` | Retorna o progresso atual |
| `/jobs/{job_id}/events` | `GET` | Retorna os eventos registrados |
| `/jobs/{job_id}/artifacts` | `GET` | Lista artefatos produzidos |
| `/jobs/{job_id}/stdout` | `GET` | Exibe stdout do processo |
| `/jobs/{job_id}/stderr` | `GET` | Exibe stderr do processo |

### Exemplo de submissão por `curl`

```bash
curl -X POST \
  -F 'archive=@/caminho/amostra.7z' \
  -F 'focus_terms=IsDebuggerPresent,VirtualProtect' \
  http://127.0.0.1:8765/jobs/upload
```

Depois, o progresso pode ser acompanhado em loop pelo endpoint de status.

```bash
curl http://127.0.0.1:8765/jobs/<job_id>/status
```

## Relatórios genéricos

Uma vez concluído o job, o projeto permite gerar documentação reutilizável específica daquela execução.

```bash
python3.11 scripts/generate_generic_report.py \
  --job-dir data/jobs_api/<job_id> \
  --output-md docs/generic_job_report.md

python3.11 scripts/generate_generic_docx.py \
  --job-dir data/jobs_api/<job_id> \
  --output-docx docs/Generic_CDF_Analysis_Report.docx
```

## Validações já executadas

A versão atual foi validada tanto pela CLI quanto pela API local sobre o dataset `Full-Execution-Sample-1.7z`. A submissão de teste pela API comprovou os seguintes pontos:

| Verificação | Resultado |
| --- | --- |
| Upload do `7z` via HTTP | Concluído |
| Criação de job assíncrono | Concluída |
| Atualização progressiva de `status.json` | Confirmada |
| Registro incremental em `events.jsonl` | Confirmado |
| Geração do JSON de correlação genérica | Confirmada |
| Geração de relatório Markdown e DOCX para o job | Confirmada |

## Compatibilidade e limitações

O classificador de arquivos reconhece padrões como `FunctionInterceptor`, `TraceFcnCall`, `TraceInstructions`, `TraceMemory` e `TraceDisassembly`. Arquivos textuais desconhecidos também são preservados no manifesto e passam por um scanner genérico de contexto. Ainda assim, a qualidade da correlação depende da riqueza dos traces presentes na amostra. Se um tipo de trace não existir, o pipeline continuará funcionando, mas com menos evidências disponíveis.

## App web (`ai_correlacion_web`) — produção

A UI React e a API tRPC correm no **mesmo processo Node** (Express). O caminho mais simples em produção é alojar essa app como **serviço web Node contínuo** (processo de longa duração, mesmo domínio para estáticos e para `/api/...`). O repositório inclui o blueprint **[render.yaml](render.yaml)** na raiz e os detalhes operacionais (variáveis de ambiente, MySQL, OAuth e build) em **[docs/DEPLOY_GRATUITO.md](docs/DEPLOY_GRATUITO.md)**.

## Observações práticas

Os arquivos CDF originais e seus equivalentes comprimidos completos podem ter tamanho elevado. Por isso, o repositório privilegia o versionamento de **scripts, manifestos, relatórios, amostras de saída e artefatos derivados**, mantendo a rastreabilidade necessária sem inflar indevidamente o histórico Git. Os hashes do dataset e a configuração do job preservam a reprodutibilidade operacional.
