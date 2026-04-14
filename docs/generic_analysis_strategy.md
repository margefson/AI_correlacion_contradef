# Estratégia de Generalização do Pipeline de Correlação CDF

A próxima evolução do repositório deve remover a dependência de uma única amostra, de um único nome de função e de um conjunto fixo de arquivos. A análise passará a operar sobre **pacotes 7z arbitrários**, contendo **CDFs ou arquivos textuais equivalentes**, e permitirá ao operador informar uma ou mais funções de interesse para reconstruir a correlação entre eventos observados nos traces.

| Objetivo | Diretriz de implementação |
| --- | --- |
| Ingestão genérica | Aceitar `--archive arquivo.7z` e também `--input-dir diretório`, com extração automática para um workspace isolado por execução. |
| Descoberta de arquivos | Detectar arquivos de trace recursivamente, classificando-os por tipo com base no nome e, quando necessário, por heurística de conteúdo. |
| Foco parametrizado | Permitir `--focus NomeDaFuncao` repetível, lista de expressões regulares e arquivo de configuração JSON para múltiplos alvos. |
| Correlação multiarquivo | Construir um grafo de evidências por função e por arquivo, em vez de um fluxo rígido centrado em `IsDebuggerPresent`. |
| Acompanhamento progressivo | Escrever `status.json`, `events.jsonl` e artefatos parciais por etapa para inspeção quase em tempo real. |
| Operação contínua | Expor uma API local para submissão do 7z, consulta do progresso e download dos artefatos produzidos. |

A arquitetura será dividida em um **núcleo reutilizável**, uma **CLI genérica** e um **serviço HTTP leve**. O núcleo concentrará extração, descoberta, parsing, filtragem e correlação. A CLI facilitará reprocessamentos e automação em lote. O serviço HTTP viabilizará o cenário operacional pedido pelo usuário: submeter um pacote 7z de uma amostra e acompanhar o resultado durante o processamento.

| Camada | Função |
| --- | --- |
| `scripts/cdf_analysis_core.py` | Funções reutilizáveis para extração, classificação, parsing, correlação, escrita de manifestos e atualização de progresso. |
| `scripts/run_generic_cdf_analysis.py` | Entrada de linha de comando para processar uma amostra a partir de `7z` ou diretório. |
| `scripts/cdf_realtime_api.py` | Serviço FastAPI com endpoints para upload, criação de job, progresso, eventos e acesso aos artefatos. |
| `scripts/render_generic_report.py` | Geração de relatório Markdown e, se aplicável, DOCX a partir da saída genérica. |
| `data/jobs/<job_id>/` | Workspace por execução, contendo eventos, status, arquivos extraídos, artefatos parciais e saídas finais. |

A correlação deverá ser transformada de um fluxo pré-ordenado em uma estrutura dirigida por evidências. Cada nó representará uma função observada. Cada aresta representará uma relação inferida a partir de chamadas, proximidade em traces, recorrência por thread e coocorrência entre arquivos. O resultado mínimo deverá incluir um JSON com nós, arestas, evidências, arquivos de origem, linhas relevantes e nível de confiança.

| Tipo de evidência | Origem esperada | Uso na correlação |
| --- | --- | --- |
| Chamada direta | `TraceInstructions`, `TraceFcnCall.*` | Construir arestas `caller -> callee`. |
| Bloco interceptado | `FunctionInterceptor` | Confirmar presença, thread, módulo e ponto de observação da função. |
| Contexto textual | `TraceMemory`, traces textuais grandes | Reforçar recorrência, proximidade e contexto operacional. |
| Endereço correlato | `TraceDisassembly` e traces com endereços | Abrir janelas de evidência para endereços vinculados às funções alvo. |

O acompanhamento progressivo será operacionalizado por artefatos de estado simples e estáveis. Isso permitirá monitoramento por interface web, automação externa ou inspeção manual no filesystem.

| Artefato de acompanhamento | Finalidade |
| --- | --- |
| `status.json` | Estado atual do job, etapa ativa, porcentagem estimada e principais saídas já disponíveis. |
| `events.jsonl` | Log append-only com eventos de início, descoberta, parsing, correlação, erro e conclusão. |
| `partial/*.json` | Resultados intermediários produzidos por etapa para consumo antecipado. |
| `reports/*.md` | Resumo técnico gerado mesmo antes do DOCX final, quando houver. |

A generalização também deve contemplar arquivos com nomes diferentes dos usados na amostra atual. Por isso, a classificação dos arquivos deve usar um mapa de padrões por categoria, como `function_interceptor`, `trace_fcn_call`, `trace_instructions`, `trace_memory`, `trace_disassembly` e `unknown_text_trace`. Arquivos desconhecidos, mas textuais, devem ser preservados no manifesto e passar por um scanner genérico de contexto.

Ao final da implementação, o repositório deverá conter exemplos de uso, documentação operacional, scripts testados e uma skill reutilizável que descreva quando e como aplicar esse fluxo em futuras amostras.
