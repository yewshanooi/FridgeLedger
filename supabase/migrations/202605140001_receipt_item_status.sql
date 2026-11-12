create extension if not exists pgcrypto;

alter table public.receipt_items
  add column if not exists id uuid default gen_random_uuid();

update public.receipt_items
set id = gen_random_uuid()
where id is null;

alter table public.receipt_items
  alter column id set not null,
  alter column id set default gen_random_uuid();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.receipt_items'::regclass
      and contype = 'p'
  ) then
    alter table public.receipt_items
      add constraint receipt_items_pkey primary key (id);
  end if;
end $$;

alter table public.receipt_items
  add column if not exists status text not null default 'active',
  add column if not exists used_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'receipt_items_status_check'
  ) then
    alter table public.receipt_items
      add constraint receipt_items_status_check
      check (status in ('active', 'consumed', 'wasted', 'expired'));
  end if;
end $$;
