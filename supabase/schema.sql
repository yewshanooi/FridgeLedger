-- Enable pgcrypto for UUID generation
create extension if not exists pgcrypto;

-- 1. Base table: receipts
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text,
  purchase_date date,
  saved_at timestamptz not null default now(),
  image_url text
);

create index if not exists receipts_user_id_idx on public.receipts (user_id);
create index if not exists receipts_purchase_date_idx on public.receipts (purchase_date);

-- 2. Base table: receipt_items
create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  name text not null,
  normalized_name text,
  category text,
  quantity numeric,
  unit text,
  price numeric,
  shelf_life_days integer,
  status text not null default 'active',
  used_at timestamptz,
  constraint receipt_items_status_check check (status in ('active', 'consumed', 'wasted', 'expired'))
);

create index if not exists receipt_items_receipt_id_idx on public.receipt_items (receipt_id);

-- 3. Reminders table
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item text not null check (length(trim(item)) > 0),
  due_date date not null,
  location text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists reminders_user_due_date_idx on public.reminders (user_id, done, due_date);

-- 4. Expiry email notifications tracking
create table if not exists public.expiry_email_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_item_id uuid not null references public.receipt_items(id) on delete cascade,
  stage text not null check (stage in ('soon')),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, receipt_item_id, stage)
);

create index if not exists expiry_email_notifications_user_stage_idx
  on public.expiry_email_notifications (user_id, stage, sent_at desc);

-- 5. Row Level Security (RLS)
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.reminders enable row level security;
alter table public.expiry_email_notifications enable row level security;

-- RLS Policies for Receipts
drop policy if exists "Users can select own receipts" on public.receipts;
create policy "Users can select own receipts" on public.receipts for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own receipts" on public.receipts;
create policy "Users can insert own receipts" on public.receipts for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own receipts" on public.receipts;
create policy "Users can update own receipts" on public.receipts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own receipts" on public.receipts;
create policy "Users can delete own receipts" on public.receipts for delete using (auth.uid() = user_id);

-- RLS Policies for Receipt Items
drop policy if exists "Users can select own receipt items" on public.receipt_items;
create policy "Users can select own receipt items" on public.receipt_items for select using (
  exists (select 1 from public.receipts where receipts.id = receipt_items.receipt_id and receipts.user_id = auth.uid())
);

drop policy if exists "Users can insert own receipt items" on public.receipt_items;
create policy "Users can insert own receipt items" on public.receipt_items for insert with check (
  exists (select 1 from public.receipts where receipts.id = receipt_items.receipt_id and receipts.user_id = auth.uid())
);

drop policy if exists "Users can update own receipt items" on public.receipt_items;
create policy "Users can update own receipt items" on public.receipt_items for update using (
  exists (select 1 from public.receipts where receipts.id = receipt_items.receipt_id and receipts.user_id = auth.uid())
) with check (
  exists (select 1 from public.receipts where receipts.id = receipt_items.receipt_id and receipts.user_id = auth.uid())
);

drop policy if exists "Users can delete own receipt items" on public.receipt_items;
create policy "Users can delete own receipt items" on public.receipt_items for delete using (
  exists (select 1 from public.receipts where receipts.id = receipt_items.receipt_id and receipts.user_id = auth.uid())
);

-- RLS Policies for Reminders
drop policy if exists "Users can select own reminders" on public.reminders;
create policy "Users can select own reminders" on public.reminders for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own reminders" on public.reminders;
create policy "Users can insert own reminders" on public.reminders for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own reminders" on public.reminders;
create policy "Users can update own reminders" on public.reminders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own reminders" on public.reminders;
create policy "Users can delete own reminders" on public.reminders for delete using (auth.uid() = user_id);

-- 6. Storage Buckets and RLS
insert into storage.buckets (id, name, public)
values ('receipt-images', 'receipt-images', false), ('receipts', 'receipts', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can select own receipt images" on storage.objects;
create policy "Users can select own receipt images" on storage.objects for select using (
  bucket_id in ('receipt-images', 'receipts') and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can insert own receipt images" on storage.objects;
create policy "Users can insert own receipt images" on storage.objects for insert with check (
  bucket_id in ('receipt-images', 'receipts') and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own receipt images" on storage.objects;
create policy "Users can update own receipt images" on storage.objects for update using (
  bucket_id in ('receipt-images', 'receipts') and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id in ('receipt-images', 'receipts') and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own receipt images" on storage.objects;
create policy "Users can delete own receipt images" on storage.objects for delete using (
  bucket_id in ('receipt-images', 'receipts') and (storage.foldername(name))[1] = auth.uid()::text
);
