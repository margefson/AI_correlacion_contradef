# analysisRouter-10.ts — plano de implementação

## Objetivo do arquivo
Organizar as rotas e ações relacionadas à análise, conectando o fluxo da UI com o serviço de análise.

## Checklist de alteração
- Separar criação de análise de acompanhamento.
- Separar lista de jobs de detalhe de job.
- Garantir navegação clara entre home, reduce logs e resultados.
- Mapear estados de loading e erro para a interface.
- Preparar história/retomada de job, se houver suporte.
- Manter nomes de rota coerentes com o artigo e com o produto.

## Estrutura sugerida
- rota de criação/upload
- rota de status/progresso
- rota de eventos
- rota de artefatos
- rota de relatório final

## Observações
- O router deve ser fino.
- Ele deve apenas organizar navegação e chamadas.
- O comportamento analítico fica no service e no backend.
