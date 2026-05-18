-- ============================================================
-- Migração Inicial da Plataforma Raízes (Supabase)
-- Cria as tabelas para gestão de famílias e membros com suporte a RLS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.raizes_families (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    root_member_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    sub_families JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.raizes_members (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES public.raizes_families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    birth_date TEXT,
    death_date TEXT,
    status TEXT DEFAULT 'vivo',
    bio TEXT,
    photo TEXT,
    role TEXT DEFAULT 'Parente',
    parent_id TEXT,
    partner_id TEXT,
    member_type TEXT DEFAULT 'offline',
    linked_user_id TEXT,
    children_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Configuração de RLS (Row Level Security)
ALTER TABLE public.raizes_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raizes_members ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso Público (Para SPA sem autenticação obrigatória no backend)
-- Permite leitura e escrita pública para facilitar o uso da SPA no GitHub Pages.
CREATE POLICY "Permitir acesso total público a raizes_families" ON public.raizes_families
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Permitir acesso total público a raizes_members" ON public.raizes_members
    FOR ALL USING (true) WITH CHECK (true);
