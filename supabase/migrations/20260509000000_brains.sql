-- Brains: Bernard's domain-specific knowledge bases (RAG)
--
-- Three tables + pgvector for semantic search:
--   brains            — one row per knowledge domain (chatting, revenue, growth, ...)
--   brain_documents   — raw source docs the user uploads
--   brain_chunks      — chunked + embedded pieces; this is what Bernard actually retrieves
--
-- At query time the app embeds the user question, calls match_brain_chunks(),
-- and stuffs the top-K results into Bernard's system prompt.

-- 1. Enable pgvector
create extension if not exists vector;

-- 2. Brains (knowledge domains)
create table if not exists brains (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  system_prompt text,
  created_at timestamptz default now()
);

-- 3. Source documents
create table if not exists brain_documents (
  id uuid primary key default gen_random_uuid(),
  brain_id uuid references brains(id) on delete cascade,
  title text not null,
  source_url text,
  content text not null,
  uploaded_by uuid,
  created_at timestamptz default now()
);

-- 4. Embedded chunks (what Bernard searches)
create table if not exists brain_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references brain_documents(id) on delete cascade,
  brain_id uuid references brains(id) on delete cascade,
  content text not null,
  embedding vector(1536) not null,
  chunk_index int not null,
  created_at timestamptz default now()
);

create index if not exists brain_chunks_embedding_idx
  on brain_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists brain_chunks_brain_idx on brain_chunks(brain_id);

-- 5. RPC for similarity search
create or replace function match_brain_chunks(
  query_embedding vector(1536),
  match_brain_id uuid,
  match_count int default 5
) returns table (id uuid, content text, similarity float)
language sql stable as $$
  select id, content, 1 - (embedding <=> query_embedding) as similarity
  from brain_chunks
  where brain_id = match_brain_id
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- 6. Seed the three starter brains
insert into brains (slug, name, description) values
  ('chatting', 'Chatting Playbook',  'PPV cadence, tone, sales scripts, fan psychology'),
  ('revenue',  'Revenue Strategy',   'Pricing, monetization, retention, win-back'),
  ('growth',   'Growth & Marketing', 'Traffic, social platforms, funnel optimization')
on conflict (slug) do nothing;

-- 7. Public-RLS pattern (matches the rest of the schema)
alter table brains            enable row level security;
alter table brain_documents   enable row level security;
alter table brain_chunks      enable row level security;

drop policy if exists "brains read"        on brains;
drop policy if exists "brains write"       on brains;
drop policy if exists "brain_docs read"    on brain_documents;
drop policy if exists "brain_docs write"   on brain_documents;
drop policy if exists "brain_chunks read"  on brain_chunks;
drop policy if exists "brain_chunks write" on brain_chunks;

create policy "brains read"        on brains          for select using (true);
create policy "brains write"       on brains          for all    using (true) with check (true);
create policy "brain_docs read"    on brain_documents for select using (true);
create policy "brain_docs write"   on brain_documents for all    using (true) with check (true);
create policy "brain_chunks read"  on brain_chunks    for select using (true);
create policy "brain_chunks write" on brain_chunks    for all    using (true) with check (true);
