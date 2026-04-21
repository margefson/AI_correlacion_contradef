# process_real_cdfs.py — plano de implementação

## Objetivo do arquivo
Executar o fluxo real de análise sobre o conjunto histórico, mas usando a mesma base do pipeline genérico.

## Checklist de alteração
- Verificar se há lógica duplicada do core.
- Mover regras reutilizáveis para cdf_analysis_core.py.
- Manter este arquivo apenas como orquestrador do caso real.
- Unificar nomes de artefatos com o pipeline genérico.
- Garantir que status, eventos e saídas tenham o mesmo contrato.
- Preservar compatibilidade com dados antigos, se necessário.

## Estrutura sugerida
- carregar entrada real
- preparar job
- chamar core
- coletar artefatos
- salvar relatórios
- registrar conclusão

## Observações
- Esse arquivo deve ser fino.
- Quanto menos lógica aqui, melhor.
- O objetivo é evitar bifurcação entre “real” e “genérico”.
