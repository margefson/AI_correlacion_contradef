# generate_generic_report.py — fase 1 de patch

## Objetivo
Padronizar a geração de relatórios para qualquer job de análise.

## Estrutura sugerida
```python
def load_job(job_dir):
    ...

def summarize_job(job):
    ...

def build_generic_sections(job):
    ...

def render_generic_markdown(sections):
    ...
```

## Checklist de alteração
- Ler status, eventos e artefatos do job.
- Gerar um sumário curto e reutilizável.
- Evitar dependência de dataset específico.
- Reaproveitar a mesma estrutura para jobs diferentes.
- Incluir processamento, evidências e conclusão.

## Seções sugeridas
- Identificação do job
- Objetivo da análise
- Configuração usada
- Processamento realizado
- Evidências principais
- Artefatos gerados
- Resumo final

## Observações
- O relatório genérico deve ser mais compacto que o relatório detalhado.
- Ele deve servir como base para Markdown e DOCX.
