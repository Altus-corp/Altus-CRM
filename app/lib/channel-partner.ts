export function isChannelPartnerColumn(column: { field_key: string; label: string }) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalize(column.label) === "channelpartner" || normalize(column.field_key) === "channelpartner";
}

export function isSeniorAmbassadorColumn(column: { field_key: string; label: string }) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalize(column.label) === "seniorambassador" || normalize(column.field_key) === "seniorambassador";
}
