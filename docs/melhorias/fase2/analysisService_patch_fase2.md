# analysisService-11.ts — fase 2 de patch

## Objetivo
Normalizar os dados recebidos da API para uso direto na UI.

## Pseudo-código dos adaptadores

### mapApiJobToViewModel(response)
```ts
function mapApiJobToViewModel(response) {
  return {
    jobId: response.job_id ?? response.id,
    status: response.status ?? 'error',
    phase: response.phase ?? 'unknown',
    progress: Number(response.progress ?? 0),
    message: response.message ?? '',
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    events: response.events ?? [],
    artifacts: response.artifacts ?? [],
    summary: response.summary ?? {}
  }
}
```

### pollStatus(jobId)
```ts
async function pollStatus(jobId) {
  const status = await getAnalysisStatus(jobId)
  return normalizeForUI(status)
}
```

### normalizeEvents(events)
```ts
function normalizeEvents(events) {
  return events
    .map(map event fields)
    .sort by timestamp
}
```

### normalizeArtifacts(artifacts)
```ts
function normalizeArtifacts(artifacts) {
  return artifacts
    .map(map artifact fields)
    .filter(valid)
}
```

## Regras de normalização
- Nunca quebrar a tela quando um campo faltar.
- Sempre devolver arrays vazios em vez de undefined.
- Converter progresso para número seguro.
- Ordenar eventos por data.
- Manter nomes de campos estáveis.

## Saída esperada para a UI
- job resumido
- eventos ordenados
- artefatos limpos
- erro legível quando a API falhar

## Observações
- Esse adaptador deve ser pequeno e confiável.
- O objetivo é simplificar ReduceLogs.
