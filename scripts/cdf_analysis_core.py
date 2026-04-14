#!/usr/bin/env python3
from __future__ import annotations

import csv
import gzip
import hashlib
import json
import re
import shutil
import subprocess
import time
from collections import Counter, defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Deque, Dict, Iterable, Iterator, List, Optional, Tuple

FILE_TYPE_RULES: List[Tuple[str, List[str]]] = [
    ('function_interceptor', [r'functioninterceptor']),
    ('trace_fcn_call_m1', [r'tracefcncall\.m1']),
    ('trace_fcn_call_m2', [r'tracefcncall\.m2']),
    ('trace_fcn_call', [r'tracefcncall']),
    ('trace_instructions', [r'traceinstructions']),
    ('trace_memory', [r'tracememory']),
    ('trace_disassembly', [r'tracedisassembly']),
]
TEXT_SUFFIXES = {'.cdf', '.txt', '.log', '.csv', '.trace'}
CALL_RE = re.compile(
    r'(?P<calltype>Call|Tailcall)\s+'
    r'(?P<src_addr>0x[0-9a-fA-F]+)\s+'
    r'(?P<src_symbol>.+?)\s+->\s+'
    r'(?P<dst_addr>0x[0-9a-fA-F]+)\s+'
    r'(?P<dst_symbol>.+?)\s+\[T(?P<thread>\d+)\]'
)
LINE_PREFIX_ADDR_RE = re.compile(r'^(0x[0-9a-fA-F]+)')
MEM_ADDR_RE = re.compile(r'\[(0x[0-9a-fA-F]+)\]')
FCN_RE = re.compile(r'^(?P<target_address>[0-9a-fA-F]+)\s+T\[(?P<thread>\d+)\]\s+(?P<raw_target>.+)$')


@dataclass
class FocusMatcher:
    label: str
    pattern: str
    is_regex: bool
    compiled: re.Pattern[str]


class JobTracker:
    def __init__(self, job_dir: Path):
        self.job_dir = job_dir
        self.status_path = job_dir / 'status.json'
        self.events_path = job_dir / 'events.jsonl'
        ensure_dir(job_dir)
        if not self.status_path.exists():
            self.update_status(state='created', progress=0.0, stage='created', message='Job criado.')

    def update_status(self, **fields: Any) -> Dict[str, Any]:
        status: Dict[str, Any] = {}
        if self.status_path.exists():
            try:
                status = json.loads(self.status_path.read_text(encoding='utf-8'))
            except Exception:
                status = {}
        status.update(fields)
        status['updated_at'] = utc_now()
        self.status_path.write_text(json.dumps(status, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        return status

    def emit_event(self, stage: str, message: str, level: str = 'info', details: Optional[Dict[str, Any]] = None) -> None:
        event = {
            'timestamp': utc_now(),
            'level': level,
            'stage': stage,
            'message': message,
            'details': details or {},
        }
        with self.events_path.open('a', encoding='utf-8') as f:
            f.write(json.dumps(event, ensure_ascii=False) + '\n')


def utc_now() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path: Path, data: Any) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def write_csv(path: Path, rows: List[Dict[str, Any]], fieldnames: List[str]) -> None:
    ensure_dir(path.parent)
    with path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def append_jsonl(path: Path, item: Dict[str, Any]) -> None:
    ensure_dir(path.parent)
    with path.open('a', encoding='utf-8') as f:
        f.write(json.dumps(item, ensure_ascii=False) + '\n')


def sha256sum(path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def choose_level(size_bytes: int) -> int:
    gb = 1024 ** 3
    mb = 1024 ** 2
    if size_bytes >= 2 * gb:
        return 3
    if size_bytes >= 512 * mb:
        return 5
    return 7


def compress_file(src: Path, dst_dir: Path) -> Dict[str, Any]:
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


def compress_all(files: List[Path], output_dir: Path, tracker: Optional[JobTracker] = None) -> Dict[str, Any]:
    artifacts = []
    for idx, src in enumerate(files, start=1):
        if tracker:
            tracker.emit_event('compression', f'Comprimindo arquivo {idx}/{len(files)}.', details={'file': str(src)})
        artifacts.append(compress_file(src, output_dir))
    return {
        'file_count': len(artifacts),
        'total_original_size': sum(x['original_size'] for x in artifacts),
        'total_compressed_size': sum(x['compressed_size'] for x in artifacts),
        'artifacts': artifacts,
    }


def extract_archive(archive_path: Path, extract_dir: Path) -> Dict[str, Any]:
    ensure_dir(extract_dir)
    if shutil.which('7z') is None:
        raise RuntimeError('O executável 7z não está disponível no ambiente.')
    command = ['7z', 'x', '-y', str(archive_path), f'-o{extract_dir}']
    proc = subprocess.run(command, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f'Falha na extração do pacote: {proc.stderr or proc.stdout}')
    extracted_files = sorted([str(p) for p in extract_dir.rglob('*') if p.is_file()])
    return {
        'archive': str(archive_path),
        'extract_dir': str(extract_dir),
        'file_count': len(extracted_files),
        'files': extracted_files,
        'stdout_tail': '\n'.join((proc.stdout or '').splitlines()[-20:]),
    }


def looks_textual(path: Path, sample_size: int = 4096) -> bool:
    try:
        data = path.read_bytes()[:sample_size]
    except Exception:
        return False
    if not data:
        return True
    if b'\x00' in data:
        return False
    return True


def classify_file(path: Path) -> str:
    name = path.name.lower()
    for file_type, patterns in FILE_TYPE_RULES:
        if any(re.search(pattern, name) for pattern in patterns):
            return file_type
    if path.suffix.lower() in TEXT_SUFFIXES and looks_textual(path):
        return 'unknown_text_trace'
    return 'other'


def discover_files(root: Path) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    for path in sorted([p for p in root.rglob('*') if p.is_file()]):
        file_type = classify_file(path)
        records.append({
            'name': path.name,
            'path': str(path),
            'relative_path': str(path.relative_to(root)),
            'size_bytes': path.stat().st_size,
            'sha256': sha256sum(path),
            'file_type': file_type,
        })
    return records


def compile_focus_matchers(focus_terms: Optional[List[str]] = None, focus_regexes: Optional[List[str]] = None) -> List[FocusMatcher]:
    matchers: List[FocusMatcher] = []
    for term in focus_terms or []:
        cleaned = term.strip()
        if not cleaned:
            continue
        matchers.append(FocusMatcher(label=cleaned, pattern=re.escape(cleaned), is_regex=False, compiled=re.compile(re.escape(cleaned), re.IGNORECASE)))
    for expr in focus_regexes or []:
        cleaned = expr.strip()
        if not cleaned:
            continue
        matchers.append(FocusMatcher(label=cleaned, pattern=cleaned, is_regex=True, compiled=re.compile(cleaned, re.IGNORECASE)))
    return matchers


def matched_focus(text: str, matchers: List[FocusMatcher]) -> List[str]:
    found: List[str] = []
    for matcher in matchers:
        if matcher.compiled.search(text):
            found.append(matcher.label)
    return found


def normalize_symbol(text: str) -> str:
    cleaned = text.strip()
    if not cleaned:
        return cleaned
    if '->' in cleaned:
        cleaned = cleaned.split('->', 1)[-1].strip()
    if ':' in cleaned:
        cleaned = cleaned.rsplit(':', 1)[-1].strip()
    if '!' in cleaned:
        cleaned = cleaned.rsplit('!', 1)[-1].strip()
    cleaned = cleaned.split('(', 1)[0].strip()
    cleaned = re.sub(r'\+0x[0-9a-fA-F]+', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned.strip()


def scan_context_terms(texts: Iterable[str], matchers: List[FocusMatcher]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for text in texts:
        for label in matched_focus(text, matchers):
            counter[label] += 1
    return counter


def extract_first(text: str, pattern: str) -> str:
    m = re.search(pattern, text, flags=re.IGNORECASE)
    return m.group(1).strip() if m else ''


def parse_function_interceptor(path: Path, matchers: List[FocusMatcher]) -> Dict[str, Any]:
    lines = path.read_text(encoding='cp1252', errors='ignore').splitlines()
    blocks: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    for idx, line in enumerate(lines, start=1):
        if line.startswith('[+] '):
            if current:
                current['line_end'] = idx - 1
                current['matched_terms'] = matched_focus('\n'.join(current['content']), matchers)
                blocks.append(current)
            current = {'line_start': idx, 'header': line.strip(), 'content': [line.rstrip()]}
        elif current is not None:
            current['content'].append(line.rstrip())
    if current:
        current['line_end'] = len(lines)
        current['matched_terms'] = matched_focus('\n'.join(current['content']), matchers)
        blocks.append(current)

    focus_blocks: List[Dict[str, Any]] = []
    term_counts: Counter[str] = Counter()
    for block in blocks:
        if not block['matched_terms']:
            continue
        joined = '\n'.join(block['content'])
        parsed = {
            'file': str(path),
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
        for term in parsed['matched_terms']:
            term_counts[term] += 1
        focus_blocks.append(parsed)
    return {
        'file': str(path),
        'total_blocks': len(blocks),
        'focus_blocks': focus_blocks,
        'term_counts': dict(term_counts),
    }


def parse_tracefcncall(path: Path, method_hint: str, matchers: List[FocusMatcher]) -> Dict[str, Any]:
    focus_rows: List[Dict[str, Any]] = []
    symbol_counts: Counter[str] = Counter()
    total_rows = 0
    with path.open('r', encoding='utf-8', errors='ignore') as f:
        for idx, line in enumerate(f, start=1):
            line = line.rstrip('\n')
            m = FCN_RE.match(line)
            if not m:
                continue
            total_rows += 1
            raw_target = m.group('raw_target')
            split_at = raw_target.rfind(':')
            if split_at == -1:
                module_path = ''
                symbol = raw_target
            else:
                module_path = raw_target[:split_at]
                symbol = raw_target[split_at + 1:]
            display_symbol = normalize_symbol(symbol)
            row = {
                'file': str(path),
                'line_number': idx,
                'method': method_hint,
                'target_address': '0x' + m.group('target_address').lower(),
                'thread': int(m.group('thread')),
                'module_path': module_path,
                'symbol': symbol,
                'display_symbol': display_symbol,
            }
            row['matched_terms'] = matched_focus(' '.join([row['symbol'], row['module_path'], row['display_symbol']]), matchers)
            symbol_counts[display_symbol] += 1
            if row['matched_terms']:
                focus_rows.append(row)
    return {
        'file': str(path),
        'method': method_hint,
        'total_rows': total_rows,
        'focus_rows': focus_rows,
        'symbol_counts_top20': symbol_counts.most_common(20),
    }


def scan_large_text(path: Path, file_type: str, matchers: List[FocusMatcher], chunk_size: int, context_before: int, context_after: int, collect_calls: bool = False) -> Dict[str, Any]:
    total_lines = 0
    global_counts: Counter[str] = Counter()
    chunk_counter: Counter[str] = Counter()
    chunk_summaries: List[Dict[str, Any]] = []
    matches: List[Dict[str, Any]] = []
    call_edges: List[Dict[str, Any]] = []
    interesting_addresses = set()
    prev_lines: Deque[Tuple[int, str]] = deque(maxlen=context_before)
    active_contexts: List[Dict[str, Any]] = []

    def flush_finished() -> None:
        remaining = []
        for ctx in active_contexts:
            if ctx['remaining_after'] <= 0:
                matches.append({'trigger_line': ctx['trigger_line'], 'matched_terms': ctx['matched_terms'], 'context': ctx['lines']})
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
            flush_finished()

            terms = matched_focus(line, matchers)
            if terms:
                for term in terms:
                    global_counts[term] += 1
                    chunk_counter[term] += 1
                active_contexts.append({
                    'trigger_line': idx,
                    'matched_terms': terms,
                    'lines': [{'line_number': n, 'text': txt} for n, txt in prev_lines] + [{'line_number': idx, 'text': line}],
                    'remaining_after': context_after,
                })

            addr_m = LINE_PREFIX_ADDR_RE.match(line)
            if addr_m and terms:
                interesting_addresses.add(addr_m.group(1).lower())

            if collect_calls and ('Call ' in line or 'Tailcall ' in line):
                m = CALL_RE.search(line)
                if m:
                    src_text = m.group('src_symbol')
                    dst_text = m.group('dst_symbol')
                    src_matches = matched_focus(src_text, matchers)
                    dst_matches = matched_focus(dst_text, matchers)
                    if src_matches or dst_matches:
                        edge = {
                            'file': str(path),
                            'file_type': file_type,
                            'line_number': idx,
                            'calltype': m.group('calltype'),
                            'src_addr': m.group('src_addr').lower(),
                            'src_symbol': src_text,
                            'src_display': normalize_symbol(src_text),
                            'dst_addr': m.group('dst_addr').lower(),
                            'dst_symbol': dst_text,
                            'dst_display': normalize_symbol(dst_text),
                            'thread': int(m.group('thread')),
                            'src_matches': src_matches,
                            'dst_matches': dst_matches,
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
        matches.append({'trigger_line': ctx['trigger_line'], 'matched_terms': ctx['matched_terms'], 'context': ctx['lines']})
    if total_lines % chunk_size != 0:
        start_line = (len(chunk_summaries) * chunk_size) + 1
        chunk_summaries.append({
            'chunk_index': len(chunk_summaries) + 1,
            'start_line': start_line,
            'end_line': total_lines,
            'term_counts': dict(chunk_counter),
        })
    return {
        'file': str(path),
        'file_type': file_type,
        'total_lines': total_lines,
        'term_counts': dict(global_counts),
        'matches': matches,
        'chunk_summaries': chunk_summaries,
        'call_edges': call_edges,
        'interesting_addresses': sorted(interesting_addresses),
    }


def extract_disassembly_windows(path: Path, interesting_addresses: Iterable[str], window: int = 8) -> Dict[str, Any]:
    lines = path.read_text(encoding='utf-8', errors='ignore').splitlines()
    addr_to_idx: Dict[str, int] = {}
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
            'file': str(path),
            'address': addr,
            'start_line': start + 1,
            'end_line': end,
            'lines': [{'line_number': i + 1, 'text': lines[i]} for i in range(start, end)],
        })
    return {'file': str(path), 'total_lines': len(lines), 'matched_windows': windows}


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    text = re.sub(r'_+', '_', text)
    return text.strip('_') or 'item'


def summarize_term_counts(results: Iterable[Dict[str, Any]]) -> Dict[str, int]:
    counter: Counter[str] = Counter()
    for result in results:
        for key, value in result.get('term_counts', {}).items():
            counter[key] += int(value)
    return dict(counter)


def build_generic_correlation(
    focus_labels: List[str],
    function_interceptors: List[Dict[str, Any]],
    tracefcn_results: List[Dict[str, Any]],
    scan_results: List[Dict[str, Any]],
    disassembly_results: List[Dict[str, Any]],
) -> Dict[str, Any]:
    node_map: Dict[str, Dict[str, Any]] = {}
    edge_map: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

    def ensure_node(label: str, is_focus: bool = False) -> Dict[str, Any]:
        key = slugify(label)
        if key not in node_map:
            node_map[key] = {
                'id': key,
                'label': label,
                'is_focus': is_focus,
                'counts': {
                    'function_interceptor': 0,
                    'trace_fcn_call': 0,
                    'trace_textual': 0,
                },
                'files': set(),
                'threads': set(),
                'matched_queries': set(),
                'sample_evidence': [],
            }
        if is_focus:
            node_map[key]['is_focus'] = True
        return node_map[key]

    def append_evidence(node: Dict[str, Any], source_type: str, file: str, thread: Any, query_labels: List[str], sample: str) -> None:
        node['counts'][source_type] += 1
        if file:
            node['files'].add(file)
        if thread not in ('', None):
            node['threads'].add(str(thread))
        for label in query_labels:
            node['matched_queries'].add(label)
        if sample and len(node['sample_evidence']) < 5:
            node['sample_evidence'].append(sample[:240])

    def add_edge(src_label: str, dst_label: str, relation: str, file: str, thread: Any, evidence_line: str, matched_queries: List[str]) -> None:
        src = ensure_node(src_label, is_focus=src_label in focus_labels)
        dst = ensure_node(dst_label, is_focus=dst_label in focus_labels)
        key = (src['id'], dst['id'], relation)
        if key not in edge_map:
            edge_map[key] = {
                'from': src['id'],
                'to': dst['id'],
                'from_label': src_label,
                'to_label': dst_label,
                'relation': relation,
                'count': 0,
                'files': set(),
                'threads': set(),
                'matched_queries': set(),
                'samples': [],
                'confidence': 0.0,
            }
        edge = edge_map[key]
        edge['count'] += 1
        if file:
            edge['files'].add(file)
        if thread not in ('', None):
            edge['threads'].add(str(thread))
        for label in matched_queries:
            edge['matched_queries'].add(label)
        if evidence_line and len(edge['samples']) < 5:
            edge['samples'].append(evidence_line[:240])

    for label in focus_labels:
        ensure_node(label, is_focus=True)

    for result in function_interceptors:
        for block in result.get('focus_blocks', []):
            for label in block.get('matched_terms', []):
                node = ensure_node(label, is_focus=label in focus_labels)
                append_evidence(node, 'function_interceptor', block.get('file', ''), block.get('thread', ''), block.get('matched_terms', []), block.get('header', ''))
            matched = block.get('matched_terms', [])
            if len(matched) > 1:
                for idx in range(len(matched) - 1):
                    add_edge(matched[idx], matched[idx + 1], 'cooccurrence_function_interceptor', block.get('file', ''), block.get('thread', ''), block.get('header', ''), matched)

    for result in tracefcn_results:
        for row in result.get('focus_rows', []):
            for label in row.get('matched_terms', []):
                node = ensure_node(label, is_focus=label in focus_labels)
                append_evidence(node, 'trace_fcn_call', row.get('file', ''), row.get('thread', ''), row.get('matched_terms', []), row.get('display_symbol', ''))

    for result in scan_results:
        for label, count in result.get('term_counts', {}).items():
            node = ensure_node(label, is_focus=label in focus_labels)
            node['counts']['trace_textual'] += int(count)
            node['files'].add(result.get('file', ''))
            node['matched_queries'].add(label)
        for match in result.get('matches', []):
            matched = match.get('matched_terms', [])
            if len(matched) > 1:
                center = ' | '.join(x.get('text', '') for x in match.get('context', [])[:2])
                for idx in range(len(matched) - 1):
                    add_edge(matched[idx], matched[idx + 1], 'cooccurrence_context', result.get('file', ''), '', center, matched)
        for edge in result.get('call_edges', []):
            matched_queries = sorted(set(edge.get('src_matches', []) + edge.get('dst_matches', [])))
            add_edge(edge['src_display'], edge['dst_display'], 'direct_call', edge.get('file', ''), edge.get('thread', ''), edge.get('raw_line', ''), matched_queries)
            if edge.get('src_matches'):
                src_node = ensure_node(edge['src_display'], is_focus=edge['src_display'] in focus_labels)
                append_evidence(src_node, 'trace_textual', edge.get('file', ''), edge.get('thread', ''), edge.get('src_matches', []), edge.get('raw_line', ''))
            if edge.get('dst_matches'):
                dst_node = ensure_node(edge['dst_display'], is_focus=edge['dst_display'] in focus_labels)
                append_evidence(dst_node, 'trace_textual', edge.get('file', ''), edge.get('thread', ''), edge.get('dst_matches', []), edge.get('raw_line', ''))

    disassembly_window_count = sum(len(item.get('matched_windows', [])) for item in disassembly_results)

    nodes = []
    for node in node_map.values():
        node['files'] = sorted(x for x in node['files'] if x)
        node['threads'] = sorted(node['threads'])
        node['matched_queries'] = sorted(node['matched_queries'])
        nodes.append(node)
    nodes.sort(key=lambda x: (not x['is_focus'], x['label'].lower()))

    edges = []
    for edge in edge_map.values():
        distinct_files = len(edge['files'])
        distinct_threads = len(edge['threads'])
        confidence = min(0.99, 0.30 + (0.15 * min(edge['count'], 4)) + (0.10 if distinct_files > 1 else 0.0) + (0.05 if distinct_threads > 0 else 0.0))
        edge['confidence'] = round(confidence, 2)
        edge['files'] = sorted(x for x in edge['files'] if x)
        edge['threads'] = sorted(edge['threads'])
        edge['matched_queries'] = sorted(edge['matched_queries'])
        edges.append(edge)
    edges.sort(key=lambda x: (-x['count'], x['relation'], x['from_label'], x['to_label']))

    return {
        'focus_queries': focus_labels,
        'node_count': len(nodes),
        'edge_count': len(edges),
        'nodes': nodes,
        'edges': edges,
        'support': {
            'function_interceptor_term_counts': summarize_term_counts(function_interceptors),
            'tracefcn_term_counts': summarize_term_counts(tracefcn_results),
            'text_trace_term_counts': summarize_term_counts(scan_results),
            'disassembly_windows_count': disassembly_window_count,
        },
    }


def build_mermaid(flow: Dict[str, Any]) -> str:
    lines = ['flowchart TD']
    for node in flow.get('nodes', []):
        counts = node.get('counts', {})
        label = f"{node['label']}\\nFI:{counts.get('function_interceptor', 0)} FC:{counts.get('trace_fcn_call', 0)} TXT:{counts.get('trace_textual', 0)}"
        border = ':::focus' if node.get('is_focus') else ''
        lines.append(f'    {node["id"]}["{label}"]{border}')
    for edge in flow.get('edges', [])[:200]:
        relation = edge.get('relation', 'relation')
        lines.append(f'    {edge["from"]} -->|{relation} ({edge.get("count", 0)})| {edge["to"]}')
    lines.append('    classDef focus fill:#ffe8a3,stroke:#8a6d1d,stroke-width:2px;')
    return '\n'.join(lines) + '\n'


def collect_paths(discovered_files: List[Dict[str, Any]], file_type: str) -> List[Path]:
    return [Path(item['path']) for item in discovered_files if item['file_type'] == file_type]


def analyze_bundle(
    *,
    job_dir: Path,
    focus_terms: Optional[List[str]] = None,
    focus_regexes: Optional[List[str]] = None,
    archive_path: Optional[Path] = None,
    input_dir: Optional[Path] = None,
    chunk_size: int = 250000,
    context_before: int = 2,
    context_after: int = 2,
    compress_full_files: bool = True,
) -> Dict[str, Any]:
    tracker = JobTracker(job_dir)
    input_root = job_dir / 'input'
    extracted_root = job_dir / 'extracted'
    output_root = job_dir / 'output'
    manifests_dir = output_root / 'manifests'
    derived_dir = output_root / 'derived'
    filtered_dir = output_root / 'filtered'
    correlation_dir = output_root / 'correlation'
    figures_dir = output_root / 'figures'
    partial_dir = output_root / 'partial'
    compressed_dir = job_dir / 'compressed_full'
    for directory in [input_root, extracted_root, manifests_dir, derived_dir, filtered_dir, correlation_dir, figures_dir, partial_dir]:
        ensure_dir(directory)

    tracker.update_status(state='running', progress=0.02, stage='initializing', message='Inicializando análise genérica.')
    tracker.emit_event('initializing', 'Inicialização do job concluída.', details={'job_dir': str(job_dir)})

    if not focus_terms and not focus_regexes:
        raise ValueError('É necessário informar ao menos uma função alvo em --focus ou --focus-regex.')
    focus_matchers = compile_focus_matchers(focus_terms, focus_regexes)
    write_json(manifests_dir / 'focus_config.json', {
        'focus_terms': focus_terms or [],
        'focus_regexes': focus_regexes or [],
        'compiled_labels': [m.label for m in focus_matchers],
    })

    if archive_path:
        copied_archive = input_root / archive_path.name
        if archive_path.resolve() != copied_archive.resolve():
            shutil.copy2(archive_path, copied_archive)
        tracker.update_status(progress=0.08, stage='extracting_archive', message='Extraindo pacote 7z submetido.')
        tracker.emit_event('extracting_archive', 'Iniciando extração do pacote.', details={'archive': str(copied_archive)})
        extraction = extract_archive(copied_archive, extracted_root)
        write_json(manifests_dir / 'archive_extraction.json', extraction)
        scan_root = extracted_root
    elif input_dir:
        scan_root = input_dir
    else:
        raise ValueError('Informe archive_path ou input_dir.')

    tracker.update_status(progress=0.14, stage='discovering_files', message='Descobrindo e classificando arquivos da amostra.')
    discovered_files = discover_files(scan_root)
    write_json(manifests_dir / 'dataset_manifest.json', discovered_files)
    tracker.emit_event('discovering_files', 'Arquivos classificados.', details={'count': len(discovered_files)})

    relevant_files = [Path(item['path']) for item in discovered_files if item['file_type'] != 'other']
    if compress_full_files and relevant_files:
        tracker.update_status(progress=0.20, stage='compressing', message='Executando compressão adaptativa dos arquivos textuais relevantes.')
        compression_manifest = compress_all(relevant_files, compressed_dir, tracker=tracker)
        write_json(manifests_dir / 'compression_manifest.json', compression_manifest)
    else:
        compression_manifest = None

    fi_paths = collect_paths(discovered_files, 'function_interceptor')
    fcn_paths = collect_paths(discovered_files, 'trace_fcn_call_m1') + collect_paths(discovered_files, 'trace_fcn_call_m2') + collect_paths(discovered_files, 'trace_fcn_call')
    instruction_paths = collect_paths(discovered_files, 'trace_instructions')
    memory_paths = collect_paths(discovered_files, 'trace_memory')
    disassembly_paths = collect_paths(discovered_files, 'trace_disassembly')
    unknown_text_paths = collect_paths(discovered_files, 'unknown_text_trace')

    function_interceptors = []
    for idx, path in enumerate(fi_paths, start=1):
        tracker.update_status(progress=0.28, stage='parsing_function_interceptor', message=f'Processando FunctionInterceptor {idx}/{len(fi_paths)}.')
        tracker.emit_event('parsing_function_interceptor', 'Processando arquivo FunctionInterceptor.', details={'file': str(path)})
        parsed = parse_function_interceptor(path, focus_matchers)
        function_interceptors.append(parsed)
        write_json(partial_dir / f'{slugify(path.name)}_function_interceptor.json', parsed)

    tracefcn_results = []
    for idx, path in enumerate(fcn_paths, start=1):
        tracker.update_status(progress=0.38, stage='parsing_tracefcncall', message=f'Processando TraceFcnCall {idx}/{len(fcn_paths)}.')
        tracker.emit_event('parsing_tracefcncall', 'Processando arquivo TraceFcnCall.', details={'file': str(path)})
        method_hint = 'generic'
        lower_name = path.name.lower()
        if '.m1' in lower_name:
            method_hint = 'M1'
        elif '.m2' in lower_name:
            method_hint = 'M2'
        parsed = parse_tracefcncall(path, method_hint, focus_matchers)
        tracefcn_results.append(parsed)
        write_json(partial_dir / f'{slugify(path.name)}_tracefcncall.json', parsed)

    scan_results = []
    scan_targets: List[Tuple[Path, str, bool]] = []
    scan_targets.extend((path, 'trace_instructions', True) for path in instruction_paths)
    scan_targets.extend((path, 'trace_memory', False) for path in memory_paths)
    scan_targets.extend((path, 'unknown_text_trace', False) for path in unknown_text_paths)
    interesting_addresses = set()
    for idx, (path, file_type, collect_calls) in enumerate(scan_targets, start=1):
        tracker.update_status(progress=0.55 + (0.20 * idx / max(len(scan_targets), 1)), stage='scanning_large_traces', message=f'Escaneando {path.name} ({idx}/{len(scan_targets)}).')
        tracker.emit_event('scanning_large_traces', 'Escaneando trace textual.', details={'file': str(path), 'file_type': file_type})
        scanned = scan_large_text(path, file_type, focus_matchers, chunk_size, context_before, context_after, collect_calls=collect_calls)
        scan_results.append(scanned)
        write_json(partial_dir / f'{slugify(path.name)}_scan.json', scanned)
        interesting_addresses.update(scanned.get('interesting_addresses', []))

    for result in function_interceptors:
        for block in result.get('focus_blocks', []):
            if block.get('caller_address'):
                interesting_addresses.add(str(block['caller_address']).lower())
    for result in tracefcn_results:
        for row in result.get('focus_rows', []):
            interesting_addresses.add(row.get('target_address', '').lower())

    disassembly_results = []
    for idx, path in enumerate(disassembly_paths, start=1):
        tracker.update_status(progress=0.82, stage='extracting_disassembly_windows', message=f'Extraindo janelas do disassembly {idx}/{len(disassembly_paths)}.')
        tracker.emit_event('extracting_disassembly_windows', 'Extraindo janelas do disassembly.', details={'file': str(path)})
        extracted = extract_disassembly_windows(path, interesting_addresses)
        disassembly_results.append(extracted)
        write_json(partial_dir / f'{slugify(path.name)}_disassembly_windows.json', extracted)

    flow = build_generic_correlation(
        [m.label for m in focus_matchers],
        function_interceptors,
        tracefcn_results,
        scan_results,
        disassembly_results,
    )
    write_json(correlation_dir / 'generic_focus_correlation.json', flow)
    (figures_dir / 'generic_focus_correlation.mmd').write_text(build_mermaid(flow), encoding='utf-8')

    function_interceptor_focus_rows: List[Dict[str, Any]] = []
    for result in function_interceptors:
        function_interceptor_focus_rows.extend([
            {
                'file': block['file'],
                'line_start': block['line_start'],
                'line_end': block['line_end'],
                'header': block['header'],
                'matched_terms': '|'.join(block['matched_terms']),
                'module_name': block['module_name'],
                'thread': block['thread'],
                'call_id': block['call_id'],
                'caller_address': block['caller_address'],
            }
            for block in result.get('focus_blocks', [])
        ])
    write_json(derived_dir / 'function_interceptor_focus.json', function_interceptors)
    write_csv(derived_dir / 'function_interceptor_focus.csv', function_interceptor_focus_rows, ['file', 'line_start', 'line_end', 'header', 'matched_terms', 'module_name', 'thread', 'call_id', 'caller_address'])

    tracefcn_focus_rows: List[Dict[str, Any]] = []
    for result in tracefcn_results:
        tracefcn_focus_rows.extend(result.get('focus_rows', []))
    write_json(derived_dir / 'tracefcn_focus.json', tracefcn_results)
    write_csv(derived_dir / 'tracefcn_focus.csv', tracefcn_focus_rows, ['file', 'line_number', 'method', 'target_address', 'thread', 'module_path', 'symbol', 'display_symbol', 'matched_terms'])

    filtered_matches = {
        'matches': [m for result in scan_results for m in result.get('matches', [])],
        'call_edges': [e for result in scan_results for e in result.get('call_edges', [])],
    }
    write_json(filtered_dir / 'generic_focus_matches.json', filtered_matches)
    write_json(derived_dir / 'generic_chunk_summaries.json', {
        'files': [
            {
                'file': result['file'],
                'file_type': result['file_type'],
                'total_lines': result['total_lines'],
                'term_counts': result['term_counts'],
                'chunks': result['chunk_summaries'],
            }
            for result in scan_results
        ]
    })
    write_json(filtered_dir / 'generic_disassembly_windows.json', disassembly_results)

    run_summary = {
        'job_dir': str(job_dir),
        'focus_terms': [m.label for m in focus_matchers],
        'input_source': str(archive_path or input_dir),
        'discovered_file_count': len(discovered_files),
        'classified_counts': dict(Counter(item['file_type'] for item in discovered_files)),
        'outputs': {
            'dataset_manifest': str(manifests_dir / 'dataset_manifest.json'),
            'focus_config': str(manifests_dir / 'focus_config.json'),
            'compression_manifest': str(manifests_dir / 'compression_manifest.json') if compression_manifest else '',
            'function_interceptor_focus': str(derived_dir / 'function_interceptor_focus.csv'),
            'tracefcn_focus': str(derived_dir / 'tracefcn_focus.csv'),
            'generic_matches': str(filtered_dir / 'generic_focus_matches.json'),
            'generic_chunk_summaries': str(derived_dir / 'generic_chunk_summaries.json'),
            'generic_disassembly_windows': str(filtered_dir / 'generic_disassembly_windows.json'),
            'generic_correlation': str(correlation_dir / 'generic_focus_correlation.json'),
            'generic_mermaid': str(figures_dir / 'generic_focus_correlation.mmd'),
        },
    }
    write_json(output_root / 'run_summary.json', run_summary)

    tracker.update_status(
        state='completed',
        progress=1.0,
        stage='completed',
        message='Análise genérica concluída.',
        output_dir=str(output_root),
        discovered_file_count=len(discovered_files),
        focus_terms=[m.label for m in focus_matchers],
        correlation_file=str(correlation_dir / 'generic_focus_correlation.json'),
    )
    tracker.emit_event('completed', 'Análise concluída com sucesso.', details={'output_dir': str(output_root)})
    return run_summary
