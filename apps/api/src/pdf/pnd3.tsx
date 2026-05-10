import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { PndAggregateResult, PndRow, PndVendorGroup } from '../lib/tax/pnd-aggregate';

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

function fmtPeriodThai(period_code: string): string {
  const [yearStr, monthStr] = period_code.split('-');
  const month = parseInt(monthStr ?? '1', 10) - 1;
  const year = parseInt(yearStr ?? '2025', 10) + 543;
  return `${THAI_MONTHS[month]} ${year}`;
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
const STRIPE = '#fdf2f4';

export type Pnd3Data = {
  aggregate: PndAggregateResult;
  filing_no: string;
  issuer: {
    name_en: string;
    name_th: string;
    tax_id: string;
    branch_office: string;
    address: string;
  };
  printed_at?: Date;
};

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 8, fontFamily: 'Sarabun', color: DARK },

  titleBlock: { alignItems: 'center', marginBottom: 10 },
  titleMain: { fontSize: 14, fontWeight: 'bold', color: DARK, marginBottom: 2 },
  titleSub: { fontSize: 9, color: GRAY, marginBottom: 2 },
  titleRef: { fontSize: 8, color: ACCENT, fontWeight: 'bold' },

  divider: { borderBottom: '0.5 solid ' + BORDER, marginBottom: 10, marginTop: 4 },

  headerRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  headerBox: {
    flex: 1,
    backgroundColor: LIGHT_BG,
    padding: 8,
    borderLeft: '3 solid ' + ACCENT,
  },
  headerLabel: { fontSize: 6, color: GRAY, marginBottom: 3, fontWeight: 'bold' },
  headerName: { fontSize: 9, fontWeight: 'bold', marginBottom: 1 },
  headerDetail: { fontSize: 7, color: GRAY, marginBottom: 1 },

  summaryRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
  summaryBox: {
    width: '40%',
    backgroundColor: LIGHT_BG,
    padding: 8,
    borderLeft: '3 solid ' + ACCENT,
  },
  summaryLabel: { fontSize: 6, color: GRAY, fontWeight: 'bold', marginBottom: 4 },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderBottom: '0.5 solid ' + BORDER,
  },
  summaryKey: { fontSize: 7, color: GRAY },
  summaryVal: { fontSize: 8, fontWeight: 'bold' },

  sectionLabel: { fontSize: 7, color: GRAY, fontWeight: 'bold', marginBottom: 4 },

  table: {
    borderTop: '0.5 solid ' + BORDER,
    borderLeft: '0.5 solid ' + BORDER,
    borderRight: '0.5 solid ' + BORDER,
    marginBottom: 8,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: DARK,
    color: '#ffffff',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    fontSize: 7,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5 solid ' + BORDER,
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  tableRowStripe: {
    flexDirection: 'row',
    borderBottom: '0.5 solid ' + BORDER,
    paddingVertical: 3,
    paddingHorizontal: 4,
    backgroundColor: STRIPE,
  },
  vendorHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f3e8eb',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottom: '0.5 solid ' + BORDER,
  },

  colNo: { width: 22, textAlign: 'center' },
  colVendor: { flex: 2, paddingRight: 4 },
  colTaxId: { width: 90, textAlign: 'center' },
  colType: { width: 60, textAlign: 'center' },
  colDate: { width: 70, textAlign: 'center' },
  colGross: { width: 80, textAlign: 'right' },
  colRate: { width: 40, textAlign: 'right' },
  colWht: { width: 80, textAlign: 'right' },
  colCert: { width: 70, textAlign: 'center' },

  vendorSubtotal: {
    flexDirection: 'row',
    backgroundColor: '#ede0e2',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottom: '0.5 solid ' + BORDER,
    fontWeight: 'bold',
  },

  grandTotal: {
    flexDirection: 'row',
    backgroundColor: DARK,
    color: '#ffffff',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
  },

  signatureSection: { flexDirection: 'row', marginTop: 24, justifyContent: 'space-between' },
  signatureBox: { width: '35%', alignItems: 'center' },
  signatureLine: { borderTop: '0.5 solid ' + DARK, width: '100%', marginBottom: 4 },
  signatureLabel: { fontSize: 6, color: GRAY, textAlign: 'center' },

  footer: {
    position: 'absolute',
    bottom: 18,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 6,
    color: GRAY,
    borderTop: '0.5 solid ' + BORDER,
    paddingTop: 3,
  },
});

function TableHeader() {
  return (
    <View style={styles.tableHeaderRow}>
      <Text style={styles.colNo}>#</Text>
      <Text style={styles.colVendor}>ชื่อผู้รับเงิน / Payee</Text>
      <Text style={styles.colTaxId}>เลขผู้เสียภาษี</Text>
      <Text style={styles.colType}>ประเภทเงินได้</Text>
      <Text style={styles.colDate}>วันที่จ่าย</Text>
      <Text style={styles.colGross}>ยอดเงินที่จ่าย (฿)</Text>
      <Text style={styles.colRate}>อัตรา</Text>
      <Text style={styles.colWht}>ภาษีที่หัก (฿)</Text>
      <Text style={styles.colCert}>เลขที่ใบรับรอง</Text>
    </View>
  );
}

function VendorSection({ group, rowOffset, isLast }: { group: PndVendorGroup; rowOffset: number; isLast: boolean }) {
  return (
    <>
      {group.lines.map((line: PndRow, i: number) => {
        const rowIndex = rowOffset + i;
        const isStripe = rowIndex % 2 === 1;
        const rowStyle = isStripe ? styles.tableRowStripe : styles.tableRow;
        return (
          <View key={line.record_id} style={rowStyle}>
            <Text style={styles.colNo}>{rowIndex + 1}</Text>
            <Text style={styles.colVendor}>
              {i === 0 ? (group.vendor_name_th ?? group.vendor_name) : ''}
            </Text>
            <Text style={styles.colTaxId}>{i === 0 ? (group.vendor_tax_id ?? '—') : ''}</Text>
            <Text style={styles.colType}>{line.wht_type}</Text>
            <Text style={styles.colDate}>{fmtDateThai(line.payment_date)}</Text>
            <Text style={styles.colGross}>{fmtMoney(line.gross_amount)}</Text>
            <Text style={styles.colRate}>{parseFloat(line.wht_rate).toFixed(0)}%</Text>
            <Text style={styles.colWht}>{fmtMoney(line.wht_amount)}</Text>
            <Text style={styles.colCert}>{line.cert_no}</Text>
          </View>
        );
      })}
      {group.lines.length > 1 && (
        <View style={styles.vendorSubtotal}>
          <Text style={styles.colNo} />
          <Text style={{ ...styles.colVendor, fontSize: 7, color: ACCENT }}>
            รวม {group.vendor_name_th ?? group.vendor_name}
          </Text>
          <Text style={styles.colTaxId} />
          <Text style={styles.colType} />
          <Text style={styles.colDate} />
          <Text style={styles.colGross}>{fmtMoney(group.total_gross)}</Text>
          <Text style={styles.colRate} />
          <Text style={styles.colWht}>{fmtMoney(group.total_wht)}</Text>
          <Text style={styles.colCert} />
        </View>
      )}
    </>
  );
}

export function Pnd3PDF({ data }: { data: Pnd3Data }) {
  const { aggregate, filing_no, issuer, printed_at } = data;
  const printDate = printed_at ?? new Date();

  let rowOffset = 0;
  const vendorSections = aggregate.groups.map((group, gi) => {
    const offset = rowOffset;
    rowOffset += group.lines.length;
    return (
      <VendorSection key={group.vendor_id} group={group} rowOffset={offset} isLast={gi === aggregate.groups.length - 1} />
    );
  });

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.titleMain}>ภ.ง.ด.3 — แบบนำส่งภาษีเงินได้หัก ณ ที่จ่าย (บุคคลธรรมดา)</Text>
          <Text style={styles.titleSub}>PND3 — PERSONAL INCOME TAX WITHHOLDING RETURN (INDIVIDUALS)</Text>
          <Text style={styles.titleRef}>เลขที่ {filing_no} — งวด {fmtPeriodThai(aggregate.period_code)}</Text>
        </View>

        <View style={styles.divider} />

        {/* Issuer info */}
        <View style={styles.headerRow}>
          <View style={styles.headerBox}>
            <Text style={styles.headerLabel}>ผู้จ่ายเงิน / PAYER</Text>
            <Text style={styles.headerName}>{issuer.name_en}</Text>
            <Text style={{ fontSize: 8, marginBottom: 1 }}>{issuer.name_th}</Text>
            <Text style={styles.headerDetail}>{issuer.address}</Text>
            <Text style={styles.headerDetail}>
              เลขประจำตัวผู้เสียภาษี: {issuer.tax_id}  รหัสสาขา: {issuer.branch_office}
            </Text>
          </View>

          {/* Summary box */}
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>สรุปยอด / SUMMARY</Text>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryKey}>ผู้รับเงิน (ราย)</Text>
              <Text style={styles.summaryVal}>{aggregate.recipient_count}</Text>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryKey}>ยอดเงินที่จ่ายรวม</Text>
              <Text style={styles.summaryVal}>{fmtMoney(aggregate.total_gross)} บาท</Text>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryKey}>ภาษีที่หักรวม</Text>
              <Text style={{ ...styles.summaryVal, color: ACCENT }}>{fmtMoney(aggregate.total_wht)} บาท</Text>
            </View>
          </View>
        </View>

        {/* Records table */}
        <Text style={styles.sectionLabel}>รายการ / RECORDS</Text>
        <View style={styles.table}>
          <TableHeader />
          {vendorSections}
          {/* Grand total row */}
          <View style={styles.grandTotal}>
            <Text style={styles.colNo} />
            <Text style={{ ...styles.colVendor, color: '#ffffff' }}>รวมทั้งสิ้น / GRAND TOTAL</Text>
            <Text style={styles.colTaxId} />
            <Text style={styles.colType} />
            <Text style={styles.colDate} />
            <Text style={{ ...styles.colGross, color: '#ffffff' }}>{fmtMoney(aggregate.total_gross)}</Text>
            <Text style={styles.colRate} />
            <Text style={{ ...styles.colWht, color: '#ffffff' }}>{fmtMoney(aggregate.total_wht)}</Text>
            <Text style={styles.colCert} />
          </View>
        </View>

        {/* Signature */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>ลายมือชื่อผู้จ่ายเงิน / Authorized Signatory</Text>
            <Text style={{ fontSize: 6, color: GRAY, textAlign: 'center', marginTop: 2 }}>{issuer.name_en}</Text>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>ตำแหน่ง / Position</Text>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>วันที่ยื่น / Submission Date</Text>
          </View>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${issuer.name_en}  |  ภ.ง.ด.3 ${filing_no}  |  งวด ${fmtPeriodThai(aggregate.period_code)}  |  หน้า ${pageNumber}/${totalPages}  |  พิมพ์: ${printDate.toISOString().slice(0, 10)}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
