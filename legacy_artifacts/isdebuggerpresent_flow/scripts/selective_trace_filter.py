#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Dict, Iterable, List


def load_rows(path: Path, delimiter: str) -> Iterable[Dict[str, str]]:
    with path.open('r', encoding='utf-8', errors='ignore', newline='') as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        for row in reader:
            yield row


def in_address_range(value: str, start: int | None, end: int | None) -> bool:
    if start is None and end is None:
        return True
    try:
        num = int(value, 16) if value.lower().startswith('0x') else int(value)
    except Exception:
        return False
    if start is not None and num < start:
        return False
    if end is not None and num > end:
        return False
    return True


def row_matches(row: Dict[str, str], terms: List[str], regex: str | None, function_field: str | None,
                function_name: str | None, address_field: str | None, start: int | None, end: int | None) -> bool:
    haystack = ' '.join(str(v) for v in row.values())
    if terms and not all(term.lower() in haystack.lower() for term in terms):
        return False
    if regex and re.search(regex, haystack) is None:
        return False
    if function_field and function_name:
        if row.get(function_field, '').lower() != function_name.lower():
            return False
    if address_field:
        if not in_address_range(row.get(address_field, ''), start, end):
            return False
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description='Filtragem seletiva de traces exportados em CSV/TSV.')
    parser.add_argument('input', help='Arquivo CSV/TSV de entrada')
    parser.add_argument('--delimiter', default=',', help='Delimitador do arquivo: , ou tabulação')
    parser.add_argument('--contains', nargs='*', default=[], help='Palavras-chave obrigatórias')
    parser.add_argument('--regex', help='Expressão regular opcional')
    parser.add_argument('--function-field', help='Nome da coluna de função/API')
    parser.add_argument('--function-name', help='Função a filtrar, ex.: IsDebuggerPresent')
    parser.add_argument('--address-field', help='Nome da coluna de endereço')
    parser.add_argument('--start-address', help='Endereço inicial, decimal ou hexadecimal')
    parser.add_argument('--end-address', help='Endereço final, decimal ou hexadecimal')
    parser.add_argument('--output', required=True, help='Arquivo JSON de saída')
    args = parser.parse_args()

    delimiter = '\t' if args.delimiter.lower() in {'tab', '\\t'} else args.delimiter
    start = int(args.start_address, 16) if args.start_address and args.start_address.lower().startswith('0x') else (int(args.start_address) if args.start_address else None)
    end = int(args.end_address, 16) if args.end_address and args.end_address.lower().startswith('0x') else (int(args.end_address) if args.end_address else None)

    rows = []
    for row in load_rows(Path(args.input), delimiter):
        if row_matches(row, args.contains, args.regex, args.function_field, args.function_name, args.address_field, start, end):
            rows.append(row)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({
        'input': args.input,
        'match_count': len(rows),
        'filters': {
            'contains': args.contains,
            'regex': args.regex,
            'function_field': args.function_field,
            'function_name': args.function_name,
            'address_field': args.address_field,
            'start_address': args.start_address,
            'end_address': args.end_address,
        },
        'rows': rows,
    }, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(out_path)


if __name__ == '__main__':
    main()
