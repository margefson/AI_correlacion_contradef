# Pacote de acompanhamento para o fluxo de `IsDebuggerPresent`

## Objetivo

Este pacote foi preparado para duas finalidades complementares. A primeira é **entregar o fluxo já mapeado**, com foco em `IsDebuggerPresent`, a partir do documento-resumo fornecido pelo usuário. A segunda é **operacionalizar as recomendações de acompanhamento** do relatório-base, permitindo que a equipe processe os traces brutos assim que os arquivos `*.cdf` forem exportados para formatos tabulares como CSV ou TSV [1].

## Estrutura do pacote

| Caminho | Conteúdo | Finalidade |
|---|---|---|
| `docs/legacy/isdebuggerpresent_flow/fluxo_isdebuggerpresent_mapeado.md` | Relatório técnico em Markdown | Explica o fluxo correlacionado em todos os arquivos [1] |
| `legacy_artifacts/LoadLibraryA/fluxo_loadlibrarya_mapeado.md` | Relatório paralelo (pivô `LoadLibraryA`) | Mesma cadeia de artefatos Contradef contra o repositório oficial [ver pasta no GitHub](https://github.com/margefson/AI_correlacion_contradef/tree/main/legacy_artifacts/LoadLibraryA) |
| `legacy_artifacts/CheckRemoteDebuggerPresent/fluxo_checkremotedebuggerpresent_mapeado.md` | Relatório paralelo (pivô `CheckRemoteDebuggerPresent`) | Cadeia anti‑debug típica a seguir a `IsDebuggerPresent` — [pastas no GitHub](https://github.com/margefson/AI_correlacion_contradef/tree/main/legacy_artifacts/CheckRemoteDebuggerPresent) |
| `docs/fluxo_isdebuggerpresent.mmd` | Diagrama Mermaid | Representa visualmente a cadeia anti-debug até a classificação |
| `outputs/fluxo_isdebuggerpresent.png` | Imagem do diagrama | Visualização pronta para anexos e apresentações |
| `outputs/fluxo_isdebuggerpresent.json` | Mapeamento estruturado | Base para automação e reuso |
| `scripts/adaptive_trace_compressor.py` | Compressão adaptativa | Reduz o custo de armazenamento mantendo manifesto SHA-256 |
| `scripts/selective_trace_filter.py` | Filtragem seletiva | Recorta eventos por função, texto e endereço |
| `scripts/chunked_trace_processor.py` | Análise incremental | Processa arquivos grandes em blocos |
| `scripts/correlate_isdebuggerpresent_flow.py` | Correlação automática | Reconstrói a cadeia centrada em `IsDebuggerPresent` |
| `scripts/build_mermaid_from_json.py` | Visualização automática | Gera diagramas Mermaid a partir do JSON de correlação |

## Como as sugestões do documento-base foram implementadas

O documento-base recomendou **compressão de traces**, **filtragem seletiva**, **análise incremental**, **correlação automática** e **visualização** [1]. Neste pacote, cada recomendação foi traduzida em um artefato executável. Assim, a implementação não ficou apenas descritiva: ela já está pronta para uso operacional assim que os traces exportados estiverem disponíveis.

| Recomendação original | Implementação entregue | Resultado prático |
|---|---|---|
| Compressão de traces | `adaptive_trace_compressor.py` | Gera arquivos `.gz` e um manifesto com hash |
| Filtragem seletiva | `selective_trace_filter.py` | Permite focar em APIs, palavras-chave e faixas de endereço |
| Análise incremental | `chunked_trace_processor.py` | Evita carregar arquivos muito grandes de uma vez |
| Correlação automática | `correlate_isdebuggerpresent_flow.py` | Cruza exportações de múltiplos traces em um único JSON |
| Visualização | `build_mermaid_from_json.py` + `fluxo_isdebuggerpresent.png` | Gera e atualiza o grafo de execução |

## Fluxo operacional recomendado

A sequência ideal começa pela exportação dos arquivos `*.cdf` para CSV ou TSV. Depois, os traces podem ser comprimidos para preservação e rastreabilidade. Em seguida, deve-se aplicar filtragem seletiva em torno de `IsDebuggerPresent` e funções adjacentes. O terceiro passo é o processamento incremental, especialmente para `TraceInstructions` e `TraceMemory`, que tendem a ser muito volumosos. Por fim, a correlação automática produz um JSON consolidado, e a etapa de visualização transforma esse resultado em grafo.

| Ordem | Ação | Script sugerido |
|---|---|---|
| 1 | Preservar os traces exportados | `adaptive_trace_compressor.py` |
| 2 | Recortar eventos de interesse | `selective_trace_filter.py` |
| 3 | Agregar arquivos volumosos em blocos | `chunked_trace_processor.py` |
| 4 | Correlacionar o fluxo a partir de `IsDebuggerPresent` | `correlate_isdebuggerpresent_flow.py` |
| 5 | Atualizar o diagrama do fluxo | `build_mermaid_from_json.py` |

## Exemplos de uso

Os comandos abaixo assumem que os arquivos exportados já existem em formato CSV ou TSV. Ajuste nomes de colunas e caminhos conforme a ferramenta usada na exportação dos `*.cdf`.

```bash
python3.11 scripts/adaptive_trace_compressor.py /dados/traces_exportados --output-dir /dados/compressed
```

```bash
python3.11 scripts/selective_trace_filter.py /dados/FunctionInterceptor.csv \
  --function-field api \
  --function-name IsDebuggerPresent \
  --output /dados/filtered/isdebuggerpresent.json
```

```bash
python3.11 scripts/chunked_trace_processor.py /dados/TraceInstructions.csv \
  --api-field api \
  --chunk-size 50000 \
  --output-dir /dados/chunks_traceinstructions
```

```bash
python3.11 scripts/correlate_isdebuggerpresent_flow.py \
  --function-interceptor /dados/FunctionInterceptor.csv \
  --tracefcncall-m1 /dados/TraceFcnCall.M1.csv \
  --tracefcncall-m2 /dados/TraceFcnCall.M2.csv \
  --traceinstructions /dados/TraceInstructions.csv \
  --tracememory /dados/TraceMemory.csv \
  --tracedisassembly /dados/TraceDisassembly.csv \
  --output /dados/correlation/isdebuggerpresent_flow.json
```

```bash
python3.11 scripts/build_mermaid_from_json.py /dados/correlation/isdebuggerpresent_flow.json \
  --output /dados/correlation/isdebuggerpresent_flow.mmd
```

## Limitações atuais

Este pacote foi preparado sem acesso aos traces `contradef.2956.*.cdf`. Portanto, o conteúdo técnico entregue aqui é fiel ao documento-base, mas ainda não substitui uma extração evidencial dos arquivos brutos. O próximo salto de qualidade depende apenas da disponibilidade das exportações reais. Quando isso acontecer, os scripts poderão transformar o fluxo lógico em um fluxo forense completo, com endereços, argumentos, threads e timestamps.

## Referências

[1]: Documento fornecido pelo usuário. *Análise dos Resultados de Execução - Full-Execution-Sample-1.docx*.
