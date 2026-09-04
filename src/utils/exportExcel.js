/**
 * Excel / CSV Export Utility
 * Adds UTF-8 BOM so Excel opens numbers, currencies, and special characters cleanly.
 */

export function downloadExcelCsv(filename, headers, rows) {
  const csvRows = [
    headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','),
    ...rows.map(row =>
      row.map(cell => `"${String(cell !== null && cell !== undefined ? cell : '').replace(/"/g, '""')}"`).join(',')
    )
  ];

  // \uFEFF is UTF-8 Byte Order Mark (BOM) so Microsoft Excel recognizes encoding immediately
  const blob = new Blob(["\uFEFF" + csvRows.join("\r\n")], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
