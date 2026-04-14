#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding='utf-8'))


def fmt_list(items: List[str]) -> str:
    return ', '.join(items) if items else 'N/A'


def render_table(rows: List[List[str]], headers: List[str]) -> str:
    lines = ['| ' + ' | '.join(headers) + ' |', '| ' + ' | '.join(['---'] * len(headers)) + ' |']
    for row in rows:
        lines.append('| ' + ' | '.join(row) + ' |')
    return '\n'.join(lines)


def build_report(job_dir: Path) -> str:
    status = read_json(job_dir / 'status.json', default={})
    run_summary = read_json(job_dir / 'output' / 'run_summary.json', default={})
    manifest = read_json(job_dir / 'output' / 'manifests' / 'dataset_manifest.json', default=[])
    correlation = read_json(job_dir / 'output' / 'correlation' / 'generic_focus_correlation.json', default={})
    focus_config = read_json(job_dir / 'output' / 'manifests' / 'focus_config.json', default={})

    classified_counts = run_summary.get('classified_counts', {})
    manifest_rows = []
    for item in manifest:
        manifest_rows.append([
            item.get('relative_path', ''),
            item.get('file_type', ''),
            str(item.get('size_bytes', '')),
            item.get('sha256', '')[:16] + '…' if item.get('sha256') else '',
        ])

    node_rows = []
    for node in correlation.get('nodes', [])[:20]:
        counts = node.get('counts', {})
        node_rows.append([
            node.get('label', ''),
            'sim' if node.get('is_focus') else 'não',
            str(counts.get('function_interceptor', 0)),
            str(counts.get('trace_fcn_call', 0)),
            str(counts.get('trace_textual', 0)),
            fmt_list(node.get('matched_queries', [])),
        ])

    edge_rows = []
    for edge in correlation.get('edges', [])[:20]:
        edge_rows.append([
            edge.get('from_label', ''),
            edge.get('to_label', ''),
            edge.get('relation', ''),
            str(edge.get('count', 0)),
            str(edge.get('confidence', '')),
            fmt_list(edge.get('matched_queries', [])),
        ])

    output_paths = run_summary.get('outputs', {})
    output_rows = [[key, value] for key, value in output_paths.items()]
    classified_rows = [[key, str(value)] for key, value in classified_counts.items()]

    report = f"""# Relatório de Análise Genérica de CDF

Este relatório consolida uma execução do pipeline genérico para correlação de funções em traces CDF ou equivalentes textuais. O objetivo do job foi localizar as funções-alvo informadas, medir sua presença nos arquivos descobertos, reconstruir relações observadas entre chamadas e disponibilizar artefatos reutilizáveis para inspeção contínua.

## Resumo executivo

| Campo | Valor |
| --- | --- |
| Diretório do job | `{job_dir}` |
| Estado final | `{status.get('state', 'desconhecido')}` |
| Etapa final | `{status.get('stage', 'desconhecida')}` |
| Funções literais | `{fmt_list(focus_config.get('focus_terms', []))}` |
| Expressões regulares | `{fmt_list(focus_config.get('focus_regexes', []))}` |
| Arquivos descobertos | `{run_summary.get('discovered_file_count', 0)}` |
| Arquivo principal de correlação | `{status.get('correlation_file', '')}` |

A execução gerou um conjunto de manifestos, saídas derivadas, recortes filtrados e um grafo de correlação. O pipeline foi desenhado para operar sobre pacotes 7z submetidos em novas análises e não depende de um nome de função fixo.

## Distribuição dos arquivos classificados

{render_table(classified_rows or [['N/A', '0']], ['Categoria', 'Quantidade'])}

## Manifesto do dataset

{render_table(manifest_rows or [['N/A', 'N/A', '0', 'N/A']], ['Arquivo', 'Categoria', 'Tamanho (bytes)', 'SHA-256'])}

## Nós principais observados

{render_table(node_rows or [['N/A', 'não', '0', '0', '0', 'N/A']], ['Nó', 'É foco', 'FunctionInterceptor', 'TraceFcnCall', 'Textual', 'Consultas associadas'])}

## Arestas principais observadas

{render_table(edge_rows or [['N/A', 'N/A', 'N/A', '0', '0', 'N/A']], ['Origem', 'Destino', 'Relação', 'Contagem', 'Confiança', 'Consultas associadas'])}

## Artefatos produzidos

{render_table(output_rows or [['N/A', 'N/A']], ['Artefato', 'Caminho'])}

## Interpretação operacional

O JSON de correlação deve ser tratado como uma estrutura de evidências. Relações `direct_call` representam chamadas explicitamente observadas em traces de instruções. Relações `cooccurrence_*` representam proximidade contextual ou coocorrência em blocos, úteis para priorização investigativa, mas não suficientes isoladamente para afirmar causalidade. Os contadores por arquivo e por categoria ajudam a diferenciar funções apenas citadas de funções efetivamente encadeadas na execução.

## Próximos passos recomendados

| Objetivo | Ação sugerida |
| --- | --- |
| Reexecutar sobre nova amostra | Submeter outro `7z` pela API ou rodar a CLI com novo `--archive`. |
| Acompanhar progresso em tempo quase real | Consultar `status.json`, `events.jsonl` e os endpoints `/jobs/{{job_id}}/...`. |
| Refinar o foco | Adicionar novas funções em `--focus` ou padrões em `--focus-regex`. |
| Produzir documentação editável | Gerar também o relatório em DOCX a partir deste mesmo job. |
"""
    return report + '\n'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Gerar relatório Markdown a partir de um job da análise genérica de CDF.')
    parser.add_argument('--job-dir', required=True, help='Diretório do job concluído.')
    parser.add_argument('--output-md', required=True, help='Arquivo Markdown de saída.')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    job_dir = Path(args.job_dir).expanduser().resolve()
    output_md = Path(args.output_md).expanduser().resolve()
    output_md.parent.mkdir(parents=True, exist_ok=True)
    output_md.write_text(build_report(job_dir), encoding='utf-8')
    print(output_md)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
