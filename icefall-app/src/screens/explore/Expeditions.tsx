/**
 * SUPERSEDED — this screen is now Groups.
 *
 * The crew screen that lived here listed the athlete's own expeditions, drew an
 * empty "Discover" state, and carried the member list, the readiness figures,
 * the share action and the leave action inline on every card. All of it has
 * moved, and nothing was duplicated on the way:
 *
 *   the list, the empty states and the CTA  →  `@/screens/explore/Groups`
 *   the card                                →  `@/components/network/GroupCard`
 *   members, readiness, share, leave        →  `@/screens/explore/GroupWorkspace`
 *   the date helpers and the share text     →  `@/network/groups`
 *
 * The model did not change. A group IS the `Expedition` in `@/network/types`,
 * created through the same `createExpedition` and left through the same
 * `leaveExpedition` — there is no second entity, and there must never be one.
 *
 * The file stays as a re-export so the `/explore/crew` route and any link that
 * still points at it keep resolving to a real screen instead of dying. Once
 * /explore/groups is routed, `/explore/crew` should redirect to it.
 */
export { default } from "@/screens/explore/Groups";
