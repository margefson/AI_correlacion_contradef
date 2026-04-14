#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def load(path: str | Path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def format_bytes(num: int) -> str:
    units = ['B', 'KB', 'MB', 'GB', 'TB']
    value = float(num)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f'{value:.2f} {unit}'
        value /= 1024
    return f'{num} B'


def md_table(headers, rows):
    out = []
    out.append('| ' + ' | '.join(headers) + ' |')
    out.append('| ' + ' | '.join(['---'] * len(headers)) + ' |')
    for row in rows:
        out.append('| ' + ' | '.join(str(row.get(h, '')) for h in headers) + ' |')
    return '\n'.join(out)


def one_line_context(match_obj):
    if not match_obj:
        return ''
    ctx = match_obj.get('context', [])
    for item in ctx:
        text = item.get('text', '')
        if any(x in text for x in ['IsDebuggerPresent', 'CheckRemoteDebuggerPresent', 'ZwQueryInformationProcess', 'ZwSetInformationThread', 'GetTickCount', 'QueryPerformanceCounter', 'EnumSystemFirmwareTables', 'LocalAlloc', 'VirtualProtect', 'HeapFree', 'FatalExit', 'LoadLibraryA']):
            return f"linha {item.get('line_number')}: {text[:180].replace('|', '/')}"
    if ctx:
        item = ctx[len(ctx) // 2]
        return f"linha {item.get('line_number')}: {item.get('text', '')[:180].replace('|', '/')}"
    return ''


def main() -> None:
    parser = argparse.ArgumentParser(description='Gerar relatório Markdown consolidado da análise dos CDFs reais.')
    parser.add_argument('--repo-root', required=True)
    parser.add_argument('--output-md', required=True)
    args = parser.parse_args()

    root = Path(args.repo_root)
    dataset_manifest = load(root / 'data/manifests/dataset_manifest.json')
    compression_manifest = load(root / 'data/manifests/compression_manifest.json')
    flow = load(root / 'data/correlation/isdebuggerpresent_flow_real.json')
    fi = load(root / 'data/derived/function_interceptor_focus.json')
    ti = load(root / 'data/derived/traceinstructions_chunk_summary.json')
    tm = load(root / 'data/derived/tracememory_chunk_summary.json')

    dataset_rows = []
    for item in dataset_manifest:
        dataset_rows.append({
            'Arquivo': item['file'],
            'Tamanho': format_bytes(item['size_bytes']),
            'SHA-256': item['sha256'][:16] + '...',
        })

    compression_rows = []
    for item in compression_manifest['artifacts']:
        ratio = 0 if item['original_size'] == 0 else (1 - (item['compressed_size'] / item['original_size'])) * 100
        compression_rows.append({
            'Arquivo': Path(item['source']).name,
            'Original': format_bytes(item['original_size']),
            'Comprimido': format_bytes(item['compressed_size']),
            'Redução (%)': f'{ratio:.2f}',
            'Nível': item['compression_level'],
        })

    flow_rows = []
    for node in flow['nodes']:
        flow_rows.append({
            'Função': node['label'],
            'FI': node['counts']['function_interceptor'],
            'M1': node['counts']['tracefcncall_m1'],
            'M2': node['counts']['tracefcncall_m2'],
            'TI': node['counts']['traceinstructions'],
            'TM': node['counts']['tracememory'],
        })

    evidence_rows = []
    for node in flow['nodes']:
        ev = node['evidence']
        evidence_rows.append({
            'Função': node['label'],
            'FunctionInterceptor': f"bloco {ev['function_interceptor']['line_start']}" if ev.get('function_interceptor') else '',
            'TraceFcnCall M1': f"linha {ev['tracefcncall_m1']['line_number']}" if ev.get('tracefcncall_m1') else '',
            'TraceFcnCall M2': f"linha {ev['tracefcncall_m2']['line_number']}" if ev.get('tracefcncall_m2') else '',
            'TraceInstructions': f"linha {ev['traceinstructions']['trigger_line']}" if ev.get('traceinstructions') else '',
            'TraceMemory': f"linha {ev['tracememory']['trigger_line']}" if ev.get('tracememory') else '',
        })

    key_call_rows = []
    for item in flow.get('key_call_edges', [])[:12]:
        key_call_rows.append({
            'Linha': item['line_number'],
            'Tipo': item['calltype'],
            'Origem': item['src_symbol'][:70],
            'Destino': item['dst_symbol'][:70],
            'Thread': item['thread'],
        })

    first_chunks_ti = []
    for chunk in ti['chunks'][:8]:
        if chunk['term_counts']:
            first_chunks_ti.append({
                'Chunk': chunk['chunk_index'],
                'Linhas': f"{chunk['start_line']}-{chunk['end_line']}",
                'Ocorrências': ', '.join(f"{k}:{v}" for k, v in chunk['term_counts'].items()),
            })

    first_chunks_tm = []
    for chunk in tm['chunks'][:8]:
        if chunk['term_counts']:
            first_chunks_tm.append({
                'Chunk': chunk['chunk_index'],
                'Linhas': f"{chunk['start_line']}-{chunk['end_line']}",
                'Ocorrências': ', '.join(f"{k}:{v}" for k, v in chunk['term_counts'].items()),
            })

    isdebug_node = next(node for node in flow['nodes'] if node['label'] == 'IsDebuggerPresent')
    final_term = flow['sequence_terms'][-1] if flow['sequence_terms'] else 'N/D'

    md = f"# Relatório técnico dos CDFs reais: fluxo a partir de IsDebuggerPresent\n\n"
    md += "Este relatório consolida a execução do pipeline sobre os arquivos CDF reais extraídos de `Full-Execution-Sample-1.7z`. O objetivo foi reconstruir, a partir de **IsDebuggerPresent**, o encadeamento entre arquivos, produzir recortes reutilizáveis, aplicar compressão adaptativa aos traces completos e materializar os acompanhamentos sugeridos em artefatos operacionais dentro do repositório.\n\n"
    md += "A análise confirmou que o ponto de partida observável do fluxo monitorado combina a resolução inicial de APIs como **LoadLibraryA** com a transição para **IsDebuggerPresent**, seguida por chamadas anti-análise e de preparação de execução. O ponto terminal reconstruído pelo fluxo agregado chega a **FatalExit**, depois de passar por **CheckRemoteDebuggerPresent**, **ZwQueryInformationProcess**, **ZwSetInformationThread**, **GetTickCount**, **QueryPerformanceCounter**, **EnumSystemFirmwareTables**, **LocalAlloc**, **VirtualProtect** e **HeapFree**.\n\n"
    md += "## Dataset utilizado\n\n"
    md += "O conjunto real processado nesta etapa foi composto pelos seis CDFs abaixo. O pipeline preservou um manifesto com tamanho e hash de cada arquivo para permitir rastreabilidade, reprocessamento e conferência de integridade.\n\n"
    md += md_table(['Arquivo', 'Tamanho', 'SHA-256'], dataset_rows) + '\n\n'
    md += "## Compressão adaptativa aplicada aos traces reais\n\n"
    md += "Como parte das sugestões de acompanhamento, a compressão adaptativa foi executada sobre os CDFs reais completos em armazenamento local, gerando um manifesto versionado com o resultado por arquivo. Essa etapa reduziu drasticamente o espaço consumido pelos traces textuais volumosos e preservou evidências suficientes para futura redistribuição controlada.\n\n"
    md += md_table(['Arquivo', 'Original', 'Comprimido', 'Redução (%)', 'Nível'], compression_rows) + '\n\n'
    md += "## Fluxo correlacionado observado\n\n"
    md += f"O fluxo consolidado contém **{len(flow['nodes'])}** nós principais. A função de foco, **IsDebuggerPresent**, aparece com as seguintes contagens observadas: FI={isdebug_node['counts']['function_interceptor']}, M1={isdebug_node['counts']['tracefcncall_m1']}, M2={isdebug_node['counts']['tracefcncall_m2']}, TI={isdebug_node['counts']['traceinstructions']} e TM={isdebug_node['counts']['tracememory']}. A sequência agregada reconstruída termina em **{final_term}**.\n\n"
    md += md_table(['Função', 'FI', 'M1', 'M2', 'TI', 'TM'], flow_rows) + '\n\n'
    md += "## Evidências cruzadas por arquivo\n\n"
    md += "A tabela seguinte resume onde cada função do fluxo foi efetivamente localizada em cada tipo de log. Esse cruzamento é a base do correlacionador versionado no repositório.\n\n"
    md += md_table(['Função', 'FunctionInterceptor', 'TraceFcnCall M1', 'TraceFcnCall M2', 'TraceInstructions', 'TraceMemory'], evidence_rows) + '\n\n'
    md += "## Chamadas-chave reconstruídas no TraceInstructions\n\n"
    md += "Além das contagens, o pipeline extraiu chamadas e tailcalls diretamente do trace de instruções. As primeiras relações mais relevantes preservadas no JSON de correlação são apresentadas abaixo.\n\n"
    md += md_table(['Linha', 'Tipo', 'Origem', 'Destino', 'Thread'], key_call_rows) + '\n\n'
    md += "## Processamento incremental por chunks\n\n"
    md += f"O arquivo `TraceInstructions` foi processado em streaming ao longo de **{ti['total_lines']:,}** linhas, enquanto `TraceMemory` foi tratado em **{tm['total_lines']:,}** linhas. O mecanismo de chunks permite localizar rapidamente em quais faixas de linhas as funções de interesse se concentram, sem necessidade de carregar os arquivos inteiros em memória.\n\n"
    md += "### Primeiros chunks relevantes em TraceInstructions\n\n"
    md += md_table(['Chunk', 'Linhas', 'Ocorrências'], first_chunks_ti) + '\n\n'
    md += "### Primeiros chunks relevantes em TraceMemory\n\n"
    md += md_table(['Chunk', 'Linhas', 'Ocorrências'], first_chunks_tm) + '\n\n'
    md += "## Interpretação operacional do fluxo\n\n"
    md += "Sob a perspectiva operacional, o encadeamento observado reforça uma sequência típica de preparação anti-debug e anti-análise seguida de alocação e alteração de memória. A presença conjunta de **IsDebuggerPresent**, **CheckRemoteDebuggerPresent**, **ZwQueryInformationProcess** e **ZwSetInformationThread** sugere um estágio inicial de verificação e evasão. Em seguida, **GetTickCount** e **QueryPerformanceCounter** reforçam a dimensão temporal do controle de execução. Por fim, **LocalAlloc**, **VirtualProtect** e **HeapFree** apontam para manipulação de memória e limpeza/ajuste do ambiente, antes do encerramento reconstruído em **FatalExit**.\n\n"
    md += "## Artefatos implementados no repositório\n\n"
    md += "Os acompanhamentos sugeridos foram efetivamente materializados no repositório na forma de compressão real dos traces, filtragem seletiva por termos de interesse, processamento incremental por chunk, correlação automática multi-arquivo, geração de diagrama Mermaid, renderização visual em PNG e documentação operacional para reprocessamento futuro.\n\n"
    md += "## Principais arquivos gerados\n\n"
    principal_rows = [
        {'Arquivo': 'data/manifests/dataset_manifest.json', 'Descrição': 'Manifesto de integridade dos CDFs reais'},
        {'Arquivo': 'data/manifests/compression_manifest.json', 'Descrição': 'Manifesto da compressão adaptativa executada'},
        {'Arquivo': 'data/filtered/traceinstructions_focus_matches.json', 'Descrição': 'Recortes do trace de instruções com contexto'},
        {'Arquivo': 'data/filtered/tracememory_focus_matches.json', 'Descrição': 'Recortes do trace de memória com contexto'},
        {'Arquivo': 'data/filtered/tracedisassembly_windows.json', 'Descrição': 'Janelas do disassembly associadas a endereços relevantes'},
        {'Arquivo': 'data/correlation/isdebuggerpresent_flow_real.json', 'Descrição': 'Fluxo correlacionado estruturado'},
        {'Arquivo': 'data/figures/isdebuggerpresent_flow_real.mmd', 'Descrição': 'Diagrama Mermaid reconstruível'},
        {'Arquivo': 'data/figures/isdebuggerpresent_flow_real.png', 'Descrição': 'Render visual do fluxo correlacionado'},
    ]
    md += md_table(['Arquivo', 'Descrição'], principal_rows) + '\n'

    Path(args.output_md).write_text(md, encoding='utf-8')
    print(args.output_md)


if __name__ == '__main__':
    main()
