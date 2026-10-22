-- Ejecutar una vez en el SQL Editor de Supabase. Datos exclusivamente ficticios.
create sequence if not exists public.demo_order_code_seq start 1001;

create table if not exists public.products (
  id integer primary key,
  name text not null,
  price integer not null check (price >= 0),
  ingredients text not null,
  allergens text not null,
  stock integer not null check (stock >= 0),
  active boolean not null default true
);

create table if not exists public.knowledge (
  id integer primary key,
  title text not null,
  content text not null,
  active boolean not null default true
);

create table if not exists public.sessions (
  sender_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  code text primary key,
  customer_ref text not null,
  status text not null default 'recibido',
  fulfillment text not null check (fulfillment in ('pickup', 'delivery')),
  zone text,
  address text,
  subtotal integer not null,
  delivery_fee integer not null,
  total integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  order_code text not null references public.orders(code),
  product_id integer not null references public.products(id),
  product_name text not null,
  quantity integer not null check (quantity between 1 and 10),
  unit_price integer not null,
  primary key (order_code, product_id)
);

create table if not exists public.inbound_messages (
  id text primary key,
  received_at timestamptz not null default now()
);

create index if not exists orders_customer_ref_idx on public.orders(customer_ref, created_at desc);

alter table public.products enable row level security;
alter table public.knowledge enable row level security;
alter table public.sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inbound_messages enable row level security;

-- La API solo admite llamadas del Worker mediante la clave secreta.
revoke all on table public.products, public.knowledge, public.sessions,
  public.orders, public.order_items, public.inbound_messages from public, anon, authenticated;
grant all on table public.products, public.knowledge, public.sessions,
  public.orders, public.order_items, public.inbound_messages to service_role;
revoke all on sequence public.demo_order_code_seq from public, anon, authenticated;
grant usage on sequence public.demo_order_code_seq to service_role;

create or replace function public.claim_inbound_message(p_message_id text)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  insert into public.inbound_messages(id) values (p_message_id) on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.claim_inbound_message(text) from public, anon, authenticated;
grant execute on function public.claim_inbound_message(text) to service_role;

create or replace function public.place_demo_order(
  p_customer_ref text,
  p_cart jsonb,
  p_fulfillment text,
  p_zone text,
  p_address text
)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_subtotal integer := 0;
  v_fee integer := 0;
  v_code text;
begin
  if p_customer_ref is null or length(p_customer_ref) < 3
     or p_fulfillment not in ('pickup', 'delivery')
     or jsonb_typeof(p_cart) <> 'array' or jsonb_array_length(p_cart) = 0 then
    raise exception 'Pedido inválido';
  end if;
  if p_fulfillment = 'delivery' then
    if p_zone not in ('Santiago Centro', 'Providencia', 'Ñuñoa') or length(coalesce(p_address, '')) < 8 then
      raise exception 'Zona o dirección inválida';
    end if;
    v_fee := 2500;
  end if;
  v_code := 'DEMO-' || nextval('public.demo_order_code_seq');
  insert into public.orders(code, customer_ref, status, fulfillment, zone, address, subtotal, delivery_fee, total)
  values (v_code, p_customer_ref, 'recibido', p_fulfillment, p_zone, p_address, 0, v_fee, 0);

  for v_item in select * from jsonb_array_elements(p_cart) loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 10 then raise exception 'Cantidad inválida'; end if;
    update public.products
       set stock = stock - v_quantity
     where id = (v_item->>'productId')::integer and active and stock >= v_quantity
    returning * into v_product;
    if not found then raise exception 'SIN_STOCK'; end if;
    insert into public.order_items(order_code, product_id, product_name, quantity, unit_price)
    values (v_code, v_product.id, v_product.name, v_quantity, v_product.price);
    v_subtotal := v_subtotal + v_quantity * v_product.price;
  end loop;

  update public.orders set subtotal = v_subtotal, total = v_subtotal + v_fee where code = v_code;
  return jsonb_build_object('code', v_code, 'status', 'recibido', 'total', v_subtotal + v_fee, 'fulfillment', p_fulfillment);
end;
$$;

revoke all on function public.place_demo_order(text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.place_demo_order(text, jsonb, text, text, text) to service_role;

insert into public.products(id, name, price, ingredients, allergens, stock, active) values
  (1, 'Hamburguesa clásica', 5900, 'pan, carne, lechuga, tomate y salsa de la casa', 'gluten', 25, true),
  (2, 'Hamburguesa con queso', 6900, 'pan, carne, queso, lechuga y salsa de la casa', 'gluten, leche', 20, true),
  (3, 'Papas fritas', 2500, 'papas, aceite y sal', 'puede existir contaminación cruzada', 40, true),
  (4, 'Bebida 350 ml', 1800, 'bebida en lata', 'consultar etiqueta del fabricante', 30, true)
on conflict (id) do nothing;

insert into public.knowledge(id, title, content, active) values
  (1, 'Horarios', 'Atendemos de lunes a sábado de 12:00 a 22:00. Domingo cerrado.', true),
  (2, 'Delivery', 'En esta demo entregamos en Santiago Centro, Providencia y Ñuñoa. El despacho simulado cuesta $2.500.', true),
  (3, 'Retiro', 'El retiro simulado se realiza en el local. La dirección ficticia es Av. Demo 123, Santiago.', true),
  (4, 'Alérgenos', 'La cocina manipula gluten y lácteos. No se garantiza ausencia de contaminación cruzada. Consultar con una persona ante alergias graves.', true),
  (5, 'Pagos', 'Esta es una demostración. No procesamos pagos reales ni enviamos pedidos a cocina.', true)
on conflict (id) do nothing;
