import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { CFResult } from '../lib/reports/cash-flow';
import type { ReportRow, ReportSection } from '../lib/reports/common';

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

  header: { marginBottom: 16 },
  companyName: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  reportTitle: { fontSize: 11, marginBottom: 2 },
  periodLine: { fontSize: 9, color: '#666666' },

  colName: { flex: 1 },
  colAmt: { width: '22%', textAlign: 'right' },

  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },

  mainSectionHeader: {
    flexDirection: 'row',
    backgroundColor: '#374151',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 8,
  },

  subSectionHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    paddingVertical: 3,
    paddingHorizontal: 8,
    fontWeight: 'bold',
    marginTop: 4,
  },

  dataRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderBottom: '0.5 solid #e5e7eb',
  },

  subtotalRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderTop: '0.5 solid #9ca3af',
    fontWeight: 'bold',
  },

  sectionTotalRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTop: '1 solid #111827',
    borderBottom: '1 solid #111827',
    marginTop: 4,
    marginBottom: 2,
    fontWeight: 'bold',
    backgroundColor: '#f9fafb',
  },

  netChangeRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderTop: '2 solid #111827',
    borderBottom: '2 solid #111827',
    marginTop: 10,
    fontWeight: 'bold',
    fontSize: 10,
    backgroundColor: '#f3f4f6',
  },

  reconciliationBlock: {
    marginTop: 12,
    borderTop: '0.5 solid #9ca3af',
    paddingTop: 8,
  },
  reconciliationTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 4,
  },
  reconciliationRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  reconciliationTotalRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderTop: '0.5 solid #9ca3af',
    fontWeight: 'bold',
    marginTop: 2,
  },

  balanceCheckRow: {
    flexDirection: 'row',
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#d1fae5',
    borderRadius: 3,
  },
  balanceCheckText: { fontWeight: 'bold', color: '#065f46', fontSize: 9 },

  imbalanceBanner: {
    marginTop: 8,
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

function SubSection({ section }: { section: ReportSection }) {
  if (section.rows.length === 0) return null;
  return (
    <View>
      <View style={styles.subSectionHeader}>
        <Text style={styles.colName}>{section.title_en} / {section.title_th}</Text>
      </View>
      {section.rows.map((row: ReportRow) => (
        <View key={row.account_code} style={styles.dataRow}>
          <Text style={styles.colName}>{row.account_code}  {row.name_en}</Text>
          <Text style={styles.colAmt}>{fmtMoney(row.amount)}</Text>
        </View>
      ))}
      <View style={styles.subtotalRow}>
        <Text style={styles.colName}>  Total {section.title_en}</Text>
        <Text style={styles.colAmt}>{fmtMoney(section.total)}</Text>
      </View>
    </View>
  );
}

export function CashFlowPDF({ result }: { result: CFResult }) {
  const periodStr = `${fmtDateBE(result.start_date)} — ${fmtDateBE(result.end_date)}`;

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>WIND CLINIC</Text>
          <Text style={styles.reportTitle}>
            Cash Flow Statement / งบกระแสเงินสด (Indirect Method)
          </Text>
          <Text style={styles.periodLine}>
            Period: {periodStr}
            {result.branch !== 'ALL' ? `  |  Branch: ${result.branch}` : ''}
          </Text>
        </View>

        {/* Column headers */}
        <View style={styles.tableHeaderRow}>
          <Text style={styles.colName}>Description</Text>
          <Text style={styles.colAmt}>Amount (THB)</Text>
        </View>

        {/* Operating Activities */}
        <View style={styles.mainSectionHeader}>
          <Text style={styles.colName}>
            OPERATING ACTIVITIES / กระแสเงินสดจากกิจกรรมดำเนินงาน
          </Text>
        </View>

        {/* Net Income */}
        <View style={styles.dataRow}>
          <Text style={styles.colName}>Net Income / กำไรสุทธิ</Text>
          <Text style={styles.colAmt}>{fmtMoney(result.operating.net_income)}</Text>
        </View>

        {/* Depreciation addback */}
        <SubSection section={result.operating.depreciation} />

        {/* Working capital changes */}
        <SubSection section={result.operating.working_capital} />

        {/* Other operating adjustments */}
        <SubSection section={result.operating.other} />

        {/* Operating total */}
        <View style={styles.sectionTotalRow}>
          <Text style={styles.colName}>
            NET CASH FROM OPERATING / เงินสดสุทธิจากกิจกรรมดำเนินงาน
          </Text>
          <Text style={styles.colAmt}>{fmtMoney(result.operating.total)}</Text>
        </View>

        {/* Investing Activities */}
        <View style={styles.mainSectionHeader}>
          <Text style={styles.colName}>
            INVESTING ACTIVITIES / กระแสเงินสดจากกิจกรรมลงทุน
          </Text>
        </View>
        {result.investing.rows.length > 0 ? (
          <>
            {result.investing.rows.map((row: ReportRow) => (
              <View key={row.account_code} style={styles.dataRow}>
                <Text style={styles.colName}>{row.account_code}  {row.name_en}</Text>
                <Text style={styles.colAmt}>{fmtMoney(row.amount)}</Text>
              </View>
            ))}
          </>
        ) : (
          <View style={styles.dataRow}>
            <Text style={[styles.colName, { color: '#9ca3af' }]}>No investing activity</Text>
            <Text style={styles.colAmt}>—</Text>
          </View>
        )}
        <View style={styles.sectionTotalRow}>
          <Text style={styles.colName}>
            NET CASH FROM INVESTING / เงินสดสุทธิจากกิจกรรมลงทุน
          </Text>
          <Text style={styles.colAmt}>{fmtMoney(result.investing.total)}</Text>
        </View>

        {/* Financing Activities */}
        <View style={styles.mainSectionHeader}>
          <Text style={styles.colName}>
            FINANCING ACTIVITIES / กระแสเงินสดจากกิจกรรมจัดหาเงิน
          </Text>
        </View>
        {result.financing.rows.length > 0 ? (
          <>
            {result.financing.rows.map((row: ReportRow) => (
              <View key={row.account_code} style={styles.dataRow}>
                <Text style={styles.colName}>{row.account_code}  {row.name_en}</Text>
                <Text style={styles.colAmt}>{fmtMoney(row.amount)}</Text>
              </View>
            ))}
          </>
        ) : (
          <View style={styles.dataRow}>
            <Text style={[styles.colName, { color: '#9ca3af' }]}>No financing activity</Text>
            <Text style={styles.colAmt}>—</Text>
          </View>
        )}
        <View style={styles.sectionTotalRow}>
          <Text style={styles.colName}>
            NET CASH FROM FINANCING / เงินสดสุทธิจากกิจกรรมจัดหาเงิน
          </Text>
          <Text style={styles.colAmt}>{fmtMoney(result.financing.total)}</Text>
        </View>

        {/* Net Change in Cash */}
        <View style={styles.netChangeRow}>
          <Text style={styles.colName}>
            NET CHANGE IN CASH / เงินสดสุทธิเพิ่ม (ลด)
          </Text>
          <Text style={styles.colAmt}>{fmtMoney(result.net_change)}</Text>
        </View>

        {/* Reconciliation block */}
        <View style={styles.reconciliationBlock}>
          <Text style={styles.reconciliationTitle}>
            Cash Reconciliation / การกระทบยอดเงินสด
          </Text>
          <View style={styles.reconciliationRow}>
            <Text style={styles.colName}>Cash at Beginning of Period / เงินสดต้นงวด</Text>
            <Text style={styles.colAmt}>{fmtMoney(result.cash_begin)}</Text>
          </View>
          <View style={styles.reconciliationRow}>
            <Text style={styles.colName}>Cash at End of Period / เงินสดปลายงวด</Text>
            <Text style={styles.colAmt}>{fmtMoney(result.cash_end)}</Text>
          </View>
          <View style={styles.reconciliationTotalRow}>
            <Text style={styles.colName}>Net Change (End − Begin) / การเปลี่ยนแปลงสุทธิ</Text>
            <Text style={styles.colAmt}>{fmtMoney(result.cash_delta)}</Text>
          </View>
        </View>

        {/* Reconciliation status banner */}
        {result.reconciled ? (
          <View style={styles.balanceCheckRow}>
            <Text style={styles.balanceCheckText}>
              ✓  RECONCILED — Net change from activities = change in cash balance = {fmtMoney(result.net_change)}
            </Text>
          </View>
        ) : (
          <View style={styles.imbalanceBanner}>
            <Text style={styles.imbalanceText}>
              WARNING: Cash Flow NOT reconciled — difference: {fmtMoney(result.reconciliation_diff ?? '0.00')}
              {'  '}(Activities {fmtMoney(result.net_change)} ≠ Cash delta {fmtMoney(result.cash_delta)})
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
