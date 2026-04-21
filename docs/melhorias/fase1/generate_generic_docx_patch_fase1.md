# generate_generic_docx.py — fase 1 de patch

## Objetivo
Converter o relatório genérico para DOCX com estrutura limpa, consistente e reutilizável.

## Estrutura sugerida
```python
def load_report_markdown(job_dir):
    ...

def build_docx_document(report_data):
    ...

def apply_styles(doc):
    ...

def write_docx(output_path, doc):
    ...
```

## Checklist de alteração
- Ler o conteúdo já gerado pelo relatório genérico.
- Aplicar títulos e seções padronizadas.
- Preservar a ordem lógica do relatório.
- Manter formatação simples e legível.
- Garantir compatibilidade com o Markdown de origem.

## Seções sugeridas
- Título do job
- Identificação
- Resumo executivo
- Configuração
- Processamento
- Evidências
- Artefatos
- Conclusão

## Observações
- O DOCX deve refletir o Markdown de forma fiel.
- A geração precisa ser determinística.
- O foco é leitura e revisão, não enfeite visual.
