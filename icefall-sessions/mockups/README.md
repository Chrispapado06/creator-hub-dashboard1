# Owner mockups — the reference for 1:1

These are the owner's actual mockup files, copied from their Downloads on
2026-08-31. **These pixels are the standard, not any textual inventory of them.**

    crm-dashboard.png     Dashboard — tiles, map, revenue, donut     (Session 03)
    crm-products.png      Products list + Everest–South Col detail   (Session 03)
    crm-bookings.png      Bookings split view + Aconcagua detail     (Session 03)
    crm-commissions.png   Commissions                                (Session 03)
    phone-2.png           Find a Guide                               (Session 01)
    phone-3.png           Request Guide                              (Session 01)
    phone-4.png           Guide profile                              (Session 01)
    phone-5.png           Plan / Today                               (Session 01)
    social-pages-owner-mockup.webp
                          Social, ONE image with FOUR panels: Feed,
                          People, Groups, Stories                    (Session 01)
    activity-complete-owner-mockup.webp
                          Activity summary after finishing a session (Session 01)

    (There is no phone-1: that file turned out to be the CRM Dashboard and was
    renamed. Numbering kept so existing references stay valid.)

The standard, set by the owner after rejecting a first pass that matched every
number but not the design: **build and mockup side by side at the same width —
if structure alone tells you which is which, it is not done.**

**Chrome unifies; content stays per-drawing (owner ruling, 2026-08-31 evening).**
The four CRM drawings carry slightly different sidebars (items, badges, one has
Commissions, one has Revenue & Finance). Copying each verbatim made navigation
change per screen — "like its separate app", the owner's words. So: ONE canonical
demo sidebar across every CRM face — the union of the drawings' items, in their
style — and it is COLLAPSIBLE: a slim icon rail that expands on click. The owner
asked for the collapse explicitly so row thumbnails get their space back. Per-screen
CONTENT remains 1:1 with its own drawing.

What outranks these pixels, and nothing else does:
- The bottom nav keeps START (owner's words, phone app).
- The certification wording, no federation roundel, the enquiry notice until a
  row lands.
- Production/flag-off behaviour: bit-for-bit unchanged.
- A frame element that embodies a PRODUCT decision (deleting built screens from
  the real nav, crossing tenancy) renders in the demo face but is escalated, not
  implemented, for production.

## Recovered 2026-09-03 from session transcripts

Four of the owner's drawings existed ONLY inside chat windows and were never saved. They
have now been extracted from the session transcripts that received them and written here.

    athlete-profile-owner-mockup-2sep.webp
        THE ATHLETE PROFILE, 2 September. Two panels. Sent with the instruction
        "ok it shouldnt look like that, ehres 1:1 mockup just remove passport when
        sharing the profile". This is the drawing behind both
        icefall-app/src/screens/Profile.tsx and src/screens/explore/AthleteProfile.tsx,
        and it was believed lost — the AthleteProfile.tsx header (lines 57-129) was
        written as a prose substitute for it. THE PROSE IS NO LONGER THE BEST SOURCE.
        This file is. The header comment remains valuable for a different reason: it
        records which half of the drawing can be honestly built.

    social-pages-owner-mockup.webp
        ONE IMAGE, FOUR PANELS: Feed, People, Groups, Stories. Flagged explicitly
        because a session grepping for a "Groups mockup" will find no such file and
        may conclude none exists. It is in here.

    create-group-placement-owner-mockup.png
        The Explore header with FIND / EXPEDITIONS / GUIDES / SOCIAL, sent with
        "to create group, need to be added a + sign next and above seocial page,
        not under discover". THIS ANSWERS A QUESTION PREVIOUSLY RECORDED AS
        UNANSWERABLE. The Groups panel of the social drawing contains no create
        affordance at all, and a note in this project concluded that whatever was
        added would be a divergence by necessity. It is not: the owner placed it,
        in the header beside SOCIAL, and explicitly ruled OUT the obvious
        alternative of putting it under Discover.

    activity-complete-owner-mockup.webp
        The activity summary shown after finishing a session.

HOW THEY WERE RECOVERED, because this will be needed again: a pasted image is stored as
base64 inside the session's own transcript at
~/.claude/projects/<slugified-cwd>/<session-id>.jsonl, in a content block of type
"image". Iterate the JSONL, decode source.data, write the bytes. A session that received
a drawing and believes it "does not have the bytes" is mistaken — its transcript has
them, and another session can read that transcript. Grep the transcripts for a
distinctive phrase from the owner's message to find the right file.

WHAT IS STILL ONLY PROSE: the Home screen's list of elements that are NOT derivable and
must never be faked (readiness, "expedition ready", zones, nearby people) lives in the
header of icefall-app/src/screens/Home.tsx and in no README. Same shape of problem as the
profile one had.

TWO THINGS THE SOCIAL DRAWING SETTLES, previously argued from memory:
  - Private groups are marked with a PADLOCK beside the title, on two of the four cards.
    That is the owner's own visual language. Do not invent a different badge.
  - Both padlocked cards nonetheless say "Join". That is the one place the drawing and
    correctness diverge: a Join on a private group can only fail, because the insert
    policy pins every decision column null. The label becomes "Request to join" and the
    owner is TOLD about the divergence rather than left to find a renamed button.
