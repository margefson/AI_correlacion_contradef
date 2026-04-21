# ReduceLogs-8.tsx — fase 3 de patch

## Objetivo
Conectar a tela ao service e exibir a execução do job em tempo quase real.

## Estrutura de comportamento
```tsx
const [job, setJob] = useState<JobViewModel | null>(null)
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)

async function handleUpload(file) {
  setLoading(true)
  const { jobId } = await uploadAnalysis(file)
  setJob({ jobId, status: 'created', phase: 'created', progress: 0, events: [], artifacts: [] })
  startPolling(jobId)
}

async function startPolling(jobId) {
  while (true) {
    const status = await getAnalysisStatus(jobId)
    const events = await getAnalysisEvents(jobId)
    const artifacts = await getAnalysisArtifacts(jobId)
    setJob({ ...status, events, artifacts })
    if (status.status === 'done' || status.status === 'error') break
    await sleep(2000)
  }
}
```

## Checklist de alteração
- Ligar upload ao `analysisService`.
- Salvar job atual em state.
- Iniciar polling após upload.
- Atualizar progresso e fase automaticamente.
- Recarregar eventos e artefatos durante a execução.
- Mostrar erro e conclusão de forma clara.

## Observações
- A tela deve reagir sem recarregar a página.
- O usuário precisa enxergar a evolução do job.
- O foco é acompanhar e interpretar, não apenas fazer upload.
