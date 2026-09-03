import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

export type InvoiceEmailItem = {
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
};

export type InvoiceEmailProps = {
  companyName: string;
  companyLogoUrl?: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  currencyCode: string;
  currencySymbol: string;
  items: InvoiceEmailItem[];
  subtotal: string;
  total: string;
  invoiceUrl: string;
  companyEmail?: string;
  companyPhone?: string;
  showPaymentButton?: boolean;
  paymentUrl?: string;
};

const colors = {
  page: "#f4f5f6",
  card: "#ffffff",
  ink: "#141517",
  muted: "#6b6d70",
  border: "#e6e7e8",
  soft: "#f8f8f9",
  brand: "#d41920",
  brandHover: "#b7141b",
};

function displayInvoiceNumber(invoiceNumber: string): string {
  return invoiceNumber.startsWith("#") ? invoiceNumber : `#${invoiceNumber}`;
}

export function InvoiceSentEmail({
  companyName,
  companyLogoUrl,
  customerName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  items,
  subtotal,
  total,
  invoiceUrl,
  companyEmail,
  companyPhone,
  showPaymentButton = false,
  paymentUrl,
}: InvoiceEmailProps) {
  const preview = `${companyName} sent invoice ${displayInvoiceNumber(invoiceNumber)}`;
  const showPay = Boolean(showPaymentButton && paymentUrl);

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Section style={styles.header}>
              {companyLogoUrl ? (
                <Img src={companyLogoUrl} alt={companyName} width="120" height="40" style={styles.logo} />
              ) : null}
              <Text style={styles.companyName}>{companyName}</Text>
              <Heading as="h1" style={styles.invoiceHeading}>
                Invoice
              </Heading>
              <Text style={styles.invoiceNumber}>{displayInvoiceNumber(invoiceNumber)}</Text>
            </Section>

            <Section style={styles.greeting}>
              <Text style={styles.hello}>Hello {customerName},</Text>
              <Text style={styles.message}>
                Your invoice is ready. Please review the invoice details below.
              </Text>
            </Section>

            <Section style={styles.metaBox}>
              <Row>
                <Column style={styles.metaColumn}>
                  <Text style={styles.metaLabel}>Invoice number</Text>
                  <Text style={styles.metaValue}>{invoiceNumber}</Text>
                </Column>
                <Column style={styles.metaColumn}>
                  <Text style={styles.metaLabel}>Invoice date</Text>
                  <Text style={styles.metaValue}>{invoiceDate}</Text>
                </Column>
              </Row>
              {dueDate ? (
                <Row>
                  <Column style={styles.metaColumn}>
                    <Text style={styles.metaLabel}>Due date</Text>
                    <Text style={styles.metaValue}>{dueDate}</Text>
                  </Column>
                  <Column style={styles.metaColumn} />
                </Row>
              ) : null}
            </Section>

            <Section style={styles.tableWrap}>
              <table style={styles.table} width="100%" cellPadding="0" cellSpacing="0" role="presentation">
                <thead>
                  <tr>
                    <th align="left" style={styles.th}>
                      Description
                    </th>
                    <th align="right" style={styles.thNarrow}>
                      Qty
                    </th>
                    <th align="right" style={styles.thAmount}>
                      Unit Price
                    </th>
                    <th align="right" style={styles.thAmount}>
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={`${item.description}-${index}`}>
                      <td style={styles.td}>{item.description}</td>
                      <td align="right" style={styles.tdNarrow}>
                        {item.quantity}
                      </td>
                      <td align="right" style={styles.tdAmount}>
                        {item.unitPrice}
                      </td>
                      <td align="right" style={styles.tdAmount}>
                        {item.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section style={styles.totals}>
              <Row>
                <Column style={styles.totalsSpacer} />
                <Column style={styles.totalsColumn}>
                  <Row>
                    <Column>
                      <Text style={styles.subtotalLabel}>Subtotal</Text>
                    </Column>
                    <Column>
                      <Text style={styles.subtotalValue}>{subtotal}</Text>
                    </Column>
                  </Row>
                  <Hr style={styles.totalRule} />
                  <Row>
                    <Column>
                      <Text style={styles.totalLabel}>Total</Text>
                    </Column>
                    <Column>
                      <Text style={styles.totalValue}>{total}</Text>
                    </Column>
                  </Row>
                </Column>
              </Row>
            </Section>

            <Section style={styles.actions}>
              {showPay ? (
                <Row>
                  <Column style={styles.actionColumn}>
                    <Button href={invoiceUrl} style={styles.primaryButton}>
                      View Invoice
                    </Button>
                  </Column>
                  <Column style={styles.actionColumn}>
                    <Button href={paymentUrl} style={styles.secondaryButton}>
                      Pay Invoice
                    </Button>
                  </Column>
                </Row>
              ) : (
                <Button href={invoiceUrl} style={styles.primaryButton}>
                  View Invoice
                </Button>
              )}
              <Text style={styles.linkFallback}>
                If the button does not work, copy and paste this link into your browser:
                <br />
                {invoiceUrl}
              </Text>
            </Section>

            <Hr style={styles.footerRule} />
            <Section>
              <Text style={styles.signoff}>Thank you,</Text>
              <Text style={styles.signoffName}>{companyName}</Text>
              {companyEmail || companyPhone ? (
                <Text style={styles.contact}>
                  {[companyEmail, companyPhone].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
              <Text style={styles.automated}>
                This is an automated email. Please do not reply directly to this message.
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: colors.page,
    margin: 0,
    padding: "24px 12px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  container: {
    maxWidth: "600px",
    margin: "0 auto",
    width: "100%",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: "16px",
    border: `1px solid ${colors.border}`,
    padding: "40px 32px",
  },
  header: {
    textAlign: "center" as const,
    paddingBottom: "8px",
  },
  logo: {
    display: "block",
    margin: "0 auto 16px auto",
    maxWidth: "140px",
    height: "auto",
  },
  companyName: {
    margin: "0 0 24px",
    color: colors.ink,
    fontSize: "15px",
    fontWeight: 600,
    letterSpacing: "0.02em",
  },
  invoiceHeading: {
    margin: "0",
    color: colors.ink,
    fontSize: "28px",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
  },
  invoiceNumber: {
    margin: "8px 0 0",
    color: colors.muted,
    fontSize: "16px",
    fontWeight: 500,
  },
  greeting: {
    paddingTop: "28px",
  },
  hello: {
    margin: "0 0 8px",
    color: colors.ink,
    fontSize: "16px",
    fontWeight: 600,
  },
  message: {
    margin: 0,
    color: colors.muted,
    fontSize: "15px",
    lineHeight: "24px",
  },
  metaBox: {
    marginTop: "28px",
    backgroundColor: colors.soft,
    borderRadius: "12px",
    padding: "16px 18px",
  },
  metaColumn: {
    width: "50%",
    verticalAlign: "top",
    paddingBottom: "8px",
  },
  metaLabel: {
    margin: "0 0 4px",
    color: colors.muted,
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
  },
  metaValue: {
    margin: 0,
    color: colors.ink,
    fontSize: "14px",
    fontWeight: 600,
  },
  tableWrap: {
    marginTop: "28px",
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
  },
  th: {
    borderBottom: `1px solid ${colors.border}`,
    color: colors.muted,
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    padding: "0 8px 10px 0",
    textTransform: "uppercase" as const,
  },
  thNarrow: {
    borderBottom: `1px solid ${colors.border}`,
    color: colors.muted,
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    padding: "0 8px 10px",
    textTransform: "uppercase" as const,
    width: "48px",
  },
  thAmount: {
    borderBottom: `1px solid ${colors.border}`,
    color: colors.muted,
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    padding: "0 0 10px 8px",
    textTransform: "uppercase" as const,
    whiteSpace: "nowrap" as const,
  },
  td: {
    borderBottom: `1px solid ${colors.border}`,
    color: colors.ink,
    fontSize: "13px",
    lineHeight: "20px",
    padding: "12px 8px 12px 0",
    verticalAlign: "top",
  },
  tdNarrow: {
    borderBottom: `1px solid ${colors.border}`,
    color: colors.ink,
    fontSize: "13px",
    padding: "12px 8px",
    verticalAlign: "top",
    whiteSpace: "nowrap" as const,
  },
  tdAmount: {
    borderBottom: `1px solid ${colors.border}`,
    color: colors.ink,
    fontSize: "13px",
    padding: "12px 0 12px 8px",
    verticalAlign: "top",
    whiteSpace: "nowrap" as const,
  },
  totals: {
    marginTop: "20px",
  },
  totalsSpacer: {
    width: "46%",
  },
  totalsColumn: {
    width: "54%",
  },
  subtotalLabel: {
    margin: "0 0 4px",
    color: colors.muted,
    fontSize: "13px",
  },
  subtotalValue: {
    margin: "0 0 4px",
    color: colors.ink,
    fontSize: "13px",
    textAlign: "right" as const,
  },
  totalRule: {
    borderColor: colors.border,
    borderTop: `1px solid ${colors.border}`,
    margin: "8px 0",
  },
  totalLabel: {
    margin: 0,
    color: colors.ink,
    fontSize: "15px",
    fontWeight: 700,
  },
  totalValue: {
    margin: 0,
    color: colors.ink,
    fontSize: "18px",
    fontWeight: 700,
    textAlign: "right" as const,
  },
  actions: {
    marginTop: "32px",
    textAlign: "center" as const,
  },
  actionColumn: {
    padding: "0 6px",
    textAlign: "center" as const,
  },
  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: "8px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: "20px",
    padding: "14px 28px",
    textAlign: "center" as const,
    textDecoration: "none",
  },
  secondaryButton: {
    backgroundColor: colors.ink,
    borderRadius: "8px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: "20px",
    padding: "14px 28px",
    textAlign: "center" as const,
    textDecoration: "none",
  },
  linkFallback: {
    margin: "16px 0 0",
    color: colors.muted,
    fontSize: "12px",
    lineHeight: "18px",
    wordBreak: "break-all" as const,
  },
  footerRule: {
    borderColor: colors.border,
    borderTop: `1px solid ${colors.border}`,
    margin: "32px 0 20px",
  },
  signoff: {
    margin: 0,
    color: colors.ink,
    fontSize: "14px",
  },
  signoffName: {
    margin: "4px 0 0",
    color: colors.ink,
    fontSize: "14px",
    fontWeight: 600,
  },
  contact: {
    margin: "8px 0 0",
    color: colors.muted,
    fontSize: "13px",
  },
  automated: {
    margin: "16px 0 0",
    color: colors.muted,
    fontSize: "12px",
    lineHeight: "18px",
  },
};

export default InvoiceSentEmail;
