#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import re
from collections import Counter, deque
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

FOCUS_PATTERNS: Dict[str, List[str]] = {
    'LoadLibraryA': [r'LoadLibraryA'],
    'IsDebuggerPresent': [r'IsDebuggerPresent'],
    'CheckRemoteDebuggerPresent': [r'CheckRemoteDebuggerPresent'],
    'ZwQueryInformationProcess': [r'ZwQueryInformationProcess', r'NtQueryInformationProcess'],
    'ZwSetInformationThread': [r'ZwSetInformationThread'],
    'GetTickCount': [r'GetTickCount'],
    'QueryPerformanceCounter': [r'QueryPerformanceCounter', r'RtlQueryPerformanceCounter'],
    'EnumSystemFirmwareTables': [r'EnumSystemFirmwareTables'],
    'WMI': [r'\bWMI\b'],
    'LocalAlloc': [r'LocalAlloc'],
    'VirtualProtect': [r'VirtualProtect(Ex)?'],
    'HeapFree': [r'HeapFree'],
    'FatalExit': [r'FatalExit'],
}

FLOW_ORDER = [
    'LoadLibraryA',
    'IsDebuggerPresent',
    'CheckRemoteDebuggerPresent',
    'ZwQueryInformationProcess',
    'ZwSetInformationThread',
    'GetTickCount',
    'QueryPerformanceCounter',
    'EnumSystemFirmwareTables',
    'WMI',
    'LocalAlloc',
    'VirtualProtect',
    'HeapFree',
    'FatalExit',
]

PATTERNS = {k: [re.compile(p) for p in v] for k, v in FOCUS_PATTERNS.items()}
CALL_RE = re.compile(
    r'(?P<calltype>Call|Tailcall)\s+'
    r'(?P<src_addr>0x[0-9a-fA-F]+)\s+'
    r'(?P<src_symbol>.+?)\s+->\s+'
    r'(?P<dst_addr>0x[0-9a-fA-F]+)\s+'
    r'(?P<dst_symbol>.+?)\s+\[T(?P<thread>\d+)\]'
)
ADDR_RE = re.compile(r'0x[0-9a-fA-F]+')
MEM_ADDR_RE = re.compile(r'\[(0x[0-9a-fA-F]+)\]')
LINE_PREFIX_ADDR_RE = re.compile(r'^(0x[0-9a-fA-F]+)')
FCN_RE = re.compile(r'^(?P<target_address>[0-9a-fA-F]+)\s+T\[(?P<thread>\d+)\]\s+(?P<raw_target>.+)$')


def sha256sum(path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, data: object) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def write_csv(path: Path, rows: List[Dict[str, object]], fieldnames: List[str]) -> None:
    ensure_dir(path.parent)
    with path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def matched_terms(text: str) -> List[str]:
    found = []
    for name, regexes in PATTERNS.items():
        if any(r.search(text) for r in regexes):
            found.append(name)
    return found


def choose_level(size_bytes: int) -> int:
    gb = 1024 ** 3
    mb = 1024 ** 2
    if size_bytes >= 2 * gb:
        return 3
    if size_bytes >= 512 * mb:
        return 5
    return 7


def compress_file(src: Path, dst_dir: Path) -> Dict[str, object]:
    ensure_dir(dst_dir)
    level = choose_level(src.stat().st_size)
    dst = dst_dir / f'{src.name}.gz'
    with src.open('rb') as fin, gzip.open(dst, 'wb', compresslevel=level) as fout:
        while True:
            block = fin.read(1024 * 1024)
            if not block:
                break
            fout.write(block)
    return {
        'source': str(src),
        'compressed': str(dst),
        'original_size': src.stat().st_size,
        'compressed_size': dst.stat().st_size,
        'compression_level': level,
        'source_sha256': sha256sum(src),
        'compressed_sha256': sha256sum(dst),
    }


def compress_all(cdf_dir: Path, output_dir: Path) -> Dict[str, object]:
    results = []
    for src in sorted(cdf_dir.glob('*.cdf')):
        results.append(compress_file(src, output_dir))
    return {
        'dataset_directory': str(cdf_dir),
        'file_count': len(results),
        'total_original_size': sum(x['original_size'] for x in results),
        'total_compressed_size': sum(x['compressed_size'] for x in results),
        'artifacts': results,
    }


def parse_function_interceptor(path: Path) -> Dict[str, object]:
    lines = path.read_text(encoding='cp1252', errors='ignore').splitlines()
    blocks: List[Dict[str, object]] = []
    current: Dict[str, object] | None = None
    for idx, line in enumerate(lines, start=1):
        if line.startswith('[+] '):
            if current:
                current['line_end'] = idx - 1
                current['matched_terms'] = matched_terms('\n'.join(current['content']))
                blocks.append(current)
            current = {
                'line_start': idx,
                'header': line.strip(),
                'content': [line.rstrip()],
            }
        elif current is not None:
            current['content'].append(line.rstrip())
    if current:
        current['line_end'] = len(lines)
        current['matched_terms'] = matched_terms('\n'.join(current['content']))
        blocks.append(current)

    focus_blocks = []
    for block in blocks:
        if not block['matched_terms']:
            continue
        joined = '\n'.join(block['content'])
        parsed = {
            'line_start': block['line_start'],
            'line_end': block['line_end'],
            'header': block['header'],
            'matched_terms': block['matched_terms'],
            'module_name': extract_first(joined, r'Nome do m[oó]dulo:\s*(.+)'),
            'thread': extract_first(joined, r'Thread:\s*(\d+)'),
            'call_id': extract_first(joined, r'Id de chamada:\s*(\d+)'),
            'caller_address': extract_first(joined, r'Endere[cç]o da fun[cç][aã]o chamante:\s*(0x[0-9a-fA-F]+)'),
            'content': joined,
        }
        focus_blocks.append(parsed)

    summary_counter = Counter()
    for block in focus_blocks:
        for term in block['matched_terms']:
            summary_counter[term] += 1

    return {
        'total_blocks': len(blocks),
        'focus_blocks': focus_blocks,
        'term_counts': dict(summary_counter),
    }


def extract_first(text: str, pattern: str) -> str:
    m = re.search(pattern, text, flags=re.IGNORECASE)
    return m.group(1).strip() if m else ''


def parse_tracefcncall(path: Path, method: str) -> Dict[str, object]:
    rows = []
    focus_rows = []
    symbol_counts = Counter()
    with path.open('r', encoding='utf-8', errors='ignore') as f:
        for idx, line in enumerate(f, start=1):
            line = line.rstrip('\n')
            m = FCN_RE.match(line)
            if not m:
                continue
            raw_target = m.group('raw_target')
            split_at = raw_target.rfind(':')
            if split_at == -1:
                module_path = ''
                symbol = raw_target
            else:
                module_path = raw_target[:split_at]
                symbol = raw_target[split_at + 1:]
            row = {
                'line_number': idx,
                'method': method,
                'target_address': '0x' + m.group('target_address').lower(),
                'thread': int(m.group('thread')),
                'module_path': module_path,
                'symbol': symbol,
            }
            row['matched_terms'] = matched_terms(row['symbol'])
            rows.append(row)
            symbol_counts[row['symbol']] += 1
            if row['matched_terms']:
                focus_rows.append(row)
    return {
        'rows': rows,
        'focus_rows': focus_rows,
        'symbol_counts_top20': symbol_counts.most_common(20),
    }


def scan_large_text(path: Path, chunk_size: int, context_before: int, context_after: int, collect_calls: bool = False) -> Dict[str, object]:
    total_lines = 0
    global_counts = Counter()
    chunk_summaries = []
    matches = []
    call_edges = []
    interesting_addresses = set()
    prev_lines: deque[Tuple[int, str]] = deque(maxlen=context_before)
    active_contexts: List[Dict[str, object]] = []
    chunk_counter = Counter()

    def flush_finished(line_number: int) -> None:
        remaining = []
        for ctx in active_contexts:
            if ctx['remaining_after'] <= 0:
                matches.append({
                    'trigger_line': ctx['trigger_line'],
                    'matched_terms': ctx['matched_terms'],
                    'context': ctx['lines'],
                })
            else:
                remaining.append(ctx)
        active_contexts[:] = remaining

    with path.open('r', encoding='utf-8', errors='ignore') as f:
        for idx, raw in enumerate(f, start=1):
            total_lines = idx
            line = raw.rstrip('\n')

            for ctx in active_contexts:
                if idx > ctx['trigger_line'] and ctx['remaining_after'] > 0:
                    ctx['lines'].append({'line_number': idx, 'text': line})
                    ctx['remaining_after'] -= 1
            flush_finished(idx)

            terms = matched_terms(line)
            if terms:
                for term in terms:
                    global_counts[term] += 1
                    chunk_counter[term] += 1
                ctx = {
                    'trigger_line': idx,
                    'matched_terms': terms,
                    'lines': [{'line_number': n, 'text': txt} for n, txt in prev_lines] + [{'line_number': idx, 'text': line}],
                    'remaining_after': context_after,
                }
                active_contexts.append(ctx)

            addr_m = LINE_PREFIX_ADDR_RE.match(line)
            if addr_m and terms:
                interesting_addresses.add(addr_m.group(1).lower())

            if collect_calls and ('Call ' in line or 'Tailcall ' in line):
                m = CALL_RE.search(line)
                if m:
                    target_terms = matched_terms(m.group('dst_symbol'))
                    source_terms = matched_terms(m.group('src_symbol'))
                    edge_terms = sorted(set(target_terms + source_terms))
                    if edge_terms:
                        edge = {
                            'line_number': idx,
                            'calltype': m.group('calltype'),
                            'src_addr': m.group('src_addr').lower(),
                            'src_symbol': m.group('src_symbol'),
                            'dst_addr': m.group('dst_addr').lower(),
                            'dst_symbol': m.group('dst_symbol'),
                            'thread': int(m.group('thread')),
                            'matched_terms': edge_terms,
                            'raw_line': line,
                        }
                        call_edges.append(edge)
                        interesting_addresses.add(edge['src_addr'])
                        interesting_addresses.add(edge['dst_addr'])

            if '-> "' in line and terms:
                for addr in MEM_ADDR_RE.findall(line):
                    interesting_addresses.add(addr.lower())

            prev_lines.append((idx, line))

            if idx % chunk_size == 0:
                chunk_summaries.append({
                    'chunk_index': len(chunk_summaries) + 1,
                    'start_line': idx - chunk_size + 1,
                    'end_line': idx,
                    'term_counts': dict(chunk_counter),
                })
                chunk_counter = Counter()

    for ctx in active_contexts:
        matches.append({
            'trigger_line': ctx['trigger_line'],
            'matched_terms': ctx['matched_terms'],
            'context': ctx['lines'],
        })
    if total_lines % chunk_size != 0:
        start_line = (len(chunk_summaries) * chunk_size) + 1
        chunk_summaries.append({
            'chunk_index': len(chunk_summaries) + 1,
            'start_line': start_line,
            'end_line': total_lines,
            'term_counts': dict(chunk_counter),
        })

    return {
        'total_lines': total_lines,
        'term_counts': dict(global_counts),
        'matches': matches,
        'chunk_summaries': chunk_summaries,
        'call_edges': call_edges,
        'interesting_addresses': sorted(interesting_addresses),
    }


def extract_disassembly_windows(path: Path, interesting_addresses: Iterable[str], window: int = 8) -> Dict[str, object]:
    lines = path.read_text(encoding='utf-8', errors='ignore').splitlines()
    addr_to_idx = {}
    for idx, line in enumerate(lines):
        m = LINE_PREFIX_ADDR_RE.match(line)
        if m:
            addr_to_idx[m.group(1).lower()] = idx
    windows = []
    for addr in sorted(set(a.lower() for a in interesting_addresses)):
        if addr not in addr_to_idx:
            continue
        idx = addr_to_idx[addr]
        start = max(0, idx - window)
        end = min(len(lines), idx + window + 1)
        windows.append({
            'address': addr,
            'start_line': start + 1,
            'end_line': end,
            'lines': [{'line_number': i + 1, 'text': lines[i]} for i in range(start, end)],
        })
    return {
        'total_lines': len(lines),
        'matched_windows': windows,
    }


def build_flow(function_interceptor: Dict[str, object], m1: Dict[str, object], m2: Dict[str, object], instr: Dict[str, object], memory: Dict[str, object], disasm: Dict[str, object]) -> Dict[str, object]:
    fi_blocks = function_interceptor['focus_blocks']
    edges = []
    nodes = []
    for term in FLOW_ORDER:
        counts = {
            'function_interceptor': function_interceptor['term_counts'].get(term, 0),
            'tracefcncall_m1': sum(1 for row in m1['focus_rows'] if term in row['matched_terms']),
            'tracefcncall_m2': sum(1 for row in m2['focus_rows'] if term in row['matched_terms']),
            'traceinstructions': instr['term_counts'].get(term, 0),
            'tracememory': memory['term_counts'].get(term, 0),
        }
        if not any(counts.values()):
            continue
        evidence = {
            'function_interceptor': next((b for b in fi_blocks if term in b['matched_terms']), None),
            'tracefcncall_m1': next((r for r in m1['focus_rows'] if term in r['matched_terms']), None),
            'tracefcncall_m2': next((r for r in m2['focus_rows'] if term in r['matched_terms']), None),
            'traceinstructions': next((m for m in instr['matches'] if term in m['matched_terms']), None),
            'tracememory': next((m for m in memory['matches'] if term in m['matched_terms']), None),
        }
        nodes.append({
            'id': term.lower().replace('queryperformancecounter', 'query_performance_counter').replace('checkremotedebuggerpresent', 'check_remote_debugger_present').replace('isdebuggerpresent', 'is_debugger_present').replace('zwqueryinformationprocess', 'zw_query_information_process').replace('zwsetinformationthread', 'zw_set_information_thread').replace('loadlibrarya', 'load_library_a').replace('locals', 'locals').replace('enumsystemfirmwaretables', 'enum_system_firmware_tables'),
            'label': term,
            'counts': counts,
            'evidence': evidence,
        })
    for idx in range(len(nodes) - 1):
        edges.append({
            'from': nodes[idx]['id'],
            'to': nodes[idx + 1]['id'],
            'relation': 'precede_no_fluxo_observado',
        })

    key_calls = [edge for edge in instr['call_edges'] if 'IsDebuggerPresent' in edge['matched_terms'] or 'CheckRemoteDebuggerPresent' in edge['matched_terms'] or 'ZwQueryInformationProcess' in edge['matched_terms'] or 'VirtualProtect' in edge['matched_terms'] or 'LocalAlloc' in edge['matched_terms']]
    return {
        'focus_function': 'IsDebuggerPresent',
        'sequence_terms': [n['label'] for n in nodes],
        'nodes': nodes,
        'edges': edges,
        'key_call_edges': key_calls,
        'disassembly_windows_count': len(disasm['matched_windows']),
    }


def build_mermaid(flow: Dict[str, object]) -> str:
    lines = ['flowchart TD']
    for node in flow['nodes']:
        counts = node['counts']
        label = f"{node['label']}\\nFI:{counts['function_interceptor']} M1:{counts['tracefcncall_m1']} M2:{counts['tracefcncall_m2']} TI:{counts['traceinstructions']} TM:{counts['tracememory']}"
        lines.append(f'    {node["id"]}["{label}"]')
    for edge in flow['edges']:
        lines.append(f'    {edge["from"]} -->|{edge["relation"]}| {edge["to"]}')
    return '\n'.join(lines) + '\n'


def main() -> None:
    parser = argparse.ArgumentParser(description='Processar CDFs reais e gerar artefatos derivados para acompanhamento e correlação.')
    parser.add_argument('--input-dir', required=True, help='Diretório contendo os .cdf')
    parser.add_argument('--output-dir', required=True, help='Diretório principal para saídas derivadas')
    parser.add_argument('--compress-output-dir', help='Diretório externo para os .gz completos dos CDFs')
    parser.add_argument('--chunk-size', type=int, default=250000, help='Linhas por chunk nos traces grandes')
    parser.add_argument('--context-before', type=int, default=2)
    parser.add_argument('--context-after', type=int, default=2)
    parser.add_argument('--skip-compression', action='store_true')
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    derived_dir = output_dir / 'derived'
    filtered_dir = output_dir / 'filtered'
    correlation_dir = output_dir / 'correlation'
    manifests_dir = output_dir / 'manifests'
    figures_dir = output_dir / 'figures'
    for d in [derived_dir, filtered_dir, correlation_dir, manifests_dir, figures_dir]:
        ensure_dir(d)

    dataset_manifest = []
    for p in sorted(input_dir.glob('*.cdf')):
        dataset_manifest.append({
            'file': p.name,
            'path': str(p),
            'size_bytes': p.stat().st_size,
            'sha256': sha256sum(p),
        })
    write_json(manifests_dir / 'dataset_manifest.json', dataset_manifest)

    function_interceptor = parse_function_interceptor(input_dir / 'contradef.2956.FunctionInterceptor.cdf')
    write_json(derived_dir / 'function_interceptor_focus.json', function_interceptor)
    write_csv(
        derived_dir / 'function_interceptor_focus.csv',
        [
            {
                'line_start': b['line_start'],
                'line_end': b['line_end'],
                'header': b['header'],
                'matched_terms': '|'.join(b['matched_terms']),
                'module_name': b['module_name'],
                'thread': b['thread'],
                'call_id': b['call_id'],
                'caller_address': b['caller_address'],
            }
            for b in function_interceptor['focus_blocks']
        ],
        ['line_start', 'line_end', 'header', 'matched_terms', 'module_name', 'thread', 'call_id', 'caller_address']
    )

    m1 = parse_tracefcncall(input_dir / 'contradef.2956.TraceFcnCall.M1.cdf', 'M1')
    m2 = parse_tracefcncall(input_dir / 'contradef.2956.TraceFcnCall.M2.cdf', 'M2')
    write_json(derived_dir / 'tracefcncall_m1.json', m1)
    write_json(derived_dir / 'tracefcncall_m2.json', m2)
    write_csv(derived_dir / 'tracefcncall_m1_focus.csv', m1['focus_rows'], ['line_number', 'method', 'target_address', 'thread', 'module_path', 'symbol', 'matched_terms'])
    write_csv(derived_dir / 'tracefcncall_m2_focus.csv', m2['focus_rows'], ['line_number', 'method', 'target_address', 'thread', 'module_path', 'symbol', 'matched_terms'])

    instr = scan_large_text(input_dir / 'contradef.2956.TraceInstructions.cdf', args.chunk_size, args.context_before, args.context_after, collect_calls=True)
    memory = scan_large_text(input_dir / 'contradef.2956.TraceMemory.cdf', args.chunk_size, args.context_before, args.context_after, collect_calls=False)
    write_json(filtered_dir / 'traceinstructions_focus_matches.json', {'matches': instr['matches'], 'call_edges': instr['call_edges']})
    write_json(filtered_dir / 'tracememory_focus_matches.json', {'matches': memory['matches']})
    write_json(derived_dir / 'traceinstructions_chunk_summary.json', {'total_lines': instr['total_lines'], 'term_counts': instr['term_counts'], 'chunks': instr['chunk_summaries']})
    write_json(derived_dir / 'tracememory_chunk_summary.json', {'total_lines': memory['total_lines'], 'term_counts': memory['term_counts'], 'chunks': memory['chunk_summaries']})

    interesting_addresses = set(instr['interesting_addresses'])
    for block in function_interceptor['focus_blocks']:
        if block['caller_address']:
            interesting_addresses.add(block['caller_address'].lower())
    disasm = extract_disassembly_windows(input_dir / 'contradef.2956.TraceDisassembly.cdf', interesting_addresses)
    write_json(filtered_dir / 'tracedisassembly_windows.json', disasm)

    flow = build_flow(function_interceptor, m1, m2, instr, memory, disasm)
    write_json(correlation_dir / 'isdebuggerpresent_flow_real.json', flow)
    (figures_dir / 'isdebuggerpresent_flow_real.mmd').write_text(build_mermaid(flow), encoding='utf-8')

    compression_manifest = None
    if not args.skip_compression and args.compress_output_dir:
        compression_manifest = compress_all(input_dir, Path(args.compress_output_dir))
        write_json(manifests_dir / 'compression_manifest.json', compression_manifest)

    summary = {
        'dataset_manifest': str(manifests_dir / 'dataset_manifest.json'),
        'function_interceptor_focus': str(derived_dir / 'function_interceptor_focus.json'),
        'tracefcncall_m1_focus_csv': str(derived_dir / 'tracefcncall_m1_focus.csv'),
        'tracefcncall_m2_focus_csv': str(derived_dir / 'tracefcncall_m2_focus.csv'),
        'traceinstructions_focus_matches': str(filtered_dir / 'traceinstructions_focus_matches.json'),
        'tracememory_focus_matches': str(filtered_dir / 'tracememory_focus_matches.json'),
        'traceinstructions_chunk_summary': str(derived_dir / 'traceinstructions_chunk_summary.json'),
        'tracememory_chunk_summary': str(derived_dir / 'tracememory_chunk_summary.json'),
        'tracedisassembly_windows': str(filtered_dir / 'tracedisassembly_windows.json'),
        'correlation_json': str(correlation_dir / 'isdebuggerpresent_flow_real.json'),
        'mermaid_file': str(figures_dir / 'isdebuggerpresent_flow_real.mmd'),
        'compression_manifest': str(manifests_dir / 'compression_manifest.json') if compression_manifest else None,
    }
    write_json(output_dir / 'run_summary.json', summary)
    print(output_dir / 'run_summary.json')


if __name__ == '__main__':
    main()
