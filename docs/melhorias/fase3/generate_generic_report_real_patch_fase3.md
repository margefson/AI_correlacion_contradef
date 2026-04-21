# generate_generic_report.py — fase 3 de patch

## Objetivo
Padronizar relatórios genéricos com uma estrutura clara e reutilizável.

## Estrutura de implementação sugerida
```python
def build_generic_report(result):
    sections = []
    sections.append(make_summary(result))
    sections.append(make_findings(result))
    sections.append(make_evidence(result))
    sections.append(make_actions(result))
    return '

'.join(sections)
```

## Checklist de alteração
- Criar cabeçalho consistente.
- Resumir contexto e resultado.
- Listar achados principais.
- Destacar evidências relevantes.
- Incluir ações recomendadas.
- Manter linguagem simples e objetiva.

## Regras de escrita
- Evitar duplicação entre seções.
- Evitar jargão excessivo.
- Priorizar clareza para leitura rápida.
- Permitir uso em diferentes tipos de análise.

## Observações
- O relatório genérico deve servir como fallback.
- Ele complementa o relatório especializado sem competir com ele.
