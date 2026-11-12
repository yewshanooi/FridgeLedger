create extension if not exists pgcrypto;

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item text not null check (length(trim(item)) > 0),
  due_date date not null,
  location text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists reminders_user_due_date_idx
  on public.reminders (user_id, done, due_date);

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

alter table if exists public.receipts enable row level security;
alter table if exists public.receipt_items enable row level security;
alter table if exists public.reminders enable row level security;
alter table if exists public.expiry_email_notifications enable row level security;

drop policy if exists "Users can select own receipts" on public.receipts;
drop policy if exists "Users can insert own receipts" on public.receipts;
drop policy if exists "Users can update own receipts" on public.receipts;
drop policy if exists "Users can delete own receipts" on public.receipts;

create policy "Users can select own receipts"
  on public.receipts for select
  using (auth.uid() = user_id);

create policy "Users can insert own receipts"
  on public.receipts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own receipts"
  on public.receipts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own receipts"
  on public.receipts for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can select own receipt items" on public.receipt_items;
drop policy if exists "Users can insert own receipt items" on public.receipt_items;
drop policy if exists "Users can update own receipt items" on public.receipt_items;
drop policy if exists "Users can delete own receipt items" on public.receipt_items;

create policy "Users can select own receipt items"
  on public.receipt_items for select
  using (
    exists (
      select 1
      from public.receipts
      where receipts.id = receipt_items.receipt_id
        and receipts.user_id = auth.uid()
    )
  );

create policy "Users can insert own receipt items"
  on public.receipt_items for insert
  with check (
    exists (
      select 1
      from public.receipts
      where receipts.id = receipt_items.receipt_id
        and receipts.user_id = auth.uid()
    )
  );

create policy "Users can update own receipt items"
  on public.receipt_items for update
  using (
    exists (
      select 1
      from public.receipts
      where receipts.id = receipt_items.receipt_id
        and receipts.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.receipts
      where receipts.id = receipt_items.receipt_id
        and receipts.user_id = auth.uid()
    )
  );

create policy "Users can delete own receipt items"
  on public.receipt_items for delete
  using (
    exists (
      select 1
      from public.receipts
      where receipts.id = receipt_items.receipt_id
        and receipts.user_id = auth.uid()
    )
  );

drop policy if exists "Users can select own reminders" on public.reminders;
drop policy if exists "Users can insert own reminders" on public.reminders;
drop policy if exists "Users can update own reminders" on public.reminders;
drop policy if exists "Users can delete own reminders" on public.reminders;

create policy "Users can select own reminders"
  on public.reminders for select
  using (auth.uid() = user_id);

create policy "Users can insert own reminders"
  on public.reminders for insert
  with check (auth.uid() = user_id);

create policy "Users can update own reminders"
  on public.reminders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own reminders"
  on public.reminders for delete
  using (auth.uid() = user_id);

update storage.buckets
set public = false
where id in ('receipt-images', 'receipts');

drop policy if exists "Users can select own receipt images" on storage.objects;
drop policy if exists "Users can insert own receipt images" on storage.objects;
drop policy if exists "Users can update own receipt images" on storage.objects;
drop policy if exists "Users can delete own receipt images" on storage.objects;

create policy "Users can select own receipt images"
  on storage.objects for select
  using (
    bucket_id in ('receipt-images', 'receipts')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can insert own receipt images"
  on storage.objects for insert
  with check (
    bucket_id in ('receipt-images', 'receipts')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own receipt images"
  on storage.objects for update
  using (
    bucket_id in ('receipt-images', 'receipts')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('receipt-images', 'receipts')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own receipt images"
  on storage.objects for delete
  using (
    bucket_id in ('receipt-images', 'receipts')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
