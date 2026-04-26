#!/usr/bin/env python3
"""
PDF Report Generator Server
Gera relatórios PDF de incidentes de segurança via API REST interna.
Porta: 5002
"""

import io
import json
import argparse
from datetime import datetime
from flask import Flask, request, jsonify, send_file
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

app = Flask(__name__)

# ─── Color Palette ────────────────────────────────────────────────────────────
DARK_BG      = colors.HexColor("#0D0F1A")
CYAN         = colors.HexColor("#00E5FF")
PINK         = colors.HexColor("#FF2D78")
YELLOW       = colors.HexColor("#FFD600")
GREEN        = colors.HexColor("#00E676")
PURPLE       = colors.HexColor("#AA00FF")
GRAY_DARK    = colors.HexColor("#1A1D2E")
GRAY_MID     = colors.HexColor("#2A2D3E")
GRAY_LIGHT   = colors.HexColor("#8892A4")
WHITE        = colors.HexColor("#E8EAF0")

RISK_COLORS = {
    "critical": colors.HexColor("#FF2D78"),
    "high":     colors.HexColor("#FF6D00"),
    "medium":   colors.HexColor("#FFD600"),
    "low":      colors.HexColor("#00E676"),
}

RISK_LABELS = {
    "critical": "CRÍTICO",
    "high":     "ALTO",
    "medium":   "MÉDIO",
    "low":      "BAIXO",
}

CAT_LABELS = {
    "phishing":           "Phishing",
    "malware":            "Malware",
    "brute_force":        "Força Bruta",
    "ddos":               "DDoS",
    "vazamento_de_dados": "Vazamento de Dados",
    "unknown":            "Desconhecido",
}

CAT_COLORS = {
    "phishing":           colors.HexColor("#FF2D78"),
    "malware":            colors.HexColor("#AA00FF"),
    "brute_force":        colors.HexColor("#FF6D00"),
    "ddos":               colors.HexColor("#FFD600"),
    "vazamento_de_dados": colors.HexColor("#00E5FF"),
    "unknown":            colors.HexColor("#8892A4"),
}


def build_styles():
    styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title", fontName="Helvetica-Bold", fontSize=20,
            textColor=CYAN, spaceAfter=4, alignment=TA_LEFT
        ),
        "subtitle": ParagraphStyle(
            "Subtitle", fontName="Helvetica", fontSize=10,
            textColor=GRAY_LIGHT, spaceAfter=2, alignment=TA_LEFT
        ),
        "section": ParagraphStyle(
            "Section", fontName="Helvetica-Bold", fontSize=12,
            textColor=CYAN, spaceBefore=14, spaceAfter=6
        ),
        "body": ParagraphStyle(
            "Body", fontName="Helvetica", fontSize=9,
            textColor=WHITE, leading=14
        ),
        "small": ParagraphStyle(
            "Small", fontName="Helvetica", fontSize=8,
            textColor=GRAY_LIGHT, leading=12
        ),
        "mono": ParagraphStyle(
            "Mono", fontName="Courier", fontSize=8,
            textColor=CYAN, leading=12
        ),
    }


def build_pdf(data: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
        title="Relatório de Incidentes de Segurança",
        author="Incident Security System"
    )

    S = build_styles()
    story = []

    incidents   = data.get("incidents", [])
    user_name   = data.get("userName", "Usuário")
    user_email  = data.get("userEmail", "")
    generated   = datetime.now().strftime("%d/%m/%Y às %H:%M")
    is_admin    = data.get("isAdmin", False)

    # ── Header ────────────────────────────────────────────────────────────────
    story.append(Paragraph("INCIDENT_SYS", S["title"]))
    story.append(Paragraph("Sistema de Gerenciamento de Incidentes de Segurança Cibernética", S["subtitle"]))
    story.append(HRFlowable(width="100%", thickness=1, color=CYAN, spaceAfter=8))

    # ── Report metadata ───────────────────────────────────────────────────────
    meta_data = [
        ["Relatório gerado em:", generated],
        ["Usuário:", f"{user_name} <{user_email}>"],
        ["Total de incidentes:", str(len(incidents))],
        ["Tipo:", "Global (Admin)" if is_admin else "Pessoal"],
    ]
    meta_table = Table(meta_data, colWidths=[5*cm, 12*cm])
    meta_table.setStyle(TableStyle([
        ("FONTNAME",    (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME",    (1, 0), (1, -1), "Helvetica"),
        ("FONTSIZE",    (0, 0), (-1, -1), 9),
        ("TEXTCOLOR",   (0, 0), (0, -1), GRAY_LIGHT),
        ("TEXTCOLOR",   (1, 0), (1, -1), WHITE),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [GRAY_DARK, GRAY_MID]),
        ("TOPPADDING",  (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("GRID",        (0, 0), (-1, -1), 0.5, GRAY_MID),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 12))

    # ── Summary stats ─────────────────────────────────────────────────────────
    if incidents:
        story.append(Paragraph("RESUMO ESTATÍSTICO", S["section"]))

        # By category
        cat_counts: dict = {}
        risk_counts: dict = {}
        for inc in incidents:
            cat = inc.get("category", "unknown")
            risk = inc.get("riskLevel", "low")
            cat_counts[cat] = cat_counts.get(cat, 0) + 1
            risk_counts[risk] = risk_counts.get(risk, 0) + 1

        # Category table
        cat_rows = [["Categoria", "Quantidade", "% do Total"]]
        for cat, cnt in sorted(cat_counts.items(), key=lambda x: -x[1]):
            pct = f"{cnt / len(incidents) * 100:.1f}%"
            cat_rows.append([CAT_LABELS.get(cat, cat), str(cnt), pct])

        cat_table = Table(cat_rows, colWidths=[7*cm, 4*cm, 4*cm])
        cat_style = [
            ("BACKGROUND",  (0, 0), (-1, 0), GRAY_MID),
            ("TEXTCOLOR",   (0, 0), (-1, 0), CYAN),
            ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [DARK_BG, GRAY_DARK]),
            ("TEXTCOLOR",   (0, 1), (-1, -1), WHITE),
            ("GRID",        (0, 0), (-1, -1), 0.5, GRAY_MID),
            ("TOPPADDING",  (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("ALIGN",       (1, 0), (-1, -1), "CENTER"),
        ]
        for i, (cat, _) in enumerate(sorted(cat_counts.items(), key=lambda x: -x[1]), start=1):
            c = CAT_COLORS.get(cat, GRAY_LIGHT)
            cat_style.append(("TEXTCOLOR", (0, i), (0, i), c))
        cat_table.setStyle(TableStyle(cat_style))

        # Risk table
        risk_rows = [["Nível de Risco", "Quantidade", "% do Total"]]
        for risk in ["critical", "high", "medium", "low"]:
            cnt = risk_counts.get(risk, 0)
            if cnt == 0:
                continue
            pct = f"{cnt / len(incidents) * 100:.1f}%"
            risk_rows.append([RISK_LABELS.get(risk, risk), str(cnt), pct])

        risk_table = Table(risk_rows, colWidths=[7*cm, 4*cm, 4*cm])
        risk_style = [
            ("BACKGROUND",  (0, 0), (-1, 0), GRAY_MID),
            ("TEXTCOLOR",   (0, 0), (-1, 0), PINK),
            ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [DARK_BG, GRAY_DARK]),
            ("TEXTCOLOR",   (0, 1), (-1, -1), WHITE),
            ("GRID",        (0, 0), (-1, -1), 0.5, GRAY_MID),
            ("TOPPADDING",  (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("ALIGN",       (1, 0), (-1, -1), "CENTER"),
        ]
        for i, risk in enumerate([r for r in ["critical", "high", "medium", "low"] if risk_counts.get(r, 0) > 0], start=1):
            c = RISK_COLORS.get(risk, GRAY_LIGHT)
            risk_style.append(("TEXTCOLOR", (0, i), (0, i), c))
            risk_style.append(("FONTNAME",  (0, i), (0, i), "Helvetica-Bold"))
        risk_table.setStyle(TableStyle(risk_style))

        summary_row = [[cat_table, risk_table]]
        summary_outer = Table(summary_row, colWidths=[8.5*cm, 8.5*cm], hAlign="LEFT")
        summary_outer.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(summary_outer)
        story.append(Spacer(1, 12))

    # ── Incidents list ────────────────────────────────────────────────────────
    story.append(Paragraph("LISTA DE INCIDENTES", S["section"]))

    if not incidents:
        story.append(Paragraph("Nenhum incidente encontrado.", S["body"]))
    else:
        header = ["#", "Título", "Categoria", "Risco", "Conf.", "Data"]
        if is_admin:
            header.insert(2, "Usuário")

        rows = [header]
        for inc in incidents:
            cat_label  = CAT_LABELS.get(inc.get("category", "unknown"), inc.get("category", "—"))
            risk_label = RISK_LABELS.get(inc.get("riskLevel", "low"), inc.get("riskLevel", "—"))
            conf       = f"{int(float(inc.get('confidence', 0)) * 100)}%" if inc.get("confidence") is not None else "—"
            date_raw   = inc.get("createdAt", "")
            try:
                date_str = datetime.fromisoformat(str(date_raw).replace("Z", "+00:00")).strftime("%d/%m/%Y")
            except Exception:
                date_str = str(date_raw)[:10]

            row = [
                str(inc.get("id", "")),
                Paragraph(str(inc.get("title", ""))[:80], S["small"]),
                cat_label,
                risk_label,
                conf,
                date_str,
            ]
            if is_admin:
                row.insert(2, Paragraph(str(inc.get("userName", "—"))[:30], S["small"]))
            rows.append(row)

        if is_admin:
            col_widths = [1*cm, 5.5*cm, 3*cm, 2.5*cm, 2*cm, 1.5*cm, 1.5*cm]
        else:
            col_widths = [1*cm, 7.5*cm, 3*cm, 2.5*cm, 1.5*cm, 1.5*cm]

        inc_table = Table(rows, colWidths=col_widths, repeatRows=1)
        inc_style = [
            ("BACKGROUND",    (0, 0), (-1, 0), GRAY_MID),
            ("TEXTCOLOR",     (0, 0), (-1, 0), CYAN),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [DARK_BG, GRAY_DARK]),
            ("TEXTCOLOR",     (0, 1), (-1, -1), WHITE),
            ("GRID",          (0, 0), (-1, -1), 0.5, GRAY_MID),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN",         (0, 0), (0, -1), "CENTER"),
        ]
        # Color risk column
        risk_col = 4 if is_admin else 3
        for i, inc in enumerate(incidents, start=1):
            risk = inc.get("riskLevel", "low")
            c = RISK_COLORS.get(risk, GRAY_LIGHT)
            inc_style.append(("TEXTCOLOR", (risk_col, i), (risk_col, i), c))
            inc_style.append(("FONTNAME",  (risk_col, i), (risk_col, i), "Helvetica-Bold"))
        inc_table.setStyle(TableStyle(inc_style))
        story.append(inc_table)

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 16))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY_MID))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"Incident Security System · Relatório gerado automaticamente em {generated} · CONFIDENCIAL",
        S["small"]
    ))

    doc.build(story)
    return buf.getvalue()


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "pdf-generator"})


@app.route("/generate-pdf", methods=["POST"])
def generate_pdf():
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({"error": "No data provided"}), 400
        pdf_bytes = build_pdf(data)
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"relatorio_incidentes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        )
    except Exception as e:
        print(f"[PDF] Error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PDF Report Generator Server")
    parser.add_argument("--port", type=int, default=5002, help="Port to listen on (default: 5002)")
    args = parser.parse_args()
    print(f"[PDF Server] Starting on port {args.port}...")
    app.run(host="0.0.0.0", port=args.port, debug=False)
