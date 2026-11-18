-- ============================================================================
-- QUARENTENA Z — ARQUITETURA DE BANCO DE DADOS EM NUVEM (SUPABASE / POSTGRESQL)
-- Contas de Usuários, Conquistas, Ranking Global, Cloud Saves e Multiplayer
-- Com Row Level Security (RLS), Índices de Performance e Anti-Cheat Server-Side
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. CONTAS E PERFIS DE COMANDANTES (USUÁRIOS)
CREATE TABLE IF NOT EXISTS public.users_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid UUID UNIQUE,
  client_id VARCHAR(64) UNIQUE NOT NULL,
  owner_hash CHAR(64) UNIQUE NOT NULL,
  display_name VARCHAR(22) NOT NULL DEFAULT 'Comandante',
  patent VARCHAR(40) NOT NULL DEFAULT 'Recruta de Perímetro',
  best_wave INTEGER NOT NULL DEFAULT 0 CHECK (best_wave >= 0 AND best_wave <= 5000),
  total_kills BIGINT NOT NULL DEFAULT 0 CHECK (total_kills >= 0 AND total_kills <= 100000000),
  total_games INTEGER NOT NULL DEFAULT 0 CHECK (total_games >= 0 AND total_games <= 1000000),
  total_playtime_sec BIGINT NOT NULL DEFAULT 0 CHECK (total_playtime_sec >= 0),
  last_map VARCHAR(32) NOT NULL DEFAULT 'four',
  last_difficulty VARCHAR(16) NOT NULL DEFAULT 'normal',
  license_edition VARCHAR(8) NOT NULL DEFAULT 'STD',
  medals JSONB NOT NULL DEFAULT '{}'::jsonb,
  integrity_sig VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_best_wave ON public.users_profiles (best_wave DESC, total_kills DESC);

-- 2. CONQUISTAS DESBLOQUEADAS POR USUÁRIO (50 MEDALHAS + SECRETAS)
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.users_profiles(id) ON DELETE CASCADE,
  achievement_id VARCHAR(32) NOT NULL CHECK (achievement_id ~ '^[a-z0-9_]+$'),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  integrity_hash VARCHAR(64) NOT NULL,
  UNIQUE (profile_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_ach_profile ON public.user_achievements (profile_id);

-- 3. RANKING GLOBAL VERIFICADO (SOLO & DESAFIO DIÁRIO)
CREATE TABLE IF NOT EXISTS public.global_leaderboard (
  run_id VARCHAR(48) PRIMARY KEY,
  profile_id UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  owner_hash CHAR(64) NOT NULL,
  player_name VARCHAR(22) NOT NULL DEFAULT 'Comandante',
  wave INTEGER NOT NULL CHECK (wave >= 0 AND wave <= 5000),
  time_sec INTEGER NOT NULL CHECK (time_sec >= 0 AND time_sec <= 1209600),
  kills INTEGER NOT NULL CHECK (kills >= 0 AND kills <= 5000000),
  map_id VARCHAR(32) NOT NULL DEFAULT 'four',
  difficulty VARCHAR(16) NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('easy', 'normal', 'hard', 'apocalypse')),
  cmd_count INTEGER NOT NULL DEFAULT 0,
  state_hash BIGINT NOT NULL DEFAULT 0,
  run_seal VARCHAR(32) NOT NULL,
  run_ticket TEXT,
  is_profile BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_wave ON public.global_leaderboard (wave DESC, kills DESC, time_sec DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_kills ON public.global_leaderboard (kills DESC, wave DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_map ON public.global_leaderboard (map_id, wave DESC);

-- 4. SALVAMENTO EM NUVEM HÍBRIDO (OFFLINE <-> ONLINE)
CREATE TABLE IF NOT EXISTS public.cloud_saves (
  owner_hash CHAR(64) PRIMARY KEY,
  player_name VARCHAR(22) NOT NULL,
  career JSONB NOT NULL DEFAULT '{}'::jsonb,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  achievements JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_save JSONB,
  save_signature VARCHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. ESQUEMA MULTIPLAYER (SALAS, PAREAMENTO, SINCRONIZAÇÃO DE ONDAS E PLACARES)
-- ============================================================================

-- 5A. SALAS MULTIPLAYER (CO-OP E COMPETITIVO / DUELO)
CREATE TABLE IF NOT EXISTS public.mp_rooms (
  room_id VARCHAR(36) PRIMARY KEY,
  room_code VARCHAR(8) UNIQUE NOT NULL,
  room_name VARCHAR(40) NOT NULL DEFAULT 'Operação Co-op',
  host_owner_hash CHAR(64) NOT NULL,
  mode VARCHAR(16) NOT NULL DEFAULT 'coop' CHECK (mode IN ('coop', 'versus', 'daily')),
  map_id VARCHAR(32) NOT NULL DEFAULT 'four',
  difficulty VARCHAR(16) NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('easy', 'normal', 'hard', 'apocalypse')),
  max_players SMALLINT NOT NULL DEFAULT 2 CHECK (max_players BETWEEN 2 AND 4),
  current_wave INTEGER NOT NULL DEFAULT 0,
  current_tick BIGINT NOT NULL DEFAULT 0,
  rng_seed BIGINT NOT NULL DEFAULT 20260101,
  state_hash BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished', 'closed')),
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_rooms_matchmaking ON public.mp_rooms (status, is_public, mode, difficulty);

-- 5B. JOGADORES PAREADOS NA SALA (MATCHMAKING & SLOTS)
CREATE TABLE IF NOT EXISTS public.mp_room_players (
  id BIGSERIAL PRIMARY KEY,
  room_id VARCHAR(36) NOT NULL REFERENCES public.mp_rooms(room_id) ON DELETE CASCADE,
  owner_hash CHAR(64) NOT NULL,
  player_name VARCHAR(22) NOT NULL DEFAULT 'Comandante',
  slot_index SMALLINT NOT NULL DEFAULT 0 CHECK (slot_index BETWEEN 0 AND 3),
  is_ready BOOLEAN NOT NULL DEFAULT FALSE,
  ping_ms INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  towers_built INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, owner_hash),
  UNIQUE (room_id, slot_index)
);

-- 5C. SINCRONIZAÇÃO DE ONDAS E COMANDOS DETERMINÍSTICOS (CMDLOG)
CREATE TABLE IF NOT EXISTS public.mp_wave_events (
  id BIGSERIAL PRIMARY KEY,
  room_id VARCHAR(36) NOT NULL REFERENCES public.mp_rooms(room_id) ON DELETE CASCADE,
  wave_number INTEGER NOT NULL CHECK (wave_number >= 0),
  tick BIGINT NOT NULL CHECK (tick >= 0),
  sender_hash CHAR(64) NOT NULL,
  cmd_type VARCHAR(24) NOT NULL CHECK (cmd_type IN ('place', 'up', 'paragon', 'ability', 'sell', 'prio', 'aim', 'portal_exit', 'clearObs', 'wave', 'power', 'auto', 'sync_state')),
  cmd_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_hash BIGINT NOT NULL DEFAULT 0,
  verified BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_wave_events_room_tick ON public.mp_wave_events (room_id, tick ASC);

-- 5D. PLACARES MULTIPLAYER (COOPERATIVO E COMPETITIVO)
CREATE TABLE IF NOT EXISTS public.mp_scores (
  match_id VARCHAR(48) PRIMARY KEY,
  room_id VARCHAR(36) REFERENCES public.mp_rooms(room_id) ON DELETE SET NULL,
  mode VARCHAR(16) NOT NULL DEFAULT 'coop' CHECK (mode IN ('coop', 'versus', 'daily')),
  map_id VARCHAR(32) NOT NULL DEFAULT 'four',
  difficulty VARCHAR(16) NOT NULL DEFAULT 'normal',
  team_names TEXT NOT NULL,
  wave_reached INTEGER NOT NULL CHECK (wave_reached >= 0 AND wave_reached <= 5000),
  total_kills INTEGER NOT NULL CHECK (total_kills >= 0 AND total_kills <= 10000000),
  duration_sec INTEGER NOT NULL CHECK (duration_sec >= 0),
  winner_name VARCHAR(22),
  match_seal VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_scores_mode_wave ON public.mp_scores (mode, wave_reached DESC, total_kills DESC);

-- ============================================================================
-- 6. POLÍTICAS DE SEGURANÇA (ROW LEVEL SECURITY - RLS)
-- ============================================================================
ALTER TABLE public.users_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_wave_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_scores ENABLE ROW LEVEL SECURITY;

-- Leitura pública para placares e salas públicas
CREATE POLICY "Leitura publica do ranking global" ON public.global_leaderboard FOR SELECT USING (true);
CREATE POLICY "Leitura publica de salas abertas" ON public.mp_rooms FOR SELECT USING (is_public = true);
CREATE POLICY "Leitura publica de placares multiplayer" ON public.mp_scores FOR SELECT USING (true);
