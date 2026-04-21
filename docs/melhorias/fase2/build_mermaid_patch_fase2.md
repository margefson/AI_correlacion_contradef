# build_mermaid_from_json.py — fase 2 de patch

## Objetivo
Melhorar a legibilidade do diagrama Mermaid com agrupamento por fase e redução de ruído.

## Pseudo-código do fluxo
```python
def build_mermaid(graph_json):
    validate input
    normalize data
    create header
    group nodes by phase
    add edges in temporal order
    add labels for evidence and severity
    return mermaid text
```

## Estratégias de layout
- Agrupar por ingestão, redução, correlação, classificação e exportação.
- Priorizar fluxo temporal.
- Evitar nós redundantes.
- Manter nome curto para cada nó.
- Destacar nós de maior evidência.

## Checklist de alteração
- Organizar o grafo por fases.
- Eliminar duplicação visual.
- Manter relação clara entre eventos consecutivos.
- Evitar excesso de detalhes técnicos no diagrama.
- Gerar saída parcial se o grafo estiver incompleto.

## Observações
- O diagrama não deve tentar mostrar tudo.
- Ele deve mostrar o essencial para leitura humana.
- O mesmo diagrama precisa funcionar no relatório e na UI.
