# cdf_realtime_api.py — fase 1 de patch

## Objetivo
Padronizar o ciclo de vida dos jobs expostos pela API.

## Estrutura sugerida de funções
```python
@dataclass
class ApiJob:
    job_id: str
    status: str
    phase: str
    progress: int
    message: str
    created_at: str
    updated_at: str
    events: list
    artifacts: list


def create_api_job(upload, config) -> ApiJob:
    ...


def save_job_state(job: ApiJob):
    ...


def append_event(job_id, event_type, message, data=None):
    ...


def update_job_phase(job_id, phase, progress, message=None):
    ...


def get_job_status(job_id):
    ...


def get_job_events(job_id):
    ...


def get_job_artifacts(job_id):
    ...


def launch_analysis_background(job: ApiJob, payload):
    ...
```

## Fluxo da API
- upload recebido
- job criado
- estado inicial salvo
- análise iniciada em background
- status consultável
- eventos consultáveis
- artefatos consultáveis
- finalização com status done/error

## Checklist de alteração
- Separar criação de job de execução da análise.
- Persistir estado em disco logo no início.
- Registrar eventos ao longo do processamento.
- Atualizar fase e progresso em pontos previsíveis.
- Manter endpoints simples e estáveis.
- Não misturar lógica de análise com HTTP.

## Observações
- O backend deve ser previsível para a UI.
- O polling do frontend depende da consistência dos estados.
- Se houver expansão futura, SSE pode vir depois sem quebrar o contrato.
