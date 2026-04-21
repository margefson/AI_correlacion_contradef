# analysisService-11.ts — plano de implementação

## Objetivo do arquivo
Servir como camada de integração entre a interface e a API de análise, normalizando upload, status, eventos, artefatos e histórico.

## Responsabilidades
- Enviar arquivo para a API.
- Consultar status do job.
- Consultar eventos do job.
- Consultar artefatos do job.
- Converter respostas da API em modelo amigável para UI.
- Manter polling simples e consistente.

## Checklist de alteração
- Criar tipos de retorno para job, status, evento e artefato.
- Centralizar URLs/paths da API em um único lugar.
- Criar função de upload com retorno de job_id.
- Criar função de polling de status.
- Criar função para buscar eventos.
- Criar função para buscar artefatos.
- Normalizar erros e mensagens de falha.
- Expor adaptadores para resumo da análise e grafo.

## Modelo de dados sugerido
JobSummary:
- jobId
- status
- phase
- progress
- message
- startedAt
- updatedAt
- artifacts
- events

EventItem:
- timestamp
- type
- message
- phase

ArtifactItem:
- name
- path
- type
- size

## Pontos importantes
- Não misturar UI com regras de negócio.
- Não duplicar transformação de dados em vários componentes.
- Retornar sempre formatos previsíveis para a tela ReduceLogs.
- Permitir atualização incremental sem recarregar tudo.

## Saídas esperadas
- uploadAnalysis(file)
- getAnalysisStatus(jobId)
- getAnalysisEvents(jobId)
- getAnalysisArtifacts(jobId)
- mapApiJobToViewModel(response)

## Observações
- Esse arquivo é o contrato entre frontend e backend.
- Se o backend mudar, esse serviço deve absorver a adaptação.
