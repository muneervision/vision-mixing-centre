-- ================= Add poster fields to song_requests =================
-- Run this in Supabase's SQL Editor (safe to re-run)

alter table song_requests add column if not exists poster_theme text;
alter table song_requests add column if not exists photo_data text;
