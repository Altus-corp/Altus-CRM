export type ResolverLead = Record<string, any> | null | undefined;

const aliases: Record<string, string[]> = {
  first_name: ["firstName", "First Name"],
  last_name: ["lastName", "Last Name"],
  lastCalledOn: ["last_called_on", "lastCalledOn", "Last Called On"],
  last_called_on: ["lastCalledOn", "Last Called On"],
  leadAcquiredDate: ["lead_acquisition_date", "leadAcquiredDate", "leadAcquisitionDate", "Lead Acquisition Date"],
  lead_acquisition_date: ["leadAcquiredDate", "leadAcquisitionDate", "Lead Acquisition Date"],
  businessCategory: ["business_category", "Business Category"],
  business_category: ["businessCategory", "Business Category"],
  industry: ["industryName", "Industry"],
  natureOfBusiness: ["nature_of_business", "Nature of Business"],
  nature_of_business: ["natureOfBusiness", "Nature of Business"],
  company: ["Company", "Company Name"],
  cellNo: ["cell_no", "mobile", "Mobile", "Cell No"],
  email: ["Email", "Email ID"],
  designation: ["Designation"],
  city: ["City", "Location"],
  leadSource: ["lead_source", "leadSource", "Lead Source", "Source"],
  proposed_solution: ["proposedSolution", "Proposed Solution"],
  inviteSentByIntroducer: ["invite_sent_by_introducer", "inviteSentByIntroducer", "Invite Sent by Introducer"],
  invite_sent_by_introducer: ["inviteSentByIntroducer", "Invite Sent by Introducer"],
  inviteDateSent: ["invite_date_sent", "inviteDateSent", "Invite Date Sent"],
  invite_date_sent: ["inviteDateSent", "Invite Date Sent"],
  introducerCallDone: ["introducer_call_done", "introducerCallDone", "Introducer Call Done"],
  introducer_call_done: ["introducerCallDone", "Introducer Call Done"],
  introducerCallDate: ["introducer_call_date", "introducerCallDate", "Introducer Call Date"],
  introducer_call_date: ["introducerCallDate", "Introducer Call Date"],
  introducerFeedback: ["introducer_feedback", "introducerFeedback", "Introducer Feedback"],
  introducer_feedback: ["introducerFeedback", "Introducer Feedback"],
  introducerName: ["introducer_name", "introducerName", "Introducer Name"],
  introducer_name: ["introducerName", "Introducer Name"],
  employee_name: ["employeeName", "Employee Name"],
  association_network_name: ["associationNetworkName", "associationName", "Association/Network Name"],
  chapterName: ["chapter_name", "chapterName", "Chapter Name"],
  chapter_name: ["chapterName", "chapter", "Chapter Name"],
  callingResolution: ["calling_resolution", "callingResolution", "Calling Resolution"],
  calling_resolution: ["callingResolution", "Calling Resolution"],
  nextCallOn: ["next_call_on", "nextCallOn", "Next Call On"],
  next_call_on: ["nextCallOn", "Next Call On"],
  callingRemarks: ["calling_remarks", "callingRemarks", "Calling Remarks"],
  calling_remarks: ["callingRemarks", "Calling Remarks"],
  introVideoSent: ["intro_video_sent", "introVideoSent", "2 Mins Intro Video Sent"],
  intro_video_sent: ["introVideoSent", "2 Mins Intro Video Sent"],
  emailSent: ["email_sent", "emailSent", "Email Sent"],
  email_sent: ["emailSent", "Email Sent"],
  whatsappMessageSent: ["whatsapp_message_sent", "whatsappMessageSent", "Msg Sent on Whatsapp"],
  whatsapp_message_sent: ["whatsappMessageSent", "lastWhatsAppAt", "Msg Sent on Whatsapp"],
  extraNotes: ["extra_notes", "extraNotes", "extraInfo", "Extra Notes"],
  extra_notes: ["extraNotes", "extraInfo", "Extra Notes"],
  rating: ["leadRating", "Rating"],
};

const direct: Record<string, string> = {
  leadNo: "lead_no", leadTypeCode: "lead_type", company: "company", cellNo: "phone", phone: "phone",
  email: "email", designation: "designation", city: "city", leadSource: "lead_source", sourceSystem: "source_system",
  permission: "permission", stage: "stage", lead_status: "lead_status", psoDate: "pso_date", nextFollowUpAt: "next_follow_up_at",
  owner: "owner_user_id", isPrePsDone: "is_pre_ps_done", first_name: "first_name", last_name: "last_name",
  created_at: "created_at", updated_at: "updated_at", last_opened_at: "last_opened_at",
};
const directFallbacks: Record<string, string[]> = {
  cellNo: ["phone", "alternate_phone"], phone: ["phone", "alternate_phone"], city: ["city", "location"], leadSource: ["lead_source", "lead_source_secondary"],
};

function clean(value: unknown) {
  if (typeof value === "string" && value.trim().toLowerCase() === "not provided") return null;
  return value === "" ? null : value;
}

export function resolveLeadValue(lead: ResolverLead, key: string): unknown {
  if (!lead) return null;
  if (key === "businessCategory") key = "business_category";
  if (key === "name") {
    const first = resolveLeadValue(lead, "first_name");
    const last = resolveLeadValue(lead, "last_name");
    return first || last ? [first, last].filter(Boolean).join(" ") : clean(lead.name);
  }
  const columns = directFallbacks[key] || (direct[key] ? [direct[key]] : []);
  for (const column of columns) {
    const value = clean(lead[column]);
    if (value !== null && value !== undefined) return value;
  }
  if (key in lead && clean(lead[key]) != null) return clean(lead[key]);
  const candidates = [key, ...(aliases[key] || [])];
  const workbook = lead.custom_values?.mishtie_workbook;
  const workbookSources = workbook && typeof workbook === "object" ? Object.values(workbook).filter((source) => source && typeof source === "object" && !Array.isArray(source)) : [];
  for (const source of [lead.custom_values?.lead_fields, lead.custom_values, lead.legacy_finance, ...workbookSources]) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(source, candidate)) {
        const value = clean(source[candidate]);
        if (value !== null && value !== undefined) return value;
      }
    }
  }
  return null;
}
