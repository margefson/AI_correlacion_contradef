# Backlog técnico por arquivo

## 1. scripts/cdf_analysis_core.py
- Definir job único com id, status, progress, phase, events e artifacts.
- Separar fases: ingestão, descoberta, redução seletiva, correlação, classificação, exportação.
- Registrar cada mudança de fase em events.jsonl.
- Padronizar estrutura do grafo com nós, arestas, evidências e severidade.
- Gerar resumo textual por fase para relatório e UI.

## 2. scripts/process_real_cdfs.py
- Tornar o arquivo apenas orquestrador.
- Remover duplicação de lógica do core.
- Unificar saída do caso real com a do pipeline genérico.
- Ajustar nomes de artefatos para os mesmos contratos do artigo.

## 3. scripts/run_generic_cdf_analysis.py
- Validar argumentos de entrada.
- Salvar manifesto de configuração do job.
- Registrar uso de focus e focus-regex.
- Chamar o core sem misturar responsabilidades.
- Persistir status inicial antes do processamento pesado.

## 4. scripts/cdf_realtime_api.py
- Retornar job_id imediatamente no upload.
- Expor status por fase.
- Expor eventos incrementais.
- Expor lista de artefatos em atualização.
- Garantir polling simples para o frontend.

## 5. analysisService-11.ts
- Normalizar upload, status, eventos e artefatos.
- Criar adaptador para fases do pipeline.
- Preparar dados do grafo e da timeline.
- Padronizar contrato de consumo da API.

## 6. analysisRouter-10.ts
- Separar criação, acompanhamento e resultado.
- Alinhar rotas ao fluxo de job.
- Preparar histórico de análises, se houver.

## 7. client/src/pages/ReduceLogs-8.tsx
- Exibir upload, progresso, eventos e artefatos.
- Mostrar grafo ou resumo da correlação.
- Destacar classificação e risco.
- Tornar evidente o ganho de interpretabilidade.

## 8. client/src/pages/Home-6.tsx
- Resumir problema e solução.
- Direcionar para a análise.
- Explicar a redução de logs e a correlação.

## 9. scripts/build_mermaid_from_json.py
- Adaptar JSON final da correlação.
- Gerar Mermaid legível e estável.
- Destacar fases e evidências.

## 10. scripts/generate_markdown_report.py
- Incluir resumo executivo.
- Listar fases do processamento.
- Mostrar redução de volume e eventos relevantes.
- Fechar com conclusão interpretável.

## 11. scripts/generate_generic_report.py e scripts/generate_generic_docx.py
- Padronizar seções.
- Incluir métricas e interpretação.
- Evitar exportar apenas texto bruto.

## 12. Documentação
- Atualizar `docs/web/GUIA_DE_USO.md`.
- Atualizar `docs/web/MAPEAMENTO_REDUCAO_HEURISTICA.md`.
- Atualizar `docs/web/PLANO_ETAPAS_ANALITICAS.md`.
