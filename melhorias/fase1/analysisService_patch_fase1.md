# analysisService-11.ts — fase 1 de patch

## Objetivo
Criar um contrato estável entre frontend e API para upload, status, eventos e artefatos.

## Estrutura sugerida de tipos
```ts
export type JobStatus = 'created' | 'running' | 'reducing' | 'correlating' | 'classifying' | 'exporting' | 'done' | 'error'

export interface JobViewModel {
  jobId: string
  status: JobStatus
  phase: string
  progress: number
  message?: string
  createdAt?: string
  updatedAt?: string
  events: AnalysisEvent[]
  artifacts: AnalysisArtifact[]
  summary?: Record<string, unknown>
}

export interface AnalysisEvent {
  timestamp: string
  type: string
  message: string
  phase?: string
  data?: unknown
}

export interface AnalysisArtifact {
  name: string
  path: string
  type?: string
  size?: number
}
```

## Funções sugeridas
```ts
export async function uploadAnalysis(file: File): Promise<{ jobId: string }>
export async function getAnalysisStatus(jobId: string): Promise<JobViewModel>
export async function getAnalysisEvents(jobId: string): Promise<AnalysisEvent[]>
export async function getAnalysisArtifacts(jobId: string): Promise<AnalysisArtifact[]>
export function mapApiJobToViewModel(response: any): JobViewModel
```

## Checklist de alteração
- Centralizar URLs da API.
- Criar os tipos acima.
- Implementar upload retornando jobId.
- Implementar polling de status.
- Implementar leitura de eventos.
- Implementar leitura de artefatos.
- Normalizar erros e respostas incompletas.

## Observações
- A UI deve depender desse service e não de fetch espalhado.
- O service deve ser o tradutor único do backend para a interface.
