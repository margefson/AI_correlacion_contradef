# Arquitetura e Fluxo de Comunicacao do Sistema

Documento visual com foco em clareza executiva e leitura rapida.

## Visao geral

- O front-end recebe os arquivos e acompanha o estado do job.
- O back-end centraliza autenticacao, persistencia e orquestracao.
- Os servicos Python fazem a analise, a correlacao e a geracao de relatorios.
- A etapa de reducao prepara os logs brutos para a leitura analitica.
- O banco preserva o historico operacional e os artefatos do processo.

## Fluxo principal

```mermaid
flowchart LR
    A[Front-end<br/>Upload e monitoramento] -->|HTTP| B[Back-end API<br/>Orquestracao do job]
    B -->|Persistencia de estado| C[(Banco de dados)]
    B -->|Disparo e controle| D[Servicos Python]
    D --> E[Reducao seletiva<br/>Normalizacao de logs]
    E --> F[Correlacao de eventos<br/>Fases e evidencias]
    F --> G[Relatorios e artefatos]
    G --> B
    B -->|Status, eventos, artefatos| A
```

Figura 1. Fluxo ponta a ponta do sistema.

## Sequencia do job

```mermaid
sequenceDiagram
    participant FE as Front-end
    participant BE as Back-end
    participant PY as Servicos Python
    participant DB as Banco

    FE->>BE: Envia arquivos de log
    BE->>DB: Cria job e status inicial
    BE->>PY: Dispara processamento em background
    loop Polling assincrono
      FE->>BE: Consulta status/eventos/artefatos
      BE->>DB: Le estado atualizado
      DB-->>BE: Retorna progresso e historico
      BE-->>FE: Atualiza fase e progresso
    end
    PY->>DB: Salva reducao, correlacao e artefatos
    BE-->>FE: Job concluido + relatorio final
```

Figura 2. Sequencia operacional resumida.

## Comunicacao entre componentes

- Front e back conversam por HTTP e consultas assincronas.
- Back e Python trocam arquivos de job e resultados intermediarios.
- Banco e back sincronizam estado, eventos e artefatos.
- A reducao de logs entrega saida normalizada para a correlacao.

## Resumo executivo

A arquitetura transforma entrada bruta em analise interpretavel, com um fluxo continuo de ingestao, reducao, correlacao, persistencia e relatorio.
