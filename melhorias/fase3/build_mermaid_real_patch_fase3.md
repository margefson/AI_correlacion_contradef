# build_mermaid_from_json.py — fase 3 de patch

## Objetivo
Fechar a geração do Mermaid com agrupamento por fase e boa legibilidade.

## Estrutura de implementação sugerida
```python
def build_mermaid(graph_json):
    nodes = normalize_nodes(graph_json.get('nodes', []))
    edges = normalize_edges(graph_json.get('edges', []))
    phases = group_by_phase(nodes)
    lines = ['graph TD']
    for phase_name, phase_nodes in phases.items():
        lines.append(f'subgraph {phase_name}')
        for node in phase_nodes:
            lines.append(f"  {node['id']}[{node['label']}]")
        lines.append('end')
    for edge in edges:
        lines.append(f"{edge['from']} --> {edge['to']}")
    return '
'.join(lines)
```

## Checklist de alteração
- Organizar nós por fase.
- Manter fluxo temporal simples.
- Restringir rótulos longos.
- Gerar subgrafos só quando ajudarem.
- Destacar evidências e severidade quando existirem.
- Permitir saída parcial mesmo com grafo incompleto.

## Observações
- O grafo deve ser legível em relatório e na UI.
- A visualização deve priorizar o analista, não a estrutura interna.
