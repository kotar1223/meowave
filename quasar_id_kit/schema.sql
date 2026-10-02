-- ==============================================================================
-- Quasar ID Database Schema (PostgreSQL / Supabase Migration)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Quasar Users table
CREATE TABLE IF NOT EXISTS quasar_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Quasar Profiles (Extended data, messenger metadata and profile music)
CREATE TABLE IF NOT EXISTS quasar_profiles (
    user_id UUID PRIMARY KEY REFERENCES quasar_users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    status_text TEXT,
    
    -- Profile Music Integration
    pinned_track_id TEXT,
    pinned_track_service TEXT,
    pinned_track_title TEXT,
    pinned_track_artist TEXT,
    pinned_track_artwork TEXT,
    pinned_track_duration INT DEFAULT 0,
    broadcast_music BOOLEAN DEFAULT TRUE,
    
    -- Messenger Integration
    messenger_user_id TEXT,
    sync_chats_enabled BOOLEAN DEFAULT TRUE,
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Quasar Messenger Sync Table
CREATE TABLE IF NOT EXISTS quasar_messenger_chats (
    chat_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meowave_room_id TEXT,
    title TEXT NOT NULL,
    is_group BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quasar_messenger_messages (
    message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID REFERENCES quasar_messenger_chats(chat_id) ON DELETE CASCADE,
    sender_id UUID REFERENCES quasar_users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    attached_track_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quasar_users_email ON quasar_users(email);
CREATE INDEX IF NOT EXISTS idx_quasar_users_username ON quasar_users(username);
CREATE INDEX IF NOT EXISTS idx_quasar_messages_chat ON quasar_messenger_messages(chat_id, created_at DESC);
