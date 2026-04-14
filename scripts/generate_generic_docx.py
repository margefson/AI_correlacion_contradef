#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from docx import Document

from generate_generic_report import build_report


def write_docx(job_dir: Path, output_docx: Path) -> None:
    report_text = build_report(job_dir)
    document = Document()
    title = document.add_heading('Relatório de Análise Genérica de CDF', level=0)
    title.alignment = 0

    for raw_line in report_text.splitlines():
        line = raw_line.rstrip()
        if not line:
            document.add_paragraph('')
            continue
        if line.startswith('# '):
            document.add_heading(line[2:].strip(), level=1)
            continue
        if line.startswith('## '):
            document.add_heading(line[3:].strip(), level=2)
            continue
        if line.startswith('### '):
            document.add_heading(line[4:].strip(), level=3)
            continue
        if line.startswith('| '):
            # As tabelas Markdown serão preservadas como parágrafos monoespaçados simples.
            paragraph = document.add_paragraph()
            run = paragraph.add_run(line)
            run.font.name = 'Courier New'
            continue
        document.add_paragraph(line)

    output_docx.parent.mkdir(parents=True, exist_ok=True)
    document.save(output_docx)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Gerar relatório DOCX a partir de um job da análise genérica de CDF.')
    parser.add_argument('--job-dir', required=True, help='Diretório do job concluído.')
    parser.add_argument('--output-docx', required=True, help='Arquivo DOCX de saída.')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    job_dir = Path(args.job_dir).expanduser().resolve()
    output_docx = Path(args.output_docx).expanduser().resolve()
    write_docx(job_dir, output_docx)
    print(output_docx)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
