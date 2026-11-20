import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { formatDateTime } from "../time.js";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit");

function drawFooter(doc, report, pageNumber) {
  doc.font("Noto").fontSize(8).fillColor("#5c6d7c");
  doc.text(report.enterprise, 32, doc.page.height - 24, { width: 520, lineBreak: false });
  doc.text(String(pageNumber), doc.page.width - 64, doc.page.height - 24, {
    width: 32,
    align: "right",
    lineBreak: false,
  });
}

function drawHeader(doc, report, locale) {
  doc.font("NotoBold").fontSize(16).fillColor("#14202b").text(report.enterprise, 32, 30, { width: 760 });
  doc.font("NotoBold").fontSize(12).text(report.title, 32, 54, { width: 760 });
  doc.font("Noto").fontSize(9).fillColor("#5c6d7c");
  doc.text(`${report.periodLabel}  ·  ${formatDateTime(report.generatedAt, locale)}`, 32, 74, { width: 760 });
  return 96;
}

function drawColumns(doc, report, y) {
  let x = 32;
  doc.save();
  doc.rect(32, y, 777, 20).fill("#0f4c6e");
  doc.font("NotoBold").fontSize(8).fillColor("#ffffff");
  for (const column of report.columns) {
    doc.text(column.label, x + 4, y + 6, { width: column.width - 8, lineBreak: false, ellipsis: true });
    x += column.width;
  }
  doc.restore();
  return y + 20;
}

export function buildPdf(report, locale) {
  const regular = path.join(process.cwd(), "fonts", "NotoSans-Regular.ttf");
  const semibold = path.join(process.cwd(), "fonts", "NotoSans-SemiBold.ttf");
  if (!fs.existsSync(regular) || !fs.existsSync(semibold)) {
    throw new Error("Report fonts are missing.");
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 32,
      info: { Title: report.title, Author: report.enterprise },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("Noto", regular);
    doc.registerFont("NotoBold", semibold);

    let pageNumber = 1;
    drawFooter(doc, report, pageNumber);
    let y = drawHeader(doc, report, locale);
    y = drawColumns(doc, report, y);

    if (!report.rows.length) {
      doc.font("Noto").fontSize(10).fillColor("#5c6d7c").text(report.emptyLabel || "—", 32, y + 16);
    }

    report.rows.forEach((row, index) => {
      if (y > doc.page.height - 58) {
        doc.addPage();
        pageNumber += 1;
        drawFooter(doc, report, pageNumber);
        y = drawColumns(doc, report, 32);
      }
      if (index % 2 === 1) doc.rect(32, y, 777, 18).fill("#f4f7fa");
      let x = 32;
      doc.font("Noto").fontSize(8).fillColor("#14202b");
      for (const column of report.columns) {
        doc.text(String(row[column.key] ?? ""), x + 4, y + 5, {
          width: column.width - 8,
          height: 12,
          ellipsis: true,
          lineBreak: false,
        });
        x += column.width;
      }
      y += 18;
    });

    const noteY = Math.min(y + 16, doc.page.height - 42);
    doc.font("Noto").fontSize(8).fillColor("#5c6d7c").text(report.weekendNote, 32, noteY, { width: 760 });
    doc.end();
  });
}
