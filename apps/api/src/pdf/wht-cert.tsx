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

export type WhtCertData = {
  cert_no: string;
  payment_date: Date;
  wht_type_label: string;
  wht_type_rd_code: string;
  wht_rate: string;
  gross_amount: string;
  wht_amount: string;
  ytd_gross: string;
  ytd_wht: string;
  issuer: {
    name_en: string;
    name_th: string;
    tax_id: string;
    address: string;
    branch_office: string;
  };
  vendor: {
    name: string;
    name_th?: string | null;
    tax_id?: string | null;
    address?: string | null;
  };
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Sarabun', color: DARK },

  // Title block
  titleBlock: { alignItems: 'center', marginBottom: 16 },
  titleMain: { fontSize: 16, fontWeight: 'bold', color: DARK, marginBottom: 2 },
  titleSub: { fontSize: 10, color: GRAY, marginBottom: 2 },
  titleCertNo: { fontSize: 10, color: ACCENT, fontWeight: 'bold' },

  divider: { borderBottom: '0.5 solid ' + BORDER, marginBottom: 12, marginTop: 4 },

  // Two-column party section
  partyRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  partyBox: {
    flex: 1,
    backgroundColor: LIGHT_BG,
    padding: 8,
    borderLeft: '3 solid ' + ACCENT,
  },
  partyLabel: { fontSize: 7, color: GRAY, marginBottom: 3, fontWeight: 'bold' },
  partyName: { fontSize: 10, fontWeight: 'bold', marginBottom: 1 },
  partyNameSub: { fontSize: 8, color: GRAY, marginBottom: 1 },
  partyDetail: { fontSize: 8, color: GRAY, marginBottom: 1 },

  // Income detail table
  sectionLabel: { fontSize: 8, color: GRAY, fontWeight: 'bold', marginBottom: 4 },
  detailTable: {
    borderTop: '0.5 solid ' + BORDER,
    borderLeft: '0.5 solid ' + BORDER,
    borderRight: '0.5 solid ' + BORDER,
    marginBottom: 12,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    backgroundColor: DARK,
    color: '#ffffff',
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontWeight: 'bold',
  },
  detailRow: {
    flexDirection: 'row',
    borderBottom: '0.5 solid ' + BORDER,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  colIncomeType: { flex: 1, paddingRight: 4 },
  colGross: { width: 90, textAlign: 'right' },
  colRate: { width: 60, textAlign: 'right' },
  colWht: { width: 90, textAlign: 'right' },

  // Cumulative section
  cumulativeBox: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  cumulativeInner: {
    width: '55%',
    backgroundColor: LIGHT_BG,
    padding: 8,
    borderLeft: '3 solid ' + ACCENT,
  },
  cumulativeLabel: { fontSize: 7, color: GRAY, fontWeight: 'bold', marginBottom: 6 },
  cumulativeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderBottom: '0.5 solid ' + BORDER,
  },
  cumulativeKey: { fontSize: 8, color: GRAY },
  cumulativeVal: { fontSize: 8, fontWeight: 'bold' },

  // Signature section
  signatureSection: { flexDirection: 'row', marginTop: 36, justifyContent: 'space-between' },
  signatureBox: { width: '40%', alignItems: 'center' },
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

export function WhtCertPDF({ data }: { data: WhtCertData }) {
  const { cert_no, payment_date, wht_type_label, wht_type_rd_code, wht_rate } = data;
  const { gross_amount, wht_amount, ytd_gross, ytd_wht, issuer, vendor } = data;

  const vendorDisplayName = vendor.name_th ?? vendor.name;
  const incomeTypeLabel = `${wht_type_rd_code} ${wht_type_label}`;
  const rateDisplay = `${parseFloat(wht_rate).toFixed(0)}%`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.titleMain}>ใบรับรองการหักภาษี ณ ที่จ่าย</Text>
          <Text style={styles.titleSub}>WITHHOLDING TAX CERTIFICATE (50 ทวิ)</Text>
          <Text style={styles.titleCertNo}>เลขที่ {cert_no}</Text>
        </View>

        <View style={styles.divider} />

        {/* Parties */}
        <View style={styles.partyRow}>
          {/* Issuer */}
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>ผู้จ่ายเงิน / PAYER (ISSUER)</Text>
            <Text style={styles.partyName}>{issuer.name_en}</Text>
            <Text style={styles.partyNameSub}>{issuer.name_th}</Text>
            {issuer.address ? (
              <Text style={styles.partyDetail}>{issuer.address}</Text>
            ) : null}
            <Text style={styles.partyDetail}>
              เลขประจำตัวผู้เสียภาษี: {issuer.tax_id}
            </Text>
            <Text style={styles.partyDetail}>
              รหัสสาขา: {issuer.branch_office}
            </Text>
          </View>

          {/* Vendor (recipient) */}
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>ผู้ถูกหักภาษี ณ ที่จ่าย / PAYEE (RECIPIENT)</Text>
            <Text style={styles.partyName}>{vendorDisplayName}</Text>
            {vendor.name_th && vendor.name_th !== vendor.name ? (
              <Text style={styles.partyNameSub}>{vendor.name}</Text>
            ) : null}
            {vendor.address ? (
              <Text style={styles.partyDetail}>{vendor.address}</Text>
            ) : null}
            <Text style={styles.partyDetail}>
              เลขประจำตัวผู้เสียภาษี: {vendor.tax_id ?? '—'}
            </Text>
          </View>
        </View>

        {/* Payment date */}
        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
          <Text style={{ fontSize: 8, color: GRAY, marginRight: 8 }}>
            วันที่จ่ายเงิน / DATE OF PAYMENT:
          </Text>
          <Text style={{ fontSize: 8, fontWeight: 'bold' }}>
            {fmtDateThai(payment_date)}
          </Text>
        </View>

        {/* Income detail */}
        <Text style={styles.sectionLabel}>
          รายการเงินที่จ่าย / INCOME DETAILS
        </Text>
        <View style={styles.detailTable}>
          <View style={styles.detailHeaderRow}>
            <Text style={styles.colIncomeType}>ประเภทเงินได้ / Type of Income</Text>
            <Text style={styles.colGross}>ยอดเงินที่จ่าย (บาท)</Text>
            <Text style={styles.colRate}>อัตรา</Text>
            <Text style={styles.colWht}>ภาษีที่หัก (บาท)</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.colIncomeType}>{incomeTypeLabel}</Text>
            <Text style={styles.colGross}>{fmtMoney(gross_amount)}</Text>
            <Text style={styles.colRate}>{rateDisplay}</Text>
            <Text style={styles.colWht}>{fmtMoney(wht_amount)}</Text>
          </View>
        </View>

        {/* Cumulative YTD */}
        <View style={styles.cumulativeBox}>
          <View style={styles.cumulativeInner}>
            <Text style={styles.cumulativeLabel}>
              ยอดสะสมตลอดปี / YEAR-TO-DATE CUMULATIVE
            </Text>
            <View style={styles.cumulativeRow}>
              <Text style={styles.cumulativeKey}>ยอดรวมที่จ่ายสะสม</Text>
              <Text style={styles.cumulativeVal}>{fmtMoney(ytd_gross)} บาท</Text>
            </View>
            <View style={styles.cumulativeRow}>
              <Text style={styles.cumulativeKey}>ภาษีที่หักสะสม</Text>
              <Text style={styles.cumulativeVal}>{fmtMoney(ytd_wht)} บาท</Text>
            </View>
          </View>
        </View>

        {/* Signature */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>ลายมือชื่อผู้จ่ายเงิน / Authorized Signature</Text>
            <Text style={styles.signatureDate}>{issuer.name_en}</Text>
            <Text style={styles.signatureDate}>วันที่ {fmtDateThai(payment_date)}</Text>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>ลายมือชื่อผู้รับ / Recipient Signature</Text>
            <Text style={styles.signatureDate}>{vendorDisplayName}</Text>
            <Text style={styles.signatureDate}>วันที่ / Date: ___/___/______</Text>
          </View>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${issuer.name_en}  |  ใบรับรองหัก ณ ที่จ่าย ${cert_no}  |  หน้า ${pageNumber}/${totalPages}  |  พิมพ์: ${new Date().toISOString().slice(0, 10)}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
