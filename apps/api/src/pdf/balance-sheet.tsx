import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { BSResult, BSSection, BSRow } from '../lib/reports/balance-sheet';

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

function fmtDateBE(d: Date): string {
  const bkk = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const day = bkk.getDate();
  const month = bkk.getMonth();
  const year = bkk.getFullYear() + 543;
  return `${day} ${THAI_MONTHS[month]} ${year}`;
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
  page: { padding: 40, fontSize: 9, fontFamily: 'Sarabun' },

  header: { marginBottom: 14 },
  companyName: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  reportTitle: { fontSize: 11, marginBottom: 2 },
  asOfLine: { fontSize: 9, color: '#666666' },

  columns: { flexDirection: 'row', flex: 1 },
  leftCol: { width: '49%' },
  divider: { width: '2%' },
  rightCol: { width: '49%' },

  colSectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: '#1f2937',
    color: '#ffffff',
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  subSectionTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    backgroundColor: '#f3f4f6',
    paddingVertical: 3,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  dataRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderBottom: '0.5 solid #e5e7eb',
  },
  rowCode: { width: '22%' },
  rowName: { width: '52%' },
  rowAmt: { width: '26%', textAlign: 'right' },

  subtotalRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderTop: '0.5 solid #9ca3af',
    fontWeight: 'bold',
    marginTop: 1,
  },
  subtotalLabel: { width: '74%' },
  subtotalAmt: { width: '26%', textAlign: 'right' },

  grandTotalRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTop: '1.5 solid #111827',
    borderBottom: '1.5 solid #111827',
    marginTop: 6,
    fontWeight: 'bold',
    fontSize: 10,
    backgroundColor: '#f3f4f6',
  },
  grandTotalLabel: { width: '74%' },
  grandTotalAmt: { width: '26%', textAlign: 'right' },

  balanceCheckRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#d1fae5',
    borderRadius: 3,
    alignItems: 'center',
  },
  balanceCheckText: { fontWeight: 'bold', color: '#065f46', fontSize: 9 },
  imbalanceBanner: {
    marginTop: 12,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 3,
  },
  imbalanceText: { color: '#b91c1c', fontSize: 9, fontWeight: 'bold' },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
    borderTop: '0.5 solid #e5e7eb',
    paddingTop: 4,
  },
});

function SectionRows({ section }: { section: BSSection }) {
  return (
    <>
      {section.rows.map((row: BSRow) => (
        <View key={row.account_code} style={styles.dataRow}>
          <Text style={styles.rowCode}>{row.account_code}</Text>
          <Text style={styles.rowName}>{row.name_en}</Text>
          <Text style={styles.rowAmt}>{fmtMoney(row.amount)}</Text>
        </View>
      ))}
    </>
  );
}

interface SubtotalProps {
  label: string;
  total: string;
}

function SubtotalLine({ label, total }: SubtotalProps) {
  return (
    <View style={styles.subtotalRow}>
      <Text style={styles.subtotalLabel}>{label}</Text>
      <Text style={styles.subtotalAmt}>{fmtMoney(total)}</Text>
    </View>
  );
}

interface GrandTotalProps {
  label: string;
  total: string;
}

function GrandTotalLine({ label, total }: GrandTotalProps) {
  return (
    <View style={styles.grandTotalRow}>
      <Text style={styles.grandTotalLabel}>{label}</Text>
      <Text style={styles.grandTotalAmt}>{fmtMoney(total)}</Text>
    </View>
  );
}

export function BalanceSheetPDF({ result }: { result: BSResult }) {
  const asOfStr = fmtDateBE(result.as_of instanceof Date ? result.as_of : new Date(result.as_of));

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>WIND CLINIC</Text>
          <Text style={styles.reportTitle}>
            Balance Sheet / งบฐานะการเงิน
          </Text>
          <Text style={styles.asOfLine}>
            As of: {asOfStr}
            {result.branch !== 'ALL' ? `  |  Branch: ${result.branch}` : ''}
          </Text>
        </View>

        {/* Two-column body */}
        <View style={styles.columns}>
          {/* Left column — Assets */}
          <View style={styles.leftCol}>
            <Text style={styles.colSectionTitle}>ASSETS / สินทรัพย์</Text>

            <Text style={styles.subSectionTitle}>
              Current Assets / สินทรัพย์หมุนเวียน
            </Text>
            <SectionRows section={result.assets.current} />
            <SubtotalLine
              label="Total Current Assets"
              total={result.assets.current.total}
            />

            <Text style={styles.subSectionTitle}>
              Non-current Assets / สินทรัพย์ไม่หมุนเวียน
            </Text>
            <SectionRows section={result.assets.non_current} />
            <SubtotalLine
              label="Total Non-current Assets"
              total={result.assets.non_current.total}
            />

            <GrandTotalLine
              label="TOTAL ASSETS / รวมสินทรัพย์"
              total={result.assets.total}
            />
          </View>

          <View style={styles.divider} />

          {/* Right column — Liabilities + Equity */}
          <View style={styles.rightCol}>
            <Text style={styles.colSectionTitle}>LIABILITIES / หนี้สิน</Text>

            <Text style={styles.subSectionTitle}>
              Current Liabilities / หนี้สินหมุนเวียน
            </Text>
            <SectionRows section={result.liabilities.current} />
            <SubtotalLine
              label="Total Current Liabilities"
              total={result.liabilities.current.total}
            />

            {result.liabilities.non_current.rows.length > 0 && (
              <>
                <Text style={styles.subSectionTitle}>
                  Non-current Liabilities / หนี้สินไม่หมุนเวียน
                </Text>
                <SectionRows section={result.liabilities.non_current} />
                <SubtotalLine
                  label="Total Non-current Liabilities"
                  total={result.liabilities.non_current.total}
                />
              </>
            )}

            <SubtotalLine
              label="TOTAL LIABILITIES / รวมหนี้สิน"
              total={result.liabilities.total}
            />

            {/* Equity */}
            <Text style={[styles.subSectionTitle, { marginTop: 8 }]}>
              EQUITY / ส่วนของเจ้าของ
            </Text>
            <SectionRows section={result.equity.items} />
            <SubtotalLine
              label="TOTAL EQUITY / รวมส่วนของเจ้าของ"
              total={result.equity.total}
            />

            <GrandTotalLine
              label="TOTAL LIABILITIES + EQUITY"
              total={result.total_l_and_e}
            />
          </View>
        </View>

        {/* Balance check */}
        {result.balanced ? (
          <View style={styles.balanceCheckRow}>
            <Text style={styles.balanceCheckText}>
              ✓  BALANCED — Total Assets = Total Liabilities + Equity = {fmtMoney(result.assets.total)}
            </Text>
          </View>
        ) : (
          <View style={styles.imbalanceBanner}>
            <Text style={styles.imbalanceText}>
              WARNING: Balance Sheet NOT balanced — imbalance: {fmtMoney(result.imbalance ?? '0.00')}
              {'  '}(Assets {fmtMoney(result.assets.total)} ≠ L+E {fmtMoney(result.total_l_and_e)})
            </Text>
          </View>
        )}

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
