drop policy if exists "Authenticated users read product resolutions" on public.lead_product_resolutions;
create policy "Authenticated users read product resolutions"
  on public.lead_product_resolutions for select to authenticated using (true);
