# cdf_analysis_core.py — fase 2 de patch

## Objetivo
Detalhar a lógica das funções centrais do pipeline.

## Pseudo-código das funções

### discover_inputs(input_dir, archive=None)
```python
def discover_inputs(input_dir, archive=None):
    files = []
    if archive:
        extract archive to temp
        walk extracted tree
    else:
        walk input_dir
    collect relevant text/cdf files
    return sorted(files)
```

### apply_selective_reduction(files, focus_terms=None, focus_regex=None)
```python
def apply_selective_reduction(files, focus_terms=None, focus_regex=None):
    reduced = []
    for file in files:
        text = read file safely
        if matches focus_terms or focus_regex:
            keep relevant snippets
        else:
            keep a compact summary or skip noise
        reduced.append(record)
    return reduced
```

### correlate_events(reduced_data, ctx)
```python
def correlate_events(reduced_data, ctx):
    graph = {"nodes": [], "edges": []}
    for item in reduced_data:
        identify phase, actor, action, evidence
        create/update nodes
        create edges between related events
        attach timestamps and source file
    return graph
```

### classify_behavior(correlation_result, ctx)
```python
def classify_behavior(correlation_result, ctx):
    labels = []
    score = 0
    if anti_debug signals: score += ...
    if anti_vm signals: score += ...
    if delay signals: score += ...
    if memory unpacking signals: score += ...
    assign risk_level and tags
    return {"score": score, "risk": ..., "tags": labels}
```

## Regras de implementação
- Ler arquivos com segurança e tolerância a erro.
- Manter sempre evidência de origem no resultado.
- Nunca perder o vínculo entre redução e fonte.
- Correlacionar apenas o que for útil para leitura humana.
- Classificação deve ser explicável por regras.

## Saídas esperadas por função
- discover_inputs -> lista de arquivos encontrados
- apply_selective_reduction -> lista compactada de evidências
- correlate_events -> grafo/nós/arestas
- classify_behavior -> score, risco e etiquetas

## Observações
- Esse nível ainda é framework-level, não depende de modelos de IA.
- O valor está na interpretabilidade, não em complexidade algorítmica.
