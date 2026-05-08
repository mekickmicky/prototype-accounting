import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'เงินสด',
  TRANSFER: 'โอนเงิน',
  CREDIT_CARD: 'บัตรเครดิต',
  DEBIT_CARD: 'บัตรเดบิต',
  QR: 'QR Code',
  CHEQUE: 'เช็ค',
  OTHER: 'อื่นๆ',
};

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
  docTitle: { fontSize: 18, fontWeight: 'bold', color: ACCENT, textAlign: 'right', marginBottom: 4 },
  docMetaRow: { flexDirection: 'row', marginBottom: 2 },
  docMetaLabel: { fontSize: 8, color: GRAY, flex: 1, textAlign: 'right', paddingRight: 6 },
  docMetaValue: { fontSize: 8, fontWeight: 'bold', width: 110, textAlign: 'right' },
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
  paymentSection: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  paymentBlock: { flex: 1, backgroundColor: LIGHT_BG, padding: 8 },
  paymentLabel: { fontSize: 7, color: GRAY, marginBottom: 3 },
  paymentValue: { fontSize: 9, fontWeight: 'bold' },
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
  col_no: { width: 30 },
  col_invoice: { flex: 1 },
  col_amount: { width: 90, textAlign: 'right' },
  totalsSection: { marginTop: 16, alignItems: 'flex-end' },
  totalsTable: { width: 220 },
  totalRow: { flexDirection: 'row', paddingVertical: 2 },
  totalLabel: { flex: 1, fontSize: 9, color: GRAY, textAlign: 'right', paddingRight: 8 },
  totalValue: { width: 90, fontSize: 9, textAlign: 'right' },
  grandTotalRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    backgroundColor: DARK,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  grandTotalLabel: { flex: 1, fontSize: 10, fontWeight: 'bold', color: '#ffffff', textAlign: 'right', paddingRight: 8 },
  grandTotalValue: { width: 90, fontSize: 10, fontWeight: 'bold', color: '#ffffff', textAlign: 'right' },
  notesSection: { marginTop: 16, fontSize: 8, color: GRAY },
  advanceNote: {
    marginTop: 8,
    padding: 6,
    backgroundColor: '#fef9c3',
    borderLeft: '3 solid #eab308',
    fontSize: 8,
  },
});

export type ReceiptApplicationItem = {
  invoice_no: string;
  applied_amount: string;
};

export type ReceiptPDFData = {
  receipt_no: string;
  receipt_date: Date;
  customer_name: string;
  customer_name_th?: string | null;
  customer_tax_id?: string | null;
  customer_address?: string | null;
  customer_phone?: string | null;
  payment_method: string;
  bank_name?: string | null;
  slip_ref?: string | null;
  total_amount: string;
  card_fee: string;
  applications: ReceiptApplicationItem[];
  sum_applied: string;
  advance: string;
  notes?: string | null;
};

export function ReceiptPDF({ data }: { data: ReceiptPDFData }) {
  const paymentLabel = PAYMENT_METHOD_LABELS[data.payment_method] ?? data.payment_method;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyNameEn}>WIND CLINIC</Text>
            <Text style={styles.companyNameTh}>วินด์ คลินิก</Text>
            <Text style={styles.companyDetail}>เลขประจำตัวผู้เสียภาษี: 0105566XXXXXXX</Text>
            <Text style={styles.companyDetail}>กรุงเทพมหานคร, ประเทศไทย</Text>
          </View>
          <View style={styles.docBlock}>
            <Text style={styles.docTitle}>ใบเสร็จรับเงิน</Text>
            <View style={styles.docMetaRow}>
              <Text style={styles.docMetaLabel}>เลขที่:</Text>
              <Text style={styles.docMetaValue}>{data.receipt_no}</Text>
            </View>
            <View style={styles.docMetaRow}>
              <Text style={styles.docMetaLabel}>วันที่:</Text>
              <Text style={styles.docMetaValue}>{fmtDateThai(data.receipt_date)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Customer */}
        <View style={styles.customerSection}>
          <View style={styles.customerBlock}>
            <Text style={styles.billToLabel}>ได้รับเงินจาก</Text>
            <Text style={styles.customerName}>{data.customer_name}</Text>
            {data.customer_name_th ? <Text style={styles.customerDetail}>{data.customer_name_th}</Text> : null}
            {data.customer_tax_id ? <Text style={styles.customerDetail}>เลขผู้เสียภาษี: {data.customer_tax_id}</Text> : null}
            {data.customer_address ? <Text style={styles.customerDetail}>{data.customer_address}</Text> : null}
            {data.customer_phone ? <Text style={styles.customerDetail}>โทร: {data.customer_phone}</Text> : null}
          </View>
        </View>

        {/* Payment method */}
        <View style={styles.paymentSection}>
          <View style={styles.paymentBlock}>
            <Text style={styles.paymentLabel}>ชำระโดย</Text>
            <Text style={styles.paymentValue}>{paymentLabel}</Text>
          </View>
          {data.bank_name ? (
            <View style={styles.paymentBlock}>
              <Text style={styles.paymentLabel}>บัญชีธนาคาร</Text>
              <Text style={styles.paymentValue}>{data.bank_name}</Text>
            </View>
          ) : null}
          {data.slip_ref ? (
            <View style={styles.paymentBlock}>
              <Text style={styles.paymentLabel}>เลขอ้างอิง</Text>
              <Text style={styles.paymentValue}>{data.slip_ref}</Text>
            </View>
          ) : null}
        </View>

        {/* Applications table — only when there are invoice applications */}
        {data.applications.length > 0 ? (
          <View>
            <View style={styles.tableHeaderRow}>
              <Text style={styles.col_no}>#</Text>
              <Text style={styles.col_invoice}>เลขที่ใบแจ้งหนี้</Text>
              <Text style={styles.col_amount}>จำนวนเงิน (บาท)</Text>
            </View>
            {data.applications.map((app, i) => (
              <View key={app.invoice_no} style={styles.tableRow}>
                <Text style={styles.col_no}>{i + 1}</Text>
                <Text style={styles.col_invoice}>{app.invoice_no}</Text>
                <Text style={styles.col_amount}>{fmtMoney(app.applied_amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsTable}>
            {parseFloat(data.card_fee) > 0 ? (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>ค่าธรรมเนียมบัตร:</Text>
                  <Text style={styles.totalValue}>{fmtMoney(data.card_fee)}</Text>
                </View>
              </>
            ) : null}
            {parseFloat(data.advance) > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>เงินมัดจำ (ล่วงหน้า):</Text>
                <Text style={styles.totalValue}>{fmtMoney(data.advance)}</Text>
              </View>
            ) : null}
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>ยอดรวมทั้งสิ้น:</Text>
              <Text style={styles.grandTotalValue}>{fmtMoney(data.total_amount)}</Text>
            </View>
          </View>
        </View>

        {/* Advance note */}
        {parseFloat(data.advance) > 0 ? (
          <View style={styles.advanceNote}>
            <Text>หมายเหตุ: ยอดเงิน {fmtMoney(data.advance)} บาท บันทึกเป็นเงินมัดจำ (Customer Deposit)</Text>
          </View>
        ) : null}

        {data.notes ? (
          <View style={styles.notesSection}>
            <Text>บันทึก: {data.notes}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
