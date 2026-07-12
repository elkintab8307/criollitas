-- El rol y la sede pasan a app_metadata: user_metadata es editable por el
-- propio usuario (updateUser), lo que permitia autopromoverse a admin.
create or replace function public.current_rol() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
         -> 'app_metadata' ->> 'rol'
$$;

create or replace function public.current_sede_id() returns uuid
language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb
          -> 'app_metadata' ->> 'sede_id')::uuid
$$;

-- Copia los claims existentes y limpia los editables
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
           'rol', raw_user_meta_data->>'rol',
           'sede_id', raw_user_meta_data->>'sede_id')
where raw_user_meta_data ? 'rol';

update auth.users
set raw_user_meta_data = raw_user_meta_data - 'rol' - 'sede_id'
where raw_user_meta_data ? 'rol';
