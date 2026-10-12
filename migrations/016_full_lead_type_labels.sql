UPDATE dropdown_options AS o
SET label = CASE o.value
  WHEN 'DL' THEN 'Direct Lead'
  WHEN 'L' THEN 'Lead'
  WHEN 'QDL' THEN 'Qualified Direct Lead'
  WHEN 'QL' THEN 'Qualified Lead'
  WHEN 'R' THEN 'Referral'
  ELSE o.label
END
FROM dropdown_definitions AS d
WHERE o.dropdown_id = d.id
  AND d.key = 'lead_type'
  AND o.value IN ('DL', 'L', 'QDL', 'QL', 'R');
