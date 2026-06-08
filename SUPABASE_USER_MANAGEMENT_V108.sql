-- Dashboard OPS V108 - suppression sécurisée d'un utilisateur Auth.
-- À exécuter une seule fois dans le SQL Editor Supabase du même projet.

create or replace function public.delete_ops_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Accès refusé';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Impossible de supprimer le compte actuellement connecté';
  end if;

  if exists (
    select 1
    from public.profiles
    where id = target_user_id
      and role = 'super_admin'
  ) then
    raise exception 'Impossible de supprimer un compte super admin';
  end if;

  delete from auth.users
  where id = target_user_id;
end;
$$;

revoke all on function public.delete_ops_user(uuid) from public;
grant execute on function public.delete_ops_user(uuid) to authenticated;

notify pgrst, 'reload schema';
