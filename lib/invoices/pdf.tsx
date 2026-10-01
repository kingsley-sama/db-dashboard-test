// The invoice as a PDF — A4 portrait, rendered on the server from the same
// InvoiceDocument the on-screen preview shows, so the two always match.

import 'server-only';
import React from 'react';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { formatEuro } from './calculate.ts';
import type { InvoiceDocument } from './build.ts';
import type { Party } from './parties.ts';

const INK = '#012e64';
const MUTED = '#6b7280';
const RULE = '#e5e7eb';

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 60, paddingHorizontal: 40, fontSize: 9, fontFamily: 'Helvetica', color: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 2 },
  meta: { textAlign: 'right' },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  metaLabel: { color: MUTED, width: 80, textAlign: 'right', marginRight: 8 },
  parties: { flexDirection: 'row', marginBottom: 20 },
  party: { flex: 1, paddingRight: 16 },
  partyLabel: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  partyName: { fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 4, marginBottom: 4, fontFamily: 'Helvetica-Bold', color: INK },
  project: { marginTop: 8, marginBottom: 2, fontFamily: 'Helvetica-Bold', color: INK },
  order: { flexDirection: 'row', marginTop: 4, marginBottom: 1 },
  orderText: { fontFamily: 'Helvetica-Bold' },
  charge: { flexDirection: 'row', paddingVertical: 1 },
  orderTotal: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 2, marginBottom: 4 },
  colDesc: { flex: 1, paddingLeft: 10 },
  colQty: { width: 40, textAlign: 'right' },
  colUnit: { width: 70, textAlign: 'right' },
  colAmount: { width: 70, textAlign: 'right' },
  totals: { marginTop: 16, alignSelf: 'flex-end', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: 1, borderTopColor: INK, fontFamily: 'Helvetica-Bold', fontSize: 11, color: INK },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED },
});

function PartyBlock({ label, party }: { label: string; party: Party }) {
  return (
    <View style={styles.party}>
      <Text style={styles.partyLabel}>{label}</Text>
      <Text style={styles.partyName}>{party.name}</Text>
      {party.addressLines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      {party.taxId && <Text>Tax ID: {party.taxId}</Text>}
      {party.email && <Text>{party.email}</Text>}
      {party.bankDetailsLines.length > 0 && (
        <View style={{ marginTop: 4 }}>
          {party.bankDetailsLines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

function groupByProject(lines: InvoiceDocument['calculation']['lines']) {
  const groups: { projectId: string; projectName: string | null; lines: typeof lines }[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.projectId === line.order.projectId) last.lines.push(line);
    else groups.push({ projectId: line.order.projectId, projectName: line.order.projectName, lines: [line] });
  }
  return groups;
}

function InvoicePdf({ invoice }: { invoice: InvoiceDocument }) {
  const { calculation, request } = invoice;
  return (
    <Document title={`Invoice ${invoice.reference}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>INVOICE</Text>
          <View style={styles.meta}>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Reference</Text><Text>{invoice.reference}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Date</Text><Text>{invoice.issuedOn}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Period</Text><Text>{request.startDate} – {request.endDate}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>View type</Text><Text>{invoice.viewTypeLabel}</Text></View>
          </View>
        </View>

        <View style={styles.parties}>
          <PartyBlock label="From" party={invoice.from} />
          <PartyBlock label="Bill to" party={invoice.billTo} />
        </View>

        <View style={styles.tableHead} fixed>
          <Text style={[styles.colDesc, { paddingLeft: 0 }]}>Description</Text>
          <Text style={styles.colQty}>Qty</Text>
          <Text style={styles.colUnit}>Unit price</Text>
          <Text style={styles.colAmount}>Amount</Text>
        </View>

        {groupByProject(calculation.lines).map((group) => (
          <View key={group.projectId}>
            {/* Keep a project heading with at least its first order. */}
            <Text style={styles.project} minPresenceAhead={80}>
              Project {group.projectId}{group.projectName ? ` · ${group.projectName}` : ''}
            </Text>
            {group.lines.map((line) => (
              <View key={line.order.id} wrap={false}>
                <View style={styles.order}>
                  <Text style={styles.orderText}>
                    Order {line.order.orderRef} · {line.categoryLabel} · delivered {line.order.deliveryDate} · {line.order.quantity} view{line.order.quantity === 1 ? '' : 's'}
                  </Text>
                </View>
                {line.charges.map((charge) => (
                  <View key={charge.chargeType} style={styles.charge}>
                    <Text style={styles.colDesc}>{charge.label}</Text>
                    <Text style={styles.colQty}>{charge.quantity}</Text>
                    <Text style={styles.colUnit}>{formatEuro(charge.unitPrice)}</Text>
                    <Text style={styles.colAmount}>{formatEuro(charge.amount)}</Text>
                  </View>
                ))}
                <View style={styles.orderTotal}>
                  <Text style={[styles.colDesc, { color: MUTED }]}>Order total</Text>
                  <Text style={[styles.colAmount, { fontFamily: 'Helvetica-Bold' }]}>{formatEuro(line.total)}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalRow}><Text>Subtotal</Text><Text>{formatEuro(calculation.subtotal)}</Text></View>
          {calculation.vatRate > 0 && (
            <View style={styles.totalRow}><Text>VAT {calculation.vatRate}%</Text><Text>{formatEuro(calculation.vatAmount)}</Text></View>
          )}
          <View style={styles.grandTotal}><Text>Total</Text><Text>{formatEuro(calculation.total)}</Text></View>
        </View>

        <View style={styles.footer} fixed>
          <Text>{invoice.paymentTerms}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(invoice: InvoiceDocument): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf invoice={invoice} />);
}
