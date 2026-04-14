#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict


def safe_label(text: str) -> str:
    return text.replace('"', "'")


def main() -> None:
    parser = argparse.ArgumentParser(description='Gerar diagrama Mermaid a partir de um JSON de correlação.')
    parser.add_argument('input_json', help='Arquivo JSON com nós e arestas')
    parser.add_argument('--output', required=True, help='Arquivo .mmd de saída')
    args = parser.parse_args()

    data = json.loads(Path(args.input_json).read_text(encoding='utf-8'))
    nodes: Dict[str, Dict[str, str]] = {node['id']: node for node in data['nodes']}

    lines = ['flowchart TD']
    for node_id, node in nodes.items():
        label = safe_label(f"{node['label']}\\n[{node['file']}]\\n<{node['confidence']}>")
        lines.append(f'    {node_id}["{label}"]')
    for edge in data['edges']:
        rel = safe_label(edge['relation'])
        lines.append(f"    {edge['from']} -->|{rel}| {edge['to']}")

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(out_path)


if __name__ == '__main__':
    main()
