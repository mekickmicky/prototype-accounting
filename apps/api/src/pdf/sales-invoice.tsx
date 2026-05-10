import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'Sarabun',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/sarabun/v17/DtVjJx26TKEr37c9WBI.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/sarabun/v17/DtVmJx26TKEr37c9YK5sulw.ttf', fontWeight: 700 },
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

export type CompanyInfo = {
  name_en: string;
  name_th: string;
  tax_id: string;
  address: string;
  phone: string;
  email: string;
};

export type BranchInfo = {
  code: string;
  name: string;
  branch_office: string;
  address?: string;
};

export type CustomerInfo = {
  name: string;
  name_th?: string | null;
  tax_id?: string | null;
  branch_office: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  payment_terms_days?: number;
};

export type InvoiceLine = {
  line_no: number;
  description: string;
  qty: string;
  unit_price: string;
  discount: string;
  vat_rate: string;
  line_total: string;
};

export type SalesInvoicePDFData = {
  invoice_no: string;
  tax_invoice_no?: string | null;
  issue_date: Date;
  due_date: Date;
  is_tax_invoice: boolean;
  vat_inclusive: boolean;
  subtotal: string;
  discount: string;
  vat_amount: string;
  total: string;
  notes?: string | null;
  lines: InvoiceLine[];
  customer: CustomerInfo;
  company: CompanyInfo;
  branch: BranchInfo;
  receipt_no?: string;
  is_fully_paid?: boolean;
};

const ACCENT = '#9f5f6a';
const DARK = '#1f2937';
const GRAY = '#6b7280';
const LIGHT_BG = '#f9fafb';
const BORDER = '#e5e7eb';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Sarabun', color: DARK },
  headerRow: { flexDirection: 'row', marginBottom: 16 },
  companyBlock: { flex: 1 },
  docBlock: { width: '40%' },
  companyNameEn: { fontSize: 13, fontWeight: 'bold', marginBottom: 1 },
  companyNameTh: { fontSize: 10, marginBottom: 4 },
  companyDetail: { fontSize: 8, color: GRAY, marginBottom: 1 },
  docTitle: { fontSize: 18, fontWeight: 'bold', color: ACCENT, textAlign: 'right', marginBottom: 1 },
  docSubtitle: { fontSize: 9, textAlign: 'right', color: GRAY, marginBottom: 8 },
  docMetaRow: { flexDirection: 'row', marginBottom: 2 },
  docMetaLabel: { fontSize: 8, color: GRAY, flex: 1, textAlign: 'right', paddingRight: 6 },
  docMetaValue: { fontSize: 8, fontWeight: 'bold', width: 100, textAlign: 'right' },
  divider: { borderBottom: '0.5 solid ' + BORDER, marginBottom: 12 },
  customerSection: {
    flexDirection: 'row',
    backgroundColor: LIGHT_BG,
    padding: 8,
    marginBottom: 16,
    borderLeft: '3 solid ' + ACCENT,
  },
  customerBlock: { flex: 1 },
  billToLabel: { fontSize: 7, color: GRAY, marginBottom: 3 },
  customerName: { fontSize: 10, fontWeight: 'bold', marginBottom: 1 },
  customerDetail: { fontSize: 8, color: GRAY, marginBottom: 1 },
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
  colNo: { width: '5%' },
  colDesc: { width: '45%' },
  colQty: { width: '8%', textAlign: 'right' },
  colPrice: { width: '14%', textAlign: 'right' },
  colDiscount: { width: '10%', textAlign: 'right' },
  colAmount: { width: '18%', textAlign: 'right' },
  totalsSection: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totalsBox: { width: '42%' },
  totalsRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottom: '0.5 solid ' + BORDER,
  },
  totalsLabel: { flex: 1, color: GRAY },
  totalsValue: { width: 85, textAlign: 'right' },
  totalsGrandRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: DARK,
    marginTop: 2,
  },
  totalsGrandLabel: { flex: 1, fontWeight: 'bold', fontSize: 10, color: '#ffffff' },
  totalsGrandValue: { width: 85, textAlign: 'right', fontWeight: 'bold', fontSize: 10, color: '#ffffff' },
  notesSection: { marginTop: 12 },
  notesLabel: { fontSize: 7, color: GRAY, marginBottom: 2 },
  notesText: { fontSize: 8 },
  paymentTerms: { marginTop: 6 },
  paymentTermsText: { fontSize: 8, color: GRAY },
  signatureSection: { flexDirection: 'row', marginTop: 36, justifyContent: 'space-between' },
  signatureBox: { width: '30%', alignItems: 'center' },
  signatureLine: { borderTop: '0.5 solid ' + DARK, width: '100%', marginBottom: 4 },
  signatureLabel: { fontSize: 7, color: GRAY, textAlign: 'center' },
  signatureDate: { fontSize: 7, color: GRAY, textAlign: 'center', marginTop: 2 },
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

export function SalesInvoicePDF({ data }: { data: SalesInvoicePDFData }) {
  const { invoice_no, issue_date, due_date, company, branch, customer, lines } = data;
  const { subtotal, discount, vat_amount, total, notes } = data;

  const customerDisplayName = customer.name_th ?? customer.name;
  const branchLabel = branch.name ? `สาขา ${branch.name} (${branch.code})` : '';
  const hasDiscount = parseFloat(discount) > 0;
  const hasVat = parseFloat(vat_amount) > 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyNameEn}>{company.name_en}</Text>
            <Text style={styles.companyNameTh}>{company.name_th}</Text>
            {branchLabel ? <Text style={styles.companyDetail}>{branchLabel}</Text> : null}
            <Text style={styles.companyDetail}>{company.address}</Text>
            <Text style={styles.companyDetail}>โทร {company.phone}  |  {company.email}</Text>
            <Text style={styles.companyDetail}>เลขประจำตัวผู้เสียภาษี {company.tax_id}</Text>
          </View>
          <View style={styles.docBlock}>
            <Text style={styles.docTitle}>ใบแจ้งหนี้</Text>
            <Text style={styles.docSubtitle}>INVOICE</Text>
            <View style={styles.docMetaRow}>
              <Text style={styles.docMetaLabel}>เลขที่:</Text>
              <Text style={styles.docMetaValue}>{invoice_no}</Text>
            </View>
            <View style={styles.docMetaRow}>
              <Text style={styles.docMetaLabel}>วันที่:</Text>
              <Text style={styles.docMetaValue}>{fmtDateThai(issue_date)}</Text>
            </View>
            <View style={styles.docMetaRow}>
              <Text style={styles.docMetaLabel}>ครบกำหนดชำระ:</Text>
              <Text style={styles.docMetaValue}>{fmtDateThai(due_date)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Customer */}
        <View style={styles.customerSection}>
          <View style={styles.customerBlock}>
            <Text style={styles.billToLabel}>เรียนเก็บเงิน / BILL TO</Text>
            <Text style={styles.customerName}>{customerDisplayName}</Text>
            {customer.name_th && customer.name_th !== customer.name
              ? <Text style={styles.customerDetail}>{customer.name}</Text>
              : null}
            {customer.address ? <Text style={styles.customerDetail}>{customer.address}</Text> : null}
            {customer.phone ? <Text style={styles.customerDetail}>โทร {customer.phone}</Text> : null}
          </View>
        </View>

        {/* Lines */}
        <View style={styles.tableHeaderRow}>
          <Text style={styles.colNo}>#</Text>
          <Text style={styles.colDesc}>รายการ / Description</Text>
          <Text style={styles.colQty}>จำนวน</Text>
          <Text style={styles.colPrice}>ราคา/หน่วย</Text>
          <Text style={styles.colDiscount}>ส่วนลด</Text>
          <Text style={styles.colAmount}>จำนวนเงิน</Text>
        </View>
        {lines.map((line, idx) => (
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
            <Text style={styles.colAmount}>{fmtMoney(line.line_total)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>ยอดก่อนภาษี</Text>
              <Text style={styles.totalsValue}>{fmtMoney(subtotal)}</Text>
            </View>
            {hasDiscount && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>ส่วนลดรวม</Text>
                <Text style={styles.totalsValue}>({fmtMoney(discount)})</Text>
              </View>
            )}
            {hasVat && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>ภาษีมูลค่าเพิ่ม 7%</Text>
                <Text style={styles.totalsValue}>{fmtMoney(vat_amount)}</Text>
              </View>
            )}
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

        {/* Payment terms */}
        {customer.payment_terms_days != null && customer.payment_terms_days > 0 ? (
          <View style={styles.paymentTerms}>
            <Text style={styles.paymentTermsText}>
              เงื่อนไขการชำระเงิน: {customer.payment_terms_days} วัน นับจากวันที่ใบแจ้งหนี้
            </Text>
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
            <Text style={styles.signatureLabel}>ผู้มีอำนาจลงนาม</Text>
            <Text style={styles.signatureDate}>{company.name_en}</Text>
          </View>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${company.name_en}  |  ใบแจ้งหนี้เลขที่ ${invoice_no}  |  หน้า ${pageNumber}/${totalPages}  |  พิมพ์: ${new Date().toISOString().slice(0, 10)}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
