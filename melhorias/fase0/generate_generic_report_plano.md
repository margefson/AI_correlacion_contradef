# generate_generic_report.py — plano de implementação

## Objetivo do arquivo
Gerar um relatório genérico reutilizável para qualquer job, com seções padronizadas e linguagem consistente.

## Checklist de alteração
- Receber job_dir e localizar artefatos do job.
- Ler status, eventos e manifestos.
- Montar um sumário do processamento.
- Destacar redução, correlação e conclusão.
- Reaproveitar a mesma estrutura para jobs novos.
- Evitar dependência de um dataset específico.

## Estrutura sugerida
- Identificação do job
- Objetivo da análise
- Configuração usada
- Processamento realizado
- Evidências relevantes
- Artefatos gerados
- Resumo interpretativo
- Conclusão

## Observações
- O relatório deve ser mais curto que o Markdown detalhado.
- Deve servir como base para DOCX.
- Deve ser fácil de ler e compartilhar.
