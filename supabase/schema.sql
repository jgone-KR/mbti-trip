-- MBTI 즉흥 여행 · Supabase 데이터베이스 설정
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여 넣고 Run 을 누르세요. 여러 번 실행해도 안전해요.

-- ───────── 1. 테이블 ─────────
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nickname   text check (char_length(nickname) between 1 and 20),
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id         text primary key check (char_length(id) <= 64),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) <= 40),
  city       text not null check (char_length(city) <= 20),
  trip_len   text check (char_length(trip_len) <= 20),
  trip_date  text check (char_length(trip_date) <= 10),
  code       text check (char_length(code) <= 4),
  stops      int  not null default 0,
  json       text not null check (char_length(json) <= 200000),   -- 전체 코스
  preview    text check (char_length(preview) <= 50000),          -- 남에게 보여 줄 앞 2곳
  shared     boolean not null default false,
  shared_at  timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists plans_user_idx   on public.plans (user_id, updated_at desc);
create index if not exists plans_shared_idx on public.plans (shared_at desc) where shared;

create table if not exists public.wallets (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  credits      int  not null default 0 check (credits >= 0),
  streak       int  not null default 0,
  last_checkin date,
  updated_at   timestamptz not null default now()
);

create table if not exists public.credit_log (
  id      bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta   int  not null,
  why     text,
  at      timestamptz not null default now()
);
create index if not exists credit_log_user_idx on public.credit_log (user_id, at desc);

create table if not exists public.unlocks (
  user_id uuid references auth.users(id) on delete cascade,
  plan_id text references public.plans(id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (user_id, plan_id)
);

create table if not exists public.ai_usage (
  user_id uuid references auth.users(id) on delete cascade,
  day     date,
  count   int not null default 0,
  primary key (user_id, day)
);

-- ───────── 2. 접근 규칙(RLS) ─────────
-- 앱은 자기 데이터만 읽고 쓸 수 있어요. 크레딧은 앱에서 직접 바꿀 수 없고 아래 함수로만 바뀌어요.
alter table public.profiles   enable row level security;
alter table public.plans      enable row level security;
alter table public.wallets    enable row level security;
alter table public.credit_log enable row level security;
alter table public.unlocks    enable row level security;
alter table public.ai_usage   enable row level security;

drop policy if exists "own plans" on public.plans;
create policy "own plans" on public.plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select to authenticated using (true);

drop policy if exists "own wallet" on public.wallets;
create policy "own wallet" on public.wallets for select to authenticated using (user_id = auth.uid());

drop policy if exists "own log" on public.credit_log;
create policy "own log" on public.credit_log for select to authenticated using (user_id = auth.uid());

drop policy if exists "own unlocks" on public.unlocks;
create policy "own unlocks" on public.unlocks for select to authenticated using (user_id = auth.uid());
-- ai_usage 는 규칙이 없어서 앱에서 접근할 수 없어요(AI 서버 함수만 사용).

-- ───────── 3. 서버 함수 ─────────
create or replace function public._wallet_json(uid uuid) returns json
language sql security definer set search_path = public as $$
  select json_build_object(
    'credits', coalesce(w.credits, 0),
    'streak',  coalesce(w.streak, 0),
    'last',    w.last_checkin,
    'unlocked', coalesce((select json_agg(p.user_id::text || ':' || u.plan_id)
                          from unlocks u join plans p on p.id = u.plan_id where u.user_id = uid), '[]'::json),
    'log', coalesce((select json_agg(x) from (select delta, why, at from credit_log
                     where user_id = uid order by at desc limit 30) x), '[]'::json))
  from (select uid as id) z left join wallets w on w.user_id = z.id;
$$;

create or replace function public.get_wallet() returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into wallets (user_id) values (auth.uid()) on conflict do nothing;
  return _wallet_json(auth.uid());
end $$;

-- 출석: 1일차 50 · 2~6일차 10 · 7일차 30. 하루 빠지면 1일차부터. 날짜는 한국 시간 기준.
create or replace function public.checkin() returns json
language plpgsql security definer set search_path = public as $$
declare w wallets; today date := (now() at time zone 'Asia/Seoul')::date; s int; r int;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into wallets (user_id) values (auth.uid()) on conflict do nothing;
  select * into w from wallets where user_id = auth.uid() for update;
  if w.last_checkin = today then raise exception 'already_checked_in'; end if;
  s := case when w.last_checkin = today - 1 then (w.streak % 7) + 1 else 1 end;
  r := case s when 1 then 50 when 7 then 30 else 10 end;
  update wallets set credits = credits + r, streak = s, last_checkin = today, updated_at = now()
   where user_id = auth.uid();
  insert into credit_log (user_id, delta, why) values (auth.uid(), r, '출석 ' || s || '일차');
  return json_build_object('day', s, 'reward', r, 'wallet', _wallet_json(auth.uid()));
end $$;

-- 크레딧은 출석 체크로만 받아요. (테스트 충전 charge_test는 2026-10-23에 없앴어요)

-- 커뮤니티 목록: 남의 코스는 앞 2곳(preview)만 내려 줘요.
create or replace function public.list_community()
returns table (id text, author uuid, nickname text, name text, city text, trip_len text, trip_date text,
               code text, stops int, shared_at timestamptz, preview text, unlocked boolean, mine boolean)
language sql security definer set search_path = public stable as $$
  select p.id, p.user_id, pr.nickname, p.name, p.city, p.trip_len, p.trip_date, p.code, p.stops, p.shared_at,
         p.preview,
         exists (select 1 from unlocks u where u.user_id = auth.uid() and u.plan_id = p.id),
         p.user_id = auth.uid()
    from plans p left join profiles pr on pr.user_id = p.user_id
   where p.shared and auth.uid() is not null
   order by p.shared_at desc nulls last
   limit 200;
$$;

-- 코스 열람: 내 코스나 이미 연 코스는 무료, 처음 여는 남의 코스는 20 크레딧 차감.
create or replace function public.unlock_plan(pid text) returns json
language plpgsql security definer set search_path = public as $$
declare p plans; c int; cost int := 20;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into p from plans where id = pid and (shared or user_id = auth.uid());
  if not found then raise exception 'not_found'; end if;
  if p.user_id <> auth.uid() and not exists (select 1 from unlocks where user_id = auth.uid() and plan_id = pid) then
    insert into wallets (user_id) values (auth.uid()) on conflict do nothing;
    select credits into c from wallets where user_id = auth.uid() for update;
    if c < cost then raise exception 'not_enough_credits'; end if;
    update wallets set credits = credits - cost, updated_at = now() where user_id = auth.uid();
    insert into unlocks (user_id, plan_id) values (auth.uid(), pid);
    insert into credit_log (user_id, delta, why) values (auth.uid(), -cost, '코스 열람 · ' || p.name);
  end if;
  return json_build_object('json', p.json, 'wallet', _wallet_json(auth.uid()));
end $$;

-- 닉네임: 2~12자, 한글·영문·숫자·띄어쓰기, 금지어 제외, 다른 사람과 겹치면 안 돼요
create or replace function public.set_nickname(nick text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := regexp_replace(trim(coalesce(nick, '')), '\s+', ' ', 'g');
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if char_length(n) < 2 or char_length(n) > 12 then raise exception 'nick_length'; end if;
  if n !~ '^[가-힣A-Za-z0-9 _]+$' then raise exception 'nick_chars'; end if;
  if lower(replace(n, ' ', '')) ~ '(씨발|시발|씹|병신|븅신|개새|새끼|좆|존나|느금|니미|애미|섹스|보지|자지|fuck|shit|bitch|sex|porn|운영자|관리자|admin|공식)' then
    raise exception 'nick_banned';
  end if;
  if exists (select 1 from profiles where lower(nickname) = lower(n) and user_id <> auth.uid()) then
    raise exception 'nick_taken';
  end if;
  insert into profiles (user_id, nickname) values (auth.uid(), n)
  on conflict (user_id) do update set nickname = excluded.nickname;
end $$;

-- ───────── 4. 실행 권한 ─────────
revoke all on function public._wallet_json(uuid) from public, anon, authenticated;
revoke all on function public.get_wallet(), public.checkin(), public.list_community(),
                       public.unlock_plan(text), public.set_nickname(text) from public, anon;
grant execute on function public.get_wallet(), public.checkin(), public.list_community(),
                          public.unlock_plan(text), public.set_nickname(text) to authenticated;
