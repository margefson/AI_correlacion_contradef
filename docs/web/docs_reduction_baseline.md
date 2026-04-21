# Validação Inicial da Redução de Logs em C++

## Objetivo

Esta validação isola a proposta descrita em **Detalhes Técnicos das Propostas de Melhoria** e verifica, de forma reproduzível, se a heurística baseada em gatilho **VirtualProtect RW→RX** realmente reduz o volume dos logs granulares antes da integração completa com o restante da plataforma.

## Implementação testada

Foi criado um protótipo em C++ baseado na classe **SelectiveTracingEngine** descrita no documento técnico. O protótipo executa quatro passos principais:

| Etapa | Descrição |
| --- | --- |
| Detecção passiva | Lê o `FunctionInterceptor` e procura APIs sensíveis como `VirtualProtect`, `VirtualAlloc` e `WriteProcessMemory`. |
| Disparo do gatilho | Ativa o rastreamento granular quando identifica a transição `RW→RX` em `VirtualProtect`. |
| Redução seletiva | Mantém apenas linhas relevantes de `TraceInstructions` e `TraceMemory` próximas ao endereço do gatilho ou contendo APIs críticas. |
| Medição | Calcula linhas e bytes antes e depois da redução. |

## Amostras utilizadas

A validação usou amostras reais presentes no repositório base do projeto:

| Arquivo | Origem |
| --- | --- |
| `FunctionInterceptor_sample.csv` | `legacy_artifacts/isdebuggerpresent_flow/examples/` |
| `TraceInstructions_sample.csv` | `legacy_artifacts/isdebuggerpresent_flow/examples/` |
| `TraceMemory_sample.csv` | `legacy_artifacts/isdebuggerpresent_flow/examples/` |

## Resultado medido

O gatilho foi ativado no endereço **0x10A0**. A redução medida foi a seguinte:

| Log | Linhas antes | Linhas depois | Bytes antes | Bytes depois | Redução |
| --- | ---: | ---: | ---: | ---: | ---: |
| `TraceInstructions_sample.csv` | 9 | 6 | 696 | 405 | 42% |
| `TraceMemory_sample.csv` | 3 | 2 | 260 | 136 | 48% |
| **Total combinado** | **12** | **8** | **956** | **541** | **43%** |

## Interpretação inicial

O teste confirma que, mesmo nessa validação controlada, a heurística reduz o volume total preservando o evento crítico que motivou o rastreamento granular. Em outras palavras, o log realmente ficou menor após a aplicação do filtro seletivo, o que sustenta a ideia de usar essa abordagem como primeira etapa da plataforma.

## Arquivos gerados

| Arquivo | Finalidade |
| --- | --- |
| `tools_selective_reducer.cpp` | Protótipo reproduzível do redutor em C++. |
| `reduction_test_output/TraceInstructions_reduced.csv` | Saída reduzida do rastreamento de instruções. |
| `reduction_test_output/TraceMemory_reduced.csv` | Saída reduzida do rastreamento de memória. |
| `reduction_test_output/reduction_metrics.json` | Métricas consumidas pela interface web. |

## Próxima etapa recomendada

Com a redução inicial validada, a próxima evolução natural é repetir o mesmo experimento sobre logs maiores da Contradef, preferencialmente usando uma captura bruta mais extensa, para medir o ganho em cenários mais próximos do uso real e ajustar a heurística antes de avançar para correlação e interpretabilidade mais sofisticadas.
