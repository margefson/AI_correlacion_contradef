# Contradef Log Analyzer

**Contradef Log Analyzer** é uma plataforma web para análise automatizada de logs de malware gerados pela ferramenta **Contradef**. A aplicação foi estruturada para apoiar analistas de segurança na leitura de execuções evasivas, combinando **redução heurística de logs**, **classificação automática**, **interpretação assistida por LLM** e **visualização analítica em dashboard**.

## Objetivo

O sistema recebe múltiplos arquivos de log da Contradef, normaliza os eventos, identifica APIs suspeitas e técnicas evasivas, calcula métricas de redução e produz um resumo interpretável sobre o fluxo de execução do malware. A interface foi desenhada para priorizar rapidez de leitura, contextualização operacional e apoio à decisão do analista.

## Funcionalidades implementadas

| Módulo | Descrição |
| --- | --- |
| Upload múltiplo | Envio de logs nos formatos **FunctionInterceptor**, **TraceFcnCall**, **TraceMemory**, **TraceInstructions** e **TraceDisassembly**. |
| Parsing e normalização | Conversão dos arquivos enviados em eventos normalizados, com estágio, técnica, APIs suspeitas e endereços extraídos. |
| Redução heurística | Seleção de linhas relevantes com base em APIs suspeitas, gatilhos como **VirtualProtect RW→RX**, termos focais e regexes complementares. |
| Classificação | Estimativa da categoria do malware entre **Trojan**, **Spyware**, **Ransomware**, **Backdoor** e **Unknown**. |
| Visualização | Dashboard com histórico, timeline de eventos, fluxo analítico, tabela filtrável e métricas de compressão. |
| Interpretação por IA | Geração de resumo em linguagem natural com foco em técnicas detectadas, risco, fase atual e recomendações. |
| Relatório e artefatos | Exibição de resumo exportável e acesso aos artefatos gerados pela análise. |

## Arquitetura

| Camada | Responsabilidade |
| --- | --- |
| **Frontend** | React 19, Tailwind CSS 4, componentes analíticos, dashboard com polling e visualização do fluxo. |
| **Backend** | Express + tRPC para submissão, listagem, detalhe e sincronização de análises. |
| **Persistência** | Drizzle ORM com tabelas para jobs, eventos, artefatos, insights e commits de análise. |
| **IA** | Integração server-side para interpretação textual dos padrões detectados nos logs. |
| **Storage** | Persistência dos artefatos gerados via camada de storage da plataforma. |

## Fluxo de uso

1. O analista informa um nome de análise e, opcionalmente, termos e regexes prioritários.
2. Os logs da Contradef são enviados pela interface web.
3. O backend identifica o tipo de cada arquivo, processa o conteúdo e reduz o volume com base nas heurísticas configuradas.
4. O sistema persiste os eventos, métricas, artefatos e o insight interpretativo.
5. O dashboard exibe o histórico, a situação da análise, a timeline, o fluxo resumido e o relatório analítico.

## Estrutura analítica principal

| Arquivo | Papel |
| --- | --- |
| `server/analysisService.ts` | Parsing, redução, classificação, geração de artefatos e insight interpretativo. |
| `server/analysisRouter.ts` | Contratos tRPC para listagem, detalhe, submissão e sincronização. |
| `shared/analysis.ts` | Tipos compartilhados entre backend e frontend. |
| `client/src/pages/Home.tsx` | Dashboard principal orientado ao analista. |
| `server/analysis.router.test.ts` | Testes de contrato do roteador analítico. |

## Comandos úteis

| Comando | Finalidade |
| --- | --- |
| `pnpm dev` | Executa a aplicação em modo de desenvolvimento. |
| `pnpm test` | Executa a suíte de testes Vitest. |
| `pnpm db:push` | Gera e aplica as migrações do schema atual. |
| `pnpm build` | Valida o build de produção da aplicação. |

## Validação inicial da redução em C++

A etapa atual do projeto também inclui uma validação isolada da proposta de redução descrita em **Detalhes Técnicos das Propostas de Melhoria**. Para isso, foi implementado um protótipo reproduzível em `tools_selective_reducer.cpp`, executado sobre amostras reais do repositório base. O resultado consolidado dessa medição está documentado em `docs_reduction_baseline.md` e também aparece na interface principal em uma tabela **antes/depois**.

## Estado atual e próximos passos

Esta primeira versão já entrega a base navegável da plataforma, com persistência, dashboard, ingestão de logs, redução heurística, classificação e relatório interpretável. Como evolução natural do projeto, ainda é recomendável fortalecer a validação com amostras reais da Contradef, ampliar os testes do serviço analítico, sofisticar a visualização do fluxo para um grafo mais robusto e consolidar a exportação formal de relatórios em formatos adicionais.
