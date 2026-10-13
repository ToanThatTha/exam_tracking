const ExcelJS = require('exceljs');

/** Đọc sheet đầu tiên thành mảng các dòng (mảng giá trị chuỗi), bỏ dòng tiêu đề */
async function readRows(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // tiêu đề
    const values = [];
    for (let c = 1; c <= Math.max(row.cellCount, 10); c++) {
      values.push(cellText(row.getCell(c).value));
    }
    rows.push({ rowNumber, values });
  });
  return rows;
}

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('').trim();
    if (v.text != null) return String(v.text).trim();
    if (v.result != null) return String(v.result).trim();
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

async function buildWorkbook(sheetName, headers, sampleRows, widths) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  sampleRows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((col, i) => { col.width = widths[i] || 16; });
  return wb.xlsx.writeBuffer();
}

module.exports = { readRows, buildWorkbook };
