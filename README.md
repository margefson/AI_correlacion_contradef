# AI_correlacion_contradef

Este repositório consolida o processamento do conjunto **Full-Execution-Sample-1** com foco no fluxo que parte de **IsDebuggerPresent** e se propaga pelos arquivos `FunctionInterceptor`, `TraceFcnCall.M1`, `TraceFcnCall.M2`, `TraceInstructions`, `TraceMemory` e `TraceDisassembly`. O objetivo prático do projeto é transformar traces extensos em artefatos reutilizáveis para correlação, acompanhamento operacional e documentação técnica.

## Dataset utilizado

Nesta versão do repositório, o dataset efetivamente processado foi o conjunto real extraído de `Full-Execution-Sample-1.7z`, contendo os seguintes arquivos CDF:

| Arquivo | Papel na análise |
| --- | --- |
| `contradef.2956.FunctionInterceptor.cdf` | Blocos estruturados de chamadas interceptadas e seus metadados |
| `contradef.2956.TraceDisassembly.cdf` | Disassembly textual com endereços e instruções |
| `contradef.2956.TraceFcnCall.M1.cdf` | Cadeia resumida de chamadas resolvidas no primeiro nível |
| `contradef.2956.TraceFcnCall.M2.cdf` | Cadeia ampliada com redirecionamentos adicionais de chamadas |
| `contradef.2956.TraceInstructions.cdf` | Trace massivo de instruções executadas |
| `contradef.2956.TraceMemory.cdf` | Trace massivo de acessos e referências de memória |

O manifesto completo de integridade está em `data/manifests/dataset_manifest.json`.

## Estrutura do repositório

| Caminho | Conteúdo |
| --- | --- |
| `scripts/process_real_cdfs.py` | Pipeline principal de processamento dos CDFs reais |
| `scripts/build_mermaid_from_json.py` | Reconstrói o diagrama Mermaid a partir do JSON de correlação |
| `scripts/generate_markdown_report.py` | Gera o relatório consolidado em Markdown |
| `scripts/generate_final_docx.py` | Gera o relatório consolidado em DOCX |
| `data/manifests/` | Manifestos do dataset e da compressão adaptativa |
| `data/derived/` | Saídas estruturadas e sumários por chunk |
| `data/filtered/` | Recortes filtrados com contexto dos traces reais |
| `data/correlation/` | JSON final com o fluxo correlacionado |
| `data/figures/` | Diagrama Mermaid e sua renderização em PNG |
| `docs/` | Relatórios finais e documentação técnica |

## Acompanhamentos implementados

As sugestões de acompanhamento foram efetivamente implementadas sobre os **dados reais**. A compressão adaptativa foi executada sobre os CDFs completos e seu resultado foi registrado em `data/manifests/compression_manifest.json`. A filtragem seletiva foi aplicada aos traces gigantes, gerando recortes reutilizáveis em `data/filtered/`. O processamento incremental por chunks foi materializado nos arquivos `traceinstructions_chunk_summary.json` e `tracememory_chunk_summary.json`. A correlação multi-arquivo foi consolidada em `data/correlation/isdebuggerpresent_flow_real.json`, e a visualização do fluxo foi produzida em `data/figures/isdebuggerpresent_flow_real.mmd` e `data/figures/isdebuggerpresent_flow_real.png`.

## Sequência operacional recomendada

Para reexecutar o pipeline completo sobre um diretório com CDFs compatíveis, utilize a sequência abaixo.

```bash
python3.11 scripts/process_real_cdfs.py \
  --input-dir /caminho/para/cdfs \
  --output-dir /caminho/para/saida \
  --compress-output-dir /caminho/para/comprimidos
```

Em seguida, para regenerar o diagrama Mermaid a partir do JSON de correlação, execute:

```bash
python3.11 scripts/build_mermaid_from_json.py \
  --input-json data/correlation/isdebuggerpresent_flow_real.json \
  --output-mmd data/figures/isdebuggerpresent_flow_real.mmd
```

Depois, para atualizar a documentação técnica, execute:

```bash
python3.11 scripts/generate_markdown_report.py \
  --repo-root . \
  --output-md docs/relatorio_cdfs_reais_isdebuggerpresent.md

python3.11 scripts/generate_final_docx.py \
  --repo-root . \
  --output-docx docs/Relatorio_Final_CDFs_Reais_IsDebuggerPresent.docx
```

## Artefatos principais

| Arquivo | Finalidade |
| --- | --- |
| `docs/relatorio_cdfs_reais_isdebuggerpresent.md` | Relatório consolidado em Markdown |
| `docs/Relatorio_Final_CDFs_Reais_IsDebuggerPresent.docx` | Relatório final editável em DOCX |
| `data/correlation/isdebuggerpresent_flow_real.json` | Fluxo estruturado a partir de `IsDebuggerPresent` |
| `data/figures/isdebuggerpresent_flow_real.png` | Fluxo renderizado em imagem |
| `data/filtered/traceinstructions_focus_matches.json` | Contextos relevantes no trace de instruções |
| `data/filtered/tracememory_focus_matches.json` | Contextos relevantes no trace de memória |
| `data/filtered/tracedisassembly_windows.json` | Janelas do disassembly para endereços correlatos |
| `data/manifests/compression_manifest.json` | Resultado da compressão adaptativa dos CDFs reais |

## Observações práticas

Os arquivos CDF originais e seus equivalentes comprimidos completos podem ter tamanho elevado. Por isso, o repositório versiona prioritariamente os **artefatos derivados, manifestos, relatórios, diagramas e scripts**, preservando a rastreabilidade necessária sem inflar indevidamente o histórico Git. A análise continua reproduzível porque os hashes do dataset e o pipeline aplicado estão registrados no projeto.
