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

/**
 * Print individual sale receipt with Customer Details, TIN, Phone, and WHT breakdown
 */
export function printSaleReceipt({ sale, shopName = 'Jotun Paint Store' }) {
  const printWindow = window.open('', '_blank', 'width=800,height=750');
  if (!printWindow) {
    alert("Please allow popups to print receipt.");
    return;
  }

  const dt = new Date(sale.timestamp || Date.now()).toLocaleString();
  const formatEtb = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ETB';

  const itemsHtml = (sale.items || []).map((item) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px dashed #e2e8f0; font-size: 12px;">
        <strong>${item.productName}</strong>
        <div style="font-size: 11px; color: #64748b;">${item.size || ''} ${item.code ? '• ' + item.code : ''}</div>
        ${Number(item.colorantCost || item.colourant_cost || 0) > 0 ? `<div style="font-size: 10px; color: #2563eb;">🎨 Colorant: +${formatEtb(Number(item.colorantCost || item.colourant_cost || 0) * 1.15)} (inc VAT)</div>` : ''}
      </td>
      <td style="padding: 8px; border-bottom: 1px dashed #e2e8f0; font-size: 12px; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px dashed #e2e8f0; font-size: 12px; text-align: right;">${formatEtb(item.unitPrice)}</td>
      <td style="padding: 8px; border-bottom: 1px dashed #e2e8f0; font-size: 12px; text-align: right; font-weight: bold;">${formatEtb(item.subtotal)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt ${sale.id} — ${shopName}</title>
        <style>
          @page { size: 80mm auto; margin: 4mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 16px;
            max-width: 440px;
            margin: 0 auto;
          }
          .receipt-box {
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            padding: 16px;
            background: #ffffff;
          }
          .store-header {
            text-align: center;
            border-bottom: 2px dashed #cbd5e1;
            padding-bottom: 10px;
            margin-bottom: 12px;
          }
          .store-name {
            font-size: 18px;
            font-weight: 800;
            color: #1e3a8a;
          }
          .store-tag {
            font-size: 11px;
            color: #64748b;
          }
          .info-table {
            width: 100%;
            margin-bottom: 10px;
            font-size: 11px;
          }
          .info-table td {
            padding: 2px 0;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
          }
          .items-table th {
            border-bottom: 1px solid #0f172a;
            padding: 6px 8px;
            font-size: 11px;
            text-align: left;
          }
          .totals-table {
            width: 100%;
            margin-top: 8px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 8px;
            font-size: 12px;
          }
          .totals-table td {
            padding: 3px 0;
          }
          .grand-total {
            font-size: 15px;
            font-weight: 800;
            border-top: 2px solid #0f172a;
            padding-top: 6px;
          }
          .footer-note {
            text-align: center;
            font-size: 11px;
            color: #64748b;
            margin-top: 14px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 10px;
          }
          @media print {
            .no-print { display: none; }
            body { padding: 0; }
            .receipt-box { border: none; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; background: #eff6ff; border: 1px solid #bfdbfe; padding: 8px 12px; border-radius: 6px;">
          <span style="font-size: 12px; color: #1e40af; font-weight: 600;">Receipt Ready</span>
          <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 6px 14px; border-radius: 4px; font-weight: bold; cursor: pointer;">
            🖨️ Print / Save PDF
          </button>
        </div>

        <div class="receipt-box">
          <div class="store-header">
            <div class="store-name">PaintFlow</div>
            <div class="store-tag">${shopName} • Authorized Jotun Retailer</div>
          </div>

          <table class="info-table">
            <tr>
              <td><strong>Receipt #:</strong> ${sale.id}</td>
              <td style="text-align: right;"><strong>Date:</strong> ${dt}</td>
            </tr>
            <tr>
              <td><strong>Payment:</strong> ${sale.paymentType || 'Cash'}</td>
              <td style="text-align: right;"><strong>Items:</strong> ${sale.totalItems || 1} units</td>
            </tr>
            <tr>
              <td colspan="2" style="border-top: 1px dashed #e2e8f0; padding-top: 4px; margin-top: 4px;">
                <strong>Customer:</strong> ${sale.customer || 'Walk-in Customer'}
              </td>
            </tr>
            ${sale.customerTin ? `
              <tr>
                <td colspan="2"><strong>Customer TIN:</strong> ${sale.customerTin}</td>
              </tr>
            ` : ''}
            ${sale.customerPhone ? `
              <tr>
                <td colspan="2"><strong>Contact Phone:</strong> ${sale.customerPhone}</td>
              </tr>
            ` : ''}
          </table>

          <table class="items-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Price</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <table class="totals-table">
            <tr>
              <td>Included 15% VAT:</td>
              <td style="text-align: right;">${formatEtb(sale.total - sale.total / 1.15)}</td>
            </tr>
            ${sale.isWithholding ? `
              <tr>
                <td>Gross Total:</td>
                <td style="text-align: right;">${formatEtb(sale.grossTotal || sale.total)}</td>
              </tr>
              <tr style="color: #b45309; font-weight: bold;">
                <td>Less 3% Withholding Tax:</td>
                <td style="text-align: right;">-${formatEtb(sale.withholdingAmount)}</td>
              </tr>
              <tr>
                <td style="font-size: 11px; color: #64748b;">WHT Voucher:</td>
                <td style="text-align: right; font-size: 11px;">${sale.whtVoucherStatus === 'received' ? '✓ ' + (sale.whtVoucherNumber || 'Received') : '⏳ Pending Collection'}</td>
              </tr>
            ` : ''}
            <tr class="grand-total">
              <td>${sale.isWithholding ? 'Net Amount Paid:' : 'Total Paid:'}</td>
              <td style="text-align: right;">${formatEtb(sale.isWithholding ? sale.netPayable : sale.total)}</td>
            </tr>
          </table>

          <div class="footer-note">
            <p style="margin: 0 0 4px 0; font-weight: 600;">Thank you for choosing Jotun Paints!</p>
            <p style="margin: 0; font-size: 10px;">Official Sales Receipt • PaintFlow POS</p>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 250);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
