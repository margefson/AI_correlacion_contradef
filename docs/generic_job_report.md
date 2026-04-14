# Relatório de Análise Genérica de CDF

Este relatório consolida uma execução do pipeline genérico para correlação de funções em traces CDF ou equivalentes textuais. O objetivo do job foi localizar as funções-alvo informadas, medir sua presença nos arquivos descobertos, reconstruir relações observadas entre chamadas e disponibilizar artefatos reutilizáveis para inspeção contínua.

## Resumo executivo

| Campo | Valor |
| --- | --- |
| Diretório do job | `/home/ubuntu/repos/AI_correlacion_contradef/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb` |
| Estado final | `completed` |
| Etapa final | `completed` |
| Funções literais | `IsDebuggerPresent, VirtualProtect` |
| Expressões regulares | `N/A` |
| Arquivos descobertos | `6` |
| Arquivo principal de correlação | `/home/ubuntu/repos/AI_correlacion_contradef/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb/output/correlation/generic_focus_correlation.json` |

A execução gerou um conjunto de manifestos, saídas derivadas, recortes filtrados e um grafo de correlação. O pipeline foi desenhado para operar sobre pacotes 7z submetidos em novas análises e não depende de um nome de função fixo.

## Distribuição dos arquivos classificados

| Categoria | Quantidade |
| --- | --- |
| function_interceptor | 1 |
| trace_disassembly | 1 |
| trace_fcn_call_m1 | 1 |
| trace_fcn_call_m2 | 1 |
| trace_instructions | 1 |
| trace_memory | 1 |

## Manifesto do dataset

| Arquivo | Categoria | Tamanho (bytes) | SHA-256 |
| --- | --- | --- | --- |
| Full-Execution-Sample-1/contradef.2956.FunctionInterceptor.cdf | function_interceptor | 63044 | 156d70a36ca15143… |
| Full-Execution-Sample-1/contradef.2956.TraceDisassembly.cdf | trace_disassembly | 167388 | 075462e6ca8f4359… |
| Full-Execution-Sample-1/contradef.2956.TraceFcnCall.M1.cdf | trace_fcn_call_m1 | 19880 | 134ddcce52094b80… |
| Full-Execution-Sample-1/contradef.2956.TraceFcnCall.M2.cdf | trace_fcn_call_m2 | 37657 | 9eb72ed62fe208d1… |
| Full-Execution-Sample-1/contradef.2956.TraceInstructions.cdf | trace_instructions | 4214246529 | 499136c7c1c747c5… |
| Full-Execution-Sample-1/contradef.2956.TraceMemory.cdf | trace_memory | 882376705 | a7bf533f8efaf6ee… |

## Nós principais observados

| Nó | É foco | FunctionInterceptor | TraceFcnCall | Textual | Consultas associadas |
| --- | --- | --- | --- | --- | --- |
| IsDebuggerPresent | sim | 2 | 6 | 33 | IsDebuggerPresent |
| VirtualProtect | sim | 5 | 15 | 220 | VirtualProtect |
| .text | não | 0 | 0 | 0 | N/A |
| NtProtectVirtualMemory | não | 0 | 0 | 0 | N/A |
| TlsGetValue | não | 0 | 0 | 0 | N/A |
| unnamedImageEntryPoint | não | 0 | 0 | 0 | N/A |

## Arestas principais observadas

| Origem | Destino | Relação | Contagem | Confiança | Consultas associadas |
| --- | --- | --- | --- | --- | --- |
| VirtualProtect | NtProtectVirtualMemory | direct_call | 5 | 0.95 | VirtualProtect |
| VirtualProtect | TlsGetValue | direct_call | 5 | 0.95 | VirtualProtect |
| unnamedImageEntryPoint | VirtualProtect | direct_call | 4 | 0.95 | VirtualProtect |
| .text | VirtualProtect | direct_call | 1 | 0.5 | VirtualProtect |
| unnamedImageEntryPoint | IsDebuggerPresent | direct_call | 1 | 0.5 | IsDebuggerPresent |

## Artefatos produzidos

| Artefato | Caminho |
| --- | --- |
| dataset_manifest | /home/ubuntu/repos/AI_correlacion_contradef/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb/output/manifests/dataset_manifest.json |
| focus_config | /home/ubuntu/repos/AI_correlacion_contradef/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb/output/manifests/focus_config.json |
| compression_manifest | /home/ubuntu/repos/AI_correlacion_contradef/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb/output/manifests/compression_manifest.json |
| function_interceptor_focus | /home/ubuntu/repos/AI_correlacion_contradef/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb/output/derived/function_interceptor_focus.csv |
| tracefcn_focus | /home/ubuntu/repos/AI_correlacion_contradef/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb/output/derived/tracefcn_focus.csv |
| generic_matches | /home/ubuntu/repos/AI_correlacion_contradef/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb/output/filtered/generic_focus_matches.json |
| generic_chunk_summaries | /home/ubuntu/repos/AI_correlacion_contradef/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb/output/derived/generic_chunk_summaries.json |
| generic_disassembly_windows | /home/ubuntu/repos/AI_correlacion_contradef/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb/output/filtered/generic_disassembly_windows.json |
| generic_correlation | /home/ubuntu/repos/AI_correlacion_contradef/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb/output/correlation/generic_focus_correlation.json |
| generic_mermaid | /home/ubuntu/repos/AI_correlacion_contradef/data/jobs_api/20260414_180723_full_execution_sample_1_isdebuggerpresent-virtualprotect_01bed4fb/output/figures/generic_focus_correlation.mmd |

## Interpretação operacional

O JSON de correlação deve ser tratado como uma estrutura de evidências. Relações `direct_call` representam chamadas explicitamente observadas em traces de instruções. Relações `cooccurrence_*` representam proximidade contextual ou coocorrência em blocos, úteis para priorização investigativa, mas não suficientes isoladamente para afirmar causalidade. Os contadores por arquivo e por categoria ajudam a diferenciar funções apenas citadas de funções efetivamente encadeadas na execução.

## Próximos passos recomendados

| Objetivo | Ação sugerida |
| --- | --- |
| Reexecutar sobre nova amostra | Submeter outro `7z` pela API ou rodar a CLI com novo `--archive`. |
| Acompanhar progresso em tempo quase real | Consultar `status.json`, `events.jsonl` e os endpoints `/jobs/{job_id}/...`. |
| Refinar o foco | Adicionar novas funções em `--focus` ou padrões em `--focus-regex`. |
| Produzir documentação editável | Gerar também o relatório em DOCX a partir deste mesmo job. |

