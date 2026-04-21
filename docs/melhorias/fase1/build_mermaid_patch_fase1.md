# build_mermaid_from_json.py — fase 1 de patch

## Objetivo
Transformar o JSON de correlação em um diagrama Mermaid legível e compatível com o relatório e a UI.

## Estrutura sugerida
```python
def validate_graph_json(data):
    ...

def normalize_nodes(nodes):
    ...

def normalize_edges(edges):
    ...

def build_mermaid(graph_json):
    ...

def write_mermaid_file(output_path, mermaid_text):
    ...
```

## Checklist de alteração
- Validar o JSON antes de gerar o diagrama.
- Normalizar nós e arestas.
- Simplificar rótulos longos.
- Destacar fases do pipeline.
- Gerar Mermaid válido mesmo com grafo parcial.
- Salvar saída em .mmd.

## Regras de visualização
- Rótulos curtos.
- Fluxo linear sempre que possível.
- Subgrafos apenas se ajudarem a leitura.
- Evidências importantes devem aparecer no diagrama.

## Observações
- O objetivo é interpretabilidade.
- O diagrama deve ser estável entre execuções.
- A UI deve poder renderizar o mesmo arquivo sem transformação pesada.
