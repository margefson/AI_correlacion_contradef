# cdf_analysis_core.py — fase 1 de patch

## Objetivo
Reestruturar o núcleo para um pipeline explícito, rastreável e compatível com API, frontend e relatórios.

## Estrutura sugerida de funções

```python
@dataclass
class JobContext:
    job_id: str
    status: str
    phase: str
    progress: int
    config: dict
    events: list
    artifacts: list
    summary: dict


def create_job_context(config) -> JobContext:
    ...


def update_job(ctx, phase=None, progress=None, status=None, message=None):
    ...


def log_event(ctx, event_type, message, data=None):
    ...


def discover_inputs(input_dir, archive=None):
    ...


def apply_selective_reduction(files, focus_terms=None, focus_regex=None):
    ...


def correlate_events(reduced_data, ctx):
    ...


def classify_behavior(correlation_result, ctx):
    ...


def build_summary(ctx):
    ...


def export_artifacts(ctx, output_dir):
    ...


def run_analysis(config):
    ctx = create_job_context(config)
    update_job(ctx, phase='ingestao', progress=5, status='running')
    log_event(ctx, 'phase_started', 'Ingestão iniciada')

    inputs = discover_inputs(config.get('input_dir'), config.get('archive'))
    log_event(ctx, 'inputs_discovered', f'{len(inputs)} arquivos descobertos')

    update_job(ctx, phase='reducao', progress=20)
    reduced = apply_selective_reduction(inputs, config.get('focus_terms'), config.get('focus_regex'))
    log_event(ctx, 'reduction_done', 'Redução seletiva concluída')

    update_job(ctx, phase='correlacao', progress=50)
    correlation = correlate_events(reduced, ctx)
    log_event(ctx, 'correlation_done', 'Correlação concluída')

    update_job(ctx, phase='classificacao', progress=70)
    classification = classify_behavior(correlation, ctx)
    log_event(ctx, 'classification_done', 'Classificação concluída')

    update_job(ctx, phase='exportacao', progress=90)
    artifacts = export_artifacts(ctx, config.get('output_dir'))
    log_event(ctx, 'artifacts_exported', 'Artefatos exportados')

    ctx.summary = build_summary(ctx)
    update_job(ctx, status='done', phase='finished', progress=100)
    log_event(ctx, 'job_completed', 'Análise finalizada')
    return ctx
```

## Patch de implementação por etapas

### Etapa 1
Criar `JobContext` e helpers de update/log.

### Etapa 2
Separar descoberta de arquivos e redução seletiva.

### Etapa 3
Isolar correlação e classificação em funções próprias.

### Etapa 4
Criar exportação padronizada de artefatos.

### Etapa 5
Garantir escrita de `status.json` e `events.jsonl` em cada transição.

## Observações importantes
- Não duplicar lógica que já existe no `process_real_cdfs.py`.
- O core deve ser livre de detalhes HTTP.
- O core deve ser o ponto único de verdade da análise.
- O retorno final precisa ser consumido pela API e pelo frontend sem adaptação pesada.
