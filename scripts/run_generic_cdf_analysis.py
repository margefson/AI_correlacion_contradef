#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from cdf_analysis_core import analyze_bundle, ensure_dir, slugify


def default_job_dir(base_dir: Path, archive: Path | None, input_dir: Path | None, focus_terms: list[str], focus_regexes: list[str]) -> Path:
    stamp = time.strftime('%Y%m%d_%H%M%S')
    source_name = archive.stem if archive else (input_dir.name if input_dir else 'sample')
    focus_name = '-'.join([slugify(x) for x in (focus_terms or focus_regexes)[:3]]) or 'focus'
    return base_dir / f'{stamp}_{slugify(source_name)}_{focus_name}'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Executar a análise genérica de traces CDF sobre um pacote 7z ou diretório já extraído.')
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--archive', help='Pacote 7z contendo a amostra a ser analisada.')
    source.add_argument('--input-dir', help='Diretório já extraído contendo os traces.')
    parser.add_argument('--focus', action='append', default=[], help='Nome literal de função alvo. Pode ser repetido.')
    parser.add_argument('--focus-regex', action='append', default=[], help='Expressão regular de função alvo. Pode ser repetida.')
    parser.add_argument('--jobs-root', default='data/jobs', help='Diretório raiz para jobs e resultados.')
    parser.add_argument('--job-dir', help='Diretório específico do job. Se omitido, será gerado automaticamente.')
    parser.add_argument('--chunk-size', type=int, default=250000, help='Linhas por chunk nos traces grandes.')
    parser.add_argument('--context-before', type=int, default=2, help='Linhas anteriores a preservar no contexto.')
    parser.add_argument('--context-after', type=int, default=2, help='Linhas posteriores a preservar no contexto.')
    parser.add_argument('--skip-compression', action='store_true', help='Desabilitar a compressão adaptativa dos arquivos completos.')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    archive = Path(args.archive).expanduser().resolve() if args.archive else None
    input_dir = Path(args.input_dir).expanduser().resolve() if args.input_dir else None
    jobs_root = Path(args.jobs_root).expanduser().resolve()
    ensure_dir(jobs_root)
    if args.job_dir:
        job_dir = Path(args.job_dir).expanduser().resolve()
    else:
        job_dir = default_job_dir(jobs_root, archive, input_dir, args.focus, args.focus_regex)
    ensure_dir(job_dir)

    try:
        summary = analyze_bundle(
            job_dir=job_dir,
            focus_terms=args.focus,
            focus_regexes=args.focus_regex,
            archive_path=archive,
            input_dir=input_dir,
            chunk_size=args.chunk_size,
            context_before=args.context_before,
            context_after=args.context_after,
            compress_full_files=not args.skip_compression,
        )
    except Exception as exc:
        status_path = job_dir / 'status.json'
        status_path.write_text(
            json.dumps(
                {
                    'state': 'failed',
                    'message': str(exc),
                    'updated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                },
                indent=2,
                ensure_ascii=False,
            ) + '\n',
            encoding='utf-8',
        )
        print(f'Falha na análise: {exc}', file=sys.stderr)
        return 1

    print(summary['outputs']['generic_correlation'])
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
