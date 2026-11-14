/**
 * Keeps database/API product codes stable while using the shorter CRM label
 * requested for Altus OS in user-facing screens.
 */
export function displayProductCode(code: string | null | undefined, fallback = "Product") {
  const value = code?.trim();
  if (!value) return fallback;
  const labels: Record<string, string> = {
    ALTUS_OS: "OS",
    UNCATEGORIZED: "Uncategorized",
  };
  return labels[value.toUpperCase()] ?? value;
}

export function displayProductLabel(product: {
  code: string | null | undefined;
  name?: string | null;
}) {
  const code = product.code?.trim().toUpperCase();
  const shortLabels: Record<string, string> = {
    ALTUS_OS: "OS",
    AMBASSADOR: "Ambassador",
    BSS: "BSS",
    BSSO: "BSSO",
    PS: "PS",
    PSO: "PSO",
    RETAINER: "Retainer",
    KEYNOTE: "Keynote",
    UNCATEGORIZED: "Uncategorized",
  };

  return (code && shortLabels[code]) || displayProductCode(product.code);
}
