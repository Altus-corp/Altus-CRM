ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_opened_by TEXT REFERENCES users(id);

INSERT INTO dropdown_definitions (id,key,label,source_type,required,default_value,is_visible,is_active,sort_order)
VALUES
  ('dropdown-business-category','business_category','Business category','managed',false,NULL,true,true,230),
  ('dropdown-calling-resolution','calling_resolution','Calling resolution','managed',false,NULL,true,true,240),
  ('dropdown-rating','rating','Rating','managed',false,NULL,true,true,250)
ON CONFLICT (key) DO NOTHING;

INSERT INTO dropdown_options (id,dropdown_id,label,value,sort_order,is_active)
SELECT seed.id, d.id, seed.label, seed.value, seed.sort_order, true
FROM dropdown_definitions d
JOIN (VALUES
  ('business_category','dropdown-option-business-category-retail','Retail','retail',10),
  ('business_category','dropdown-option-business-category-services','Services','services',20),
  ('business_category','dropdown-option-business-category-manufacturing','Manufacturing','manufacturing',30),
  ('business_category','dropdown-option-business-category-other','Other','other',40),
  ('calling_resolution','dropdown-option-calling-resolution-no-answer','No answer','no_answer',10),
  ('calling_resolution','dropdown-option-calling-resolution-interested','Interested','interested',20),
  ('calling_resolution','dropdown-option-calling-resolution-not-interested','Not interested','not_interested',30),
  ('calling_resolution','dropdown-option-calling-resolution-callback','Callback','callback',40),
  ('rating','dropdown-option-rating-one','1','1',10),
  ('rating','dropdown-option-rating-two','2','2',20),
  ('rating','dropdown-option-rating-three','3','3',30),
  ('rating','dropdown-option-rating-four','4','4',40),
  ('rating','dropdown-option-rating-five','5','5',50)
) AS seed(dropdown_key,id,label,value,sort_order) ON seed.dropdown_key=d.key
ON CONFLICT (dropdown_id,value) DO NOTHING;
