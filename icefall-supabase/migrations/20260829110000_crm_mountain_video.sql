-- ICEFALL — a company's promotional film, PER MOUNTAIN.
--
-- OWNER DECISION, 2026-08-29: a company can show a DIFFERENT film on Everest
-- than on Denali. A climber looking at Denali should see Denali footage, not a
-- general company reel — which is also worth more to the operator.
--
-- So the film belongs to the company↔mountain relationship, not to the company.
--
-- ── WHY THIS FILE WAS WRITTEN TWICE ─────────────────────────────────────────
--
-- The first version put these columns on `companies`, and was wrong. The
-- reasoning is worth keeping because the mistake is a common one:
--
-- An earlier decision said the film appears in BOTH places — on the company's
-- own page and in its block on a mountain page. From that I concluded "the same
-- film in both places, therefore one film per company, therefore `companies` is
-- the right table" — and reported it as though the decision had settled it.
--
-- It had not. "Appears in both places" is silent on whether it is the SAME film.
-- I filled that gap myself, with a plausible answer, and stated it as fact. The
-- question was still open and was being put to the owner at the time.
--
-- The failure is not that the inference was unreasonable. It is that a gap
-- filled by inference and a gap filled by an answer read identically once
-- written down. The guard below exists because of it.

/* ========================================================================== */
/* The guard, restored one level along                                        */
/* ========================================================================== */

-- If a previous run of this migration put the film on `companies`, take it off.
-- Idempotent, and harmless where it was never there.
alter table public.companies drop constraint if exists companies_video_coherent;
alter table public.companies drop constraint if exists companies_video_youtube_id_shape;
alter table public.companies drop constraint if exists companies_video_source_known;
alter table public.companies drop column if exists video_source;
alter table public.companies drop column if exists video_youtube_id;
alter table public.companies drop column if exists video_media_id;

delete from public.editable_fields
where entity_type = 'company' and field in ('video_source', 'video_youtube_id', 'video_media_id');

/* ========================================================================== */
/* `company_destinations` becomes addressable                                    */
/* ========================================================================== */

-- The approval engine finds a row by `id`, and this table was keyed only by the
-- composite (company_id, destination_id). A surrogate id makes it versionable like
-- every other entity WITHOUT changing the primary key, so the pairing stays
-- unique and every existing foreign key and policy is untouched.
alter table public.company_destinations add column if not exists id uuid
  not null default gen_random_uuid();

create unique index if not exists company_destinations_id_key
  on public.company_destinations (id);

/* ========================================================================== */
/* The film                                                                   */
/* ========================================================================== */

alter table public.company_destinations add column if not exists video_source text
  not null default 'none';

alter table public.company_destinations drop constraint if exists company_destinations_video_source_known;
alter table public.company_destinations
  add constraint company_destinations_video_source_known
  check (video_source in ('none', 'youtube', 'upload'));

alter table public.company_destinations add column if not exists video_youtube_id text;

-- `on delete restrict`, NOT `set null`. With `set null`, deleting the live film
-- would try to null the column while `video_source` still says 'upload', which
-- the coherence constraint refuses — so the delete fails either way. Restrict
-- fails with "still referenced" rather than a check violation, which is the
-- difference between an error somebody can act on and one they have to decode.
alter table public.company_destinations add column if not exists video_media_id uuid
  references public.media_assets (id) on delete restrict;

-- AN ID, NEVER A URL. Eleven characters of [A-Za-z0-9_-]; no URL satisfies it.
--
-- The reason is not tidiness. `icefall-web` embeds from youtube-nocookie.com and
-- mounts the iframe ONLY AFTER A CLICK, because rendering it up front would
-- contact Google — and set its cookies — for every reader who opens the page,
-- including everyone who never watches. A column shaped like a URL is one step
-- from `<iframe src={...}>` on load, which regresses that for every visitor.
-- The argument gets stronger per-mountain: more rows, more chances somebody
-- pastes a link.
alter table public.company_destinations drop constraint if exists company_destinations_video_youtube_id_shape;
alter table public.company_destinations
  add constraint company_destinations_video_youtube_id_shape check (
    video_youtube_id is null or video_youtube_id ~ '^[A-Za-z0-9_-]{11}$'
  );

-- The three columns cannot disagree about whether there is a film, or where it
-- comes from. 'none' is a DECISION — an operator who has chosen not to have one,
-- which is different from a record nobody filled in.
alter table public.company_destinations drop constraint if exists company_destinations_video_coherent;
alter table public.company_destinations
  add constraint company_destinations_video_coherent check (
    (video_source = 'none'    and video_youtube_id is null and video_media_id is null)
    or (video_source = 'youtube' and video_youtube_id is not null and video_media_id is null)
    or (video_source = 'upload'  and video_media_id  is not null and video_youtube_id is null)
  );

comment on column public.company_destinations.video_source is
  'none is a DECISION, not an absence. The film is per-mountain: Denali footage on Denali.';

/**
 * The film must be the OWNING company's own media.
 *
 * The foreign key only says the asset exists. Without this, a company could
 * point its Everest film at another company's upload — and on a mountain where
 * both hold placements, a rejected clip from one operator would play inside a
 * competitor's block. The hole is worse here than it was on `companies`, because
 * the two rows sit side by side on the same page.
 */
create or replace function public.company_destinations_video_is_own_media()
returns trigger
language plpgsql
as $$
declare
  v_owner uuid;
begin
  if new.video_media_id is null then
    return new;
  end if;

  select ma.company_id into v_owner from public.media_assets ma where ma.id = new.video_media_id;

  if v_owner is distinct from new.company_id then
    raise exception 'a mountain film must be the owning company''s own media asset'
      using hint = 'Upload it against this company rather than referencing another company''s file.';
  end if;

  return new;
end;
$$;

drop trigger if exists company_destinations_video_own_media on public.company_destinations;
create trigger company_destinations_video_own_media
  before insert or update of video_media_id on public.company_destinations
  for each row execute function public.company_destinations_video_is_own_media();

/* ========================================================================== */
/* A third thing an operator can propose                                      */
/* ========================================================================== */

-- The approval engine knew about two entity types. A per-mountain film is
-- operator content like any other and goes through a pending version and an
-- ICEFALL decision, so the boundary has to learn a third.
alter table public.editable_fields drop constraint if exists editable_fields_entity_type_check;
alter table public.editable_fields
  add constraint editable_fields_entity_type_check
  check (entity_type in ('company', 'product', 'company_mountain'));

alter table public.content_versions drop constraint if exists content_versions_entity_type_check;
alter table public.content_versions
  add constraint content_versions_entity_type_check
  check (entity_type in ('company', 'product', 'company_mountain'));

insert into public.editable_fields (entity_type, field) values
  ('company_mountain', 'video_source'),
  ('company_mountain', 'video_youtube_id'),
  ('company_mountain', 'video_media_id')
on conflict do nothing;

-- Recreated for the third table. Everything else about the function is
-- unchanged: the whitelist is still applied at approval time, the base snapshot
-- is still checked, and promotion to live still belongs to Operations alone.
create or replace function public.approve_content_version(
  p_version_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v          public.content_versions%rowtype;
  v_table    text;
  v_cols     text;
  v_merged   jsonb;
  v_before   jsonb;
  v_fields   text[];
begin
  if public.has_staff_role(array['operations']) is not true then
    raise exception 'only ICEFALL operations staff may approve content';
  end if;

  select * into v from public.content_versions where id = p_version_id for update;
  if not found then
    raise exception 'no such content version';
  end if;
  if v.state <> 'pending' then
    raise exception 'only a pending version can be approved (this one is %)', v.state;
  end if;

  v_table := case v.entity_type
               when 'company' then 'companies'
               when 'product' then 'products'
               when 'company_mountain' then 'company_destinations'
             end;
  if v_table is null then
    raise exception 'no table is mapped for entity type %', v.entity_type;
  end if;

  select array_agg(f order by f) into v_fields
  from unnest(v.changed_fields) f
  where exists (
    select 1 from public.editable_fields ef
    where ef.entity_type = v.entity_type and ef.field = f
  );

  if v_fields is null then
    raise exception 'nothing in this version is applicable any more';
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
    into v_before using v.entity_id;
  if v_before is null then
    raise exception 'the record this version belongs to no longer exists';
  end if;

  if v.base_snapshot is not null then
    declare
      v_moved text[];
    begin
      select array_agg(f order by f) into v_moved
      from unnest(v_fields) f
      where v.base_snapshot ? f
        and (v_before -> f) is distinct from (v.base_snapshot -> f);

      if v_moved is not null then
        raise exception 'the live value of % changed after this was proposed',
          array_to_string(v_moved, ', ')
          using hint = 'Ask the operator to resubmit against the current value.';
      end if;
    end;
  end if;

  v_merged := v_before || v.payload;
  v_cols := (select string_agg(format('%I', f), ', ') from unnest(v_fields) f);

  execute format(
    'update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where id = $2',
    v_table, v_cols, v_cols, v_table
  ) using v_merged, v.entity_id;

  if v.entity_type = 'product' then
    update public.products
       set status = 'live', live_at = coalesce(live_at, now())
     where id = v.entity_id and status in ('draft', 'pending_review');
  end if;

  update public.content_versions
     set state = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         applied_at = now(),
         decision_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = v.id;

  perform public.record_audit_event(
    'content.approved', v.entity_type, v.entity_id::text,
    jsonb_build_object('fields', v_fields, 'before', v_before - 'id'),
    v.payload, p_reason, v.company_id
  );
end;
$$;
