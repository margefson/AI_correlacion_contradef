# INCIDENT_SYS — Conteúdo dos Slides para Apresentação

**Tema:** Profissional Acadêmico — Dark Cybersecurity
**Paleta:** Fundo escuro (#0d1117), Ciano (#00b4d8), Branco (#e6edf3), Cinza (#8b949e), Vermelho alerta (#ff4d4f)
**Tipografia:** Inter (títulos), JetBrains Mono (código/dados)
**Total de slides:** 18

---

## Slide 1 — Capa

**Título:** INCIDENT_SYS
**Subtítulo:** Plataforma de Gerenciamento de Incidentes de Segurança Cibernética com Classificação Automática por Machine Learning
**Rodapé:** Disciplina de Desenvolvimento de Sistemas · 2025/2026 · Equipe: Margefson · Nattan · Keven · Josias

> **Comentário para apresentação:**
> "Bom dia/tarde a todos. Apresentamos o INCIDENT_SYS — uma plataforma web completa para gerenciamento de incidentes de segurança cibernética, desenvolvida como projeto integrador da disciplina. O sistema combina tecnologias modernas de frontend, backend, banco de dados e inteligência artificial para resolver um problema real enfrentado por equipes de SOC — Security Operations Center."

---

## Slide 2 — Contexto e Problema

**Título:** O Problema: Incidentes Cibernéticos Crescem Exponencialmente

**Conteúdo principal:**
- Ataques cibernéticos aumentaram **38%** em 2023 (IBM Security X-Force)
- Tempo médio de identificação de uma violação: **204 dias**
- Equipes de SOC recebem centenas de alertas diários — triagem manual é inviável
- Falta de padronização na classificação gera inconsistências e atrasos na resposta

**Citação em destaque:**
> "O custo médio de uma violação de dados atingiu US$ 4,45 milhões em 2023." — IBM Cost of a Data Breach Report 2023

**Pergunta retórica no slide:**
Como automatizar a triagem e classificação de incidentes sem perder a rastreabilidade?

> **Comentário para apresentação (Margefson — Líder Técnico):**
> "O contexto que motivou este projeto é real: equipes de segurança são sobrecarregadas com alertas. Sem uma ferramenta adequada, incidentes críticos podem passar despercebidos por dias. Nossa solução propõe automatizar a classificação usando Machine Learning, mantendo o analista no controle das decisões."

---

## Slide 3 — Objetivo do Projeto

**Título:** Objetivo: Automatizar a Triagem com Rastreabilidade Completa

**Objetivo geral:**
Desenvolver uma plataforma web full-stack para registro, classificação automática e acompanhamento de incidentes de segurança cibernética, com painel administrativo, relatórios e modelo de Machine Learning retreinável.

**Objetivos específicos:**
1. Implementar classificação automática via TF-IDF + Naive Bayes com acurácia ≥ 90%
2. Garantir controle de acesso por papel (usuário / administrador)
3. Fornecer dashboard com KPIs e visualizações em tempo real
4. Permitir exportação de relatórios PDF e CSV com filtros
5. Registrar histórico completo de alterações de cada incidente
6. Atingir cobertura de testes automatizados ≥ 300 casos

**Resultado alcançado:**
✅ Acurácia: **97%** | ✅ Testes: **347 passando** | ✅ 3 servidores integrados

> **Comentário para apresentação (Margefson — Líder Técnico):**
> "Nossos objetivos foram claros desde o início. O mais desafiador foi integrar três servidores distintos — Node.js, Flask ML e Flask PDF — de forma transparente para o usuário. Conseguimos atingir 97% de acurácia no classificador e 347 testes automatizados, o que nos dá confiança na qualidade do sistema."

---

## Slide 4 — Arquitetura do Sistema

**Título:** Arquitetura: Três Servidores, Uma Experiência Unificada

**Diagrama:** [INSERIR IMAGEM: architecture.png do CDN]
URL: https://d2xsxph8kpxj0f.cloudfront.net/310519663148675640/KjT4emSwzjBHV8i56oSYsp/architecture_7007dcad.png

**Legenda das camadas (tabela lateral):**
| Camada | Tecnologia | Porta |
|---|---|---|
| Frontend | React 19 + Vite + Tailwind CSS 4 | — |
| Backend API | Node.js 22 + Express + tRPC 11 | 3000 |
| Banco de Dados | TiDB / MySQL 8 + Drizzle ORM | TLS |
| ML Classifier | Python Flask + TF-IDF + Naive Bayes | 5001 |
| PDF Generator | Python Flask + PDFKit/ReportLab | 5002 |

> **Comentário para apresentação (Nattan — Frontend + BD):**
> "A arquitetura foi projetada em camadas independentes. O frontend React se comunica exclusivamente com o backend Node.js via tRPC — um protocolo que garante tipagem de ponta a ponta. O backend, por sua vez, orquestra as chamadas ao banco de dados TiDB e aos dois servidores Flask em Python. Essa separação garante que cada camada possa ser atualizada ou substituída sem impactar as demais."

---

## Slide 5 — Stack Tecnológica: Frontend

**Título:** Frontend: Interface SOC Portal com Design Profissional Dark

**Conteúdo:**
Responsável: **Nattan e Keven**

| Tecnologia | Versão | Função |
|---|---|---|
| React | 19.x | Interface de usuário reativa |
| TypeScript | 5.9 | Tipagem estática end-to-end |
| Vite | 7.x | Build tool ultrarrápido |
| TailwindCSS | 4.x | Estilização utilitária |
| shadcn/ui | latest | Componentes acessíveis |
| Recharts | 2.x | Gráficos e dashboards |
| Wouter | 3.x | Roteamento client-side |
| tRPC Client | 11.x | Chamadas à API tipadas |

**Destaques de design:**
- Tema dark profissional (SOC Portal)
- Tipografia Inter + JetBrains Mono
- Sidebar compacta com badges de severidade coloridos
- Responsivo e acessível (WCAG AA)

> **Comentário para apresentação (Nattan — Frontend + BD):**
> "O frontend foi desenvolvido com React 19 e TypeScript, garantindo tipagem de ponta a ponta. Escolhemos o TailwindCSS 4 pela produtividade e o shadcn/ui pelos componentes acessíveis. O design segue o padrão SOC Portal — tema escuro profissional com badges coloridos por severidade, que é o padrão usado em ferramentas reais de segurança como o Splunk e o IBM QRadar."

---

## Slide 6 — Stack Tecnológica: Backend

**Título:** Backend: API Type-Safe com tRPC e Autenticação Robusta

**Conteúdo:**
Responsável: **Margefson**

| Tecnologia | Versão | Função |
|---|---|---|
| Node.js | 22.x | Runtime JavaScript |
| Express | 4.x | Servidor HTTP |
| tRPC | 11.x | API type-safe (sem REST) |
| Drizzle ORM | 0.44.x | Queries e migrações |
| bcryptjs | 2.x | Hash de senhas (custo 12) |
| jose | 6.x | JWT HttpOnly sessions |
| Zod | 4.x | Validação de schema |
| Vitest | latest | Testes automatizados |

**Destaques de segurança:**
- Senhas com bcrypt custo 12 (resistente a brute force)
- JWT HttpOnly (imune a XSS)
- Proteção contra timing attack no login
- RBAC: `user` e `admin` com `protectedProcedure`

> **Comentário para apresentação (Margefson — Backend):**
> "O backend usa tRPC em vez de REST tradicional. A vantagem é que os tipos TypeScript são compartilhados automaticamente entre frontend e backend — se eu mudar a assinatura de uma procedure, o TypeScript avisa imediatamente no frontend. Para segurança, implementamos bcrypt com custo 12, JWT HttpOnly e proteção contra timing attack — técnica que evita que um atacante descubra se um e-mail existe no sistema medindo o tempo de resposta."

---

## Slide 7 — Stack Tecnológica: Banco de Dados

**Título:** Banco de Dados: Schema Relacional com Migrações Controladas

**Conteúdo:**
Responsável: **Nattan**

**Tecnologias:** TiDB (MySQL 8 compatível) + Drizzle ORM

**Tabelas principais:**

| Tabela | Campos-chave | Descrição |
|---|---|---|
| `users` | id, name, email, passwordHash, role | Usuários do sistema |
| `incidents` | id, userId, title, description, category, riskLevel, status, confidence | Incidentes registrados |
| `categories` | id, name, description, riskLevel | Categorias personalizáveis |
| `incident_history` | id, incidentId, userId, field, oldValue, newValue, comment | Auditoria completa |

**Destaques:**
- Migrações versionadas com Drizzle Kit
- Enum para `category`, `riskLevel` e `status`
- Campo `confidence` armazena score do modelo ML
- Histórico de auditoria com campo anterior e novo valor

> **Comentário para apresentação (Nattan — Banco de Dados):**
> "O banco de dados foi modelado com Drizzle ORM, que gera SQL tipado a partir do schema TypeScript. Temos 4 tabelas principais: users, incidents, categories e incident_history. A tabela de histórico é especialmente importante — ela registra cada alteração de status, nota ou categoria com o valor anterior e o novo valor, criando uma trilha de auditoria completa para fins de compliance e LGPD."

---

## Slide 8 — Stack Tecnológica: Machine Learning

**Título:** ML: TF-IDF + Naive Bayes com 97% de Acurácia em Produção

**Conteúdo:**
Responsável: **Josias e Keven**

**Pipeline do modelo:**
```
Texto do incidente
      ↓
TF-IDF Vectorizer (5.000 features, bigramas)
      ↓
Multinomial Naive Bayes (alpha=0.1)
      ↓
Categoria + Score de Confiança
```

**Categorias classificadas:**
| Categoria | Risco | Exemplos |
|---|---|---|
| Phishing | Alto | e-mail falso, link suspeito |
| Malware | Crítico | vírus, ransomware, trojan |
| Força Bruta | Alto | tentativas de login, bloqueio |
| DDoS | Médio | sobrecarga, tráfego anômalo |
| Vazamento de Dados | Crítico | exposição, LGPD, exfiltração |

**Métricas:**
- Acurácia CV 5-fold: **97%**
- Dataset: **100 amostras** reais
- Retreinamento: dinâmico com incidentes do banco

> **Comentário para apresentação (Josias — ML):**
> "O modelo de Machine Learning usa um pipeline clássico de NLP: primeiro, o TF-IDF transforma o texto em um vetor numérico de até 5.000 features, considerando unigramas e bigramas. Depois, o Naive Bayes classifica o vetor na categoria mais provável. Atingimos 97% de acurácia em cross-validation com 5 folds — o que significa que o modelo foi testado em 5 subconjuntos diferentes do dataset e manteve essa performance. O diferencial é o retreinamento dinâmico: ao adicionar novos incidentes ao sistema, o admin pode retreinar o modelo com todos os dados acumulados."

---

## Slide 9 — Fluxo de Classificação

**Título:** Da Submissão à Classificação: Fluxo em Tempo Real

**Diagrama de fluxo (texto para renderizar como diagrama):**

```
[Usuário preenche formulário]
         ↓
[Frontend valida campos]
         ↓
[tRPC mutation → Backend Node.js]
         ↓
[Backend envia texto para Flask :5001]
         ↓
[Flask: TF-IDF + Naive Bayes]
         ↓
[Retorna: categoria + confiança + risco]
         ↓
[Backend salva no banco TiDB]
         ↓
[Frontend exibe resultado com badge colorido]
         ↓
[Se risco CRÍTICO → notificação automática ao admin]
```

**Tempo médio de classificação:** < 200ms

> **Comentário para apresentação (Keven — Frontend + ML):**
> "O fluxo de classificação acontece em menos de 200 milissegundos. Quando o usuário submete o formulário, o frontend envia os dados via tRPC para o backend Node.js. O backend encaminha o texto para o servidor Flask na porta 5001, que executa o pipeline TF-IDF + Naive Bayes e retorna a categoria, o score de confiança e o nível de risco. Se o risco for crítico, o sistema dispara automaticamente uma notificação para o administrador. Tudo isso acontece de forma transparente para o usuário."

---

## Slide 10 — Funcionalidades: Usuário

**Título:** Experiência do Usuário: Registro, Acompanhamento e Exportação

**Funcionalidades por perfil (usuário):**

**Registro e Autenticação:**
- Checklist visual de força de senha em tempo real
- Login com sessão JWT HttpOnly

**Gestão de Incidentes:**
- Formulário com preview de classificação antes de submeter
- Listagem com filtros avançados (categoria, risco, data)
- Busca de texto completo com destaque visual nos resultados
- Exportação CSV com BOM UTF-8

**Acompanhamento:**
- Status: Em Aberto → Em Andamento → Resolvido
- Notas de acompanhamento (texto livre)
- Histórico de alterações com timeline visual
- Comentário ao alterar status

**Perfil:**
- Estatísticas pessoais (total, críticos, resolvidos)
- Distribuição de risco em gráfico

> **Comentário para apresentação (Nattan — Frontend):**
> "Do ponto de vista do usuário, o sistema oferece uma experiência completa. O destaque é o checklist de força de senha em tempo real — o botão de registro só é habilitado quando todos os critérios são atendidos. Na listagem de incidentes, o usuário pode filtrar por categoria, risco e data, além de buscar por texto com destaque visual nos termos encontrados. O acompanhamento de status com histórico completo é fundamental para compliance — o usuário sabe exatamente o que aconteceu com cada incidente."

---

## Slide 11 — Funcionalidades: Administrador

**Título:** Painel Admin: Visibilidade Global e Controle Total

**Funcionalidades exclusivas do admin:**

| Módulo | Funcionalidade |
|---|---|
| **Dashboard Global** | KPIs de todos os usuários, gráficos consolidados |
| **Incidentes** | Visualiza e reclassifica incidentes de qualquer usuário |
| **Usuários** | Editar, excluir, resetar senha, promover/rebaixar perfil |
| **Categorias** | CRUD completo (criar, editar, excluir fisicamente) |
| **Relatório PDF** | Exporta todos os incidentes do sistema com filtros |
| **Machine Learning** | Retreina modelo, visualiza métricas, baixa dataset |

**Segurança do painel admin:**
- Admin não pode excluir/resetar a própria conta via painel
- Todas as procedures admin usam `adminProcedure` (RBAC)
- Senha padrão de reset: `Security2026@`

> **Comentário para apresentação (Margefson — Backend + Admin):**
> "O painel administrativo foi desenvolvido com RBAC — Role-Based Access Control. Cada procedure sensível usa o middleware `adminProcedure`, que verifica se o usuário tem papel `admin` antes de executar. O admin tem visibilidade global de todos os incidentes, pode gerenciar usuários incluindo reset de senha para `Security2026@`, e tem acesso ao painel de Machine Learning para retreinar o modelo com os novos dados acumulados."

---

## Slide 12 — Machine Learning: Retreinamento Dinâmico

**Título:** Retreinamento Contínuo: O Modelo Aprende com Novos Incidentes

**Fluxo de retreinamento:**

```
[Admin acessa painel ML]
         ↓
[Seleciona: "Incluir todos os incidentes do banco"]
         ↓
[Backend busca todos os incidentes (getAllIncidents)]
         ↓
[Envia para Flask :5001 /retrain]
         ↓
[Flask combina: dataset original + incidentes do banco]
         ↓
[Retreina TF-IDF + Naive Bayes]
         ↓
[Salva modelo + métricas + last_updated]
         ↓
[Retorna: nova acurácia + categorias atualizadas]
```

**Vantagem:** O modelo melhora continuamente com dados reais da organização

> **Comentário para apresentação (Josias — ML):**
> "O retreinamento dinâmico é um diferencial importante. Em vez de usar apenas o dataset estático de 100 amostras, o admin pode retreinar o modelo com todos os incidentes já registrados no sistema. Isso significa que, com o tempo, o modelo aprende os padrões específicos da organização — incidentes reais, com terminologia real, registrados pelos próprios analistas. A data da última atualização é exibida no painel para rastreabilidade."

---

## Slide 13 — Testes Automatizados

**Título:** Qualidade Garantida: 347 Testes em 11 Arquivos

**Cobertura de testes:**

| Arquivo | Testes | Cobertura |
|---|---|---|
| `auth.test.ts` | 42 | Registro, login, JWT, bcrypt, timing attack |
| `incidents.test.ts` | 38 | CRUD, validação, RBAC, ML mock |
| `ml.test.ts` | 29 | Classificador, retreinamento, métricas |
| `admin.test.ts` | 31 | Painel admin, reclassificação, stats |
| `advanced_features.test.ts` | 33 | Filtros, CSV, perfil, relatório |
| `followup.test.ts` | 28 | Status, notas, histórico, timeline |
| `session4.test.ts` | 35 | PDF, busca, incident_history |
| `session5.test.ts` | 23 | Gerenciamento usuários, dataset |
| `session6.test.ts` | 28 | PDF quebra de linha, ML last_updated |
| Outros | 60 | Segurança, validação, schema |
| **Total** | **347** | **11 arquivos** |

**Framework:** Vitest (compatível com Jest)

> **Comentário para apresentação (Margefson — Testes):**
> "Testes automatizados são fundamentais em sistemas de segurança. Desenvolvemos 347 testes em 11 arquivos, cobrindo desde casos felizes até cenários de ataque — como IDOR (acesso a recursos de outro usuário), timing attack no login e injeção de dados inválidos. O Vitest nos permite rodar todos os testes em menos de 6 segundos, o que viabiliza integração contínua."

---

## Slide 14 — Segurança Implementada

**Título:** Segurança em Camadas: Defesa em Profundidade

**Controles de segurança implementados:**

| Camada | Controle | Proteção |
|---|---|---|
| **Autenticação** | bcrypt custo 12 | Brute force de senhas |
| **Sessão** | JWT HttpOnly | XSS, roubo de token |
| **Autorização** | RBAC (user/admin) | Escalada de privilégios |
| **Dados** | IDOR protection | Acesso a dados de outros usuários |
| **Input** | Zod + Joi | Injeção, overflow |
| **Timing** | Dummy hash compare | Enumeração de e-mails |
| **Senhas** | Checklist + força | Senhas fracas |
| **Categorias** | Hard delete | Dados órfãos |

**Princípio aplicado:** Defesa em Profundidade (Defense in Depth)

> **Comentário para apresentação (Margefson — Segurança):**
> "Segurança foi tratada como requisito não-funcional desde o início, não como adição posterior. Implementamos defesa em profundidade — múltiplas camadas de proteção. O controle mais interessante é a proteção contra timing attack: mesmo quando o e-mail não existe no banco, o sistema executa um bcrypt.compare com um hash dummy, garantindo que o tempo de resposta seja idêntico ao de um login com e-mail válido. Isso impede que um atacante enumere e-mails válidos medindo o tempo de resposta."

---

## Slide 15 — Demonstração: Fluxo Completo

**Título:** Demo: Do Registro ao Relatório em 5 Passos

**Roteiro de demonstração:**

**Passo 1 — Registro e Login**
- Criar conta com checklist de senha
- Fazer login e ver o dashboard

**Passo 2 — Registrar Incidente**
- Preencher formulário com título e descrição
- Observar preview de classificação em tempo real
- Submeter e ver classificação automática com badge

**Passo 3 — Acompanhamento**
- Abrir detalhe do incidente
- Alterar status para "Em Andamento" com comentário
- Observar timeline de histórico atualizada

**Passo 4 — Busca e Filtros**
- Usar busca de texto com destaque visual
- Aplicar filtros por categoria e risco
- Exportar CSV filtrado

**Passo 5 — Painel Admin**
- Visualizar todos os incidentes do sistema
- Gerar relatório PDF consolidado
- Retreinar modelo com novos dados

> **Comentário para apresentação (Keven — Demo):**
> "Vou demonstrar o fluxo completo em 5 passos. Começamos com o registro, onde o checklist de senha valida em tempo real. Em seguida, registramos um incidente e observamos a classificação automática pelo modelo ML. Depois, acompanhamos o incidente alterando o status e adicionando um comentário — que fica registrado na timeline de histórico. Por fim, no painel admin, geramos o relatório PDF consolidado de todos os incidentes do sistema."

---

## Slide 16 — Resultados e Métricas

**Título:** Resultados: Objetivos Alcançados com Excelência

**Métricas do projeto:**

| Objetivo | Meta | Resultado |
|---|---|---|
| Acurácia ML | ≥ 90% | **97%** ✅ |
| Testes automatizados | ≥ 300 | **347** ✅ |
| Cobertura de funcionalidades | 100% | **100%** ✅ |
| Tempo de classificação | < 500ms | **< 200ms** ✅ |
| Servidores integrados | 3 | **3** ✅ |
| Arquivos de teste | ≥ 5 | **11** ✅ |

**Funcionalidades entregues:**
- ✅ Autenticação segura com RBAC
- ✅ Classificação automática ML
- ✅ Dashboard com KPIs e gráficos
- ✅ Filtros avançados e busca de texto
- ✅ Histórico de auditoria completo
- ✅ Relatório PDF e exportação CSV
- ✅ Gerenciamento completo de usuários (admin)
- ✅ Retreinamento dinâmico do modelo

> **Comentário para apresentação (Todos):**
> "Todos os objetivos foram alcançados e superados. A acurácia de 97% supera a meta de 90%. Os 347 testes automatizados garantem qualidade e facilitam manutenção futura. O sistema está publicado e acessível em produção em incidentsys-kjt4emsw.manus.space."

---

## Slide 17 — Divisão do Time

**Título:** Equipe: Especialização por Stack com Colaboração Integrada

**Organograma do time:**

| Integrante | Papel | Stack | Responsabilidades |
|---|---|---|---|
| **Margefson** | Tech Lead + Backend | Node.js, tRPC, Vitest | API tRPC, autenticação, procedures, testes, PDF nativo, gerenciamento de usuários |
| **Nattan** | Frontend + BD | React, TypeScript, Drizzle | UI/UX, design system, schema do banco, migrações, dashboard, perfil |
| **Keven** | Frontend + ML | React, Python, scikit-learn | Componentes UI, integração ML no frontend, servidor Flask ML, demonstrações |
| **Josias** | ML Engineer | Python, scikit-learn, Flask | Pipeline TF-IDF + Naive Bayes, dataset, retreinamento, servidor PDF Flask |

**Metodologia:** Desenvolvimento iterativo com entregas semanais e revisão de código em pares

> **Comentário para apresentação (Todos — cada um fala sobre sua parte):**
> "Nossa equipe foi organizada por especialidade, mas com forte colaboração entre as camadas. Cada integrante apresentará sua contribuição específica nos próximos slides. A integração entre as camadas foi o maior desafio — garantir que o TypeScript do frontend 'conversasse' com o Python do ML exigiu um protocolo bem definido de comunicação via HTTP JSON."

---

## Slide 18 — Conclusão e Próximos Passos

**Título:** Conclusão: Um Sistema Pronto para Produção

**Síntese do projeto:**
O INCIDENT_SYS demonstra que é possível construir uma plataforma de segurança cibernética completa, segura e com inteligência artificial integrada usando tecnologias modernas de código aberto.

**Contribuições técnicas:**
- Integração de 3 servidores heterogêneos (Node.js + Python Flask × 2)
- Pipeline ML retreinável com dados reais da organização
- 347 testes automatizados cobrindo segurança, ML e funcionalidades
- Auditoria completa com histórico de alterações

**Próximos passos sugeridos:**
1. Notificações in-app em tempo real (WebSocket)
2. Dashboard de métricas de resolução (MTTR por categoria)
3. Integração com SIEM (Splunk, IBM QRadar)
4. Exportação do histórico em CSV
5. Autenticação multi-fator (MFA)

**Agradecimentos**

> **Comentário para apresentação (Margefson — Fechamento):**
> "Para concluir: o INCIDENT_SYS é um sistema pronto para produção, com segurança em camadas, Machine Learning retreinável e auditoria completa. Os próximos passos naturais seriam a integração com sistemas SIEM corporativos e a adição de notificações em tempo real via WebSocket. Agradecemos a atenção e ficamos à disposição para perguntas."

---

## Notas de Apresentação — Roteiro por Integrante

### Margefson (Tech Lead + Backend)
**Slides:** 1 (abertura), 2, 3, 6, 11, 13, 14, 18 (fechamento)
**Tempo estimado:** 8 minutos
- Apresenta o contexto e problema (slide 2)
- Explica os objetivos e resultados (slide 3)
- Detalha o backend tRPC e segurança (slides 6, 14)
- Apresenta os testes automatizados (slide 13)
- Fecha com conclusão e próximos passos (slide 18)

### Nattan (Frontend + Banco de Dados)
**Slides:** 4, 5, 7, 10
**Tempo estimado:** 6 minutos
- Apresenta a arquitetura geral com diagrama (slide 4)
- Detalha o frontend React e design system (slide 5)
- Explica o schema do banco de dados (slide 7)
- Demonstra funcionalidades do usuário (slide 10)

### Keven (Frontend + ML)
**Slides:** 5 (co-apresentação), 8 (co-apresentação), 9, 15
**Tempo estimado:** 6 minutos
- Co-apresenta o frontend (slide 5)
- Co-apresenta o ML (slide 8)
- Explica o fluxo de classificação (slide 9)
- Conduz a demonstração ao vivo (slide 15)

### Josias (ML Engineer)
**Slides:** 8, 12
**Tempo estimado:** 5 minutos
- Detalha o pipeline TF-IDF + Naive Bayes (slide 8)
- Explica o retreinamento dinâmico (slide 12)
