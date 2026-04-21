# generate_markdown_report.py — fase 3 de patch

## Objetivo
Gerar um relatório final com narrativa curta, analítica e reutilizável.

## Estrutura de implementação sugerida
```python
def build_report_sections(job):
    return {
        'title': ...,
        'summary': ...,
        'config': ...,
        'phases': ...,
        'evidence': ...,
        'artifacts': ...,
        'graph': ...,
        'classification': ...,
        'conclusion': ...,
    }
```

## Checklist de alteração
- Montar resumo executivo curto.
- Descrever as fases em ordem.
- Incluir evidências e artefatos principais.
- Resumir a correlação em linguagem humana.
- Fechar com classificação e conclusão.
- Garantir que o texto possa virar DOCX sem retrabalho.

## Regras de escrita
- Não despejar log bruto.
- Não repetir os mesmos dados em várias seções.
- Manter leitura rápida.
- Priorizar utilidade para o analista.

## Observações
- Esse relatório deve apoiar o artigo e a operação.
- Ele deve refletir o comportamento observado, não só os arquivos gerados.
