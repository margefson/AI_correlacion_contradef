# Notas do repositório de referência

O repositório `margefson/AI_correlacion_contradef` já contém um pipeline parcialmente pronto para correlação de logs da Contradef. Pela página principal observada, a base atual inclui uma API local em FastAPI para upload e acompanhamento por job, scripts de análise genérica, geração de relatórios em Markdown e DOCX, reconstrução de diagramas Mermaid e processamento progressivo com artefatos como `status.json` e `events.jsonl`.

| Área identificada | Evidência observada | Potencial de reaproveitamento |
| --- | --- | --- |
| API local | `scripts/cdf_realtime_api.py` | Base para modelar ingestão assíncrona e acompanhamento de jobs no backend Node.js |
| Núcleo analítico | `scripts/cdf_analysis_core.py` | Base para portar ou encapsular parsing, correlação e recortes filtrados |
| Processamento genérico | `scripts/run_generic_cdf_analysis.py` | Referência para pipeline parametrizável por função e expressão regular |
| Relatórios | `scripts/generate_generic_report.py` e `scripts/generate_generic_docx.py` | Reaproveitamento da lógica de resumo e exportação de relatórios |
| Visualização | `scripts/build_mermaid_from_json.py` | Base para timeline/grafo interativo no frontend |
| Operação quase em tempo real | `status.json`, `events.jsonl` e saídas parciais | Excelente encaixe para painéis em tempo real e acompanhamento da análise |

A página também indica que a linguagem predominante do repositório é TypeScript, seguida de Python e JavaScript, o que sugere que já existe uma camada web iniciada em `ai_correlacion_web/` que deve ser inspecionada antes de implementar novas telas no projeto atual.

## Detalhes observados em `ai_correlacion_web`

A subpasta `ai_correlacion_web` já representa uma aplicação web madura, com `client/`, `server/`, `drizzle/`, `shared/`, testes e documentação própria. O README dessa subaplicação descreve um painel operacional em React + Tailwind com backend tRPC + Express, persistência relacional, orquestração de pipeline Python legado, acompanhamento em tempo real, exportação de artefatos e geração de resumo interpretativo por LLM.

| Elemento existente | Indício no README | Relevância para o novo produto |
| --- | --- | --- |
| Dashboard analítico | Histórico, detalhe de job, grafo, logs e exportações | Alta; reaproveitável para a interface da nova plataforma |
| Backend orquestrador | `server/analysisService.ts` e `server/analysisRouter.ts` | Alta; serve como referência para jobs de ingestão e análise |
| Persistência | `drizzle/schema.ts` e `server/db.ts` | Alta; já há base para modelar jobs, eventos e artefatos |
| Integração com pipeline legado | Execução do pipeline Python com sincronização de status | Alta; pode ser adaptada para parsing e redução dos logs da Contradef |
| Resumo por LLM | Geração interpretativa server-side | Alta; alinhado ao requisito de interpretação automática |
| Exportação | JSON, Markdown, DOCX e demais saídas | Alta; encaixa no requisito de relatório exportável |

A principal conclusão é que o repositório de referência não é apenas uma coleção de scripts. Ele já contém uma plataforma web compatível com a stack atual do projeto, o que indica que a estratégia mais eficiente será reaproveitar sua arquitetura, seus contratos e sua modelagem operacional, adaptando-os do domínio de correlação CDF para o domínio de análise automatizada de logs da Contradef.
