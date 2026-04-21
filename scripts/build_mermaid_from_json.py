#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


PHASE_MAP = {
    'loadlibrarya': 'Inicializacao',
    'isdebuggerpresent': 'Evasao',
    'checkremotedebuggerpresent': 'Evasao',
    'zwqueryinformationprocess': 'Evasao',
    'zwsetinformationthread': 'Evasao',
    'gettickcount': 'Evasao',
    'queryperformancecounter': 'Evasao',
    'enumsystemfirmwaretables': 'Evasao',
    'wmi': 'Evasao',
    'localalloc': 'Desempacotamento',
    'virtualprotect': 'Desempacotamento',
    'heapfree': 'Execucao',
    'fatalexit': 'Finalizacao',
}


def normalize_term(value: str) -> str:
    return ''.join(ch for ch in value.lower() if ch.isalnum())


def infer_phase(node: dict) -> str:
    label = str(node.get('label', '')).strip()
    node_id = str(node.get('id', '')).strip()
    key = normalize_term(label) or normalize_term(node_id)
    return PHASE_MAP.get(key, 'Execucao')


def severity_style(node: dict) -> str:
    counts = node.get('counts', {})
    total = (
        int(counts.get('function_interceptor', 0))
        + int(counts.get('tracefcncall_m1', 0))
        + int(counts.get('tracefcncall_m2', 0))
        + int(counts.get('traceinstructions', 0))
        + int(counts.get('tracememory', 0))
    )
    if total >= 15:
        return 'critical'
    if total >= 6:
        return 'high'
    return 'medium'


def build_mermaid(flow: dict) -> str:
    lines = ['flowchart TD']
    nodes = flow.get('nodes', [])
    edges = flow.get('edges', [])
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValueError('JSON de fluxo invalido: esperado "nodes" e "edges" como listas.')

    phase_groups: dict[str, list[dict]] = {}
    for node in nodes:
        phase_groups.setdefault(infer_phase(node), []).append(node)

    style_by_node: dict[str, str] = {}
    for phase_name, phase_nodes in phase_groups.items():
        lines.append(f'    subgraph {phase_name}')
        lines.append('      direction TB')
        for node in phase_nodes:
            node_id = str(node.get('id', 'node'))
            if not node_id:
                continue
            counts = node.get('counts', {})
            label = (
                f"{node.get('label', 'N/A')}\\n"
                f"FI:{counts.get('function_interceptor', 0)} "
                f"M1:{counts.get('tracefcncall_m1', 0)} "
                f"M2:{counts.get('tracefcncall_m2', 0)} "
                f"TI:{counts.get('traceinstructions', 0)} "
                f"TM:{counts.get('tracememory', 0)}"
            )
            lines.append(f"      {node_id}[\"{label}\"]")
            style_by_node[node_id] = severity_style(node)
        lines.append('    end')

    for edge in edges:
        src = edge.get('from')
        dst = edge.get('to')
        relation = edge.get('relation', 'rel')
        if not src or not dst:
            continue
        lines.append(f'    {src} -->|{relation}| {dst}')

    lines.extend([
        '    classDef sevCritical fill:#3b0a0a,stroke:#ff6b6b,stroke-width:2px,color:#ffe3e3;',
        '    classDef sevHigh fill:#1f2a44,stroke:#7ab8ff,stroke-width:2px,color:#e7f2ff;',
        '    classDef sevMedium fill:#122016,stroke:#6ad18a,stroke-width:1px,color:#d8ffe6;',
    ])
    for node_id, severity in style_by_node.items():
        if severity == 'critical':
            lines.append(f'    class {node_id} sevCritical;')
        elif severity == 'high':
            lines.append(f'    class {node_id} sevHigh;')
        else:
            lines.append(f'    class {node_id} sevMedium;')

    return '\n'.join(lines) + '\n'


def main() -> None:
    parser = argparse.ArgumentParser(description='Gerar Mermaid a partir do JSON de correlação.')
    parser.add_argument('--input-json', required=True)
    parser.add_argument('--output-mmd', required=True)
    args = parser.parse_args()

    flow = json.loads(Path(args.input_json).read_text(encoding='utf-8'))
    mermaid = build_mermaid(flow)
    Path(args.output_mmd).write_text(mermaid, encoding='utf-8')
    print(args.output_mmd)


if __name__ == '__main__':
    main()
