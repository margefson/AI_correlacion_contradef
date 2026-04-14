#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path
from typing import Dict, Iterator, List


def chunk_reader(path: Path, delimiter: str, chunk_size: int) -> Iterator[List[Dict[str, str]]]:
    with path.open('r', encoding='utf-8', errors='ignore', newline='') as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        chunk: List[Dict[str, str]] = []
        for row in reader:
            chunk.append(row)
            if len(chunk) >= chunk_size:
                yield chunk
                chunk = []
        if chunk:
            yield chunk


def normalize_api_name(row: Dict[str, str], api_field: str | None) -> str:
    if api_field and row.get(api_field):
        return row[api_field].strip()
    for key in row.keys():
        lowered = key.lower()
        if lowered in {'api', 'function', 'function_name', 'symbol'} and row.get(key):
            return row[key].strip()
    return 'UNKNOWN'


def main() -> None:
    parser = argparse.ArgumentParser(description='Processamento incremental de traces exportados em CSV/TSV.')
    parser.add_argument('input', help='Arquivo CSV/TSV de entrada')
    parser.add_argument('--delimiter', default=',', help='Delimitador do arquivo: , ou tabulação')
    parser.add_argument('--chunk-size', type=int, default=50000, help='Linhas por chunk')
    parser.add_argument('--api-field', help='Nome da coluna com a API/função')
    parser.add_argument('--output-dir', required=True, help='Diretório para saídas agregadas')
    args = parser.parse_args()

    delimiter = '\t' if args.delimiter.lower() in {'tab', '\\t'} else args.delimiter
    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    summary = []
    total_rows = 0
    global_counter: Counter[str] = Counter()

    for idx, chunk in enumerate(chunk_reader(input_path, delimiter, args.chunk_size), start=1):
        counter: Counter[str] = Counter()
        for row in chunk:
            counter[normalize_api_name(row, args.api_field)] += 1
        total_rows += len(chunk)
        global_counter.update(counter)
        chunk_result = {
            'chunk_id': idx,
            'rows': len(chunk),
            'top_apis': counter.most_common(20),
        }
        summary.append(chunk_result)
        (output_dir / f'chunk_{idx:04d}.json').write_text(json.dumps(chunk_result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    final_result = {
        'input': str(input_path),
        'chunk_size': args.chunk_size,
        'total_rows': total_rows,
        'chunks': len(summary),
        'global_top_apis': global_counter.most_common(50),
        'chunk_summaries': summary,
    }
    (output_dir / 'summary.json').write_text(json.dumps(final_result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(output_dir / 'summary.json')


if __name__ == '__main__':
    main()
