#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import List

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
import uvicorn

from cdf_analysis_core import ensure_dir, read_json, slugify

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JOBS_ROOT = REPO_ROOT / 'data' / 'jobs_api'
DEFAULT_HOST = '0.0.0.0'
DEFAULT_PORT = 8765

app = FastAPI(title='Generic CDF Correlation API', version='1.0.0')
app.state.jobs_root = DEFAULT_JOBS_ROOT


INDEX_HTML = """
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Análise Genérica de CDF</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; line-height: 1.4; }
    form, .card { border: 1px solid #ddd; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    input[type=text] { width: 100%; padding: 0.5rem; }
    code, pre { background: #f6f8fa; padding: 0.25rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Análise Genérica de CDF</h1>
  <p>Envie um pacote <strong>7z</strong> com os traces e informe uma ou mais funções de interesse separadas por vírgula. O processamento cria um job isolado e atualiza o status durante a execução.</p>
  <form action="/jobs/upload" method="post" enctype="multipart/form-data">
    <label>Arquivo 7z</label><br />
    <input type="file" name="archive" accept=".7z" required /><br /><br />
    <label>Funções-alvo (vírgula separando múltiplas funções)</label><br />
    <input type="text" name="focus_terms" placeholder="IsDebuggerPresent, VirtualProtect" required /><br /><br />
    <label>Expressões regulares opcionais (vírgula)</label><br />
    <input type="text" name="focus_regexes" placeholder="Zw.*InformationProcess" /><br /><br />
    <button type="submit">Enviar e iniciar análise</button>
  </form>
  <div class="card">
    <h2>Endpoints úteis</h2>
    <p><code>GET /jobs</code> lista jobs existentes.</p>
    <p><code>GET /jobs/{job_id}/status</code> retorna o estado atual.</p>
    <p><code>GET /jobs/{job_id}/events</code> retorna os eventos já registrados.</p>
    <p><code>GET /jobs/{job_id}/artifacts</code> lista os artefatos do job.</p>
  </div>
</body>
</html>
"""


def jobs_root() -> Path:
    root = Path(app.state.jobs_root).resolve()
    ensure_dir(root)
    return root


def split_csv_values(raw: str) -> List[str]:
    if not raw.strip():
        return []
    return [item.strip() for item in raw.split(',') if item.strip()]


def build_job_id(archive_name: str, focus_terms: List[str]) -> str:
    stamp = time.strftime('%Y%m%d_%H%M%S')
    focus_slug = '-'.join(slugify(x) for x in focus_terms[:3]) or 'focus'
    return f'{stamp}_{slugify(Path(archive_name).stem)}_{focus_slug}_{uuid.uuid4().hex[:8]}'


def run_job_async(job_dir: Path, archive_path: Path, focus_terms: List[str], focus_regexes: List[str]) -> None:
    command = [
        sys.executable,
        str(REPO_ROOT / 'scripts' / 'run_generic_cdf_analysis.py'),
        '--archive', str(archive_path),
        '--job-dir', str(job_dir),
    ]
    for item in focus_terms:
        command.extend(['--focus', item])
    for item in focus_regexes:
        command.extend(['--focus-regex', item])
    stdout_path = job_dir / 'process.stdout.log'
    stderr_path = job_dir / 'process.stderr.log'
    with stdout_path.open('ab') as out, stderr_path.open('ab') as err:
        subprocess.Popen(command, cwd=REPO_ROOT, stdout=out, stderr=err, start_new_session=True)


@app.get('/', response_class=HTMLResponse)
def index() -> str:
    return INDEX_HTML


@app.get('/jobs')
def list_jobs() -> JSONResponse:
    items = []
    for path in sorted([p for p in jobs_root().iterdir() if p.is_dir()], reverse=True):
        status = read_json(path / 'status.json', default={})
        items.append({'job_id': path.name, 'status': status})
    return JSONResponse({'jobs': items})


@app.post('/jobs/upload')
async def create_job(
    archive: UploadFile = File(...),
    focus_terms: str = Form(...),
    focus_regexes: str = Form(''),
) -> JSONResponse:
    if not archive.filename or not archive.filename.lower().endswith('.7z'):
        raise HTTPException(status_code=400, detail='Envie um arquivo .7z válido.')
    focus_term_list = split_csv_values(focus_terms)
    focus_regex_list = split_csv_values(focus_regexes)
    if not focus_term_list and not focus_regex_list:
        raise HTTPException(status_code=400, detail='Informe ao menos uma função-alvo ou regex.')

    job_id = build_job_id(archive.filename, focus_term_list or focus_regex_list)
    job_dir = jobs_root() / job_id
    input_dir = job_dir / 'input'
    ensure_dir(input_dir)
    archive_path = input_dir / archive.filename
    with archive_path.open('wb') as f:
        shutil.copyfileobj(archive.file, f)

    status_path = job_dir / 'status.json'
    status_path.write_text(json.dumps({
        'state': 'queued',
        'progress': 0.0,
        'stage': 'queued',
        'message': 'Job recebido e aguardando processamento.',
        'archive': str(archive_path),
        'focus_terms': focus_term_list,
        'focus_regexes': focus_regex_list,
        'updated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    run_job_async(job_dir, archive_path, focus_term_list, focus_regex_list)
    return JSONResponse({'job_id': job_id, 'status_url': f'/jobs/{job_id}/status', 'events_url': f'/jobs/{job_id}/events', 'artifacts_url': f'/jobs/{job_id}/artifacts'})


@app.get('/jobs/{job_id}/status')
def job_status(job_id: str) -> JSONResponse:
    job_dir = jobs_root() / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail='Job não encontrado.')
    return JSONResponse(read_json(job_dir / 'status.json', default={'state': 'unknown'}))


@app.get('/jobs/{job_id}/events')
def job_events(
    job_id: str,
    since_index: int = Query(default=0, ge=0),
    limit: int = Query(default=500, ge=1, le=5000),
) -> JSONResponse:
    job_dir = jobs_root() / job_id
    events_path = job_dir / 'events.jsonl'
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail='Job não encontrado.')
    events = []
    if events_path.exists():
        with events_path.open('r', encoding='utf-8') as f:
            for index, line in enumerate(f):
                line = line.strip()
                if not line or index < since_index:
                    continue
                if len(events) >= limit:
                    break
                if line:
                    events.append(json.loads(line))
    next_index = since_index + len(events)
    return JSONResponse({
        'job_id': job_id,
        'since_index': since_index,
        'next_index': next_index,
        'count': len(events),
        'events': events,
    })


@app.get('/jobs/{job_id}/artifacts')
def job_artifacts(job_id: str) -> JSONResponse:
    job_dir = jobs_root() / job_id
    output_dir = job_dir / 'output'
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail='Job não encontrado.')
    artifacts = []
    if output_dir.exists():
        for path in sorted([p for p in output_dir.rglob('*') if p.is_file()]):
            artifacts.append({'path': str(path), 'relative_path': str(path.relative_to(job_dir)), 'size_bytes': path.stat().st_size})
    return JSONResponse({'job_id': job_id, 'artifact_count': len(artifacts), 'artifacts': artifacts})


@app.get('/jobs/{job_id}/stdout')
def job_stdout(job_id: str) -> JSONResponse:
    job_dir = jobs_root() / job_id
    path = job_dir / 'process.stdout.log'
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail='Job não encontrado.')
    content = path.read_text(encoding='utf-8', errors='ignore') if path.exists() else ''
    return JSONResponse({'job_id': job_id, 'stdout': content})


@app.get('/jobs/{job_id}/stderr')
def job_stderr(job_id: str) -> JSONResponse:
    job_dir = jobs_root() / job_id
    path = job_dir / 'process.stderr.log'
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail='Job não encontrado.')
    content = path.read_text(encoding='utf-8', errors='ignore') if path.exists() else ''
    return JSONResponse({'job_id': job_id, 'stderr': content})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Executar a API local de acompanhamento para análise genérica de CDFs.')
    parser.add_argument('--jobs-root', default=str(DEFAULT_JOBS_ROOT), help='Diretório raiz onde os jobs serão armazenados.')
    parser.add_argument('--host', default=DEFAULT_HOST)
    parser.add_argument('--port', type=int, default=DEFAULT_PORT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    app.state.jobs_root = Path(args.jobs_root).expanduser().resolve()
    ensure_dir(app.state.jobs_root)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == '__main__':
    main()
