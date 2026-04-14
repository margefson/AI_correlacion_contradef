#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Dict, List


def read_rows(path: Path, delimiter: str) -> List[Dict[str, str]]:
    if not path.exists():
        return []
    with path.open('r', encoding='utf-8', errors='ignore', newline='') as f:
        return list(csv.DictReader(f, delimiter=delimiter))


def match_contains(rows: List[Dict[str, str]], needle: str) -> List[Dict[str, str]]:
    result = []
    lowered = needle.lower()
    for row in rows:
        text = ' '.join(str(v) for v in row.values()).lower()
        if lowered in text:
            result.append(row)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description='Correlação automática do fluxo a partir de IsDebuggerPresent.')
    parser.add_argument('--function-interceptor', required=True, help='CSV/TSV exportado do FunctionInterceptor')
    parser.add_argument('--tracefcncall-m1', help='CSV/TSV exportado do TraceFcnCall.M1')
    parser.add_argument('--tracefcncall-m2', help='CSV/TSV exportado do TraceFcnCall.M2')
    parser.add_argument('--traceinstructions', help='CSV/TSV exportado do TraceInstructions')
    parser.add_argument('--tracememory', help='CSV/TSV exportado do TraceMemory')
    parser.add_argument('--tracedisassembly', help='CSV/TSV exportado do TraceDisassembly')
    parser.add_argument('--delimiter', default=',', help='Delimitador: , ou tabulação')
    parser.add_argument('--focus-function', default='IsDebuggerPresent', help='Função pivô da correlação')
    parser.add_argument('--output', required=True, help='Arquivo JSON de saída')
    args = parser.parse_args()

    delimiter = '\t' if args.delimiter.lower() in {'tab', '\\t'} else args.delimiter
    fi = read_rows(Path(args.function_interceptor), delimiter)
    m1 = read_rows(Path(args.tracefcncall_m1), delimiter) if args.tracefcncall_m1 else []
    m2 = read_rows(Path(args.tracefcncall_m2), delimiter) if args.tracefcncall_m2 else []
    ti = read_rows(Path(args.traceinstructions), delimiter) if args.traceinstructions else []
    tm = read_rows(Path(args.tracememory), delimiter) if args.tracememory else []
    td = read_rows(Path(args.tracedisassembly), delimiter) if args.tracedisassembly else []

    focus_hits = match_contains(fi, args.focus_function)
    related_functions = [
        'CheckRemoteDebuggerPresent',
        'NtQueryInformationProcess',
        'GetTickCount',
        'QueryPerformanceCounter',
        'EnumSystemFirmwareTables',
        'WMI',
        'LocalAlloc',
        'VirtualProtect',
        'HeapFree',
        'FatalExit',
    ]

    result = {
        'focus_function': args.focus_function,
        'function_interceptor_hits': focus_hits,
        'tracefcncall_m1_hits': match_contains(m1, args.focus_function),
        'tracefcncall_m2_hits': match_contains(m2, args.focus_function),
        'traceinstructions_hits': match_contains(ti, args.focus_function),
        'tracememory_hits': match_contains(tm, args.focus_function),
        'tracedisassembly_hits': match_contains(td, args.focus_function),
        'related_functions': {
            fn: {
                'function_interceptor': match_contains(fi, fn),
                'tracefcncall_m1': match_contains(m1, fn),
                'tracefcncall_m2': match_contains(m2, fn),
                'traceinstructions': match_contains(ti, fn),
                'tracememory': match_contains(tm, fn),
                'tracedisassembly': match_contains(td, fn),
            }
            for fn in related_functions
        },
        'notes': [
            'Os resultados dependem da qualidade e do esquema das exportações CSV/TSV.',
            'Para melhorar a correlação, preserve colunas como timestamp, endereço, thread, processo, API e módulo.'
        ]
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(out_path)


if __name__ == '__main__':
    main()
