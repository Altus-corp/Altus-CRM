export const LEAD_ADDRESS_FIELD_DEFINITIONS = [
  { field_key: "address_line_1", label: "Address Line 1 - House No/ Flat No/ Building Name", field_type: "text" },
  { field_key: "address_line_2", label: "Address Line 2 - Street Name", field_type: "text" },
  { field_key: "address_line_3", label: "Address Line 3 - Locality Name", field_type: "text" },
  { field_key: "address_line_4", label: "Address Line 4 - Area Name", field_type: "text" },
  { field_key: "country", label: "Country", field_type: "dropdown" },
  { field_key: "state", label: "State", field_type: "dropdown" },
  { field_key: "city", label: "City", field_type: "dropdown" },
  { field_key: "pincode", label: "Pincode", field_type: "text" },
  { field_key: "nearby_landmark", label: "Nearby Landmark", field_type: "text" },
  { field_key: "google_map", label: "Google Map", field_type: "link" },
] as const;

export type LeadAddressFieldKey = (typeof LEAD_ADDRESS_FIELD_DEFINITIONS)[number]["field_key"];

/** Legacy Ambassador syncs stored address values in a labelled import summary. */
export function addressFromAmbassadorSummary(summary: string): Partial<Record<LeadAddressFieldKey, string>> {
  const entries: Record<string, string> = {};
  for (const line of summary.split(/\r?\n/)) {
    const match = /^(Address|Address line 1|Address line 2|City|State|Postal code|Landmark):\s*(.*)$/i.exec(line);
    if (match && !entries[match[1].toLowerCase()]) entries[match[1].toLowerCase()] = match[2].trim();
  }
  return {
    address_line_1: entries["address line 1"] || entries.address || "",
    address_line_2: entries["address line 2"] || "",
    city: entries.city || "", state: entries.state || "", pincode: entries["postal code"] || "", nearby_landmark: entries.landmark || "",
  };
}

export const INDIA_CITIES_BY_STATE: Record<string, string[]> = {
  "Andaman and Nicobar Islands": ["Port Blair"],
  "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Tirupati", "Kurnool"],
  "Arunachal Pradesh": ["Itanagar", "Tawang", "Pasighat"],
  Assam: ["Guwahati", "Dibrugarh", "Silchar", "Jorhat"],
  Bihar: ["Patna", "Gaya", "Muzaffarpur", "Bhagalpur"],
  Chandigarh: ["Chandigarh"],
  Chhattisgarh: ["Raipur", "Bhilai", "Bilaspur", "Durg"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Silvassa", "Diu"],
  Delhi: ["New Delhi", "Delhi"],
  Goa: ["Panaji", "Margao", "Vasco da Gama", "Mapusa"],
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar"],
  Haryana: ["Gurugram", "Faridabad", "Panipat", "Ambala", "Hisar"],
  "Himachal Pradesh": ["Shimla", "Dharamshala", "Solan", "Mandi"],
  "Jammu and Kashmir": ["Srinagar", "Jammu"],
  Jharkhand: ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro"],
  Karnataka: ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi"],
  Kerala: ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam"],
  Ladakh: ["Leh", "Kargil"],
  Lakshadweep: ["Kavaratti"],
  "Madhya Pradesh": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain"],
  Maharashtra: ["Mumbai", "Pune", "Thane", "Navi Mumbai", "Nagpur", "Nashik", "Chhatrapati Sambhajinagar"],
  Manipur: ["Imphal"],
  Meghalaya: ["Shillong", "Tura"],
  Mizoram: ["Aizawl"],
  Nagaland: ["Kohima", "Dimapur"],
  Odisha: ["Bhubaneswar", "Cuttack", "Rourkela", "Puri"],
  Puducherry: ["Puducherry", "Karaikal"],
  Punjab: ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Mohali"],
  Rajasthan: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer"],
  Sikkim: ["Gangtok"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem"],
  Telangana: ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar"],
  Tripura: ["Agartala"],
  "Uttar Pradesh": ["Lucknow", "Noida", "Ghaziabad", "Kanpur", "Varanasi", "Agra", "Prayagraj"],
  Uttarakhand: ["Dehradun", "Haridwar", "Haldwani", "Nainital"],
  "West Bengal": ["Kolkata", "Howrah", "Siliguri", "Durgapur", "Asansol"],
};

export const LEAD_ADDRESS_COUNTRIES = ["India"] as const;
export const INDIA_STATES = Object.keys(INDIA_CITIES_BY_STATE);
export const INDIA_CITIES = [...new Set(Object.values(INDIA_CITIES_BY_STATE).flat())].sort((first, second) => first.localeCompare(second));

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const fieldAliases: Record<LeadAddressFieldKey, string[]> = {
  address_line_1: ["addressline1", "housenoflatnobuildingname"],
  address_line_2: ["addressline2", "streetname"],
  address_line_3: ["addressline3", "localityname"],
  address_line_4: ["addressline4", "areaname"],
  country: ["country"],
  state: ["state"],
  city: ["city"],
  pincode: ["pincode", "postalcode", "zipcode"],
  nearby_landmark: ["nearbylandmark", "landmark"],
  google_map: ["googlemap", "googlemaps", "maplink"],
};

export function isLeadAddressFieldKey(value: string): value is LeadAddressFieldKey {
  return LEAD_ADDRESS_FIELD_DEFINITIONS.some((field) => field.field_key === value);
}

export function leadAddressFieldKeyForColumn(column: { field_key: string; label: string }): LeadAddressFieldKey | null {
  if (isLeadAddressFieldKey(column.field_key)) return column.field_key;
  const key = normalized(column.field_key);
  const label = normalized(column.label);
  return LEAD_ADDRESS_FIELD_DEFINITIONS.find((field) => {
    const aliases = fieldAliases[field.field_key];
    return aliases.includes(key) || aliases.includes(label);
  })?.field_key ?? null;
}

export function locationStates(country: string) {
  return country === "India" ? INDIA_STATES : [];
}

export function locationCities(country: string, state: string) {
  return country === "India" ? INDIA_CITIES_BY_STATE[state] ?? [] : [];
}

export function validateLeadAddressLocation(values: Partial<Record<LeadAddressFieldKey, string>>) {
  const country = values.country?.trim() ?? "";
  const state = values.state?.trim() ?? "";
  const city = values.city?.trim() ?? "";
  if (!country && (state || city)) return "Select Country before State and City.";
  if (country && !LEAD_ADDRESS_COUNTRIES.includes(country as (typeof LEAD_ADDRESS_COUNTRIES)[number])) return "Choose a valid Country.";
  if (state && !locationStates(country).includes(state)) return "Choose a valid State for the selected Country.";
  if (city && !state) return "Select State before City.";
  if (city && !locationCities(country, state).includes(city)) return "Choose a valid City for the selected State.";
  return null;
}
