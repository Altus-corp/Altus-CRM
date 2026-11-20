"use client";
// Export / share for every table: Excel (exceljs, already a dependency), PDF & Print (browser print), WhatsApp, Email (own SMTP).
export type ExportCol = { label: string; text: (r: never) => string };
type Row = Record<string, unknown>;

function table(cols: { label: string; text: (r: Row) => string }[], rows: Row[]) { return { head: cols.map((c) => c.label), body: rows.map((r) => cols.map((c) => c.text(r))) }; }

export async function toXlsxBase64(title: string, cols: { label: string; text: (r: Row) => string }[], rows: Row[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(title.replace(/[\\/?*[\]:]/g, " ").slice(0, 30) || "Export");
  const t = table(cols, rows); ws.addRow(t.head); t.body.forEach((r) => ws.addRow(r.map((v) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v))));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC8102E" } };
  ws.columns.forEach((c) => { c.width = 18; }); ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer(); let bin = ""; new Uint8Array(buf as ArrayBuffer).forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin);
}
export async function exportExcel(title: string, cols: { label: string; text: (r: Row) => string }[], rows: Row[]) {
  const b64 = await toXlsxBase64(title, cols, rows); const a = document.createElement("a");
  a.href = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + b64; a.download = `${title.replace(/\W+/g, "_")}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
}
export function printTable(title: string, cols: { label: string; text: (r: Row) => string }[], rows: Row[]) {
  const t = table(cols, rows.slice(0, 2000)); const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] as string));
  const w = window.open("", "_blank"); if (!w) return false;
  w.document.write(`<title>${esc(title)}</title><style>body{font:11px Arial;margin:18px}h2{color:#C8102E;margin:0 0 4px}table{border-collapse:collapse;width:100%}th{background:#C8102E;color:#fff;text-align:left;padding:5px}td{padding:4px 5px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#fafafa}@page{size:landscape;margin:12mm}</style><h2>${esc(title)}</h2><div style="color:#666;margin-bottom:10px">Altus CRM · ${new Date().toLocaleString("en-IN")} · ${rows.length} rows</div><table><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${t.body.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 200); return true;
}
export function summaryText(title: string, cols: { label: string; text: (r: Row) => string }[], rows: Row[]) {
  const t = table(cols.slice(0, 5), rows.slice(0, 15));
  return `*${title}* — ${rows.length} rows (Altus CRM, ${new Date().toLocaleDateString("en-IN")})\n` + t.body.map((r, i) => `${i + 1}. ${r.join(" | ")}`).join("\n") + (rows.length > 15 ? `\n…and ${rows.length - 15} more` : "");
}
export const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
