import "server-only";
// Generates the Ambassador Agreement PDF — same content/clauses as the manually-produced agreement
// (components/ambassadors/agreement-doc-upload.tsx's "Manual" path uploads that one as a file); this is
// the "Digital" path: the same document, built from the AltusCorp Ambassador record's own data instead of
// a human filling in a template, with the Ambassador's own uploaded signature embedded. Altus Corp's own
// signatory signature is only embedded when AltusCorp's API already has one on file for that record
// (i.e. the record has been approved there) — otherwise that side of the signature block is left blank
// rather than inventing a signature that was never actually given.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb, type RGB } from "pdf-lib";

export type AgreementSignature = { bytes: Uint8Array; kind: "png" | "jpg" } | null;
export type AgreementData = {
  agreementDate: string; // "2026-11-04"
  entityType: string; // "Individual" | "Proprietorship" | ...
  ambassadorDisplayName: string; // ambassadorName || `${firstName} ${lastName}` || entityName
  legalName: string;
  designation: string | null;
  address: string;
  email: string | null;
  contactNumber: string | null;
  pan: string | null;
  gstin: string | null;
  referralFeePercent: number;
  aadhaar: string | null;
  bank: { bankName: string | null; accountHolderName: string | null; accountNumber: string | null; ifscCode: string | null; invoiceEmail: string | null };
  documentsUploaded: { cancelledCheque: boolean; selfie: boolean; panCopy: boolean; kycIdProof: boolean; gstCertificate: boolean };
  ambassadorSignature: AgreementSignature;
  altusSignature: AgreementSignature;
  altusSignatoryName: string;
  altusSignatoryDesignation: string;
};

const RED: RGB = rgb(0.85, 0.04, 0.04);
const MAROON: RGB = rgb(0.35, 0.04, 0.04);
const BLACK: RGB = rgb(0.08, 0.08, 0.08);
const GRAY: RGB = rgb(0.42, 0.42, 0.44);
const LINE: RGB = rgb(0.82, 0.82, 0.84);
const WHITE: RGB = rgb(1, 1, 1);

const PAGE_W = 595.28, PAGE_H = 841.89;
const MARGIN_X = 50, CONTENT_TOP = 715, CONTENT_BOTTOM = 70, HEADER_H = 105;
const REGISTERED_OFFICE = "C-6, Sacred Space, Gambhir Industrial Estate, Near Pravasi Industrial Estate, Kotkar Road, Goregaon East, Mumbai 400063";
const CONTACT_EMAIL = "support@unleashed.in";
const FOOTER_CONTACT = "+91 80970 10410|manan@unleashed.in|www.mananvasa.com";
const FOOTER_ADDRESS = "Sacred Space, C-6, Gambhir Estates, Kotkar Road, Goregaon (E), Mumbai 63";

const TERMS: [string, string][] = [
  ["1. PURPOSE", "The purpose of this Agreement is to establish a referral relationship under which the Ambassador may introduce prospective clients to Altus Corp for: Productivity Shastra; Business Scale-Up Shastra; Altus OS; Customised Solutions/Apps/Dashboard; Retainer Consulting Service. The Ambassador shall be eligible for Referral Fee on qualifying referrals that successfully convert into paying clients, subject to this Agreement."],
  ["2. AMBASSADOR'S RESPONSIBILITIES", "The Ambassador shall: Identify and introduce genuine prospective clients to Altus Corp; Facilitate introductions and communication where required; Provide accurate information to prospective clients; Not make unauthorized commitments, guarantees, discounts, representations, or promises on behalf of Altus Corp; Not negotiate or alter Altus Corp's commercial terms without prior written approval. The Ambassador shall not represent themselves as an employee, partner, agent, director, or legal representative of Altus Corp unless expressly authorized in writing."],
  ["3. REFERRAL FEE", "The Ambassador shall receive a {FEE}% Referral Fee on the eligible sale value of a qualifying referral. Referral Fee shall be calculated on the actual amount received and retained by Altus Corp, excluding GST, applicable taxes, discounts, refunds, cancellations, reversals, credit notes, and amounts not retained by Altus Corp."],
  ["4. TDS", "Referral Fee payments shall be subject to 5% TDS, wherever applicable, or such other rate as may be prescribed under applicable law. Altus Corp shall deduct and deposit applicable TDS in accordance with law and provide the relevant tax documentation to the Ambassador."],
  ["5. ELIGIBILITY OF REFERRAL", "A referral shall qualify for Referral Fee only when: the client has been introduced to Altus Corp by the Ambassador; the referral has been accepted/recorded by Altus Corp; the client is not an existing client or active lead/prospect of Altus Corp; the referral is attributable to the Ambassador; the client purchases an eligible product/service; and Altus Corp receives the applicable client payment. In case of multiple referrals or disputes regarding ownership of a lead, Altus Corp's records and documented communication shall determine referral attribution."],
  ["6. REFERRAL FEE PAYMENT", "Referral Fee shall be paid within 7 working days from the later of: Receipt of the Ambassador's valid invoice; or Receipt of full payment from the referred client by Altus Corp. Referral Fee shall not be processed until the required KYC documents and valid invoice have been received."],
  ["7. KYC & DOCUMENTATION", "The Ambassador shall provide the following documents before Referral Fee payment: Ambassador Onboarding Form, PAN Card, Aadhaar Card, GST Certificate (if applicable), cancelled cheque/bank proof, Business address proof (where applicable), Signed Agreement. Altus Corp may request additional documents required for KYC, taxation, compliance, or payment processing."],
  ["8. REFUND, CANCELLATION & REVERSAL", "If a referred client receives a full or partial refund, cancellation, reversal, credit, or adjustment, the corresponding Referral Fee shall be reversed proportionately. Where Referral Fee has already been paid, Altus Corp may recover or adjust the excess Referral Fee against future Referral Fee payments or otherwise recover the amount from the Ambassador."],
  ["9. PRO-RATA ADJUSTMENT", "Where a client receives a pro-rata billing adjustment, service reduction, downgrade, credit, or any other reduction in service value, Referral Fee shall be calculated only on the final amount actually received and retained by Altus Corp."],
  ["10. RENEWALS", "Referral Fee shall apply only to the initial sale/conversion of the referred client. No Referral Fee shall be payable on renewals, recurring payments, extensions, subsequent purchases, or continued services of the same client unless specifically approved by Altus Corp in writing."],
  ["11. EXISTING CLIENTS & LEADS", "No Referral Fee shall be payable for clients who: Are already existing clients of Altus Corp; Are already active leads/prospects in Altus Corp's records; Were already in discussion with Altus Corp before the referral; Cannot reasonably be attributed to the Ambassador; or Have been referred by multiple sources where Altus Corp determines that the Ambassador is not the qualifying referral source."],
  ["12. SALES & CLIENT MANAGEMENT", "Altus Corp shall have sole authority over pricing, discounts, proposals, negotiations, contracts, invoicing, payment terms, onboarding, service delivery, refunds, cancellations, renewals, and client support. The Ambassador shall not independently bind Altus Corp to any commercial or contractual obligation."],
  ["13. CONFIDENTIALITY", "The Ambassador shall maintain confidentiality of all non-public information relating to Altus Corp, its clients, pricing, products, business strategies, technology, processes, and commercial arrangements. Such information shall not be disclosed or used except for purposes permitted under this Agreement."],
  ["14. USE OF BRAND & MARKETING MATERIAL", "The Ambassador may use only Altus Corp-approved branding, marketing material, product information, and communication for referral purposes. The Ambassador shall not make misleading claims, publish unauthorized pricing, provide guarantees, modify official materials, or otherwise misuse Altus Corp's intellectual property."],
  ["15. INDEPENDENT RELATIONSHIP", "The Ambassador is an independent referral partner and not an employee, partner, joint venture, franchisee, or agent of Altus Corp. The Ambassador shall be responsible for their own taxes, expenses, registrations, licenses, and statutory obligations, except for deductions required to be made by Altus Corp under applicable law."],
  ["16. MODIFICATION OF COMMERCIAL TERMS", "The standard commercial terms under this Agreement, including the Referral Fee percentage, eligible products/services, payment terms, or renewal terms, may be modified or varied by mutual written agreement between the Parties. Any transaction-specific exception must be approved in writing by Altus Corp and shall apply only to the transaction or period for which it is approved."],
  ["17. NON-EXCLUSIVITY", "This Agreement is non-exclusive. The Ambassador may undertake other business or referral activities, provided they do not conflict with the confidentiality and other obligations under this Agreement."],
  ["18. TERM & TERMINATION", "Either Party may terminate this Agreement by providing 7 days' written notice. Altus Corp may terminate the Agreement with immediate effect in case of fraud, misrepresentation, misconduct, unauthorized commitments, misuse of the Company's brand, breach of confidentiality, submission of false documents, or any material breach of this Agreement. Termination shall not affect Referral Fees already validly earned, subject to applicable refund, reversal, and adjustment provisions."],
  ["19. INDEMNIFICATION", "The Ambassador shall indemnify and hold Altus Corp harmless against losses, claims, damages, liabilities, costs, or expenses arising from unauthorized representations, misleading statements, breach of confidentiality, misuse of intellectual property, violation of law, or breach of this Agreement by the Ambassador."],
  ["20. DISPUTE RESOLUTION & JURISDICTION", "The Parties shall first attempt to resolve disputes through mutual discussion. If unresolved, the Agreement shall be governed by the laws of India and disputes shall be subject to the jurisdiction of the courts of Mumbai, Maharashtra."],
  ["21. AMENDMENTS & ENTIRE AGREEMENT", "Any amendment to this Agreement shall be valid only when agreed to in writing by the Parties. This Agreement constitutes the entire understanding between the Parties concerning the Ambassador Referral Program and supersedes prior oral or written understandings relating to the same subject."],
];

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = CONTENT_TOP;
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont, private logo: PDFImage | null) { this.addPage(); }

  /** A small right-pointing triangle (▸), drawn as a vector shape instead of a text glyph — the standard
   * PDF fonts' WinAnsi encoding has no glyph for the Unicode arrow character. */
  triangle(x: number, y: number, size: number, color: RGB) {
    this.page.drawSvgPath(`M0 ${-size} L${size * 1.6} 0 L0 ${size} Z`, { x, y, color, borderWidth: 0 });
  }

  addPage() {
    const page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(page);
    this.page = page;

    // Header: thin black top rule, white band, two layered diagonal bands (maroon behind, red in front)
    // sweeping across the upper-right corner — oversized rotated rectangles that the page edge crops,
    // approximating the brand's angled banner — with the logo sitting in the clear white area on the left.
    page.drawRectangle({ x: 0, y: PAGE_H - 4, width: PAGE_W, height: 4, color: BLACK });
    page.drawRectangle({ x: PAGE_W * 0.42, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H + 60, color: MAROON, rotate: degrees(-16) });
    page.drawRectangle({ x: PAGE_W * 0.52, y: PAGE_H - HEADER_H + 10, width: PAGE_W, height: HEADER_H - 20, color: RED, rotate: degrees(-16) });
    if (this.logo) {
      const maxH = HEADER_H - 38, scale = Math.min(1, maxH / this.logo.height, 150 / this.logo.width);
      const dims = this.logo.scale(scale);
      page.drawImage(this.logo, { x: MARGIN_X, y: PAGE_H - HEADER_H / 2 - dims.height / 2 - 6, width: dims.width, height: dims.height });
    } else {
      page.drawText("ALTUS CORP", { x: MARGIN_X, y: PAGE_H - HEADER_H / 2 - 6, size: 16, font: this.bold, color: BLACK });
    }

    // Footer: a white bar with the contact line (triangle-separated), then a solid red bar with the address.
    page.drawRectangle({ x: 0, y: 22, width: PAGE_W, height: 18, color: WHITE });
    const contactParts = FOOTER_CONTACT.split("|");
    const gap = 22, partWidths = contactParts.map((part) => this.font.widthOfTextAtSize(part, 8.5));
    const totalWidth = partWidths.reduce((a, b) => a + b, 0) + gap * (contactParts.length - 1);
    let cx = PAGE_W / 2 - totalWidth / 2;
    contactParts.forEach((part, i) => {
      page.drawText(part, { x: cx, y: 28, size: 8.5, font: this.font, color: BLACK });
      cx += partWidths[i] + 7;
      if (i < contactParts.length - 1) { this.triangle(cx, 31, 3.5, RED); cx += gap - 7; }
    });
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 22, color: RED });
    page.drawText(FOOTER_ADDRESS, { x: PAGE_W / 2 - this.bold.widthOfTextAtSize(FOOTER_ADDRESS, 8) / 2, y: 8, size: 8, font: this.bold, color: WHITE });
    this.y = CONTENT_TOP;
  }

  ensure(space: number) { if (this.y - space < CONTENT_BOTTOM) this.addPage(); }

  wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > maxWidth && line) { lines.push(line); line = word; } else line = test;
      }
      lines.push(line);
    }
    return lines;
  }

  text(value: string, opts: { size?: number; font?: PDFFont; color?: RGB; x?: number; maxWidth?: number; lineGap?: number; after?: number } = {}) {
    const size = opts.size ?? 9.5, font = opts.font ?? this.font, color = opts.color ?? BLACK, x = opts.x ?? MARGIN_X;
    const maxWidth = opts.maxWidth ?? PAGE_W - MARGIN_X * 2 - (x - MARGIN_X);
    const lineGap = opts.lineGap ?? size + 3.5;
    for (const line of this.wrap(value, font, size, maxWidth)) {
      this.ensure(lineGap);
      this.page.drawText(line, { x, y: this.y, size, font, color });
      this.y -= lineGap;
    }
    this.y -= opts.after ?? 0;
  }

  heading(value: string) {
    this.ensure(26);
    this.y -= 6;
    this.page.drawText(value, { x: MARGIN_X, y: this.y, size: 10.5, font: this.bold, color: RED });
    this.y -= 6;
    this.page.drawLine({ start: { x: MARGIN_X, y: this.y }, end: { x: PAGE_W - MARGIN_X, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= 12;
  }

  /** A two-column "label / value" row, like the sample's info tables. */
  row(label: string, value: string, labelWidth = 160) {
    const size = 9, valueMaxWidth = PAGE_W - MARGIN_X * 2 - labelWidth - 14;
    const lines = this.wrap(value || "—", this.font, size + 0.5, valueMaxWidth);
    const rowHeight = Math.max(20, lines.length * 13 + 8);
    this.ensure(rowHeight);
    this.page.drawRectangle({ x: MARGIN_X, y: this.y - rowHeight, width: PAGE_W - MARGIN_X * 2, height: rowHeight, borderColor: LINE, borderWidth: 0.6, color: rgb(0.98, 0.98, 0.99) });
    this.page.drawText(label.toUpperCase(), { x: MARGIN_X + 8, y: this.y - 13, size: 7.5, font: this.bold, color: GRAY });
    lines.forEach((line, i) => this.page.drawText(line, { x: MARGIN_X + labelWidth, y: this.y - 13 - i * 13, size: size + 0.5, font: this.font, color: BLACK }));
    this.y -= rowHeight;
  }
}

async function embedSignature(doc: PDFDocument, sig: AgreementSignature) {
  if (!sig) return null;
  try { return sig.kind === "png" ? await doc.embedPng(sig.bytes) : await doc.embedJpg(sig.bytes); } catch { return null; }
}

async function embedLogo(doc: PDFDocument): Promise<PDFImage | null> {
  try { return await doc.embedPng(await readFile(path.join(process.cwd(), "public", "agreement-black-logo.png"))); } catch { return null; }
}

export async function generateAmbassadorAgreementPdf(data: AgreementData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc);
  const w = new Writer(doc, font, bold, logo);

  w.y -= 10;
  w.page.drawText("AMBASSADOR AGREEMENT FORM", { x: MARGIN_X, y: w.y, size: 9, font: bold, color: RED });
  w.y -= 18;
  w.page.drawText("Ambassador Agreement Form", { x: MARGIN_X, y: w.y, size: 20, font: bold, color: BLACK });
  w.y -= 26;

  w.row("Document", "Ambassador Agreement Form");
  w.row("Agreement Date", data.agreementDate);
  w.row("Ambassador / Entity", data.ambassadorDisplayName);
  w.row("Entity Type", data.entityType);
  w.row("Registered Office (Altus Corp)", REGISTERED_OFFICE);
  w.row("Contact", CONTACT_EMAIL);
  w.y -= 8;

  const summary = `Referral partnership for Productivity Shastra, Business Scale-Up Shastra, Altus OS, Customised Solutions/Apps/Dashboard, and Retainer Consulting Service. Referral Fee: ${data.referralFeePercent}% of eligible sale value retained by Altus Corp, subject to TDS and the terms below.`;
  const summaryLines = w.wrap(summary, font, 9.5, PAGE_W - MARGIN_X * 2 - 16);
  const summaryHeight = summaryLines.length * 13 + 14;
  w.ensure(summaryHeight);
  w.page.drawRectangle({ x: MARGIN_X, y: w.y - summaryHeight, width: PAGE_W - MARGIN_X * 2, height: summaryHeight, color: rgb(0.98, 0.95, 0.95) });
  w.page.drawRectangle({ x: MARGIN_X, y: w.y - summaryHeight, width: 3, height: summaryHeight, color: RED });
  summaryLines.forEach((line, i) => w.page.drawText(line, { x: MARGIN_X + 12, y: w.y - 14 - i * 13, size: 9, font, color: rgb(0.3, 0.3, 0.3) }));
  w.y -= summaryHeight + 14;

  const intro = `This Ambassador Agreement Form ("Agreement") is entered into on ${data.agreementDate} BETWEEN Altus Corp, having its office at ${REGISTERED_OFFICE} ("Altus Corp" / "Company") AND ${data.ambassadorDisplayName} (${data.entityType}), Address: ${data.address || "—"}; PAN: ${data.pan || "—"}${data.gstin ? `; GSTIN: ${data.gstin}` : ""}; Email: ${data.email || "—"}; Contact: ${data.contactNumber || "—"} ("Ambassador").`;
  w.text(intro, { after: 10 });

  w.heading("Terms & conditions");
  TERMS.forEach(([title, body]) => { w.text(title, { size: 9.5, font: bold, color: BLACK, after: 3 }); w.text(body.replace("{FEE}", String(data.referralFeePercent)), { after: 10 }); });

  w.addPage();
  w.page.drawText("Ambassador application details", { x: MARGIN_X, y: w.y, size: 13, font: bold, color: BLACK });
  w.y -= 22;
  w.row("Agreement date", data.agreementDate);
  w.row("Entity type", data.entityType);
  w.row("Ambassador / Entity name", data.ambassadorDisplayName);
  w.row("Referral fee", `${data.referralFeePercent}%`);
  w.row("Email", data.email || "—");
  w.row("Contact number", data.contactNumber || "—");
  w.row("PAN", data.pan || "—");
  w.row("GSTIN", data.gstin || "—");
  w.row("Address", data.address || "—");
  w.row("Legal name", data.legalName);
  w.row("Designation", data.designation || "—");
  w.row("Aadhaar / Gov ID", data.aadhaar || "—");
  w.row("Bank name", data.bank.bankName || "—");
  w.row("Account holder name", data.bank.accountHolderName || "—");
  w.row("Account number", data.bank.accountNumber || "—");
  w.row("IFSC", data.bank.ifscCode || "—");
  w.row("Invoice email", data.bank.invoiceEmail || "—");
  w.row("Cancelled cheque / bank proof", data.documentsUploaded.cancelledCheque ? "Yes" : "No");
  w.row("PAN copy", data.documentsUploaded.panCopy ? "Yes" : "No");
  w.row("KYC / ID proof", data.documentsUploaded.kycIdProof ? "Yes" : "No");
  w.row("GST certificate", data.documentsUploaded.gstCertificate ? "Yes" : "No");
  w.row("Typed full name (signature)", data.ambassadorDisplayName);
  w.y -= 14;

  w.ensure(170);
  w.page.drawText("Signature & acceptance", { x: MARGIN_X, y: w.y, size: 12, font: bold, color: BLACK });
  w.y -= 18;
  w.text("By signing below, both Parties confirm that they have read, understood, and agreed to the terms of this Agreement.", { size: 8.5, color: GRAY, after: 14 });

  const colWidth = (PAGE_W - MARGIN_X * 2 - 20) / 2;
  const leftX = MARGIN_X, rightX = MARGIN_X + colWidth + 20;
  const blockTop = w.y;
  w.page.drawText("FOR ALTUS CORP", { x: leftX, y: blockTop, size: 9.5, font: bold, color: BLACK });
  w.page.drawText("AMBASSADOR", { x: rightX, y: blockTop, size: 9.5, font: bold, color: BLACK });

  const altusImg = await embedSignature(doc, data.altusSignature);
  const ambImg = await embedSignature(doc, data.ambassadorSignature);
  const sigY = blockTop - 55;
  const sigH = 45;
  if (altusImg) { const dims = altusImg.scale(Math.min(1, sigH / altusImg.height, 120 / altusImg.width)); w.page.drawImage(altusImg, { x: leftX, y: sigY, width: dims.width, height: dims.height }); }
  if (ambImg) { const dims = ambImg.scale(Math.min(1, sigH / ambImg.height, 120 / ambImg.width)); w.page.drawImage(ambImg, { x: rightX, y: sigY, width: dims.width, height: dims.height }); }

  const lineY = blockTop - 62;
  w.page.drawLine({ start: { x: leftX, y: lineY }, end: { x: leftX + colWidth, y: lineY }, thickness: 0.6, color: LINE });
  w.page.drawLine({ start: { x: rightX, y: lineY }, end: { x: rightX + colWidth, y: lineY }, thickness: 0.6, color: LINE });
  const detailLines = (name: string, designation: string, date: string) => [`Name: ${name}`, `Designation: ${designation}`, `Date: ${date}`];
  detailLines(data.altusSignatoryName, data.altusSignatoryDesignation, data.agreementDate).forEach((line, i) => w.page.drawText(line, { x: leftX, y: lineY - 14 - i * 13, size: 9, font, color: BLACK }));
  detailLines(data.ambassadorDisplayName, data.designation || data.entityType, data.agreementDate).forEach((line, i) => w.page.drawText(line, { x: rightX, y: lineY - 14 - i * 13, size: 9, font, color: BLACK }));

  return doc.save();
}
