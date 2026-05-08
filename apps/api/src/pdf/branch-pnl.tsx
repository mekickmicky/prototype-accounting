import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { BranchPnLResult, BranchPnLSection, BranchAmounts } from '../lib/reports/branch-pnl';

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

function fmtDateBE(d: Date): string {
  const bkk = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  return `${bkk.getDate()} ${THAI_MONTHS[bkk.getMonth()]} ${bkk.getFullYear() + 543}`;
}

function fmtMoney(val: string): string {
  const isNeg = val.startsWith('-');
  const abs = isNeg ? val.slice(1) : val;
  const [intRaw, dec] = abs.split('.');
  const intPart = (intRaw ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decPart = (dec ?? '00').padEnd(2, '0').slice(0, 2);
  const formatted = `${intPart}.${decPart}`;
  if (formatted === '0.00') return '—';
  return isNeg ? `(${formatted})` : formatted;
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 8, fontFamily: 'Sarabun' },

  header: { marginBottom: 14 },
  companyName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  reportTitle: { fontSize: 10, marginBottom: 2 },
  periodLine: { fontSize: 8, color: '#666666' },

  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },

  sectionHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    marginTop: 6,
  },

  dataRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderBottom: '0.5 solid #e5e7eb',
  },

  subtotalRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderTop: '0.5 solid #9ca3af',
    fontWeight: 'bold',
  },

  derivedRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTop: '1 solid #111827',
    borderBottom: '1 solid #111827',
    marginTop: 6,
    marginBottom: 2,
    fontWeight: 'bold',
    backgroundColor: '#f9fafb',
  },

  netIncomeRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderTop: '2 solid #111827',
    borderBottom: '2 solid #111827',
    marginTop: 8,
    fontWeight: 'bold',
    fontSize: 9,
    backgroundColor: '#f3f4f6',
  },

  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    textAlign: 'center',
    fontSize: 7,
    color: '#9ca3af',
    borderTop: '0.5 solid #e5e7eb',
    paddingTop: 3,
  },

  colCode: { width: '10%' },
  colName: { width: '34%' },
  colAmt: { width: '14%', textAlign: 'right' },
});

function SectionBlock({ section }: { section: BranchPnLSection }) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.colCode}> </Text>
        <Text style={[styles.colName, { fontWeight: 'bold', fontSize: 8 }]}>
          {section.title_en} / {section.title_th}
        </Text>
        <Text style={styles.colAmt}> </Text>
        <Text style={styles.colAmt}> </Text>
        <Text style={styles.colAmt}> </Text>
        <Text style={styles.colAmt}> </Text>
      </View>

      {section.rows.map(row => (
        <View key={row.account_code} style={styles.dataRow}>
          <Text style={styles.colCode}>{row.account_code}</Text>
          <Text style={styles.colName}>{row.name_en}</Text>
          <Text style={styles.colAmt}>{fmtMoney(row.tl)}</Text>
          <Text style={styles.colAmt}>{fmtMoney(row.ek)}</Text>
          <Text style={styles.colAmt}>{fmtMoney(row.rama9)}</Text>
          <Text style={styles.colAmt}>{fmtMoney(row.total)}</Text>
        </View>
      ))}

      <View style={styles.subtotalRow}>
        <Text style={styles.colCode}> </Text>
        <Text style={styles.colName}>Total {section.title_en}</Text>
        <Text style={styles.colAmt}>{fmtMoney(section.tl)}</Text>
        <Text style={styles.colAmt}>{fmtMoney(section.ek)}</Text>
        <Text style={styles.colAmt}>{fmtMoney(section.rama9)}</Text>
        <Text style={styles.colAmt}>{fmtMoney(section.total)}</Text>
      </View>
    </View>
  );
}

function DerivedLine({ label, amounts, rowStyle }: { label: string; amounts: BranchAmounts; rowStyle?: object }) {
  return (
    <View style={rowStyle ?? styles.derivedRow}>
      <Text style={styles.colCode}> </Text>
      <Text style={styles.colName}>{label}</Text>
      <Text style={styles.colAmt}>{fmtMoney(amounts.tl)}</Text>
      <Text style={styles.colAmt}>{fmtMoney(amounts.ek)}</Text>
      <Text style={styles.colAmt}>{fmtMoney(amounts.rama9)}</Text>
      <Text style={styles.colAmt}>{fmtMoney(amounts.total)}</Text>
    </View>
  );
}

export function BranchPnLPDF({ result }: { result: BranchPnLResult }) {
  const periodStr = `${fmtDateBE(result.start_date)} — ${fmtDateBE(result.end_date)}`;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>WIND CLINIC</Text>
          <Text style={styles.reportTitle}>
            Branch Profit & Loss / กำไรขาดทุนแยกตามสาขา
          </Text>
          <Text style={styles.periodLine}>Period: {periodStr}</Text>
        </View>

        <View style={styles.tableHeaderRow}>
          <Text style={styles.colCode}>Code</Text>
          <Text style={styles.colName}>Account</Text>
          <Text style={styles.colAmt}>TL</Text>
          <Text style={styles.colAmt}>EK</Text>
          <Text style={styles.colAmt}>RAMA9</Text>
          <Text style={styles.colAmt}>Total</Text>
        </View>

        <SectionBlock section={result.revenue} />
        <SectionBlock section={result.cogs} />
        <DerivedLine label="GROSS PROFIT / กำไรขั้นต้น" amounts={result.gross_profit} />
        <SectionBlock section={result.opex} />
        <DerivedLine label="OPERATING INCOME / กำไรจากการดำเนินงาน" amounts={result.operating_income} />
        <SectionBlock section={result.other} />
        <DerivedLine
          label="NET INCOME (BEFORE TAX) / กำไรสุทธิ (ก่อนภาษี)"
          amounts={result.net_income}
          rowStyle={styles.netIncomeRow}
        />

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}  |  Generated: ${new Date().toISOString().slice(0, 10)}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
