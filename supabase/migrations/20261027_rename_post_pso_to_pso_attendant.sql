-- Post PSO is the PSO attendant stage, so show it under that name.
update public.lead_stages stage
set name = 'PSO Attendant'
from public.lead_products product
where stage.product_id = product.id
  and upper(product.code) = 'PSO'
  and lower(stage.name) = 'post pso'
  and not exists (
    select 1 from public.lead_stages other
    where other.product_id = stage.product_id and lower(other.name) = 'pso attendant'
  );
