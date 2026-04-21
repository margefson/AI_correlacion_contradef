#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from cdf_analysis_core import analyze_bundle, ensure_dir

DEFAULT_FOCUS_TERMS = [
    "LoadLibraryA",
    "IsDebuggerPresent",
    "CheckRemoteDebuggerPresent",
    "ZwQueryInformationProcess",
    "ZwSetInformationThread",
    "GetTickCount",
    "QueryPerformanceCounter",
    "EnumSystemFirmwareTables",
    "WMI",
    "LocalAlloc",
    "VirtualProtect",
    "HeapFree",
    "FatalExit",
]


def write_json(path: Path, data: object) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def mirror_generic_outputs(job_dir: Path, output_dir: Path) -> None:
    generic_output = job_dir / "output"
    ensure_dir(output_dir)
    ensure_dir(output_dir / "manifests")
    ensure_dir(output_dir / "derived")
    ensure_dir(output_dir / "filtered")
    ensure_dir(output_dir / "correlation")
    ensure_dir(output_dir / "figures")

    copy_map = {
        generic_output / "manifests" / "dataset_manifest.json": output_dir / "manifests" / "dataset_manifest.json",
        generic_output / "manifests" / "compression_manifest.json": output_dir / "manifests" / "compression_manifest.json",
        generic_output / "derived" / "function_interceptor_focus.json": output_dir / "derived" / "function_interceptor_focus.json",
        generic_output / "derived" / "generic_chunk_summaries.json": output_dir / "derived" / "generic_chunk_summaries.json",
        generic_output / "filtered" / "generic_focus_matches.json": output_dir / "filtered" / "generic_focus_matches.json",
        generic_output / "filtered" / "generic_disassembly_windows.json": output_dir / "filtered" / "tracedisassembly_windows.json",
        generic_output / "correlation" / "generic_focus_correlation.json": output_dir / "correlation" / "isdebuggerpresent_flow_real.json",
        generic_output / "figures" / "generic_focus_correlation.mmd": output_dir / "figures" / "isdebuggerpresent_flow_real.mmd",
    }
    for src, dst in copy_map.items():
        if src.exists():
            ensure_dir(dst.parent)
            shutil.copy2(src, dst)

    # Legacy aliases used by older reporting scripts.
    generic_matches_path = output_dir / "filtered" / "generic_focus_matches.json"
    if generic_matches_path.exists():
        matches_data = json.loads(generic_matches_path.read_text(encoding="utf-8"))
        write_json(output_dir / "filtered" / "traceinstructions_focus_matches.json", {"matches": matches_data.get("matches", []), "call_edges": matches_data.get("call_edges", [])})
        write_json(output_dir / "filtered" / "tracememory_focus_matches.json", {"matches": matches_data.get("matches", [])})

    chunk_path = output_dir / "derived" / "generic_chunk_summaries.json"
    if chunk_path.exists():
        chunk_data = json.loads(chunk_path.read_text(encoding="utf-8"))
        files = chunk_data.get("files", []) if isinstance(chunk_data, dict) else []
        instruction = next((f for f in files if f.get("file_type") == "trace_instructions"), {"total_lines": 0, "term_counts": {}, "chunks": []})
        memory = next((f for f in files if f.get("file_type") == "trace_memory"), {"total_lines": 0, "term_counts": {}, "chunks": []})
        write_json(output_dir / "derived" / "traceinstructions_chunk_summary.json", {
            "total_lines": instruction.get("total_lines", 0),
            "term_counts": instruction.get("term_counts", {}),
            "chunks": instruction.get("chunks", []),
        })
        write_json(output_dir / "derived" / "tracememory_chunk_summary.json", {
            "total_lines": memory.get("total_lines", 0),
            "term_counts": memory.get("term_counts", {}),
            "chunks": memory.get("chunks", []),
        })


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Orquestrar o processamento do caso real usando o core genérico.")
    parser.add_argument("--input-dir", required=True, help="Diretório contendo os .cdf reais.")
    parser.add_argument("--output-dir", required=True, help="Diretório principal para saídas no formato legado.")
    parser.add_argument("--chunk-size", type=int, default=250000)
    parser.add_argument("--context-before", type=int, default=2)
    parser.add_argument("--context-after", type=int, default=2)
    parser.add_argument("--skip-compression", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    job_dir = output_dir / "job_real_orchestrated"
    ensure_dir(job_dir)

    summary = analyze_bundle(
        job_dir=job_dir,
        focus_terms=DEFAULT_FOCUS_TERMS,
        focus_regexes=[],
        archive_path=None,
        input_dir=input_dir,
        chunk_size=args.chunk_size,
        context_before=args.context_before,
        context_after=args.context_after,
        compress_full_files=not args.skip_compression,
    )

    mirror_generic_outputs(job_dir, output_dir)
    write_json(output_dir / "run_summary.json", summary)
    print(output_dir / "run_summary.json")


if __name__ == "__main__":
    main()
