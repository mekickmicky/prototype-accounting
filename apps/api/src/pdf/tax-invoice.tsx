import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { D } from '@wind-acc/shared';
import { BusinessRuleError } from '../lib/errors';
import type { SalesInvoicePDFData, InvoiceLine } from './sales-invoice';

export type { SalesInvoicePDFData, CompanyInfo, BranchInfo, CustomerInfo, InvoiceLine } from './sales-invoice';

Font.register({
  family: 'Sarabun',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVmJx26TKEr37c9YHZvTkc.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVhJx26TKEr37c9aBz_ys8.ttf', fontWeight: 700 },
  ],
});

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function fmtDateThai(date: Date): string {
  const d = date.getUTCDate();
  const m = date.getUTCMonth();
  const y = date.getUTCFullYear() + 543;
  return `${d} ${THAI_MONTHS[m]} ${y}`;
}

function fmtMoney(val: string): string {
  const isNeg = val.startsWith('-');
  const abs = isNeg ? val.slice(1) : val;
  const [intRaw, dec] = abs.split('.');
  const intPart = (intRaw ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decPart = (dec ?? '00').padEnd(2, '0').slice(0, 2);
  return `${isNeg ? '-' : ''}${intPart}.${decPart}`;
}

// line_total is always split.gross (see invoice-math.ts lineVat).
// In both vat_inclusive and vat_exclusive modes: net = gross / (1 + rate).
function computeLineNet(line: InvoiceLine): { net: string; vat: string } {
  const gross = D(line.line_total);
  const rate = D(line.vat_rate).div(100);
  const net = gross.div(D(1).plus(rate)).toDecimalPlaces(2);
  const vat = gross.minus(net);
  return { net: net.toFixed(2), vat: vat.toFixed(2) };
}

/**
 * Validates that data satisfies Thai Revenue Department requirements for a
 * full tax invoice (ใบกำกับภาษี). Throws INVALID_TAX_INVOICE before render
 * if required fields are absent.
 */
export function validateTaxInvoiceData(data: SalesInvoicePDFData): void {
  const missing: string[] = [];
  if (!data.customer.tax_id) missing.push('customer.tax_id');
  if (!data.customer.address) missing.push('customer.address');
  if (!data.tax_invoice_no) missing.push('tax_invoice_no');
  if (!data.company.tax_id) missing.push('company.tax_id');
  if (missing.length > 0) {
    throw new BusinessRuleError('INVALID_TAX_INVOICE', { missing });
  }
}

const ACCENT = '#9f5f6a';
const DARK = '#1f2937';
const GRAY = '#6b7280';
const LIGHT_BG = '#f9fafb';
const BORDER = '#e5e7eb';
const RED_BG = '#fef2f2';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Sarabun', color: DARK },
  // Prominent document title (RD requirement: "ใบกำกับภาษี" must be prominent)
  docTitleBox: {
    alignItems: 'center',
    borderBottom: '2 solid ' + ACCENT,
    paddingBottom: 6,
    marginBottom: 14,
  },
  docTitleMain: {
    fontSize: 20,
    fontWeight: 'bold',
    color: DARK,
    textAlign: 'center',
  },
  docTitleEn: {
    fontSize: 10,
    color: GRAY,
    textAlign: 'center',
    marginTop: 1,
  },
  // Two-column: seller + document meta
  infoRow: { flexDirection: 'row', marginBottom: 12 },
  sellerBlock: { flex: 1 },
  metaBlock: { width: '38%' },
  blockLabel: { fontSize: 7, color: GRAY, marginBottom: 3 },
  sellerNameEn: { fontSize: 11, fontWeight: 'bold', marginBottom: 1 },
  sellerNameTh: { fontSize: 9, marginBottom: 3 },
  sellerDetail: { fontSize: 8, color: GRAY, marginBottom: 1 },
  sellerTaxBox: {
    marginTop: 4,
    padding: 4,
    backgroundColor: LIGHT_BG,
    borderLeft: '2 solid ' + ACCENT,
  },
  sellerTaxLabel: { fontSize: 7, color: GRAY, marginBottom: 1 },
  sellerTaxId: { fontSize: 9, fontWeight: 'bold' },
  sellerBranchOffice: { fontSize: 8, color: GRAY, marginTop: 1 },
  metaRow: { flexDirection: 'row', marginBottom: 3 },
  metaLabel: { fontSize: 8, color: GRAY, width: 90 },
  metaValue: { fontSize: 8, fontWeight: 'bold', flex: 1 },
  metaValueAccent: { fontSize: 9, fontWeight: 'bold', color: ACCENT },
  divider: { borderBottom: '0.5 solid ' + BORDER, marginBottom: 10 },
  // Buyer block
  buyerSection: {
    backgroundColor: LIGHT_BG,
    padding: 8,
    marginBottom: 14,
    borderLeft: '3 solid ' + DARK,
  },
  buyerLabel: { fontSize: 7, color: GRAY, marginBottom: 3 },
  buyerName: { fontSize: 10, fontWeight: 'bold', marginBottom: 1 },
  buyerDetail: { fontSize: 8, color: GRAY, marginBottom: 1 },
  buyerTaxRow: { flexDirection: 'row', marginTop: 3 },
  buyerTaxLabel: { fontSize: 8, color: GRAY, width: 120 },
  buyerTaxValue: { fontSize: 8, fontWeight: 'bold' },
  // Table
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: DARK,
    color: '#ffffff',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    marginTop: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5 solid ' + BORDER,
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  tableRowAlt: { backgroundColor: LIGHT_BG },
  colNo: { width: '4%' },
  colDesc: { width: '36%' },
  colQty: { width: '8%', textAlign: 'right' },
  colPrice: { width: '13%', textAlign: 'right' },
  colDiscount: { width: '9%', textAlign: 'right' },
  colNet: { width: '13%', textAlign: 'right' },
  colVatRate: { width: '8%', textAlign: 'right' },
  colVat: { width: '9%', textAlign: 'right' },
  // Totals
  totalsSection: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totalsBox: { width: '44%' },
  totalsRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottom: '0.5 solid ' + BORDER,
  },
  totalsLabel: { flex: 1, color: GRAY },
  totalsValue: { width: 90, textAlign: 'right' },
  vatHighlightRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottom: '0.5 solid ' + BORDER,
    backgroundColor: RED_BG,
  },
  totalsGrandRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: DARK,
    marginTop: 2,
  },
  totalsGrandLabel: { flex: 1, fontWeight: 'bold', fontSize: 10, color: '#ffffff' },
  totalsGrandValue: { width: 90, textAlign: 'right', fontWeight: 'bold', fontSize: 10, color: '#ffffff' },
  // Notes
  notesSection: { marginTop: 12 },
  notesLabel: { fontSize: 7, color: GRAY, marginBottom: 2 },
  notesText: { fontSize: 8 },
  // Signature
  signatureSection: { flexDirection: 'row', marginTop: 36, justifyContent: 'space-between' },
  signatureBox: { width: '30%', alignItems: 'center' },
  signatureLine: { borderTop: '0.5 solid ' + DARK, width: '100%', marginBottom: 4 },
  signatureLabel: { fontSize: 7, color: GRAY, textAlign: 'center' },
  signatureDate: { fontSize: 7, color: GRAY, textAlign: 'center', marginTop: 2 },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7,
    color: GRAY,
    borderTop: '0.5 solid ' + BORDER,
    paddingTop: 3,
  },
});

export function TaxInvoicePDF({ data }: { data: SalesInvoicePDFData }) {
  const { company, branch, customer, lines } = data;
  const { subtotal, vat_amount, total, notes } = data;
  const { tax_invoice_no, invoice_no, issue_date } = data;

  // Combined variant: ใบกำกับภาษี/ใบเสร็จรับเงิน when fully paid same day
  const isCombined = !!(data.is_fully_paid && data.receipt_no);
  const docTitleTh = isCombined
    ? 'ใบกำกับภาษี / ใบเสร็จรับเงิน'
    : 'ใบกำกับภาษี';
  const docTitleEn = isCombined ? 'TAX INVOICE / RECEIPT' : 'TAX INVOICE';

  const branchInfo = branch.name ? `สาขา ${branch.name}` : 'สำนักงานใหญ่';
  const customerDisplay = customer.name_th ?? customer.name;
  const hasVat = parseFloat(vat_amount) > 0;

  const linesWithNet = lines.map(line => {
    const { net, vat } = computeLineNet(line);
    return { ...line, net_excl_vat: net, vat_per_line: vat };
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Prominent title — RD requirement */}
        <View style={styles.docTitleBox}>
          <Text style={styles.docTitleMain}>{docTitleTh}</Text>
          <Text style={styles.docTitleEn}>{docTitleEn}</Text>
        </View>

        {/* Seller + Document meta */}
        <View style={styles.infoRow}>
          {/* Seller (company) info */}
          <View style={styles.sellerBlock}>
            <Text style={styles.blockLabel}>ผู้ขาย / SELLER</Text>
            <Text style={styles.sellerNameEn}>{company.name_en}</Text>
            <Text style={styles.sellerNameTh}>{company.name_th}</Text>
            <Text style={styles.sellerDetail}>{company.address}</Text>
            <Text style={styles.sellerDetail}>โทร {company.phone}  |  {company.email}</Text>
            <Text style={styles.sellerDetail}>{branchInfo}</Text>
            <View style={styles.sellerTaxBox}>
              <Text style={styles.sellerTaxLabel}>เลขประจำตัวผู้เสียภาษี / Tax ID</Text>
              <Text style={styles.sellerTaxId}>{company.tax_id}</Text>
              <Text style={styles.sellerBranchOffice}>
                รหัสสาขา / Branch Office: {branch.branch_office}
              </Text>
            </View>
          </View>

          {/* Document meta */}
          <View style={styles.metaBlock}>
            <Text style={styles.blockLabel}>ข้อมูลเอกสาร / DOCUMENT</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>เลขที่ใบกำกับภาษี:</Text>
              <Text style={styles.metaValueAccent}>{tax_invoice_no ?? '—'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>เลขที่ใบแจ้งหนี้:</Text>
              <Text style={styles.metaValue}>{invoice_no}</Text>
            </View>
            {isCombined && data.receipt_no ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>เลขที่ใบเสร็จ:</Text>
                <Text style={styles.metaValue}>{data.receipt_no}</Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>วันที่:</Text>
              <Text style={styles.metaValue}>{fmtDateThai(issue_date)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Buyer info — RD requirement */}
        <View style={styles.buyerSection}>
          <Text style={styles.buyerLabel}>ผู้ซื้อ / BUYER</Text>
          <Text style={styles.buyerName}>{customerDisplay}</Text>
          {customer.name_th && customer.name_th !== customer.name
            ? <Text style={styles.buyerDetail}>{customer.name}</Text>
            : null}
          {customer.address ? <Text style={styles.buyerDetail}>{customer.address}</Text> : null}
          {customer.phone ? <Text style={styles.buyerDetail}>โทร {customer.phone}</Text> : null}
          <View style={styles.buyerTaxRow}>
            <Text style={styles.buyerTaxLabel}>เลขประจำตัวผู้เสียภาษี / Tax ID:</Text>
            <Text style={styles.buyerTaxValue}>{customer.tax_id ?? '—'}</Text>
          </View>
          <View style={styles.buyerTaxRow}>
            <Text style={styles.buyerTaxLabel}>รหัสสาขา / Branch Office:</Text>
            <Text style={styles.buyerTaxValue}>{customer.branch_office}</Text>
          </View>
        </View>

        {/* Line items — net excl VAT per line (RD requirement) */}
        <View style={styles.tableHeaderRow}>
          <Text style={styles.colNo}>#</Text>
          <Text style={styles.colDesc}>รายการ / Description</Text>
          <Text style={styles.colQty}>จำนวน</Text>
          <Text style={styles.colPrice}>ราคา/หน่วย</Text>
          <Text style={styles.colDiscount}>ส่วนลด</Text>
          <Text style={styles.colNet}>มูลค่า (ไม่รวม VAT)</Text>
          <Text style={styles.colVatRate}>VAT%</Text>
          <Text style={styles.colVat}>VAT</Text>
        </View>
        {linesWithNet.map((line, idx) => (
          <View
            key={line.line_no}
            style={idx % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}
          >
            <Text style={styles.colNo}>{line.line_no}</Text>
            <Text style={styles.colDesc}>{line.description}</Text>
            <Text style={styles.colQty}>{parseFloat(line.qty).toString()}</Text>
            <Text style={styles.colPrice}>{fmtMoney(line.unit_price)}</Text>
            <Text style={styles.colDiscount}>
              {parseFloat(line.discount) > 0 ? fmtMoney(line.discount) : '—'}
            </Text>
            <Text style={styles.colNet}>{fmtMoney(line.net_excl_vat)}</Text>
            <Text style={styles.colVatRate}>{parseFloat(line.vat_rate).toFixed(0)}%</Text>
            <Text style={styles.colVat}>{fmtMoney(line.vat_per_line)}</Text>
          </View>
        ))}

        {/* Totals — net, VAT separate, grand total (RD requirement) */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>มูลค่าสินค้า/บริการ (ไม่รวม VAT)</Text>
              <Text style={styles.totalsValue}>{fmtMoney(subtotal)}</Text>
            </View>
            {hasVat ? (
              <View style={styles.vatHighlightRow}>
                <Text style={styles.totalsLabel}>ภาษีมูลค่าเพิ่ม 7% (VAT)</Text>
                <Text style={styles.totalsValue}>{fmtMoney(vat_amount)}</Text>
              </View>
            ) : null}
            <View style={styles.totalsGrandRow}>
              <Text style={styles.totalsGrandLabel}>รวมทั้งสิ้น / TOTAL</Text>
              <Text style={styles.totalsGrandValue}>{fmtMoney(total)} บาท</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {notes ? (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>หมายเหตุ / NOTES</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        ) : null}

        {/* Signature block */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>ผู้รับ / Received by</Text>
            <Text style={styles.signatureDate}>วันที่ / Date: ___/___/______</Text>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>ผู้มีอำนาจลงนาม / Authorized Signatory</Text>
            <Text style={styles.signatureDate}>{company.name_en}</Text>
          </View>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => {
            const docRef = tax_invoice_no
              ? `ใบกำกับภาษีเลขที่ ${tax_invoice_no}`
              : `ใบแจ้งหนี้เลขที่ ${invoice_no}`;
            return `${company.name_en}  |  ${docRef}  |  หน้า ${pageNumber}/${totalPages}  |  พิมพ์: ${new Date().toISOString().slice(0, 10)}`;
          }}
          fixed
        />
      </Page>
    </Document>
  );
}
