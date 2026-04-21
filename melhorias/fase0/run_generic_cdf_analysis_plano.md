# run_generic_cdf_analysis.py — plano de implementação

## Objetivo do arquivo
Ser a porta de entrada da CLI genérica, validando parâmetros e iniciando a análise de forma padronizada.

## Checklist de alteração
- Validar archive ou input-dir.
- Validar focus terms e focus-regex.
- Criar job_id e diretório do job.
- Salvar configuração do job em manifesto.
- Registrar status inicial.
- Chamar o core da análise.
- Expor erros de forma clara.
- Evitar duplicação de lógica com outros scripts.

## Fluxo sugerido
1. parse args
2. validar entradas
3. criar job
4. salvar config
5. chamar análise
6. salvar resultados
7. encerrar job

## Observações
- O script deve ser simples e previsível.
- Ele não deve conter regra de análise profunda.
- O foco é iniciar e orquestrar.
