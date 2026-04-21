# cdf_realtime_api.py — plano de implementação

## Objetivo do arquivo
Expor a execução da análise como job monitorável em tempo quase real, com upload, status, eventos e artefatos.

## Responsabilidades
- Receber upload de arquivo ou diretório compactado.
- Criar job_id único.
- Iniciar processamento em background.
- Disponibilizar status consultável.
- Disponibilizar eventos incrementais.
- Disponibilizar artefatos gerados.

## Endpoints esperados
- GET / -> formulário simples ou página de teste
- POST /jobs/upload -> cria job e inicia análise
- GET /jobs -> lista jobs
- GET /jobs/{job_id}/status -> progresso e fase
- GET /jobs/{job_id}/events -> eventos do job
- GET /jobs/{job_id}/artifacts -> artefatos disponíveis
- GET /jobs/{job_id}/stdout -> saída textual, se houver
- GET /jobs/{job_id}/stderr -> erros, se houver

## Checklist de alteração
- Garantir retorno rápido após upload.
- Persistir job_id, estado inicial e diretório do job.
- Atualizar status por fase do core.
- Registrar eventos em formato append-only.
- Expor progresso percentual simples.
- Retornar mensagens legíveis para UI.
- Evitar misturar lógica de análise com HTTP.
- Manter contrato estável para polling.

## Estrutura de status sugerida
{
  "job_id": "...",
  "status": "running|done|error",
  "phase": "ingestao|correlacao|...",
  "progress": 0-100,
  "message": "...",
  "started_at": "...",
  "updated_at": "..."
}

## Eventos sugeridos
- job_created
- upload_received
- phase_started
- phase_finished
- artifact_created
- job_completed
- job_failed

## Observações
- A API deve ser simples de consumir pelo frontend.
- O polling é suficiente para a versão atual.
- Se houver tempo depois, SSE pode ser adicionado sem quebrar o contrato básico.
