drop policy if exists "Admins delete leads" on public.leads;
create policy "Admins delete leads" on public.leads for delete to authenticated using (public.has_role('admin'));
