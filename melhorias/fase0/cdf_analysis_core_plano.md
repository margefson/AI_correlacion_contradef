# cdf_analysis_core.py — plano de implementação

## Objetivo do arquivo
Transformar o núcleo da análise em um pipeline com fases explícitas, saída rastreável e estrutura compatível com a API, o frontend e os relatórios.

## Estrutura-alvo do job
Cada job deve ter:
- id
- status
- phase
- progress
- events
- artifacts
- config
- summary

## Fases sugeridas
1. ingestao
2. descoberta
3. reducao
4. correlacao
5. classificacao
6. exportacao

## Checklist de alteração
- Extrair a definição do job para uma estrutura única.
- Criar funções pequenas por fase.
- Registrar início e fim de cada fase em events.jsonl.
- Atualizar status.json a cada mudança de fase.
- Gerar resumo curto por fase.
- Consolidar evidências em um grafo simples com nós e arestas.
- Incluir severidade ou nível de suspeita quando houver regra aplicável.
- Garantir que as saídas sejam reutilizáveis por API e relatórios.

## Saídas esperadas
- status.json
- events.jsonl
- outputmanifests/*.json
- outputcorrelation/*.json
- outputfigures/*.mmd
- summary textual do job

## Observações
- O core não deve cuidar de HTTP.
- O core não deve formatar HTML.
- O core deve ser o ponto único de verdade da análise.
