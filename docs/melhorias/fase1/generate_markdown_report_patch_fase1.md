# generate_markdown_report.py — fase 1 de patch

## Objetivo
Criar um relatório Markdown com leitura executiva e técnica, baseado no job concluído.

## Estrutura sugerida
```python
def load_job(job_dir):
    ...

def build_report_sections(job):
    ...

def render_markdown(sections):
    ...

def write_report(output_path, markdown_text):
    ...
```

## Seções sugeridas
- Título e metadados
- Resumo executivo
- Configuração do job
- Fases executadas
- Evidências relevantes
- Artefatos gerados
- Grafo/correlação resumida
- Classificação final
- Limitações e próximos passos

## Checklist de alteração
- Ler status, eventos e manifestos.
- Montar sumário do processamento.
- Destacar redução de logs.
- Destacar eventos críticos.
- Resumir a correlação.
- Incluir classificação e conclusão.

## Observações
- O relatório deve ser útil para o analista e para o artigo.
- Não deve virar dump de logs.
- O texto precisa ser curto, claro e reutilizável.
