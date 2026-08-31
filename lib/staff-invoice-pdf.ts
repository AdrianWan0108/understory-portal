import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";

export type StaffInvoicePdfData = {
  invoiceNumber: string;
  month: string;
  currencyCode: string;
  totalHours: number;
  totalAmount: number;
  submittedAt: string;
  payee: {
    legalName: string;
    address: {
      line1: string;
      line2?: string | null;
      city: string;
      province: string;
      postalCode: string;
      country: string;
    };
  };
  lineItems: Array<{
    id: string;
    workDate: string;
    hours: number;
    workLabel: string;
    notes: string | null;
    rate: number;
    amount: number;
  }>;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const PURPLE = rgb(0.2, 0.12, 0.38);
const MUTED = rgb(0.43, 0.37, 0.48);
const PALE = rgb(0.97, 0.95, 0.98);
const LINE = rgb(0.86, 0.82, 0.89);

function money(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T12:00:00.000Z`));
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function rightText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size: number,
  color = PURPLE,
) {
  page.drawText(text, {
    x: x + width - font.widthOfTextAtSize(text, size),
    y,
    font,
    size,
    color,
  });
}

function drawPageHeader(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  invoice: StaffInvoicePdfData,
  continuation = false,
) {
  page.drawText("UNDERSTORY", {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN,
    font: bold,
    size: 10,
    color: PURPLE,
  });
  page.drawText(continuation ? "INVOICE · CONTINUED" : "INVOICE", {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN - 34,
    font: bold,
    size: continuation ? 20 : 30,
    color: PURPLE,
  });

  const labelX = 390;
  const valueX = 456;
  const top = PAGE_HEIGHT - MARGIN;
  [
    ["Invoice", invoice.invoiceNumber],
    ["Period", monthLabel(invoice.month)],
    ["Issued", new Date(invoice.submittedAt).toLocaleDateString("en-CA")],
  ].forEach(([label, value], index) => {
    const y = top - index * 18;
    page.drawText(label, { x: labelX, y, font: regular, size: 9, color: MUTED });
    rightText(page, value, valueX, y, PAGE_WIDTH - MARGIN - valueX, bold, 9);
  });
}

function drawTableHeader(page: PDFPage, regular: PDFFont, y: number) {
  page.drawRectangle({
    x: MARGIN,
    y: y - 7,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 25,
    color: PALE,
  });
  const labels = [
    ["DATE", MARGIN + 8],
    ["WORK PERFORMED", MARGIN + 93],
    ["HOURS", 385],
    ["RATE", 438],
    ["AMOUNT", 493],
  ] as const;
  labels.forEach(([label, x]) => {
    page.drawText(label, { x, y, font: regular, size: 7.5, color: MUTED });
  });
}

export async function generateStaffInvoicePdf(invoice: StaffInvoicePdfData) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPageHeader(page, regular, bold, invoice);

  const fromY = PAGE_HEIGHT - 150;
  page.drawText("FROM", { x: MARGIN, y: fromY, font: bold, size: 7.5, color: MUTED });
  page.drawText(invoice.payee.legalName, {
    x: MARGIN,
    y: fromY - 18,
    font: bold,
    size: 11,
    color: PURPLE,
  });
  const address = invoice.payee.address;
  [
    address.line1,
    address.line2,
    `${address.city}, ${address.province} ${address.postalCode}`,
    address.country,
  ]
    .filter(Boolean)
    .forEach((line, index) => {
      page.drawText(String(line), {
        x: MARGIN,
        y: fromY - 35 - index * 14,
        font: regular,
        size: 9,
        color: MUTED,
      });
    });

  page.drawText("BILL TO", { x: 330, y: fromY, font: bold, size: 7.5, color: MUTED });
  page.drawText("Understory · Finance", {
    x: 330,
    y: fromY - 18,
    font: bold,
    size: 11,
    color: PURPLE,
  });
  page.drawText("Attention: Karen & Adrian", {
    x: 330,
    y: fromY - 35,
    font: regular,
    size: 9,
    color: MUTED,
  });

  let y = PAGE_HEIGHT - 278;
  drawTableHeader(page, regular, y);
  y -= 28;

  for (const item of invoice.lineItems) {
    const description = item.notes
      ? `${item.workLabel} — ${item.notes}`
      : item.workLabel;
    const descriptionLines = wrapText(description, regular, 8.5, 190);
    const rowHeight = Math.max(32, descriptionLines.length * 11 + 14);

    if (y - rowHeight < 105) {
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawPageHeader(page, regular, bold, invoice, true);
      y = PAGE_HEIGHT - 125;
      drawTableHeader(page, regular, y);
      y -= 28;
    }

    page.drawText(dateLabel(item.workDate), {
      x: MARGIN + 8,
      y: y - 10,
      font: regular,
      size: 8.5,
      color: MUTED,
    });
    descriptionLines.forEach((line, index) => {
      page.drawText(line, {
        x: MARGIN + 93,
        y: y - 10 - index * 11,
        font: index === 0 ? bold : regular,
        size: 8.5,
        color: PURPLE,
      });
    });
    rightText(page, String(item.hours), 378, y - 10, 39, regular, 8.5);
    rightText(page, money(item.rate), 423, y - 10, 50, regular, 8.5, MUTED);
    rightText(page, money(item.amount), 480, y - 10, 59, bold, 8.5);
    page.drawLine({
      start: { x: MARGIN, y: y - rowHeight + 6 },
      end: { x: PAGE_WIDTH - MARGIN, y: y - rowHeight + 6 },
      thickness: 0.5,
      color: LINE,
    });
    y -= rowHeight;
  }

  if (y < 150) {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageHeader(page, regular, bold, invoice, true);
    y = PAGE_HEIGHT - 155;
  }
  page.drawText("Payment details are stored securely in the staff payment profile.", {
    x: MARGIN,
    y: y - 30,
    font: regular,
    size: 8,
    color: MUTED,
  });
  page.drawText("TOTAL HOURS", {
    x: 382,
    y: y - 20,
    font: regular,
    size: 8,
    color: MUTED,
  });
  rightText(page, String(invoice.totalHours), 480, y - 20, 59, bold, 9);
  page.drawLine({
    start: { x: 382, y: y - 32 },
    end: { x: PAGE_WIDTH - MARGIN, y: y - 32 },
    thickness: 1,
    color: LINE,
  });
  page.drawText("TOTAL DUE", {
    x: 382,
    y: y - 54,
    font: bold,
    size: 10,
    color: PURPLE,
  });
  rightText(page, `${money(invoice.totalAmount)} CAD`, 450, y - 55, 89, bold, 12);

  document.setTitle(`Invoice ${invoice.invoiceNumber}`);
  document.setAuthor(invoice.payee.legalName);
  document.setSubject(`${monthLabel(invoice.month)} contractor invoice`);
  document.setCreator("Understory Team Portal");
  return document.save();
}
