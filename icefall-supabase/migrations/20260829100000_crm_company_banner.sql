-- ICEFALL — a banner image on the company profile.
--
-- Session 04's request 03 asked for four columns: a banner, and three describing
-- a promotional film. THE BANNER IS BUILT HERE AND THE FILM IS NOT, deliberately.
--
-- WHY THE FILM IS HELD.
--
-- Not because the request is wrong — its reasoning is right, and when the film
-- lands it should land in exactly the shape 04 argued for. It is held because
-- the shape depends on an unanswered product question, and the request encodes
-- an answer to it without meaning to.
--
-- Three columns on `companies` say: A COMPANY HAS ONE FILM. That is true if the
-- film belongs to the company. It is false if a company can show a different
-- film on its Everest block than on its Denali block, in which case the columns
-- belong on `company_destinations` and this table is the wrong home for them.
-- Nobody has decided which, and the coherence constraint 04 asked for — the part
-- they said they actually cared about — would make the first answer structural.
--
-- A nullable column in the wrong place is an inconvenience. A CHECK constraint
-- in the wrong place is a rule the database enforces about a decision nobody
-- made, and unpicking one after content exists means migrating live operator
-- content rather than dropping a column.
--
-- Nothing is blocked by waiting: 04 states the editor works against its client
-- model and these columns only matter once a database exists.
--
-- WHAT SURVIVES THE WAIT. When the film does land, keep 04's three arguments —
-- they are sound wherever the columns end up:
--   · a source enum, not a nullable URL, because "no film" is an answer rather
--     than an absence, the same distinction `bookings.value_status` draws;
--   · an ID, never a URL, so nothing downstream can render it directly;
--   · which matters because `icefall-web` embeds from youtube-nocookie.com and
--     mounts the iframe only after a click. A column shaped like a URL is one
--     step from an `<iframe src={...}>` on load, which would contact Google and
--     set its cookies for every reader who opens the page, including everyone
--     who never watches.

/* ========================================================================== */
/* The banner                                                                 */
/* ========================================================================== */

alter table public.companies add column if not exists banner_media_id uuid
  references public.media_assets (id) on delete set null;

comment on column public.companies.banner_media_id is
  'The company profile banner. A media_assets row, so the storage-path convention, the size ceilings and the licence-and-credit rule already cover it.';

/**
 * A company's banner must be a company's OWN media.
 *
 * The foreign key alone only says the asset exists — it would happily let one
 * company point its banner at another company's file, and then a rejected image
 * from one operator could appear on a competitor's page. The same reasoning
 * already constrains `media_assets.storage_path` to sit inside the owning
 * company's folder; this is that rule reaching one table further.
 *
 * A CHECK cannot do it — the test needs a subquery — so it is a trigger, which
 * also means it holds against the service role rather than only against a client.
 */
create or replace function public.companies_banner_is_own_media()
returns trigger
language plpgsql
as $$
declare
  v_owner uuid;
begin
  if new.banner_media_id is null then
    return new;
  end if;

  select ma.company_id into v_owner
  from public.media_assets ma
  where ma.id = new.banner_media_id;

  if v_owner is distinct from new.id then
    raise exception 'a company banner must be that company''s own media asset'
      using hint = 'Upload the banner against this company rather than referencing another company''s file.';
  end if;

  return new;
end;
$$;

drop trigger if exists companies_banner_own_media on public.companies;
create trigger companies_banner_own_media
  before insert or update of banner_media_id on public.companies
  for each row execute function public.companies_banner_is_own_media();

-- An operator may propose a banner, like any other content, through a pending
-- version and an ICEFALL decision. It is NOT directly writable by them: the
-- `companies` update policy is staff-only and stays that way.
insert into public.editable_fields (entity_type, field)
values ('company', 'banner_media_id')
on conflict do nothing;
