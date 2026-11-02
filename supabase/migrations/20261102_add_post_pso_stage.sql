-- Ensure PSO has the Post PSO stage used by the post-event sales workspace.
-- Existing stages and their lead assignments are preserved.
insert into public.lead_stages (product_id, name, position, is_active)
select id, 'Post PSO', 3, true
from public.lead_products
where upper(code) = 'PSO'
on conflict (product_id, name) do update
set position = excluded.position,
    is_active = true;

-- Keep the standard journey in the expected order without removing any
-- additional admin-created PSO stages.
update public.lead_stages as stage
set position = case lower(stage.name)
  when 'pre pso' then 1
  when 'during pso' then 2
  when 'post pso' then 3
  when 'pso attendant' then 4
  else stage.position
end
from public.lead_products as product
where product.id = stage.product_id
  and upper(product.code) = 'PSO';
