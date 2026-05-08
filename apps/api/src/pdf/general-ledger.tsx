import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { GLDetail, GLDetailRow } from '../lib/reports/general-ledger';

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
  const day = bkk.getDate();
  const month = bkk.getMonth();
  const year = bkk.getFullYear() + 543;
  return `${day} ${THAI_MONTHS[month]} ${year}`;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtMoney(val: string): string {
  if (val === '0.00') return '—';
  const isNeg = val.startsWith('-');
  const abs = isNeg ? val.slice(1) : val;
  const [intRaw, dec] = abs.split('.');
  const intPart = (intRaw ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decPart = (dec ?? '00').padEnd(2, '0').slice(0, 2);
  const formatted = `${intPart}.${decPart}`;
  return isNeg ? `(${formatted})` : formatted;
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 8, fontFamily: 'Sarabun' },

  header: { marginBottom: 12 },
  companyName: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  reportTitle: { fontSize: 11, marginBottom: 2 },
  metaLine: { fontSize: 8, color: '#666666' },

  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 2,
  },

  colDate: { width: '10%' },
  colJeNo: { width: '13%' },
  colDesc: { width: '37%' },
  colDebit: { width: '13%', textAlign: 'right' },
  colCredit: { width: '13%', textAlign: 'right' },
  colBalance: { width: '14%', textAlign: 'right' },

  openingRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    backgroundColor: '#f3f4f6',
    fontWeight: 'bold',
    borderBottom: '0.5 solid #9ca3af',
    marginBottom: 2,
  },

  dataRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderBottom: '0.5 solid #e5e7eb',
  },

  totalsRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderTop: '1 solid #111827',
    fontWeight: 'bold',
    marginTop: 2,
    backgroundColor: '#f9fafb',
  },

  closingRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTop: '2 solid #111827',
    borderBottom: '2 solid #111827',
    marginTop: 4,
    fontWeight: 'bold',
    fontSize: 9,
    backgroundColor: '#f3f4f6',
  },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    textAlign: 'center',
    fontSize: 7,
    color: '#9ca3af',
    borderTop: '0.5 solid #e5e7eb',
    paddingTop: 3,
  },
});

export function GeneralLedgerPDF({ result }: { result: GLDetail }) {
  const fromStr = result.period_from ? fmtDateBE(result.period_from) : 'Beginning';
  const toStr = result.period_to ? fmtDateBE(result.period_to) : 'Present';

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>WIND CLINIC</Text>
          <Text style={styles.reportTitle}>
            General Ledger Detail / บัญชีแยกประเภท
          </Text>
          <Text style={styles.metaLine}>
            Account: {result.account_code} — {result.name_en} ({result.account_type})
            {'  |  '}Period: {fromStr} — {toStr}
            {result.branch !== 'ALL' ? `  |  Branch: ${result.branch}` : ''}
          </Text>
        </View>

        {/* Column headers */}
        <View style={styles.tableHeaderRow}>
          <Text style={styles.colDate}>Date</Text>
          <Text style={styles.colJeNo}>JE No</Text>
          <Text style={styles.colDesc}>Description</Text>
          <Text style={styles.colDebit}>Debit</Text>
          <Text style={styles.colCredit}>Credit</Text>
          <Text style={styles.colBalance}>Balance</Text>
        </View>

        {/* Opening balance */}
        <View style={styles.openingRow}>
          <Text style={styles.colDate}> </Text>
          <Text style={styles.colJeNo}> </Text>
          <Text style={styles.colDesc}>Opening Balance / ยอดยกมา</Text>
          <Text style={styles.colDebit}> </Text>
          <Text style={styles.colCredit}> </Text>
          <Text style={styles.colBalance}>{fmtMoney(result.opening_balance)}</Text>
        </View>

        {/* Transaction rows */}
        {result.rows.map((row: GLDetailRow, i: number) => (
          <View key={i} style={styles.dataRow}>
            <Text style={styles.colDate}>{fmtDate(row.entry_date)}</Text>
            <Text style={styles.colJeNo}>{row.je_no}</Text>
            <Text style={styles.colDesc}>{row.description}</Text>
            <Text style={styles.colDebit}>{row.debit !== '0.00' ? fmtMoney(row.debit) : ''}</Text>
            <Text style={styles.colCredit}>{row.credit !== '0.00' ? fmtMoney(row.credit) : ''}</Text>
            <Text style={styles.colBalance}>{fmtMoney(row.running_balance)}</Text>
          </View>
        ))}

        {/* Period totals */}
        <View style={styles.totalsRow}>
          <Text style={styles.colDate}> </Text>
          <Text style={styles.colJeNo}> </Text>
          <Text style={styles.colDesc}>PERIOD TOTALS / รวมรายการ</Text>
          <Text style={styles.colDebit}>{fmtMoney(result.totals.debit)}</Text>
          <Text style={styles.colCredit}>{fmtMoney(result.totals.credit)}</Text>
          <Text style={styles.colBalance}> </Text>
        </View>

        {/* Closing balance */}
        <View style={styles.closingRow}>
          <Text style={styles.colDate}> </Text>
          <Text style={styles.colJeNo}> </Text>
          <Text style={styles.colDesc}>CLOSING BALANCE / ยอดคงเหลือ</Text>
          <Text style={styles.colDebit}> </Text>
          <Text style={styles.colCredit}> </Text>
          <Text style={styles.colBalance}>{fmtMoney(result.closing_balance)}</Text>
        </View>

        {/* Footer */}
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
