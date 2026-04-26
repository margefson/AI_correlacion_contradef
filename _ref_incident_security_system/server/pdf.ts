/**
 * pdf.ts — Gerador de PDF nativo em Node.js usando PDFKit
 *
 * Fallback para quando o servidor Flask (porta 5002) não está disponível.
 * Produz um relatório profissional com:
 *  - Cabeçalho com nome do sistema e timestamp
 *  - Estatísticas por categoria e por nível de risco
 *  - Tabela de incidentes com todos os campos relevantes
 */

import PDFDocument from "pdfkit";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface IncidentRow {
  id: number | string;
  title: string;
  description?: string;
  category?: string;
  riskLevel?: string;
  confidence?: number | null;
  status?: string;
  createdAt?: Date | string | null;
  userName?: string;
  [key: string]: unknown;
}

export interface PdfPayload {
  incidents: IncidentRow[];
  userName: string;
  userEmail: string;
  isAdmin: boolean;
}

// ─── Constantes de estilo ─────────────────────────────────────────────────────
const COLORS = {
  bg: "#0d1117",
  primary: "#00ff88",
  cyan: "#00e5ff",
  red: "#ff4444",
  orange: "#ff8800",
  yellow: "#ffcc00",
  blue: "#4499ff",
  white: "#e6edf3",
  gray: "#8b949e",
  darkGray: "#21262d",
  border: "#30363d",
};

const CAT_LABELS: Record<string, string> = {
  phishing: "Phishing",
  malware: "Malware",
  brute_force: "Força Bruta",
  ddos: "DDoS",
  vazamento_de_dados: "Vazamento de Dados",
  engenharia_social: "Engenharia Social",
};

const RISK_LABELS: Record<string, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};

const RISK_COLORS: Record<string, string> = {
  critical: COLORS.red,
  high: COLORS.orange,
  medium: COLORS.yellow,
  low: COLORS.blue,
};

const STATUS_LABELS: Record<string, string> = {
  open: "Em Aberto",
  in_progress: "Em Andamento",
  resolved: "Resolvido",
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(d).slice(0, 10);
  }
}

// ─── Gerador principal ────────────────────────────────────────────────────────
export function generatePdfBuffer(payload: PdfPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { incidents, userName, userEmail, isAdmin } = payload;

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      info: {
        Title: "Relatório de Incidentes de Segurança",
        Author: "Incident Security System",
        Subject: "Relatório de Incidentes",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 80; // margins
    const now = new Date().toLocaleString("pt-BR");

    // ── Cabeçalho ─────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 80).fill("#0d1117");
    doc
      .fillColor(COLORS.primary)
      .fontSize(18)
      .font("Helvetica-Bold")
      .text("INCIDENT SECURITY SYSTEM", 40, 20);
    doc
      .fillColor(COLORS.cyan)
      .fontSize(10)
      .font("Helvetica")
      .text("Relatório de Incidentes de Segurança Cibernética", 40, 44);
    doc
      .fillColor(COLORS.gray)
      .fontSize(8)
      .text(`Gerado em: ${now}`, 40, 60);

    doc.moveDown(3);

    // ── Informações do relatório ───────────────────────────────────────────────
    doc
      .fillColor(COLORS.cyan)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("INFORMAÇÕES DO RELATÓRIO", 40, 100);

    doc.moveTo(40, 115).lineTo(40 + pageWidth, 115).strokeColor(COLORS.border).lineWidth(0.5).stroke();

    const infoY = 120;
    doc.fillColor(COLORS.gray).fontSize(9).font("Helvetica");
    doc.text(`Usuário: ${userName}`, 40, infoY);
    doc.text(`E-mail: ${userEmail}`, 40, infoY + 14);
    doc.text(`Tipo: ${isAdmin ? "Relatório Global (Administrador)" : "Relatório Pessoal"}`, 40, infoY + 28);
    doc.text(`Total de Incidentes: ${incidents.length}`, 40, infoY + 42);

    // ── Estatísticas ──────────────────────────────────────────────────────────
    const statsY = infoY + 70;
    doc
      .fillColor(COLORS.cyan)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("ESTATÍSTICAS", 40, statsY);

    doc.moveTo(40, statsY + 15).lineTo(40 + pageWidth, statsY + 15).strokeColor(COLORS.border).lineWidth(0.5).stroke();

    // Contagem por risco
    const riskCounts: Record<string, number> = {};
    const catCounts: Record<string, number> = {};
    for (const inc of incidents) {
      const r = inc.riskLevel ?? "low";
      const c = inc.category ?? "unknown";
      riskCounts[r] = (riskCounts[r] ?? 0) + 1;
      catCounts[c] = (catCounts[c] ?? 0) + 1;
    }

    let statX = 40;
    const statY2 = statsY + 22;
    const statBoxW = 80;
    const statBoxH = 44;
    const riskOrder = ["critical", "high", "medium", "low"];

    for (const risk of riskOrder) {
      const count = riskCounts[risk] ?? 0;
      const color = RISK_COLORS[risk] ?? COLORS.gray;
      doc.rect(statX, statY2, statBoxW, statBoxH).fill("#21262d");
      doc.fillColor(color).fontSize(20).font("Helvetica-Bold").text(String(count), statX + 4, statY2 + 4, { width: statBoxW - 8, align: "center" });
      doc.fillColor(COLORS.gray).fontSize(7).font("Helvetica").text(RISK_LABELS[risk] ?? risk, statX + 4, statY2 + 30, { width: statBoxW - 8, align: "center" });
      statX += statBoxW + 8;
    }

    // ── Tabela de incidentes ──────────────────────────────────────────────────
    const tableY = statsY + 80;
    doc
      .fillColor(COLORS.cyan)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("LISTA DE INCIDENTES", 40, tableY);

    doc.moveTo(40, tableY + 15).lineTo(40 + pageWidth, tableY + 15).strokeColor(COLORS.border).lineWidth(0.5).stroke();

    if (incidents.length === 0) {
      doc.fillColor(COLORS.gray).fontSize(9).font("Helvetica").text("Nenhum incidente encontrado.", 40, tableY + 24);
    } else {
      // Cabeçalho da tabela
      const colsBase = isAdmin
        ? [
            { label: "#", w: 24 },
            { label: "Título", w: 130 },
            { label: "Usuário", w: 70 },
            { label: "Categoria", w: 70 },
            { label: "Risco", w: 50 },
            { label: "Status", w: 60 },
            { label: "Data", w: 52 },
          ]
        : [
            { label: "#", w: 24 },
            { label: "Título", w: 180 },
            { label: "Categoria", w: 80 },
            { label: "Risco", w: 55 },
            { label: "Status", w: 65 },
            { label: "Data", w: 52 },
          ];

      let rowY = tableY + 22;
      const fontSize = 8;
      const cellPadY = 5;
      const minRowH = 18;
      const lineH = fontSize + 3; // approx line height for font size 8

      // Helper: estimate row height based on title length
      const estimateRowH = (titleText: string, titleColW: number): number => {
        const charsPerLine = Math.floor((titleColW - 6) / (fontSize * 0.52));
        const lines = Math.ceil(titleText.length / Math.max(charsPerLine, 1));
        return Math.max(minRowH, cellPadY * 2 + lines * lineH);
      };

      // Helper: draw header row
      const drawHeader = (y: number) => {
        doc.rect(40, y, pageWidth, minRowH).fill("#21262d");
        let hx = 40;
        for (const col of colsBase) {
          doc.fillColor(COLORS.cyan).fontSize(fontSize).font("Helvetica-Bold").text(col.label, hx + 3, y + 5, { width: col.w - 6, lineBreak: false });
          hx += col.w;
        }
        return y + minRowH;
      };

      rowY = drawHeader(rowY);

      // Data rows
      for (let i = 0; i < incidents.length; i++) {
        const inc = incidents[i];
        const bgColor = i % 2 === 0 ? "#0d1117" : "#161b22";

        const riskColor = RISK_COLORS[inc.riskLevel ?? "low"] ?? COLORS.gray;
        const cells = isAdmin
          ? [
              { text: String(inc.id ?? ""), color: COLORS.gray, wrap: false },
              { text: String(inc.title ?? ""), color: COLORS.white, wrap: true },
              { text: String(inc.userName ?? "—"), color: COLORS.gray, wrap: false },
              { text: CAT_LABELS[inc.category ?? ""] ?? String(inc.category ?? "—"), color: COLORS.white, wrap: false },
              { text: RISK_LABELS[inc.riskLevel ?? "low"] ?? "—", color: riskColor, wrap: false },
              { text: STATUS_LABELS[inc.status ?? "open"] ?? "—", color: COLORS.gray, wrap: false },
              { text: formatDate(inc.createdAt), color: COLORS.gray, wrap: false },
            ]
          : [
              { text: String(inc.id ?? ""), color: COLORS.gray, wrap: false },
              { text: String(inc.title ?? ""), color: COLORS.white, wrap: true },
              { text: CAT_LABELS[inc.category ?? ""] ?? String(inc.category ?? "—"), color: COLORS.white, wrap: false },
              { text: RISK_LABELS[inc.riskLevel ?? "low"] ?? "—", color: riskColor, wrap: false },
              { text: STATUS_LABELS[inc.status ?? "open"] ?? "—", color: COLORS.gray, wrap: false },
              { text: formatDate(inc.createdAt), color: COLORS.gray, wrap: false },
            ];

        // Find title column width for height estimation
        const titleColIdx = 1;
        const titleColW = colsBase[titleColIdx].w;
        const rowH = estimateRowH(cells[titleColIdx].text, titleColW);

        // Check if we need a new page
        if (rowY + rowH > doc.page.height - 60) {
          doc.addPage();
          rowY = 40;
          rowY = drawHeader(rowY);
        }

        doc.rect(40, rowY, pageWidth, rowH).fill(bgColor);

        let cx = 40;
        for (let j = 0; j < colsBase.length; j++) {
          const col = colsBase[j];
          const cell = cells[j];
          const isRisk = j === (isAdmin ? 4 : 3);
          if (cell.wrap) {
            // Allow word wrap for title column
            doc
              .fillColor(cell.color)
              .fontSize(fontSize)
              .font("Helvetica")
              .text(cell.text, cx + 3, rowY + cellPadY, {
                width: col.w - 6,
                lineBreak: true,
                lineGap: 1,
              });
          } else {
            doc
              .fillColor(cell.color)
              .fontSize(fontSize)
              .font(isRisk ? "Helvetica-Bold" : "Helvetica")
              .text(cell.text, cx + 3, rowY + cellPadY, { width: col.w - 6, lineBreak: false, ellipsis: true });
          }
          cx += col.w;
        }
        rowY += rowH;
      }
    }

    // ── Rodapé ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 40;
    doc.moveTo(40, footerY - 8).lineTo(40 + pageWidth, footerY - 8).strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc
      .fillColor(COLORS.gray)
      .fontSize(7)
      .font("Helvetica")
      .text(
        `Incident Security System · Relatório gerado automaticamente em ${now} · CONFIDENCIAL`,
        40,
        footerY,
        { width: pageWidth, align: "center" }
      );

    doc.end();
  });
}
