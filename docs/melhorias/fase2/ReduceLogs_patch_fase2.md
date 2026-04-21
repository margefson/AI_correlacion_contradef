# ReduceLogs-8.tsx — fase 2 de patch

## Objetivo
Detalhar o comportamento da tela durante a execução da análise.

## Pseudo-código do fluxo
```tsx
onUpload(file):
  set state uploading
  call uploadAnalysis(file)
  save jobId
  start polling status

pollStatus(jobId):
  while status not done and not error:
    fetch status
    update progress and phase
    fetch events
    fetch artifacts
    wait interval

render():
  show upload panel
  show progress panel
  show timeline ordered by timestamp
  show artifacts list
  show graph if available
  show classification summary
```

## Checklist de alteração
- Conectar upload ao analysisService.
- Salvar jobId após envio.
- Iniciar polling automático.
- Atualizar progress e phase em intervalos.
- Recarregar eventos e artefatos conforme o job evolui.
- Renderizar erros de forma clara.
- Mostrar conclusão quando status = done.

## Regras de UI
- Não travar a tela enquanto há polling.
- Não duplicar fetch em múltiplos componentes.
- Mostrar feedback visual imediato ao usuário.
- Priorizar legibilidade sobre densidade.

## Observações
- A tela deve parecer viva durante a análise.
- O usuário precisa entender o que está acontecendo sem abrir logs brutos.
