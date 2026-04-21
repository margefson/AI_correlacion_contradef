# ReduceLogs-8.tsx — plano de implementação

## Objetivo da tela
Ser a página principal de operação da ferramenta, mostrando upload, progresso, eventos, artefatos, grafo e classificação.

## Seções sugeridas
1. Cabeçalho com contexto da análise.
2. Card de upload de amostra.
3. Barra de progresso e fase atual.
4. Linha do tempo ou lista de eventos.
5. Área de artefatos.
6. Visualização do grafo/correlação.
7. Resumo de classificação e risco.
8. Mensagens de erro e estado vazio.

## Checklist de alteração
- Conectar upload ao analysisService.
- Mostrar job_id após o envio.
- Atualizar progresso por polling.
- Exibir fase atual do pipeline.
- Renderizar lista de eventos em ordem temporal.
- Renderizar artefatos disponíveis em tempo de execução.
- Mostrar o grafo Mermaid ou um resumo visual equivalente.
- Exibir classificação final e interpretação curta.
- Tratar estados de loading, empty e error.

## Estados da tela
- idle: sem análise carregada.
- uploading: arquivo em envio.
- running: job em andamento.
- done: análise concluída.
- error: falha no processamento.

## Comportamentos esperados
- O usuário envia um arquivo e recebe feedback imediato.
- A tela passa a acompanhar o job sem recarregar a página.
- Eventos e artefatos aparecem conforme são gerados.
- O resultado final deve deixar claro o ganho de interpretabilidade.

## Componentes úteis
- UploadBox
- ProgressCard
- EventsTimeline
- ArtifactsPanel
- GraphPanel
- ClassificationBadge
- ErrorAlert

## Observações
- A tela deve ser simples de ler.
- O foco é análise, não decoração.
- O conteúdo visual precisa reforçar a proposta do artigo.
