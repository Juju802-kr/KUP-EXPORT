export type ExportCell = string | number | null | undefined;

export function escapeHtml(value: ExportCell) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function dateText(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function numberText(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function tableHtml(title: string, headers: string[], rows: ExportCell[][], options: { textColumns?: number[] } = {}) {
  const textColumns = new Set(options.textColumns ?? []);
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((cell, index) => `<td${textColumns.has(index) ? ' class="text-cell"' : ""}>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, "Malgun Gothic", sans-serif; font-size: 12px; color: #111827; }
    h1 { font-size: 18px; margin: 0 0 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; white-space: nowrap; }
    th { background: #eff6ff; font-weight: 700; text-align: center; }
    .text-cell { mso-number-format:"\\@"; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}

export function excelResponse(filename: string, html: string) {
  return new Response(`\uFEFF${html}`, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.xls`
    }
  });
}

export function printableResponse(html: string) {
  const printable = html.replace("</body>", '<script>window.addEventListener("load", () => window.print());</script></body>');
  return new Response(printable, {
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}
