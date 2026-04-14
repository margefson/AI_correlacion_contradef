#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
from typing import Dict, List


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


def compress_file(src: Path, dst_dir: Path) -> Dict[str, object]:
    dst_dir.mkdir(parents=True, exist_ok=True)
    level = choose_level(src.stat().st_size)
    dst = dst_dir / f"{src.name}.gz"

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


def collect_inputs(paths: List[str]) -> List[Path]:
    items: List[Path] = []
    for raw in paths:
        p = Path(raw)
        if p.is_file():
            items.append(p)
        elif p.is_dir():
            items.extend(sorted(x for x in p.iterdir() if x.is_file()))
    return items


def main() -> None:
    parser = argparse.ArgumentParser(description='Compressão adaptativa de traces grandes com manifesto SHA-256.')
    parser.add_argument('inputs', nargs='+', help='Arquivos ou diretórios de entrada')
    parser.add_argument('--output-dir', required=True, help='Diretório de saída para os .gz')
    parser.add_argument('--manifest', default='compression_manifest.json', help='Nome do manifesto JSON')
    args = parser.parse_args()

    src_items = collect_inputs(args.inputs)
    out_dir = Path(args.output_dir)
    manifest_path = out_dir / args.manifest

    results = [compress_file(src, out_dir) for src in src_items]
    summary = {
        'file_count': len(results),
        'total_original_size': sum(x['original_size'] for x in results),
        'total_compressed_size': sum(x['compressed_size'] for x in results),
        'artifacts': results,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(manifest_path)


if __name__ == '__main__':
    main()
