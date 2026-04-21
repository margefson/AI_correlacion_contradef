# cdf_realtime_api.py — fase 3 de patch

## Objetivo
Implementar a API realtime como ponte entre upload, execução em background e consulta de status/eventos/artefatos.

## Estrutura base sugerida
```python
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime
import uuid
import shutil
import json

app = FastAPI()
```

## Modelos sugeridos
```python
class UploadResponse(BaseModel):
    job_id: str
    status: str
    message: str

class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    phase: str
    progress: int
    message: str
    updated_at: str
```

## Estrutura sugerida de estado
```python
@dataclass
class ApiJob:
    job_id: str
    job_dir: Path
    status: str = 'created'
    phase: str = 'created'
    progress: int = 0
    message: str = ''
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
```

## Pseudo-código do fluxo
```python
@app.post('/jobs/upload', response_model=UploadResponse)
async def upload_job(archive: UploadFile = File(...)):
    job_id = str(uuid.uuid4())
    job_dir = Path('datajobsapi') / job_id
    save upload
    create status.json
    create events.jsonl
    start analysis in background
    return job_id quickly
```

## Checklist de alteração
- Criar job_id único.
- Salvar upload no diretório do job.
- Criar status inicial antes de iniciar a análise.
- Disparar o core em background.
- Expor endpoints de status, eventos e artefatos.
- Retornar mensagens claras para o frontend.

## Observações
- A API deve ser simples e previsível.
- O polling do frontend depende desse contrato.
- O estado persistido deve ser a fonte de verdade do job.
