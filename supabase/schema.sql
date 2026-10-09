-- TagTune のタグ投票用データベース
-- Supabase の「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押す。
-- 何度実行しても大丈夫なように書いてある。

-- ① 投票の表：誰が・どの曲に・どのタグを押したか
--   同じ人が同じ曲の同じタグを2回押せないように、3つの組み合わせを主キーにする
create table if not exists public.votes (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  song_id    text        not null check (char_length(song_id) between 3 and 64),
  tag        text        not null check (tag in (
               '爽やか','エモい','切ない','かっこいい','かわいい','踊れる',
               '疾走感','中毒性','泣ける','落ち着く','ピアノが好き','ギターが好き')),
  created_at timestamptz not null default now(),
  primary key (user_id, song_id, tag)
);

create index if not exists votes_song_tag_idx on public.votes (song_id, tag);

-- ② 行単位のアクセス制限：自分の票だけ見られて、追加・取り消しできる
alter table public.votes enable row level security;

drop policy if exists "自分の票を見る" on public.votes;
create policy "自分の票を見る" on public.votes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "自分の票を入れる" on public.votes;
create policy "自分の票を入れる" on public.votes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "自分の票を取り消す" on public.votes;
create policy "自分の票を取り消す" on public.votes
  for delete to authenticated using (user_id = auth.uid());

-- 1人が押せる票の数に上限をつける（荒らし対策）
create or replace function public.votes_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.votes where user_id = new.user_id) >= 3000 then
    raise exception '投票できる数の上限に達しました';
  end if;
  return new;
end $$;

drop trigger if exists votes_limit on public.votes;
create trigger votes_limit before insert on public.votes
  for each row execute function public.votes_limit();

-- ③ 集計：曲ごと・タグごとの票数（誰が押したかは見せない）
create or replace function public.get_tag_counts()
returns table (song_id text, tag text, n bigint)
language sql stable security definer set search_path = public as $$
  select song_id, tag, count(*) as n
  from public.votes
  group by song_id, tag
$$;

revoke all on function public.get_tag_counts() from public;
grant execute on function public.get_tag_counts() to anon, authenticated;
