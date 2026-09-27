import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

type Line = {
  name: string;
  variant: string;
  qty: number;
  price: number;
};

type BillDocument = {
  id: string;
  createdAt: string;
  lines: Line[];
  subtotal?: number;
  gst?: number;
  total: number;
  paid: number;
  paymentMethod: string;
};

type ShopProfile = {
  shopName: string;
  phone: string;
  upiId: string;
  upiName: string;
  qrImage?: string;
  gstin: string;
  gstEnabled: boolean;
  gstRate: number;
};

const amountText = (amount: number) => `Rs. ${amount.toFixed(2)}`;

export function getUpiUri(profile: ShopProfile, amount: number): string | null {
  const id = profile.upiId.trim();
  if (!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(id) || !Number.isFinite(amount) || amount <= 0) return null;
  const params = new URLSearchParams({
    pa: id,
    pn: profile.upiName.trim() || profile.shopName.trim() || 'Shop',
    am: amount.toFixed(2),
    cu: 'INR',
    tn: 'BUYME bill payment',
  });
  return `upi://pay?${params.toString()}`;
}

export async function createBillPdf(bill: BillDocument, profile: ShopProfile, kind: 'bill' | 'receipt'): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a5' });
  const left = 14;
  const right = 134;
  let y = 17;

  const pageBreak = (height: number) => {
    if (y + height > 194) {
      pdf.addPage();
      y = 17;
    }
  };

  pdf.setTextColor(38, 35, 57);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  const shopLines = pdf.splitTextToSize(profile.shopName.trim() || 'My Shop', 120) as string[];
  pdf.text(shopLines, left, y);
  y += shopLines.length * 7 + 2;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  if (profile.phone.trim()) {
    pdf.text(profile.phone.trim(), left, y);
    y += 5;
  }
  if (profile.gstEnabled && profile.gstin.trim()) {
    pdf.text(`GSTIN: ${profile.gstin.trim()}`, left, y);
    y += 5;
  }
  pdf.setDrawColor(220, 217, 227);
  pdf.line(left, y + 2, right, y + 2);
  y += 10;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text(kind === 'bill' ? 'BILL' : 'PAYMENT RECEIPT', left, y);
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`${kind === 'bill' ? 'Draft' : bill.id}  |  ${new Date(bill.createdAt).toLocaleString('en-IN')}`, left, y);
  y += 10;

  pdf.setFont('helvetica', 'bold');
  pdf.text('ITEM', left, y);
  pdf.text('QTY', 96, y, { align: 'right' });
  pdf.text('AMOUNT', right, y, { align: 'right' });
  y += 4;
  pdf.line(left, y, right, y);
  y += 6;

  for (const line of bill.lines) {
    const nameLines = pdf.splitTextToSize(`${line.name} (${line.variant})`, 68) as string[];
    pageBreak(Math.max(nameLines.length * 4.5, 7) + 3);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(nameLines, left, y);
    pdf.text(String(line.qty), 96, y, { align: 'right' });
    pdf.text(amountText(line.price * line.qty), right, y, { align: 'right' });
    y += Math.max(nameLines.length * 4.5, 7) + 2;
  }

  pageBreak(34);
  pdf.line(left, y, right, y);
  y += 7;
  const subtotal = bill.subtotal ?? bill.lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const gst = bill.gst ?? Math.max(0, bill.total - subtotal);
  pdf.setFontSize(9);
  pdf.text('Subtotal', left, y);
  pdf.text(amountText(subtotal), right, y, { align: 'right' });
  y += 6;
  if (gst > 0) {
    pdf.text(`GST (${profile.gstRate}%)`, left, y);
    pdf.text(amountText(gst), right, y, { align: 'right' });
    y += 6;
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Total', left, y);
  pdf.text(amountText(bill.total), right, y, { align: 'right' });
  y += 9;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  if (kind === 'receipt') {
    pdf.text(`Received via ${bill.paymentMethod}: ${amountText(bill.paid)}`, left, y);
    y += 5;
    if (bill.total - bill.paid > 0.005) {
      pdf.text(`Balance due: ${amountText(bill.total - bill.paid)}`, left, y);
      y += 5;
    }
  }

  // A draft bill carries a pay-now QR. A receipt only carries a QR for a
  // remaining balance, so a fully paid customer isn't prompted to pay twice.
  const qrAmount = kind === 'bill' ? (bill.paymentMethod === 'UPI' ? (bill.paid > 0 ? bill.paid : bill.total) : 0) : Math.max(0, bill.total - bill.paid);
  const upiUri = getUpiUri(profile, qrAmount);
  const qrData = upiUri ? await QRCode.toDataURL(upiUri, { width: 300, margin: 1 }) : qrAmount > 0 ? profile.qrImage : undefined;
  if (qrData) {
    pageBreak(48);
    y += 3;
    pdf.addImage(qrData, 'PNG', left, y, 34, 34);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(upiUri ? 'Scan to pay' : 'Scan QR; enter amount', 53, y + 11);
    pdf.setFont('helvetica', 'normal');
    pdf.text(amountText(qrAmount), 53, y + 17);
    pdf.setFontSize(7);
    pdf.text(upiUri ? profile.upiId.trim() : 'Confirm recipient before paying', 53, y + 23);
    y += 39;
  }
  pageBreak(9);
  pdf.setTextColor(110, 108, 121);
  pdf.setFontSize(8);
  pdf.text('Thank you for shopping with us.', left, y + 4);
  return pdf.output('blob');
}