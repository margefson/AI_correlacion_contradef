# generate_markdown_report.py — fase 2 de patch

## Objetivo
Detalhar a composição do relatório com foco em interpretabilidade.

## Pseudo-código
```python
def build_report_sections(job):
    sections = []
    sections.append(summary(job))
    sections.append(config(job))
    sections.append(phases(job.events))
    sections.append(evidence(job.events))
    sections.append(artifacts(job.artifacts))
    sections.append(graph(job.summary))
    sections.append(classification(job.summary))
    sections.append(conclusion(job))
    return sections
```

## Regras de composição
- Resumo curto no início.
- Fases em ordem temporal.
- Evidências com origem clara.
- Artefatos com descrição simples.
- Conclusão curta e objetiva.

## Checklist de alteração
- Gerar resumo executivo em 3-5 linhas.
- Listar fases e mensagens principais.
- Mostrar artefatos mais importantes.
- Recontar a correlação em linguagem humana.
- Fechar com observações e limitações.

## Observações
- O relatório precisa sustentar a proposta do artigo.
- Deve ser simples de revisar e fácil de converter para DOCX.
