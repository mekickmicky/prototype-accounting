import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { TrialBalanceResult, TBRow } from '../lib/reports/trial-balance';

Font.register({
  family: 'Sarabun',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/sarabun/v17/DtVjJx26TKEr37c9WBI.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/sarabun/v17/DtVmJx26TKEr37c9YK5sulw.ttf', fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Sarabun' },
  header: { marginBottom: 16 },
  companyName: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  reportTitle: { fontSize: 11, marginBottom: 2 },
  asOfLine: { fontSize: 9, color: '#666666' },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 8,
  },
  sectionRow: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    marginTop: 4,
  },
  dataRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderBottom: '0.5 solid #e5e7eb',
  },
  totalsRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTop: '1 solid #111827',
    borderBottom: '2 solid #111827',
    marginTop: 4,
    fontWeight: 'bold',
  },
  imbalanceBanner: {
    backgroundColor: '#fee2e2',
    padding: 6,
    marginTop: 8,
  },
  imbalanceText: { color: '#b91c1c', fontSize: 10, fontWeight: 'bold' },
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
  colCode: { width: '11%' },
  colNameTh: { width: '27%' },
  colNameEn: { width: '20%' },
  colType: { width: '8%' },
  colDebit: { width: '12%', textAlign: 'right' },
  colCredit: { width: '12%', textAlign: 'right' },
  colBalance: { width: '10%', textAlign: 'right' },
  totalsLabel: { width: '66%', fontWeight: 'bold' },
});

const TYPE_LABELS: Record<string, string> = {
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  EXPENSE: 'Expenses',
};

const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;

function fmtMoney(val: string): string {
  const [intRaw, dec] = val.split('.');
  const intPart = (intRaw ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decPart = dec ?? '00';
  const formatted = `${intPart}.${decPart}`;
  return formatted === '0.00' ? '—' : formatted;
}

function DataRow({ row }: { row: TBRow }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.colCode}>{row.account_code}</Text>
      <Text style={styles.colNameTh}>{row.name_th}</Text>
      <Text style={styles.colNameEn}>{row.name_en}</Text>
      <Text style={styles.colType}>{row.type}</Text>
      <Text style={styles.colDebit}>{fmtMoney(row.debit_total)}</Text>
      <Text style={styles.colCredit}>{fmtMoney(row.credit_total)}</Text>
      <Text style={styles.colBalance}>{fmtMoney(row.balance)}</Text>
    </View>
  );
}

export function TrialBalancePDF({ result }: { result: TrialBalanceResult }) {
  const grouped = new Map<string, TBRow[]>();
  for (const row of result.rows) {
    const bucket = grouped.get(row.type) ?? [];
    bucket.push(row);
    grouped.set(row.type, bucket);
  }

  const asOfStr =
    result.as_of instanceof Date
      ? result.as_of.toISOString().slice(0, 10)
      : String(result.as_of);

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        {/* Report header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>WIND CLINIC</Text>
          <Text style={styles.reportTitle}>Trial Balance / งบทดลอง</Text>
          <Text style={styles.asOfLine}>
            As of: {asOfStr}
            {result.branch !== 'ALL' ? `  |  Branch: ${result.branch}` : ''}
          </Text>
        </View>

        {/* Column header */}
        <View style={styles.tableHeaderRow}>
          <Text style={styles.colCode}>Code</Text>
          <Text style={styles.colNameTh}>Name (TH)</Text>
          <Text style={styles.colNameEn}>Name (EN)</Text>
          <Text style={styles.colType}>Type</Text>
          <Text style={styles.colDebit}>Debit</Text>
          <Text style={styles.colCredit}>Credit</Text>
          <Text style={styles.colBalance}>Balance</Text>
        </View>

        {/* Rows grouped by account type */}
        {TYPE_ORDER.map(type => {
          const rows = grouped.get(type);
          if (!rows || rows.length === 0) return null;
          return (
            <View key={type}>
              <View style={styles.sectionRow}>
                <Text>{TYPE_LABELS[type] ?? type}</Text>
              </View>
              {rows.map(row => (
                <DataRow key={row.account_code} row={row} />
              ))}
            </View>
          );
        })}

        {/* Grand totals */}
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Grand Total</Text>
          <Text style={styles.colDebit}>{fmtMoney(result.totals.debit)}</Text>
          <Text style={styles.colCredit}>{fmtMoney(result.totals.credit)}</Text>
          <Text style={styles.colBalance}>{fmtMoney(result.totals.balance)}</Text>
        </View>

        {/* Imbalance warning */}
        {result.imbalance != null ? (
          <View style={styles.imbalanceBanner}>
            <Text style={styles.imbalanceText}>
              WARNING: Trial Balance Not Balanced — imbalance: {result.imbalance}
            </Text>
          </View>
        ) : null}

        {/* Page number footer */}
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
