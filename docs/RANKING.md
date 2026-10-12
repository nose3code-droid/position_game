# ランキング

## 自分の記録(すぐ使える)
- 1試合ごとにスコアをブラウザに保存し、難易度別に上位20件を表示(各難易度50件まで保存)
- タイトル・結果・一時停止画面の「🏆 ランキング」ボタン、または **R キー** でいつでも表示(試合中は一時停止して開く)
- 端末・ブラウザごとの記録。ブラウザのデータを消すと消える

## 世界ランキング(設定すると有効になる)
世界中のスコアを集めるには保存先のデータベースが必要なので、無料の **Supabase** を使う。
設定するまでは「準備中」と表示される。

### 1. Supabase のプロジェクトを作る(無料)
1. https://supabase.com でアカウント作成 → **New project**(Region は Tokyo など近い所)
2. 左メニュー **SQL Editor** で下の SQL を貼って **Run**

```sql
-- スコア表
create table public.scores (
  id          bigint generated always as identity primary key,
  name        text    not null check (char_length(name) between 1 and 10),
  score       integer not null check (score between 0 and 100000),
  difficulty  text    not null check (difficulty in ('easy', 'normal', 'hard')),
  territory   real    not null default 0 check (territory between 0 and 100),
  kills       integer not null default 0 check (kills between 0 and 3),
  cleared     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index scores_rank on public.scores (difficulty, score desc);

-- 誰でも「読む」「追加する」だけできる(変更・削除はできない)
alter table public.scores enable row level security;
create policy "誰でも読める" on public.scores for select using (true);
create policy "誰でも追加できる" on public.scores for insert with check (true);
```

### 2. ゲームに設定する
1. Supabase の **Project Settings → API** で次の2つを確認
   - **Project URL**(`https://xxxxxxxx.supabase.co`)
   - **anon public** キー(公開用のキー。ページに埋め込んでよい種類のキー)
2. `src/config.js` の `WORLD_RANKING` を書き換える
```js
WORLD_RANKING: { enabled: true, url: 'https://xxxxxxxx.supabase.co', anonKey: 'eyJ...(anon public キー)', table: 'scores' },
```
3. コミットすると、結果画面に「世界ランキングに登録」欄が出て、ランキング画面の「🌏 世界ランキング」タブに表示される

**注意**: `service_role` キーは絶対に書かないこと(管理者用。漏れると表を消される)。書くのは `anon public` だけ。

## しくみ・セキュリティ
- 登録は本人が「登録する」を押したときだけ送信(自動では送らない)。送るのは名前・スコア・難易度・陣地率・撃破数・天下統一の有無のみ
- 表示する名前は文字を制限して無害化し、画面には文字として出す(HTMLとして解釈しない)
- データベース側の制約で、名前の長さ・スコアの範囲・難易度の値を制限。行の変更・削除はできない
- 試合の計算は各自のブラウザで行うため、**改造すれば嘘のスコアを送れる**(静的サイトでは防げない)。
  荒らされた場合は Supabase の Table Editor で該当行を削除する。本格的に防ぐにはサーバー側で試合を検証する仕組みが必要
- コード: `src/ranking.js`(保存・取得・送信)、`src/main.js`(画面)
