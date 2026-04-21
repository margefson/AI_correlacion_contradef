# analysisService-11.ts — fase 3 de patch

## Objetivo
Consumir a API realtime com um contrato estável e preparar os dados para a UI.

## Estrutura base sugerida
```ts
const API_BASE = '/api'

export async function uploadAnalysis(file: File): Promise<{ jobId: string }> {
  ...
}

export async function getAnalysisStatus(jobId: string): Promise<JobViewModel> {
  ...
}

export async function getAnalysisEvents(jobId: string): Promise<AnalysisEvent[]> {
  ...
}

export async function getAnalysisArtifacts(jobId: string): Promise<AnalysisArtifact[]> {
  ...
}
```

## Checklist de alteração
- Centralizar a base URL da API.
- Implementar upload com retorno de jobId.
- Implementar polling de status.
- Implementar busca de eventos.
- Implementar busca de artefatos.
- Normalizar erros e campos ausentes.
- Retornar estruturas prontas para ReduceLogs.

## Mapeamento esperado
- `job_id` -> `jobId`
- `updated_at` -> `updatedAt`
- `created_at` -> `createdAt`
- `events` -> `events`
- `artifacts` -> `artifacts`

## Observações
- O service deve ser a única camada que conhece os endpoints.
- A UI deve consumir o service, não a API diretamente.
