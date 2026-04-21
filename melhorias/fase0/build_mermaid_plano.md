# build_mermaid_from_json.py — plano de implementação

## Objetivo do arquivo
Gerar um diagrama Mermaid legível a partir do JSON de correlação, para uso no relatório e na interface.

## Entrada esperada
- JSON com nós
- JSON com arestas
- JSON com metadados de fase, evidência e severidade

## Saída esperada
- arquivo .mmd
- versão textual do grafo, fácil de renderizar na UI

## Checklist de alteração
- Validar a estrutura do JSON de entrada.
- Normalizar nomes de nós e arestas.
- Destacar fases do pipeline no diagrama.
- Mostrar relações causais ou temporais de forma simples.
- Evitar excesso de detalhes que prejudiquem leitura.
- Garantir compatibilidade com o relatório Markdown.
- Garantir compatibilidade com a página ReduceLogs.

## Regras de visualização
- Poucos nós por nível.
- Rótulos curtos.
- Fases visíveis como grupos ou subgrafos.
- Evidências importantes destacadas.
- Classificação ou severidade indicada quando existir.

## Estrutura sugerida
- start
- ingestao
- reducao
- correlacao
- classificacao
- exportacao
- end

## Observações
- O diagrama precisa ser mais interpretável do que bonito.
- O foco é ajudar o analista a seguir o fluxo.
- Se o JSON estiver incompleto, o arquivo ainda deve gerar um diagrama parcial válido.
