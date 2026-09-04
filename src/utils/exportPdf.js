/**
 * Cross-platform PDF Export and Printable Report Utility
 * Generates an official Jotun Paint Manager document and triggers the print dialog
 * which supports "Save as PDF" natively on Windows, macOS, iOS, and Android.
 */

export function printOrSaveAsPdf({ title, subtitle, columns, rows, summaryCards = [] }) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert("Please allow popups to export PDF.");
    return;
  }

  const currentDate = new Date().toLocaleString();

  const summaryHtml = summaryCards.length > 0 ? `
    <div style="display: flex; gap: 15px; margin: 20px 0; flex-wrap: wrap;">
      ${summaryCards.map(card => `
        <div style="flex: 1; min-width: 160px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
          <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600;">${card.label}</div>
          <div style="font-size: 20px; font-weight: bold; color: #0f172a; margin-top: 4px;">${card.value}</div>
        </div>
      `).join('')}
    </div>
  ` : '';

  const tableHeadersHtml = columns.map(c => `<th style="border-bottom: 2px solid #cbd5e1; padding: 10px 8px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">${c}</th>`).join('');

  const tableRowsHtml = rows.map((row, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      ${row.map(cell => `<td style="padding: 9px 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b;">${cell}</td>`).join('')}
    </tr>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title} — Jotun Paint Manager</title>
        <style>
          @page { size: auto; margin: 15mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 20px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header {
            border-bottom: 3px solid #2563eb;
            padding-bottom: 14px;
            margin-bottom: 15px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .brand {
            font-size: 24px;
            font-weight: 800;
            color: #2563eb;
            letter-spacing: -0.5px;
          }
          .brand span {
            color: #0f172a;
            font-size: 18px;
            font-weight: 500;
            margin-left: 6px;
          }
          .meta {
            text-align: right;
            font-size: 12px;
            color: #64748b;
          }
          .title {
            font-size: 20px;
            font-weight: 700;
            margin: 10px 0 4px 0;
            color: #0f172a;
          }
          .subtitle {
            font-size: 13px;
            color: #64748b;
            margin-bottom: 15px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 12px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #94a3b8;
          }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 15px; background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px 15px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #1e40af;"><strong>Jotun Paint Manager PDF Ready:</strong> Click Print/Save to save as PDF or send to printer.</span>
          <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer;">
            🖨️ Save as PDF / Print
          </button>
        </div>

        <div class="header">
          <div>
            <div class="brand">JOTUN <span>Paint Manager</span></div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Jordan / Addis Stock & Inventory System (ETB)</div>
          </div>
          <div class="meta">
            <div><strong>Generated:</strong> ${currentDate}</div>
            <div><strong>Currency:</strong> Ethiopian Birr (ETB)</div>
          </div>
        </div>

        <div class="title">${title}</div>
        <div class="subtitle">${subtitle || ''}</div>

        ${summaryHtml}

        <table>
          <thead>
            <tr>${tableHeadersHtml}</tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <span>Jotun Paint Manager — Automated Inventory & Sales Reconciliation</span>
          <span>Official System Document</span>
        </div>

        <script>
          // Automatically prompt print dialog after load
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
