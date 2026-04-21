# Guia de Uso — Contradef Log Analyzer

## Visão geral

O **Contradef Log Analyzer** foi concebido para apoiar o analista de segurança na interpretação de execuções de malware evasivo a partir dos logs gerados pela ferramenta **Contradef**. A primeira versão da plataforma já permite enviar múltiplos logs, acompanhar o histórico das análises e navegar por um painel com classificação, métricas de redução, timeline de eventos, fluxo resumido e relatório interpretável.

## Tipos de logs suportados

A interface reconhece e processa os seguintes formatos de log, inferindo o tipo pelo nome do arquivo quando possível:

| Tipo de log | Finalidade analítica |
| --- | --- |
| `FunctionInterceptor` | Evidencia chamadas interceptadas e favorece a identificação de APIs suspeitas. |
| `TraceFcnCall` | Permite acompanhar a sequência de chamadas de função durante a execução. |
| `TraceMemory` | Auxilia na detecção de comportamentos relacionados a proteção de páginas, escrita em memória e indícios de injeção. |
| `TraceInstructions` | Fornece uma granularidade mais baixa para acompanhamento de trechos relevantes da execução. |
| `TraceDisassembly` | Apoia a contextualização do fluxo com base em instruções e trechos desassemblados. |

## Como usar a plataforma

### 1. Acesse o painel

Ao abrir a aplicação, faça autenticação e entre no **Centro Analítico**. O painel principal exibe um resumo operacional, a área de submissão de logs e o histórico de análises já registradas. Se o objetivo for validar especificamente a diminuição dos arquivos, use o item de menu **Reduzir Logs**, que agora abre uma tela exclusiva com **upload dos arquivos de log**, execução da redução na própria interface e um bloco principal de **monitoramento do último processamento submetido**. Nessa rota, o envio passou a usar um fluxo **robusto em partes**, inicializando a sessão do lote, transmitindo cada arquivo em blocos sucessivos e só então disparando o processamento analítico. Essa abordagem evita a conversão integral para base64 no navegador, reduz o risco de reset em transferências muito longas e melhora a tolerância operacional para arquivos muito grandes, como `TraceInstructions` e `TraceMemory`.

### 2. Inicie uma nova análise

Na seção **Submissão de logs**, preencha os seguintes campos:

| Campo | Uso recomendado |
| --- | --- |
| **Nome da análise** | Identifique a amostra ou a sessão, como `Sample-APT-01`. |
| **Termos prioritários** | Liste APIs, indicadores ou palavras-chave relevantes, separadas por vírgula. |
| **Regex heurístico complementar** | Informe padrões adicionais para retenção seletiva de eventos durante a redução dos logs. |
| **Arquivos de log** | Selecione um ou mais arquivos da Contradef. |

Depois disso, clique em **Iniciar análise automatizada** no painel principal ou em **Executar redução com upload** na área **Reduzir Logs**. Nesta segunda opção, a interface prepara uma sessão de envio, transmite cada arquivo em partes de tamanho controlado e finaliza o lote apenas quando todos os blocos forem recebidos pelo servidor. Em seguida, o job entra na fila analítica com foco na validação da redução e no acompanhamento operacional do lote atual.

### 3. Acompanhe a fila e o histórico

No painel lateral de histórico, cada execução mostra:

| Elemento | Significado |
| --- | --- |
| **Status** | Estado atual do job, como `queued`, `running` ou `completed`. |
| **Fase** | Etapa operacional predominante da análise. |
| **Progresso** | Indicador percentual do pipeline. |
| **Mensagem** | Contexto resumido do último estado processado. |

Ao selecionar uma análise, o dashboard detalhado é carregado automaticamente.

## Como interpretar o dashboard

### Resumo gerencial

O topo do dashboard apresenta os principais indicadores da execução selecionada. O analista deve observar especialmente a **categoria estimada do malware**, o **nível de risco**, a **porcentagem de redução dos logs** e a quantidade de **APIs suspeitas** detectadas.

### Aba “Resumo”

Essa aba concentra a interpretação textual da execução. O texto gerado descreve as técnicas evasivas observadas, a fase atual do comportamento malicioso e recomendações iniciais para aprofundamento da investigação.

### Aba “Timeline”

A timeline organiza os eventos retidos após a redução heurística. Cada bloco informa a fase, o tipo do evento, o texto contextual e os metadados disponíveis, como arquivo, tipo de log e número de linha.

### Aba “Fluxo”

A visão de fluxo mostra nós e relações resumidas entre fases e eventos críticos. Ela serve como uma visualização rápida do percurso analítico e ajuda a localizar os pontos mais relevantes do comportamento observado.

### Aba “Eventos”

A tabela de eventos pode ser filtrada por texto e ajuda a localizar ocorrências relacionadas a APIs suspeitas, arquivos específicos e estágios da execução. Esse painel é o mais indicado para triagem dirigida e revisão analítica detalhada.

### Aba “Relatório”

A aba de relatório apresenta o resumo interpretável consolidado e os **artefatos disponíveis** para consulta ou download, como logs reduzidos, insumos intermediários e evidências geradas pelo pipeline.

## Estratégia de redução dos logs

A área **Reduzir Logs** separa a validação em duas camadas complementares. A camada principal passou a ser o **monitoramento dinâmico do último upload executado pelo analista**. É ela que deve ser usada como referência principal para interpretar o antes/depois, porque seus cartões, tabelas e recomendações se atualizam automaticamente conforme o job enviado evolui. A camada secundária reúne as **referências fixas**: os manifestos do dataset real da amostra 2956, quando disponíveis, e o **teste reproduzível do protótipo C++**, mantido apenas como baseline metodológico.

Nessa mesma tela, a plataforma apresenta um bloco de **sugestões de acompanhamento** orientado ao resultado efetivamente processado. O analista deve observar quatro pontos: a base comparada do upload atual, a preservação de eventos críticos e gatilhos, a quantidade de ruído removida sem perda do encadeamento mínimo e a ação operacional sugerida pelo sistema. O monitoramento do job atual é atualizado por **polling automático** e a tabela por arquivo indica quais logs preservaram contexto suficiente para seguir para interpretação e classificação. A leitura operacional agora distingue, para cada arquivo, as etapas de **fila do lote**, **preparação do arquivo**, **redução heurística**, **consolidação** e **conclusão**, além de manter os indicadores separados de **envio** e **processamento**. Em caso de falha operacional, a interface retorna mensagens específicas do servidor, o que ajuda a distinguir problemas de autenticação, arquivo inválido, ordem incorreta dos blocos, limite de tamanho e erros reais de processamento.

### Procedimento recomendado para validar arquivos multi-GB

Para validar especificamente o antigo cenário de `ERR_CONNECTION_RESET`, recomenda-se executar uma rodada autenticada na própria interface web usando o lote real da Contradef. O procedimento prático é o seguinte:

| Etapa | O que fazer | Sinal esperado |
| --- | --- | --- |
| **1. Autenticação** | Abra a aplicação, confirme que a sessão está autenticada e navegue até **Reduzir Logs**. | A página deve carregar normalmente, sem redirecionamento para login, e exibir o formulário de lote. |
| **2. Seleção do lote real** | Selecione os 6 arquivos reais da amostra, incluindo o `TraceInstructions` de aproximadamente **3,9 GB**. | A tabela de arquivos selecionados deve listar todos os logs com tamanho local e tipo inferido. |
| **3. Disparo do envio** | Clique em **Executar redução com upload** e mantenha a guia aberta durante a transmissão. | Cada arquivo deve iniciar com progresso de **envio** próprio, sem queda imediata da conexão. |
| **4. Acompanhamento por etapa** | Observe o painel do lote e as abas por arquivo enquanto o envio termina e o processamento começa. | O monitor deve transitar por **Fila do lote**, **Preparação do arquivo**, **Redução heurística**, **Consolidação** e **Arquivo concluído**, com mensagens coerentes por arquivo. |
| **5. Critério de sucesso** | Aguarde o job sair de `queued/running` para `completed`. | O lote deve concluir sem `ERR_CONNECTION_RESET`, com métricas antes/depois, sinais críticos e sugestões de acompanhamento preenchidas. |
| **6. Critério de falha** | Caso haja interrupção, registre o ponto exato da falha observado na tela. | A interface deve exibir mensagem operacional específica, permitindo distinguir falha de autenticação, ordem de blocos, limite de tamanho ou erro do pipeline. |

A primeira versão utiliza uma abordagem **heurística e seletiva**, priorizando eventos que contenham:

| Critério | Exemplo |
| --- | --- |
| APIs suspeitas | `IsDebuggerPresent`, `Sleep`, `NtQueryInformationProcess`, `VirtualProtect` |
| Gatilhos de memória | transições como `RW → RX` |
| Termos priorizados pelo analista | palavras-chave informadas no formulário |
| Padrões adicionais | expressões regulares complementares |

O objetivo dessa etapa é reduzir ruído e preservar linhas mais relevantes para interpretação, classificação e acompanhamento operacional.

## Limitações atuais da primeira versão

Embora a plataforma já esteja navegável e funcional, esta entrega ainda deve ser entendida como uma **base evolutiva**. As principais limitações atuais são as seguintes:

| Limitação | Observação |
| --- | --- |
| Grafo resumido | A visualização de fluxo já existe, mas ainda não é um grafo avançado com layout dedicado. |
| Tempo real por polling | A área Reduzir Logs acompanha o job atual em tempo quase real por atualização periódica; não há streaming contínuo. |
| Upload robusto, mas dependente do ambiente | O envio agora é feito em partes e reduz o risco de falha em arquivos muito grandes, porém o sucesso ainda depende do navegador, da sessão autenticada e da estabilidade da rede durante a transferência. |
| Validação com amostras reais | A correção funcional e os testes automatizados já cobrem o novo protocolo de envio, mas ainda é recomendável validar a interface com o conjunto real de 6 arquivos, incluindo o artefato de 3,9 GB, em uma sessão autenticada de uso. |
| Exportação formal | O relatório é exibido e os artefatos podem ser acessados, mas a formalização em formatos adicionais ainda pode ser expandida. |

## Próximas evoluções recomendadas

Como próximos passos, recomenda-se consolidar testes com amostras reais, evoluir a visualização do fluxo para um grafo mais robusto, fortalecer a exportação formal do relatório e expandir os testes automatizados do serviço analítico.

## Desenvolvimento local (Windows) e banco de dados

Para validar o projeto na sua máquina com persistência em **MySQL** e sem depender de OAuth/storage externos:

| Etapa | Ação |
| --- | --- |
| **Banco** | Crie o schema e um usuário com permissão (por exemplo `contradef` / `contradef` no banco `contradef`). |
| **Variáveis** | No arquivo `ai_correlacion_web/.env`, defina `DATABASE_URL` (URL `mysql://...`), `JWT_SECRET` e, se usar OAuth local, `OAUTH_SERVER_URL`. |
| **Schema** | Na pasta `ai_correlacion_web`, execute `npm.cmd run db:push` para aplicar o schema Drizzle ao banco. |
| **Servidor** | Execute `npm.cmd run dev`. Em PowerShell, prefira `npm.cmd` se `npm` estiver bloqueado por política de execução. |
| **Upload** | Se `BUILT_IN_FORGE_API_URL` e `BUILT_IN_FORGE_API_KEY` não estiverem definidos, a interface pode usar **upload legado** (multipart) e concluir a análise; aparece o aviso de execução em modo local quando não há URLs de artefato remotas. |

A tela **Reduzir Logs** passa a exibir, para o job atual, blocos de **interpretação consolidada** (categoria, risco, fase), **fluxo resumido** (nós e arestas), **lista de artefatos** e **resumo interpretativo**, além do monitoramento por arquivo já existente. O painel principal (**Centro Analítico**) continua sendo a visão completa com abas para histórico de jobs.
