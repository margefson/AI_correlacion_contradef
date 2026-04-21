# Backlog mestre consolidado

## Objetivo
Alinhar a ferramenta ao artigo proposto para o SBSeg, mantendo o fluxo de análise, a redução seletiva de logs, a correlação, a visualização em tempo real e a geração de relatórios.

## 1. Núcleo de análise
### scripts/cdf_analysis_core.py
- Definir job único com id, status, phase, progress, events e artifacts.
- Separar fases: ingestão, descoberta, redução seletiva, correlação, classificação e exportação.
- Registrar cada mudança de fase em events.jsonl.
- Atualizar status.json a cada fase.
- Padronizar o grafo de correlação com nós, arestas, evidências e severidade.
- Gerar resumo curto por fase para relatório e UI.

### scripts/process_real_cdfs.py
- Remover lógica duplicada do core.
- Tornar o arquivo apenas orquestrador do caso real.
- Unificar contratos de saída com o pipeline genérico.
- Preservar compatibilidade com dados antigos, se necessário.

### scripts/run_generic_cdf_analysis.py
- Validar archive ou input-dir.
- Validar focus terms e focus-regex.
- Criar job_id e diretório do job.
- Salvar configuração do job em manifesto.
- Registrar status inicial.
- Chamar o core sem duplicar lógica.

## 2. API e monitoramento
### scripts/cdf_realtime_api.py
- Retornar job_id imediatamente após upload.
- Expor status por fase.
- Expor eventos incrementais.
- Expor artefatos gerados.
- Manter contrato simples para polling.
- Deixar caminho aberto para SSE no futuro, se desejado.

## 3. Serviço frontend
### analysisService-11.ts
- Normalizar upload, status, eventos e artefatos.
- Criar tipos de retorno para job, evento e artefato.
- Criar adaptador para fases do pipeline.
- Preparar dados para timeline e grafo.
- Centralizar URLs/paths da API.

### analysisRouter-10.ts
- Separar criação de análise de acompanhamento.
- Separar lista de jobs de detalhe de job.
- Organizar navegação entre home, reduce logs e resultados.
- Mapear estados de loading e erro.

## 4. Interface principal
### client/src/pages/ReduceLogs-8.tsx
- Conectar upload ao analysisService.
- Mostrar job_id após envio.
- Atualizar progresso por polling.
- Exibir fase atual do pipeline.
- Renderizar eventos em ordem temporal.
- Renderizar artefatos disponíveis.
- Mostrar grafo Mermaid ou resumo visual equivalente.
- Exibir classificação final e interpretação curta.
- Tratar idle, uploading, running, done e error.

### client/src/pages/Home-6.tsx
- Explicar o problema principal em poucas linhas.
- Explicar a solução proposta.
- Destacar redução de logs, correlação e visualização.
- Direcionar para a tela ReduceLogs.
- Manter a home curta e objetiva.

## 5. Visualização e relatório
### scripts/build_mermaid_from_json.py
- Validar estrutura do JSON de entrada.
- Normalizar nomes de nós e arestas.
- Destacar fases do pipeline no diagrama.
- Gerar Mermaid legível e estável.
- Garantir compatibilidade com relatório e UI.

### scripts/generate_markdown_report.py
- Criar resumo executivo do job.
- Listar fases executadas.
- Mostrar redução de logs aplicada.
- Destacar eventos e artefatos relevantes.
- Incluir resumo da correlação e classificação.

### scripts/generate_generic_report.py
- Gerar relatório genérico reutilizável.
- Ler status, eventos e manifestos.
- Montar sumário do processamento.
- Destacar redução, correlação e conclusão.

### scripts/generate_generic_docx.py
- Converter o relatório genérico em DOCX.
- Aplicar estilo consistente e leitura limpa.
- Manter mesma ordem lógica do Markdown.
- Garantir compatibilidade e determinismo.

## 6. Documentação e apoio metodológico
### docs/web/GUIA_DE_USO.md
- Atualizar fluxo operacional da ferramenta.
- Explicar upload, acompanhamento e leitura dos resultados.

### docs/web/MAPEAMENTO_REDUCAO_HEURISTICA.md
- Documentar critérios de redução seletiva.
- Explicar o que é preservado e o que é filtrado.

### docs/web/PLANO_ETAPAS_ANALITICAS.md
- Documentar fases do pipeline.
- Explicar como interpretar status, eventos e artefatos.

## 7. Ordem recomendada de execução
1. cdf_analysis_core.py
2. cdf_realtime_api.py
3. run_generic_cdf_analysis.py
4. analysisService-11.ts
5. ReduceLogs-8.tsx
6. build_mermaid_from_json.py
7. generate_markdown_report.py
8. generate_generic_report.py
9. generate_generic_docx.py
10. documentação de apoio

## 8. Critérios de aceitação
- A análise precisa rodar com job_id rastreável.
- O progresso deve ser visível por fase.
- Os eventos devem ser consultáveis em tempo de execução.
- O relatório precisa refletir a interpretação do comportamento.
- A tela ReduceLogs precisa mostrar o fluxo de forma clara.
- O grafo precisa ser legível e útil para análise.
- O pipeline genérico e o caso real devem compartilhar o máximo possível de lógica.
