# cdf_realtime_api.py — fase 2 de patch

## Objetivo
Detalhar a persistência e a evolução dos estados do job.

## Pseudo-código das rotinas

### save_job_state(job)
```python
def save_job_state(job):
    write status.json with job fields
    ensure directory exists
    update timestamps
```

### append_event(job_id, event_type, message, data=None)
```python
def append_event(job_id, event_type, message, data=None):
    open events.jsonl in append mode
    write one json object per line
    include timestamp, type, message, phase, data
```

### update_job_phase(job_id, phase, progress, message=None)
```python
def update_job_phase(job_id, phase, progress, message=None):
    load job state
    set phase and progress
    update message and updated_at
    save_job_state(job)
    append_event(...)
```

### get_job_status(job_id)
```python
def get_job_status(job_id):
    read status.json
    return current state
```

### get_job_events(job_id)
```python
def get_job_events(job_id):
    read events.jsonl line by line
    return list of parsed events
```

### get_job_artifacts(job_id)
```python
def get_job_artifacts(job_id):
    read manifest or artifacts directory
    return list of generated files
```

## Regras de robustez
- Nunca corromper o status do job.
- Cada evento deve ser append-only.
- Se falhar, preservar o estado anterior.
- Responder com mensagens claras para o frontend.

## Estado recomendado
- created
- running
- reducing
- correlating
- classifying
- exporting
- done
- error

## Observações
- A API deve servir como fonte de verdade do andamento.
- O frontend deve apenas consultar e renderizar.
- O formato precisa ser estável para os relatórios também.
