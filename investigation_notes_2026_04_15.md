# Notas de investigação — 2026-04-15

## Achados confirmados

1. **O bloqueio da fila não é apenas de elegibilidade de backend**. Os logs do navegador registram um erro de runtime no componente `Home`:
   - `ReferenceError: selectedFile is not defined`
   - o stack aponta para `Home.tsx` servido na prévia ativa.
   - isso explica por que a interface pode quebrar e concluir incorretamente que nenhum arquivo elegível iniciou análise.

2. **O fluxo em lote da Home depende de `readyUploadItems` e do retorno de `uploadAnalysisArchiveBatch()`**.
   - quando `successfulJobIds.length === 0`, a UI lança explicitamente o erro:
   - `Nenhum arquivo elegível conseguiu iniciar análise. Revise as mensagens da fila e tente novamente.`
   - portanto qualquer erro individual por arquivo, ou quebra anterior de render, leva diretamente à mensagem reportada pelo usuário.

3. **O pipeline legado já produz artefatos suficientes para derivar fluxos por função** no diretório do job, sem necessidade obrigatória de reprocessar o pacote inteiro do zero.
   - artefatos observados em `data/jobs_api/<job>/output/partial/`:
     - `contradef_2956_tracefcncall_m1_cdf_tracefcncall.json`
     - `contradef_2956_tracefcncall_m2_cdf_tracefcncall.json`
   - artefatos correlatos observados:
     - `output/correlation/generic_focus_correlation.json`
     - `output/figures/generic_focus_correlation.mmd`
     - `output/derived/tracefcn_focus.json`
     - `output/run_summary.json`

4. **O melhor ponto de expansão multi-função no backend web** parece ser após a sincronização/finalização do job em `server/analysisService.ts`, reaproveitando os arquivos já presentes no job do pipeline para gerar novos artefatos por função e registrá-los no catálogo de artefatos exibido pela UI.

## Próximas ações técnicas

1. Corrigir a quebra residual da `Home` e revisar o estado derivado da fila para garantir que itens validados possam iniciar o upload.
2. Validar o contrato entre `uploadAnalysisArchiveBatch()` e `server/analysisHttp.ts` para confirmar por que todos os itens terminam sem `jobId` quando o runtime não quebra.
3. Implementar uma rotina no backend que enumere as funções a partir dos artefatos `tracefcncall` parciais e gere, para cada função, pelo menos:
   - JSON do fluxo
   - Mermaid (`.mmd`)
   - PNG renderizado do fluxo
4. Expor os novos artefatos por função no detalhe do job e na interface web.
