-- =====================================================================
-- VTM CHAT: POORA DATABASE SETUP (ek hi file)
-- Naye ya purane Supabase project dono par chalti hai, aur kitni bhi baar
-- chalayein koi error nahi aata aur data delete nahi hota.
--
-- Kaise chalayein: Supabase -> SQL Editor -> "New query" (nayi KHALI tab)
-- -> poori file paste -> Run.
--
-- Is mein sab kuch hai: tables, login/signup trigger, groups, DMs, unread,
-- reactions, delete audit, admin console, group members add karna, storage.
-- =====================================================================

-- ---------- 1. Tables ----------
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  display_name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text,
  type text not null check (type in ('group','dm')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists room_members (
  room_id uuid references rooms on delete cascade,
  user_id uuid references profiles on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create table if not exists messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references rooms on delete cascade,
  user_id uuid not null references profiles(id),
  body text not null default '',
  reply_to bigint references messages(id) on delete set null,
  file_url text, file_name text, file_type text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists messages_room_id_created_at_idx on messages (room_id, created_at desc);
create table if not exists app_settings (key text primary key, value text not null);
create table if not exists reactions (
  message_id bigint references messages on delete cascade,
  user_id uuid references profiles on delete cascade,
  emoji text not null check (char_length(emoji) <= 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create table if not exists message_audit (
  message_id bigint primary key references messages on delete cascade,
  body text, file_url text, file_name text,
  deleted_at timestamptz not null default now()
);

-- Approval: naya signup tab tak login/chat nahi kar sakta jab tak admin approve na kare.
-- Purane (pehle se maujood) sab users automatically approved rahte hain.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'approved') then
    alter table profiles add column approved boolean not null default true;
    alter table profiles alter column approved set default false;
  end if;
end $$;

-- Profile photo, group photo, pinned chats (har user ke apne pins, private)
alter table profiles add column if not exists avatar_url text;
alter table rooms add column if not exists avatar_url text;
create table if not exists chat_pins (
  user_id uuid references profiles on delete cascade,
  room_id uuid references rooms on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (user_id, room_id)
);

-- Typing indicator (kon likh raha hai) + voice message ki lambai
create table if not exists typing_status (
  room_id uuid references rooms on delete cascade,
  user_id uuid references profiles on delete cascade,
  at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table messages add column if not exists file_secs integer;
-- @mentions: kis kis ko mention kiya, aur @all
alter table messages add column if not exists mentions uuid[] not null default '{}';
alter table messages add column if not exists mention_all boolean not null default false;

-- !!! Invite code. Naya project ho to yeh set hota hai; purana code kabhi overwrite nahi hota.
insert into app_settings values ('invite_code', 'VTM-CHANGE-ME-2026') on conflict (key) do nothing;
insert into rooms (id, name, type) values ('00000000-0000-0000-0000-000000000001', 'General', 'group') on conflict (id) do nothing;

-- ---------- 2. Helper functions ----------
create or replace function is_approved() returns boolean language sql security definer stable set search_path = public as
$$ select coalesce((select approved from profiles where id = auth.uid()), false) $$;

create or replace function is_member(r uuid) returns boolean language sql security definer stable set search_path = public as
$$ select is_approved() and exists (select 1 from room_members where room_id = r and user_id = auth.uid()) $$;

create or replace function is_admin() returns boolean language sql security definer stable set search_path = public as
$$ select coalesce((select is_admin and approved from profiles where id = auth.uid()), false) $$;

create or replace function msg_room(mid bigint) returns uuid language sql security definer stable set search_path = public as
$$ select room_id from messages where id = mid $$;

-- ---------- 3. Signup (invite code check + profile + General room) ----------
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare code text; uname text; first boolean;
begin
  select value into code from app_settings where key = 'invite_code';
  if coalesce(new.raw_user_meta_data->>'invite','') <> code then raise exception 'Invalid invite code'; end if;
  uname := lower(split_part(new.email, '@', 1));
  first := not exists (select 1 from profiles);          -- pehla account: admin + approved. Baqi sab pending.
  insert into profiles (id, username, display_name, is_admin, approved)
    values (new.id, uname, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), uname), first, first);
  if first then insert into room_members (room_id, user_id) values ('00000000-0000-0000-0000-000000000001', new.id); end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- 4. DMs, groups, unread, members ----------
create or replace function start_dm(other uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not is_approved() then raise exception 'Your account is waiting for approval'; end if;
  if other = auth.uid() then raise exception 'Cannot DM yourself'; end if;
  if not exists (select 1 from profiles where id = other and approved) then raise exception 'That account is not approved yet'; end if;
  select r.id into rid from rooms r where r.type = 'dm'
    and exists (select 1 from room_members where room_id = r.id and user_id = auth.uid())
    and exists (select 1 from room_members where room_id = r.id and user_id = other) limit 1;
  if rid is null then
    insert into rooms (type, created_by) values ('dm', auth.uid()) returning id into rid;
    insert into room_members (room_id, user_id) values (rid, auth.uid()), (rid, other);
  end if;
  return rid;
end $$;

create or replace function create_group(gname text, members uuid[]) returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not is_approved() then raise exception 'Your account is waiting for approval'; end if;
  insert into rooms (name, type, created_by) values (left(trim(gname), 60), 'group', auth.uid()) returning id into rid;
  insert into room_members (room_id, user_id) select rid, x from (select distinct unnest(members || auth.uid()) as x) t where exists (select 1 from profiles where id = x and approved);
  return rid;
end $$;

create or replace function add_group_members(rid uuid, members uuid[]) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = rid and type = 'group' and (created_by = auth.uid() or is_admin())) then
    raise exception 'Only the group creator or an admin can add members';
  end if;
  insert into room_members (room_id, user_id)
    select rid, x from (select distinct unnest(members) as x) t
    where exists (select 1 from profiles where id = x and approved)
    on conflict do nothing;
end $$;

create or replace function set_group_avatar(rid uuid, url text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = rid and type = 'group' and (created_by = auth.uid() or is_admin())) then
    raise exception 'Only the group creator or an admin can change the group photo';
  end if;
  update rooms set avatar_url = nullif(url, '') where id = rid;
end $$;

create or replace function typing(r uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member(r) then return; end if;
  insert into typing_status (room_id, user_id, at) values (r, auth.uid(), now())
    on conflict (room_id, user_id) do update set at = now();
end $$;

drop function if exists unread_counts();
create function unread_counts() returns table (room_id uuid, n bigint, m bigint) language sql security definer stable set search_path = public as $$
  select m.room_id, count(*), count(*) filter (where auth.uid() = any (m.mentions) or m.mention_all) from room_members rm
  join messages m on m.room_id = rm.room_id and m.created_at > rm.last_read_at and m.user_id <> rm.user_id and m.deleted_at is null
  where rm.user_id = auth.uid() group by m.room_id $$;

create or replace function mark_read(r uuid) returns void language sql security definer set search_path = public as $$
  update room_members set last_read_at = now() where room_id = r and user_id = auth.uid() $$;

-- ---------- 5. Admin functions ----------
create or replace function admin_stats() returns table (user_id uuid, total bigint, last24 bigint, deleted bigint, last_at timestamptz)
language sql security definer stable set search_path = public as $$
  select p.id, count(m.id), count(m.id) filter (where m.created_at > now() - interval '24 hours'),
         count(m.id) filter (where m.deleted_at is not null), max(m.created_at)
  from profiles p left join messages m on m.user_id = p.id where is_admin() group by p.id $$;

create or replace function admin_rooms() returns table (room_id uuid, n bigint, last_at timestamptz)
language sql security definer stable set search_path = public as $$
  select m.room_id, count(*), max(m.created_at) from messages m where is_admin() group by m.room_id $$;

create or replace function set_approved(uid uuid, flag boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if not flag and uid = auth.uid() then raise exception 'You cannot revoke your own access'; end if;
  update profiles set approved = flag where id = uid;
  if flag then insert into room_members (room_id, user_id) values ('00000000-0000-0000-0000-000000000001', uid) on conflict do nothing; end if;
end $$;

create or replace function reject_user(uid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if exists (select 1 from profiles where id = uid and approved) then raise exception 'Only accounts waiting for approval can be rejected'; end if;
  delete from auth.users where id = uid;
end $$;

create or replace function set_admin(uid uuid, flag boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if not flag and not exists (select 1 from profiles where is_admin and id <> uid) then raise exception 'At least one admin is required'; end if;
  update profiles set is_admin = flag where id = uid;
end $$;

-- ---------- 6. Delete = text sab ke liye khali, asli text sirf admin audit mein ----------
drop trigger if exists msg_update on messages;      -- cleanup ke dauran band
insert into message_audit (message_id, body, file_url, file_name)
  select id, body, file_url, file_name from messages where deleted_at is not null on conflict do nothing;
update messages set body = '', file_url = null, file_name = null, file_type = null
  where deleted_at is not null and (body <> '' or file_url is not null or file_name is not null or file_type is not null);

create or replace function on_msg_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    insert into message_audit (message_id, body, file_url, file_name) values (old.id, old.body, old.file_url, old.file_name) on conflict do nothing;
    new.body := ''; new.file_url := null; new.file_name := null; new.file_type := null; new.file_secs := null;
    new.user_id := old.user_id; new.room_id := old.room_id; new.created_at := old.created_at; new.reply_to := old.reply_to;
  elsif new.body is distinct from old.body or new.file_url is distinct from old.file_url or new.deleted_at is distinct from old.deleted_at
     or new.user_id <> old.user_id or new.room_id <> old.room_id then
    raise exception 'Messages cannot be edited';
  end if;
  return new;
end $$;
create trigger msg_update before update on messages for each row execute function on_msg_update();

-- ---------- 7. Security (Row Level Security) ----------
alter table profiles enable row level security;
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table messages enable row level security;
alter table reactions enable row level security;
alter table message_audit enable row level security;
alter table chat_pins enable row level security;
alter table typing_status enable row level security;
alter table app_settings enable row level security;   -- koi policy nahi = invite code kisi ko nahi dikhta

-- SECURITY: pehle koi bhi user API se apni profile mein is_admin=true likh sakta tha.
-- Ab authenticated sirf display_name aur avatar_url badal sakta hai (username/is_admin nahi).
revoke update on profiles from anon, authenticated;
grant update (display_name, avatar_url) on profiles to authenticated;

drop policy if exists "profiles read" on profiles;
drop policy if exists "profiles edit" on profiles;
drop policy if exists "rooms read" on rooms;
drop policy if exists "rooms admin read" on rooms;
drop policy if exists "members read" on room_members;
drop policy if exists "members admin read" on room_members;
drop policy if exists "msgs read" on messages;
drop policy if exists "msgs admin read" on messages;
drop policy if exists "msgs insert" on messages;
drop policy if exists "msgs delete own" on messages;
drop policy if exists "msgs delete own or admin" on messages;
drop policy if exists "react read" on reactions;
drop policy if exists "react insert" on reactions;
drop policy if exists "react update" on reactions;
drop policy if exists "react delete" on reactions;
drop policy if exists "audit admin read" on message_audit;
drop policy if exists "typing read" on typing_status;
drop policy if exists "pins read" on chat_pins;
drop policy if exists "pins insert" on chat_pins;
drop policy if exists "pins update" on chat_pins;
drop policy if exists "pins delete" on chat_pins;

create policy "profiles read"  on profiles for select to authenticated using (id = auth.uid() or is_admin() or (approved and is_approved()));
create policy "profiles edit"  on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "rooms read"     on rooms for select to authenticated using (is_member(id));
create policy "rooms admin read" on rooms for select to authenticated using (is_admin());
create policy "members read"   on room_members for select to authenticated using (is_member(room_id));
create policy "members admin read" on room_members for select to authenticated using (is_admin());
create policy "msgs read"      on messages for select to authenticated using (is_member(room_id));
create policy "msgs admin read" on messages for select to authenticated using (is_admin());
create policy "msgs insert"    on messages for insert to authenticated with check (user_id = auth.uid() and is_member(room_id));
create policy "msgs delete own or admin" on messages for update to authenticated
  using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());
create policy "react read"   on reactions for select to authenticated using (is_member(msg_room(message_id)) or is_admin());
create policy "react insert" on reactions for insert to authenticated with check (user_id = auth.uid() and is_member(msg_room(message_id)));
create policy "react update" on reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member(msg_room(message_id)));
create policy "react delete" on reactions for delete to authenticated using (user_id = auth.uid());
create policy "audit admin read" on message_audit for select to authenticated using (is_admin());
create policy "typing read" on typing_status for select to authenticated using (is_member(room_id));
create policy "pins read"   on chat_pins for select to authenticated using (user_id = auth.uid());
create policy "pins insert" on chat_pins for insert to authenticated with check (user_id = auth.uid() and is_member(room_id));
create policy "pins update" on chat_pins for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member(room_id));
create policy "pins delete" on chat_pins for delete to authenticated using (user_id = auth.uid());

-- ---------- 8. Realtime + file storage ----------
do $$
declare t text;
begin
  foreach t in array array['messages', 'room_members', 'reactions', 'profiles', 'rooms', 'typing_status'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

insert into storage.buckets (id, name, public) values ('attachments', 'attachments', true) on conflict do nothing;
drop policy if exists "upload attachments" on storage.objects;
create policy "upload attachments" on storage.objects for insert to authenticated with check (bucket_id = 'attachments' and is_approved());

-- ---------- 9. Admin pakka karo ----------
-- Agar abhi koi admin nahi hai to sab se pehla account admin ban jata hai.
update profiles set is_admin = true, approved = true
  where id = (select id from profiles order by created_at limit 1)
    and not exists (select 1 from profiles where is_admin);
-- Kisi aur ko admin banana ho to (username badal kar) yeh line chalayen:
-- update profiles set is_admin = true where username = 'shayan';
