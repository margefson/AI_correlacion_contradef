#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def build_mermaid(flow: dict) -> str:
    lines = ['flowchart TD']
    for node in flow.get('nodes', []):
        counts = node.get('counts', {})
        label = (
            f"{node.get('label', 'N/A')}\\n"
            f"FI:{counts.get('function_interceptor', 0)} "
            f"M1:{counts.get('tracefcncall_m1', 0)} "
            f"M2:{counts.get('tracefcncall_m2', 0)} "
            f"TI:{counts.get('traceinstructions', 0)} "
            f"TM:{counts.get('tracememory', 0)}"
        )
        lines.append(f"    {node['id']}[\"{label}\"]")
    for edge in flow.get('edges', []):
        lines.append(f"    {edge['from']} -->|{edge['relation']}| {edge['to']}")
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
