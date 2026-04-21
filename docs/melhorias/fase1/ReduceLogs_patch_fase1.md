# ReduceLogs-8.tsx — fase 1 de patch

## Objetivo
Montar a estrutura da tela principal com áreas claras para upload, progresso, eventos, artefatos, grafo e classificação.

## Estrutura sugerida de componentes
```tsx
<ReduceLogsPage>
  <Header />
  <UploadPanel />
  <ProgressPanel />
  <EventsTimeline />
  <ArtifactsPanel />
  <GraphPanel />
  <ClassificationPanel />
  <ErrorPanel />
</ReduceLogsPage>
```

## Estados da tela
- idle
- uploading
- running
- done
- error

## Checklist de alteração
- Criar state para job atual.
- Criar state para loading e erro.
- Exibir jobId quando existir.
- Exibir fase e progresso em destaque.
- Criar espaço para timeline de eventos.
- Criar espaço para lista de artefatos.
- Criar espaço para grafo Mermaid.
- Criar espaço para classificação final.

## Observações
- A tela deve ser organizada em blocos.
- O conteúdo técnico deve ser legível rapidamente.
- O foco é mostrar a evolução da análise.
