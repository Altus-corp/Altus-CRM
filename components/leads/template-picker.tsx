"use client";

import { useEffect, useState } from "react";
import { listTemplatesForAssignment } from "@/app/dashboard/leads/actions";
import { renderTemplate, type MessageTemplate } from "@/app/lib/message-templates";

type Values = { firstName: string; lastName: string | null; product: string | null };

export function TemplatePicker({ assignmentId, channel, values, onPick }: { assignmentId: string; channel: "email" | "whatsapp"; values: Values; onPick: (subject: string, body: string) => void }) {
  const [templates, setTemplates] = useState<(MessageTemplate & { matchesStage: boolean })[] | null>(null);

  useEffect(() => {
    let active = true;
    listTemplatesForAssignment(assignmentId, channel).then((result) => { if (active) setTemplates(result); }).catch(() => { if (active) setTemplates([]); });
    return () => { active = false; };
  }, [assignmentId, channel]);

  if (templates === null) return <p className="mt-3 text-[11px] text-slate-400">Loading templates...</p>;
  if (!templates.length) return <p className="mt-3 text-[11px] text-slate-400">No templates for this product yet. Create them under Templates in the sidebar.</p>;
  const suggested = templates.filter((template) => template.matchesStage);
  const others = templates.filter((template) => !template.matchesStage);
  const option = (template: MessageTemplate) => <option key={template.id} value={template.id}>{template.name}{template.stage_name ? ` (${template.stage_name})` : ""}</option>;

  return <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Template
    <select defaultValue="" onChange={(event) => { const template = templates.find((item) => item.id === event.target.value); if (template) onPick(renderTemplate(template.subject ?? "", values), renderTemplate(template.body, values)); }} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-red-400">
      <option value="">Choose a template (optional)</option>
      {suggested.length > 0 && <optgroup label="For this stage">{suggested.map(option)}</optgroup>}
      {others.length > 0 && <optgroup label="Other stages">{others.map(option)}</optgroup>}
    </select>
  </label>;
}
