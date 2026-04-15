# AI Correlacion Web

**AI Correlacion Web** é uma aplicação web voltada à orquestração de análises de correlação sobre artefatos CDF já processados pelo pipeline Python legado. A aplicação não substitui a API existente em `cdf_realtime_api.py`; ela atua como uma camada web de operação, persistência, acompanhamento em tempo real, distribuição de artefatos e governança do fluxo analítico.

A plataforma foi estruturada para permitir que um operador envie pacotes `.7z`, acompanhe a evolução do job com progresso, logs e estágios operacionais, visualize o grafo de correlação e os artefatos gerados, receba um resumo interpretativo automatizado e mantenha rastreabilidade do resultado até o commit no repositório configurado.

| Componente | Papel na solução |
| --- | --- |
| Frontend React + Tailwind | Dashboard analítico, submissão de jobs, histórico, detalhes, grafo, logs e artefatos |
| tRPC + Express | Contrato tipado entre interface e backend, autenticação e procedimentos protegidos |
| Banco relacional via Drizzle | Persistência de jobs, eventos, artefatos, resumos, commit e trechos de stdout/stderr |
| Pipeline Python legado | Execução analítica real, emissão de status, produção de correlações e artefatos |
| LLM server-side | Geração de resumo interpretativo a partir da saída consolidada |
| Notificação ao proprietário | Aviso operacional após conclusão bem-sucedida |
| GitHub CLI | Commit final dos artefatos gerados quando o job termina com sucesso |

## Objetivo operacional

O objetivo principal da aplicação é oferecer uma **camada de comando operacional** sobre o pipeline existente, centralizando a execução e a leitura dos resultados em uma interface única. Isso reduz a dependência de acompanhamento manual por terminal, melhora a auditabilidade e facilita a retomada de contexto entre análises sucessivas.

A experiência foi desenhada para manter o operador dentro de um único fluxo de trabalho: submissão, monitoramento, inspeção dos resultados, exportação dos artefatos e rastreabilidade do versionamento. Essa abordagem também simplifica a integração com notificações e documentação de saída para usos posteriores.

| Capacidade entregue | Descrição |
| --- | --- |
| Submissão validada de `.7z` | Rejeita formato inválido, base64 inconsistente e entradas fora do contrato esperado |
| Acompanhamento em tempo real | Exibe estágio, progresso, mensagens, stdout e stderr resumidos por job |
| Histórico filtrável | Mantém jobs anteriores disponíveis para inspeção e retomada operacional |
| Visualização de correlação | Mostra nós, relações e tabela associada ao job selecionado |
| Exportação operacional | Exibe links explícitos para JSON, Markdown, DOCX e demais artefatos publicados |
| Resumo interpretativo | Consolida a correlação em linguagem legível por operador |
| Notificação e commit | Aciona alerta operacional e registra resultado no repositório configurado |

## Arquitetura da aplicação

A aplicação foi montada em cima do template com autenticação já integrada. O backend encapsula a lógica de orquestração do pipeline em um serviço dedicado, enquanto o frontend consome exclusivamente procedimentos tipados para preservar consistência entre o contrato de dados e a interface.

O desenho também separa claramente o que é **persistência de metadados** do que é **armazenamento de bytes**. Artefatos gerados pelo pipeline são publicados por armazenamento compatível e apenas suas referências, metadados e vínculos com jobs são mantidos no banco.

| Camada | Arquivos centrais |
| --- | --- |
| Persistência | `drizzle/schema.ts`, `server/db.ts` |
| Orquestração de análise | `server/analysisService.ts`, `server/analysisRouter.ts` |
| Roteamento principal | `server/routers.ts` |
| Interface analítica | `client/src/pages/Home.tsx`, `client/src/components/DashboardLayout.tsx` |
| Tema visual | `client/src/index.css`, `client/src/App.tsx` |
| Testes | `server/analysis.router.test.ts`, `server/auth.logout.test.ts`, `client/src/pages/Home.test.tsx` |
| Contrato legado | `docs/pipeline-integration-contract.md` |

## Fluxo de operação

O fluxo operacional começa com o envio de um pacote `.7z` e a indicação da função de interesse. O backend valida o arquivo, registra um novo job e repassa a execução para o pipeline legado, preservando o identificador do job e a trilha de estados no banco da aplicação.

Durante o processamento, o backend sincroniza o status do job, captura logs progressivos, registra eventos e atualiza artefatos intermediários ou finais. Quando a execução é concluída, o serviço consolida a correlação, publica os arquivos, gera o resumo interpretativo, envia a notificação operacional e executa o commit dos resultados no repositório configurado.

| Etapa | Resultado esperado |
| --- | --- |
| Submissão | Job criado e enfileirado com parâmetros do operador |
| Polling e sincronização | Progresso, estágio e logs atualizados na interface |
| Consolidação | Grafo, tabela, resumo, artefatos e estado final persistidos |
| Pós-processamento | Notificação enviada e commit realizado quando aplicável |
| Inspeção posterior | Histórico e detalhe continuam disponíveis no dashboard |

## Interface web

A interface principal foi desenhada como um **centro de comando analítico** em tema escuro, com foco em leitura operacional contínua. O layout lateral reduz distrações e mantém a área principal dedicada ao job corrente, ao histórico e às exportações.

A página principal agrega métricas, formulário de submissão, painel de atividade imediata, histórico filtrável, detalhe do job, grafo de correlação, logs e ações de exportação. A intenção é permitir que um analista acompanhe tanto o estado global da fila quanto a profundidade de um caso específico sem trocar de tela.

| Área da interface | Conteúdo |
| --- | --- |
| Hero operacional | Contexto do pipeline, capacidades do backend e métricas resumidas |
| Nova submissão | Upload `.7z`, foco analítico e disparo de job |
| Atividade imediata | Estado do job ativo ou instrução de retomada da fila |
| Histórico | Lista de jobs com seleção, status, progresso e recorte temporal |
| Detalhe do job | Resumo, correlação, eventos, logs, commit e artefatos |
| Exportações | Links explícitos para JSON, Markdown, DOCX e demais saídas |

## Execução local

O projeto utiliza o stack já provisionado no ambiente. Em contexto local, o fluxo esperado consiste em instalar dependências, manter o banco sincronizado e iniciar o servidor de desenvolvimento.

A autenticação, os helpers internos e os segredos injetados pela plataforma já fazem parte da base do projeto. Por isso, a operação local deve respeitar o template existente, evitando alterações nas camadas internas do framework sem necessidade arquitetural real.

| Comando | Finalidade |
| --- | --- |
| `pnpm install` | Instalar dependências do projeto |
| `pnpm db:push` | Aplicar mudanças do schema ao banco remoto/configurado |
| `pnpm dev` | Subir frontend e backend em modo de desenvolvimento |
| `pnpm test` | Executar toda a suíte Vitest |

## Validação e testes

A validação atual cobre tanto a camada de backend quanto a camada de interface. Os testes do servidor verificam os procedimentos centrais de análise e o fluxo de logout. Os testes do frontend exercitam a submissão do formulário, a atualização do histórico e a presença das exportações explícitas no painel de detalhes.

Além da suíte automatizada, a aplicação foi verificada com compilação TypeScript limpa e servidor de desenvolvimento saudável. A prévia visual do dashboard confirma o funcionamento da identidade visual e do layout principal.

| Suíte | Cobertura principal |
| --- | --- |
| `server/analysis.router.test.ts` | Submissão, listagem, detalhe e retomada de sincronização |
| `server/auth.logout.test.ts` | Limpeza do cookie de sessão e resposta do logout |
| `client/src/pages/Home.test.tsx` | Submissão via UI, seleção no histórico e exibição de exportações |

## Integração com GitHub

A aplicação foi preparada para trabalhar com versionamento operacional do resultado. Quando um job termina com sucesso e o repositório está corretamente configurado no ambiente, o backend registra os artefatos relevantes no repositório por meio da CLI autenticada.

Esse comportamento não substitui o versionamento do código da aplicação. Ao final desta entrega, o projeto também deve ser commitado no repositório GitHub indicado pelo usuário, preservando em histórico tanto o produto web quanto os artefatos gerados em execuções futuras.

| Tipo de commit | Origem |
| --- | --- |
| Commit operacional de artefatos | Executado pelo backend após job bem-sucedido |
| Commit do código da aplicação | Executado ao final desta entrega, de forma explícita |

## Limitações e próximos cuidados

A plataforma depende da disponibilidade do pipeline Python legado e da validade dos contratos que ele expõe. Qualquer alteração em formato de resposta, status, caminhos de artefatos ou convenções de saída precisa ser refletida na camada de sincronização do backend web.

Também é importante lembrar que os links de exportação exibem formatos disponíveis por job. Caso um determinado processo não gere JSON, Markdown ou DOCX, a interface sinaliza a indisponibilidade em vez de prometer saídas inexistentes.

| Ponto de atenção | Impacto |
| --- | --- |
| Mudanças no contrato do pipeline legado | Exigem atualização em `analysisService.ts` e possivelmente no schema |
| Falhas de publicação de artefatos | Afetam exportação e commit pós-processamento |
| Execuções longas ou instáveis | Podem ampliar o uso de polling e a necessidade de retentativas |
| Novos formatos de saída | Devem ser incorporados à UI e ao mapeamento de artefatos |

## Estrutura resumida do projeto

A base do projeto já contém a separação entre cliente, servidor, schema e documentação. Abaixo está a visão resumida dos arquivos mais importantes para evolução futura.

| Caminho | Responsabilidade |
| --- | --- |
| `client/src/pages/Home.tsx` | Dashboard principal da operação |
| `client/src/components/DashboardLayout.tsx` | Estrutura visual do painel |
| `client/src/index.css` | Tokens visuais e tema global |
| `server/analysisService.ts` | Orquestração do pipeline e pós-processamento |
| `server/analysisRouter.ts` | Procedimentos protegidos da área analítica |
| `server/routers.ts` | Agregação do appRouter |
| `drizzle/schema.ts` | Tabelas e campos persistidos |
| `docs/pipeline-integration-contract.md` | Contrato de integração com o backend legado |
| `todo.md` | Rastreio histórico dos itens implementados |

## Estado atual

Neste momento, a aplicação já entrega o núcleo funcional solicitado: integração com o que já existia, acompanhamento em tempo real, submissão controlada, leitura de logs, visualização de correlação, histórico, resumo por LLM, exportações explícitas e capacidade de versionamento operacional.

Os próximos incrementos naturais, caso desejados, seriam expandir filtros avançados do histórico, aumentar a profundidade das visualizações do grafo, enriquecer métricas operacionais e adicionar comparações entre execuções.
