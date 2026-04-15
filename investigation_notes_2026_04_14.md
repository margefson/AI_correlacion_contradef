# Notas de investigação — 2026-04-14

## Upload em lote e elegibilidade

- O cliente de upload em lote usa `inspectAnalysisArchive()` para marcar itens como `validated` ou `invalid`.
- A Home considera como elegíveis apenas itens com status `validated` ou `error`.
- O envio em lote sempre exige `focusFunction` preenchida antes de iniciar.
- Se nenhum `jobId` for retornado pelos uploads concluídos, a interface emite a mensagem: `Nenhum arquivo elegível conseguiu iniciar análise. Revise as mensagens da fila e tente novamente.`
- O cliente chama os endpoints JSON protegidos:
  - `POST /api/analysis/upload-sessions`
  - `POST /api/analysis/upload-sessions/:uploadId/chunks`
  - `POST /api/analysis/upload-sessions/:uploadId/complete`

## Backend do upload em partes

- O backend valida `.7z`, tamanho total e `focusFunction` já na criação da sessão.
- O endpoint de conclusão recompõe todos os chunks e chama `startAnalysisJobFromArchive(...)`.
- O retorno esperado da conclusão é o objeto do job criado, em JSON.

## Interface observada na prévia

- A prévia carregou corretamente como `AI Correlacion Web`.
- O usuário aparece autenticado como administrador operacional.
- No momento observado, não havia jobs ativos nem concluídos no histórico.
- As abas visíveis são: `Visão executiva`, `Nova submissão`, `Tempo real`, `Resultados` e `Comparação`.

## Hipóteses correntes

- A mensagem de `Nenhum arquivo elegível` pode estar mascarando falha operacional do backend em todos os arquivos da fila, em vez de um erro real de elegibilidade prévia.
- A expansão para múltiplos fluxos por função deve ocorrer após a conclusão do job, provavelmente no serviço de sincronização/finalização, para que os artefatos apareçam no painel existente.
