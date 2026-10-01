// ---------------------------------------------------------------------------
// Who the invoice is from and to. The supplier bills the company.
//
// No company or supplier details are written into the code: both come from
// environment variables so they can change without touching the source.
//
//   INVOICE_COMPANY_NAME       legal name of the recipient ("Bill to")
//   INVOICE_COMPANY_ADDRESS    address; use "\n" between lines
//   INVOICE_COMPANY_TAX_ID     VAT / tax ID
//   INVOICE_COMPANY_EMAIL      optional
//   INVOICE_PAYMENT_TERMS      footer text, e.g. "Payable within 14 days."
//   INVOICE_SUPPLIER_DETAILS   JSON keyed by supplier name (as in orders.supplier):
//     {"Studio98": {"legalName": "...", "address": "line 1\nline 2",
//                   "taxId": "...", "bankDetails": "IBAN ...\nBIC ...",
//                   "email": "..."}}
// ---------------------------------------------------------------------------

export type Party = {
  name: string;
  addressLines: string[];
  taxId: string | null;
  email: string | null;
  bankDetailsLines: string[];
};

const lines = (value: unknown) =>
  typeof value === 'string' && value.trim()
    ? value.replace(/\\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean)
    : [];

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function getCompanyParty(env: Record<string, string | undefined> = process.env): Party {
  return {
    name: text(env.INVOICE_COMPANY_NAME) ?? 'Company name not configured',
    addressLines: lines(env.INVOICE_COMPANY_ADDRESS),
    taxId: text(env.INVOICE_COMPANY_TAX_ID),
    email: text(env.INVOICE_COMPANY_EMAIL),
    bankDetailsLines: [],
  };
}

export function getPaymentTerms(env: Record<string, string | undefined> = process.env): string {
  return text(env.INVOICE_PAYMENT_TERMS) ?? 'Payable within 14 days of the invoice date.';
}

export function getSupplierParty(
  supplier: string,
  env: Record<string, string | undefined> = process.env
): Party {
  let details: Record<string, any> = {};
  try {
    const parsed = JSON.parse(env.INVOICE_SUPPLIER_DETAILS || '{}');
    if (parsed && typeof parsed === 'object') {
      details = parsed[supplier] ?? {};
    }
  } catch {
    // Malformed JSON: fall back to the bare name rather than failing the invoice.
  }

  return {
    name: text(details.legalName) ?? supplier,
    addressLines: lines(details.address),
    taxId: text(details.taxId),
    email: text(details.email),
    bankDetailsLines: lines(details.bankDetails),
  };
}
