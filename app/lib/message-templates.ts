export type MessageTemplate = { id: string; product_id: string; stage_id: string | null; stage_name: string | null; channel: "email" | "whatsapp"; name: string; subject: string | null; body: string; created_by: string | null };

export const templateVariables = ["first_name", "last_name", "full_name", "product"] as const;

export function renderTemplate(text: string, values: { firstName: string; lastName: string | null; product: string | null }) {
  const replacements: Record<string, string> = {
    first_name: values.firstName,
    last_name: values.lastName ?? "",
    full_name: [values.firstName, values.lastName].filter(Boolean).join(" "),
    product: values.product ?? "",
  };
  const aliases: Record<string, string> = { firstname: "first_name", lastname: "last_name", fullname: "full_name", name: "full_name", productname: "product" };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const lower = key.toLowerCase();
    const resolved = aliases[lower] ?? lower;
    return resolved in replacements ? replacements[resolved] : match;
  });
}
