export type ResolutionProduct = { code?: string | null; label?: string | null };

export function proposedSolutionTokens(value: unknown): string[] {
  return String(value || "").split(/[,;|]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function proposedProductCodes(value: unknown, products: readonly ResolutionProduct[]): string[] {
  const tokens = proposedSolutionTokens(value);
  return [...new Set(tokens.flatMap((token) => products.filter((product) => String(product.code || "").toLowerCase() === token || String(product.label || "").toLowerCase() === token).map((product) => String(product.code || product.label || ""))).filter(Boolean))];
}

export function resolutionAllowedForProducts(value: unknown, productCodes: readonly string[], activeResolutionsByProduct: Readonly<Record<string, readonly string[]>>): boolean {
  return value != null && value !== "" && productCodes.some((code) => (activeResolutionsByProduct[code] || []).some((resolution) => resolution === String(value)));
}
