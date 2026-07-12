-- Categorías (00000000-0000-4000-8000-0000000002NN)
insert into public.categorias (id, sede_id, nombre, orden) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'Arepas Rellenas', 1),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 'Chorizo de Cerdo', 2),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', 'Jugos en Leche', 3),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000001', 'Bebidas', 4)
on conflict (id) do nothing;

-- Productos (precio_cop en centavos)
insert into public.productos (id, sede_id, categoria_id, nombre, descripcion, precio_cop) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201',
   'Super Criollita', 'Queso de tu elección, carne, pollo desmechado y chicharrón', 1700000),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201',
   'Criollita con Res', 'Queso de tu elección y carne desmechada', 1500000),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201',
   'Criollita con Pollo', 'Queso de tu elección y pollo desmechado', 1400000),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201',
   'Criollita de Huevos Pericos', 'Queso de tu elección, huevos pericos y salchicha ranchera', 1100000),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201',
   'Criollita con Queso', 'Queso de tu elección', 800000),
  ('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202',
   'Chorizo Santarrosano', 'Acompañado de arepa y tomate', 1100000),
  ('00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203',
   'Jugo de Fresa en Leche', null, 700000),
  ('00000000-0000-4000-8000-000000000308', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203',
   'Jugo de Mora en Leche', null, 700000),
  ('00000000-0000-4000-8000-000000000309', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203',
   'Jugo de Mango en Leche', null, 700000),
  ('00000000-0000-4000-8000-000000000310', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203',
   'Jugo de Guanábana en Leche', null, 700000),
  ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000204',
   'Gaseosa', 'Precio provisional, ajustar en el CRUD', 400000),
  ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000204',
   'Jugo Hit', 'Precio provisional, ajustar en el CRUD', 400000),
  ('00000000-0000-4000-8000-000000000313', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000204',
   'Café', 'Precio provisional, ajustar en el CRUD', 250000),
  ('00000000-0000-4000-8000-000000000314', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000204',
   'Café en Leche', 'Precio provisional, ajustar en el CRUD', 350000)
on conflict (id) do nothing;

-- Modificadores de las 5 arepas (301..305): grupo Queso (obligatorio, elegir 1)
-- y Adicionales opcionales. Generados con un bloque DO para no repetir 20 inserts.
do $$
declare
  arepa uuid;
begin
  foreach arepa in array array[
    '00000000-0000-4000-8000-000000000301'::uuid,
    '00000000-0000-4000-8000-000000000302'::uuid,
    '00000000-0000-4000-8000-000000000303'::uuid,
    '00000000-0000-4000-8000-000000000304'::uuid,
    '00000000-0000-4000-8000-000000000305'::uuid
  ] loop
    insert into public.modificadores (producto_id, grupo, nombre, precio_delta_cop, obligatorio, max_seleccion)
    select arepa, v.grupo, v.nombre, v.delta, v.obligatorio, 1
    from (values
      ('Queso', 'Queso campesino', 0::bigint, true),
      ('Queso', 'Queso mozzarella', 0::bigint, true),
      ('Adicionales', 'Chorizo', 350000::bigint, false),
      ('Adicionales', 'Chicharrón', 200000::bigint, false)
    ) as v(grupo, nombre, delta, obligatorio)
    where not exists (
      select 1 from public.modificadores m
      where m.producto_id = arepa and m.nombre = v.nombre
    );
  end loop;
end $$;
