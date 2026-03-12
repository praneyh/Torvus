# Torvus

A comprehensive offline-first fitness tracking app built with Expo and React Native. Tracks weightlifting sessions, cardio, nutrition, and body metrics — all stored locally with optional cloud backup via Supabase.

## Features

### Gym
- **Workout splits** — preset splits (PPL, Upper/Lower, Bro Split, Full Body) or build your own
- **Weightlifting logger** — log sets with weight, reps, and RPE; plate calculator display
- **Cardio logger** — 13+ preset cardio exercises (running, cycling, rowing, etc.) with per-exercise metric tracking: distance, speed, incline, resistance, RPM, pace, laps, rounds, heart rate (avg or min/max range), and custom metrics
- **Calorie burn estimation** — HR-based Keytel formula > MET-based with body weight > MET 70kg reference, with confidence rating

### Nutrition
- **Food search** — powered by the USDA FoodData Central API with a local fallback database
- **AI food photo estimation** — photograph a meal and get instant macro estimates using Claude (Anthropic API)
- **Daily tracking** — log meals and track calories, protein, carbs, fat, fiber, and sodium against your goals
- **Per-nutrient AI bias** — tell the AI to lean toward over- or under-estimating each nutrient (useful for cutting/bulking)

### Progress
- **Weightlifting charts** — volume, max weight, and reps over time per exercise
- **Cardio charts** — distance, duration, speed, and calories over time per exercise
- **Body weight log** — log daily weight with a line chart over time (1M/3M/6M/ALL ranges)
- **History views** — scrollable session history for weights and cardio

### Profile & Settings
- **Fitness goal** — bulking, maintaining, or cutting
- **Body metrics** — weight and height with kg/lbs and cm/ft-in unit support
- **Auto-save** — all profile changes save automatically (no save button)
- **Cloud sync** — manual or automatic sync to Supabase on save

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54, Expo Router 6 |
| Runtime | React Native 0.81.5, React 19.1.0 |
| Database | expo-sqlite v16 (async API) |
| Cloud | Supabase Auth + JSONB blob sync |
| State | Zustand |
| AI | Anthropic Claude Sonnet (via direct fetch) |
| Nutrition API | USDA FoodData Central |
| Navigation | Expo Router (file-based) + React Navigation bottom tabs |

## Architecture

- **Offline-first** — SQLite is the primary data store. The app is fully functional without an internet connection
- **Cloud backup** — a single JSONB blob per user in Supabase is pushed on save and pulled on login
- **No external chart library** — all charts are built with React Native Views using midpoint-based line segments
- **Unit conversions** — metric values (kg, km) are always stored in the database; display conversion happens at render time

## Project Structure

```
torvus/
├── app/
│   ├── _layout.tsx          # Root layout — auth routing, DB init, seeding
│   ├── auth.tsx             # Login / signup screen
│   ├── onboarding.tsx       # 3-step onboarding (goal → body metrics → done)
│   ├── (tabs)/
│   │   ├── index.tsx        # Workout tab
│   │   ├── nutrition.tsx    # Nutrition tab
│   │   ├── progress.tsx     # Progress tab
│   │   └── profile.tsx      # Profile & settings tab
│   ├── gym/
│   │   ├── session.tsx      # Weightlifting session logger
│   │   ├── cardio.tsx       # Cardio session logger
│   │   ├── exercises.tsx    # Exercise browser
│   │   └── split-builder.tsx
│   └── nutrition/
│       ├── search.tsx       # Food search
│       ├── ai-estimate.tsx  # AI photo estimation
│       └── goals.tsx        # Nutrition goals
├── src/
│   ├── db/
│   │   ├── schema.ts        # Re-export for @/db/schema alias
│   │   └── seeds.ts         # Seed data (exercises, foods, cardio presets, splits)
│   ├── lib/
│   │   ├── supabase.ts      # Supabase client
│   │   ├── sync.ts          # pushAllData / pullAllData
│   │   └── usda.ts          # USDA FoodData Central API client
│   ├── store/
│   │   ├── workoutStore.ts
│   │   └── nutritionStore.ts
│   └── constants/
│       └── colors.ts
├── schema.ts                # SQLite schema (all tables + getDatabase())
└── models.ts                # Shared TypeScript interfaces
```

## Getting Started

### Prerequisites

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- iOS Simulator / Android Emulator, or the [Expo Go](https://expo.dev/go) app

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/Torvus.git
cd Torvus

# Install dependencies
npm install

# Start the dev server
npx expo start
```

### Environment

Create a `.env` file (or configure via `app.json` / EAS Secrets for production):

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The Anthropic API key is stored locally on-device (entered in the Profile tab — never committed).

### Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run this SQL in the Supabase SQL editor:

```sql
-- ── Cloud sync ────────────────────────────────────────────────
create table user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  blob       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table user_data enable row level security;
create policy "Users can read their own data"   on user_data for select using (auth.uid() = user_id);
create policy "Users can upsert their own data" on user_data for insert with check (auth.uid() = user_id);
create policy "Users can update their own data" on user_data for update using (auth.uid() = user_id);

-- ── Premium subscriptions ─────────────────────────────────────
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  is_premium     boolean not null default false,
  premium_since  timestamptz,
  updated_at     timestamptz not null default now()
);
alter table profiles enable row level security;
-- Users can read their own profile; only service role (edge functions) can write
create policy "Users can read their own profile" on profiles for select using (auth.uid() = id);

-- Auto-create a profile row on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── AI usage rate limiting (multi-feature) ─────────────────────
create table ai_usage (
  user_id       uuid references auth.users(id) on delete cascade,
  date          date not null default current_date,
  feature       text not null default 'food_scan',
  request_count integer not null default 0,
  primary key (user_id, date, feature)
);
alter table ai_usage enable row level security;
-- Only the edge function (service role) reads and writes this table
```

> **Migration** — if you already created `ai_usage` without the `feature` column, run this in the Supabase SQL editor:
> ```sql
> alter table ai_usage add column if not exists feature text not null default 'food_scan';
> alter table ai_usage drop constraint ai_usage_pkey;
> alter table ai_usage add primary key (user_id, date, feature);
> ```

3. Deploy edge functions and set secrets:
```bash
npx supabase login
npx supabase link --project-ref rhdinurdqecvdobjsrzb

# Set secrets
npx supabase secrets set ANTHROPIC_API_KEY=your_anthropic_key_here
npx supabase secrets set DEV_PROMO_CODE=your_test_code_here

# Deploy all four edge functions
npx supabase functions deploy ai-estimate
npx supabase functions deploy activate-subscription
npx supabase functions deploy ai-weekly-insights
npx supabase functions deploy ai-nutrition-targets
```

### Premium Features

| Feature | Rate Limit | Edge Function |
|---------|-----------|---------------|
| AI food scan | 25/day | `ai-estimate` |
| Weekly insights | 1/day | `ai-weekly-insights` |
| AI nutrition targets | 3/day | `ai-nutrition-targets` |

**Testing premium:** Use the promo code flow — open any AI feature, tap "Have a promo or test code?", enter the value you set as `DEV_PROMO_CODE`. This activates your account's premium status server-side immediately.

## Design System

| Token | Value |
|-------|-------|
| Background | `#0E0D0B` |
| Card | `#141311` |
| Border | `#252320` |
| Accent (orange) | `#EF6C3E` |
| Text primary | `#F2F0EB` |
| Text muted | `#555` |

## License

MIT
