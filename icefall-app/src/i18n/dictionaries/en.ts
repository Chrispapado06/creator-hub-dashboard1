/**
 * THE SOURCE LANGUAGE — every key the lookup system knows about, complete.
 *
 * `@/i18n/index` deep-merges whatever the chosen language provides on top of
 * this object, so a translation missing a key (or a language nobody has
 * touched at all) still renders correct, complete English rather than a gap.
 * Nothing may be removed from here without removing the call site that reads
 * it — this is the one dictionary every screen that opts in can trust in full.
 *
 * SCOPE OF THIS PASS: only the strings the Settings screen itself uses
 * (`src/screens/settings/Settings.tsx`) are listed below. The rest of the
 * app's copy is not wired through this system yet — see the note in
 * `@/i18n/language.ts` for why that is deliberate.
 */

export const en = {
  settings: {
    title: "Settings",
    verified: "Verified",
    notVerified: "Not verified",
    viewProfile: "View profile",
    shareProfile: "Share profile",

    groups: {
      appearance: "Appearance",
      coachLanguage: "Coach language",
      appLanguage: "App language",
      profile: "Profile",
      account: "Account",
      privacySafety: "Privacy & safety",
      professional: "Professional",
      mountains: "Mountains",
      activityData: "Activity & data",
      membership: "Membership",
      notifications: "Notifications",
      support: "Support",
      legal: "Legal",
      accountManagement: "Account management",
    },

    rows: {
      editProfile: {
        title: "Edit profile",
        detail: "Your name, photo, bio, experience and what you're looking for.",
      },
      verification: {
        title: "Verification",
        detail: "Have parts of your profile independently checked.",
      },
      passport: {
        title: "Mountain Passport",
        detail: "Open it, share it, and choose who can see it.",
      },
      accountDetails: {
        title: "Account details",
        detail: "Email, phone, member ID and connected sign-in methods.",
      },
      security: {
        title: "Security",
        detail: "Password, two-factor and the devices you're signed in on.",
      },
      privacy: {
        title: "Privacy",
        detail: "Control who can see your profile and mountain activity.",
      },
      location: {
        title: "Location",
        detail: "ICEFALL only ever uses an approximate position, and only if you allow it.",
      },
      safety: {
        title: "Safety",
        detail: "Blocked people, reports, and how ICEFALL keeps interactions safe.",
      },
      professionalCentre: {
        title: "Professional Centre",
        detail: "Apply as a guide or expedition partner, or for the Sherpa badge.",
      },
      coachingProfile: {
        title: "Coaching profile",
        detail: "Your training days, kit, limitations, altitude and your objective's date.",
      },
      myMountains: {
        title: "My mountains",
        detail: "Your objectives, their dates, and which one comes first.",
      },
      mountainCV: {
        title: "Mountain CV",
        detail: "What you've actually climbed, assembled from your own records.",
      },
      dataActivity: {
        title: "Data & activity",
        detail: "Export everything ICEFALL holds, or erase it.",
      },
      devicesApps: {
        title: "Devices & apps",
        detail: "Watches, health apps and anything else that could send data in.",
      },
      connectedAccounts: {
        title: "Connected accounts",
        detail: "Strava and other services linked to this account.",
      },
      ringHealth: {
        title: "Ring and health data",
        detail: "Your Oura ring, its readings, and your permission for storing them.",
      },
      offlineData: {
        title: "Offline data",
        detail: "What's stored on this device for use without a signal.",
      },
      subscription: {
        title: "Subscription",
        detail: "Your plan, what it includes and how to change it.",
      },
      referrals: {
        title: "Expedition crew",
        detail: "Invite people and earn Pro months when they subscribe.",
      },
      notificationPrefs: {
        title: "Notification preferences",
        detail: "Choose exactly what ICEFALL is allowed to interrupt you for.",
      },
      helpSupport: {
        title: "Help & support",
        detail: "Get help, report a bug, or raise a safety issue.",
      },
      showGuides: {
        title: "Show the page guides again",
        detail:
          "Home, Explore, recording, Coach and your profile each explain themselves once on the first visit. This brings all five back.",
        cleared: "Cleared",
      },
      legalDocs: {
        title: "Terms & policies",
        detail: "Terms, privacy, community guidelines, bookings and refunds.",
      },
      about: {
        title: "About ICEFALL",
        detail: "Version, credits and where the data comes from.",
      },
      manage: {
        title: "Sign out or delete account",
        detail: "Sign out of this device, or remove your account and its data.",
      },
    },
  },
};

/** The shape every language's dictionary is checked against. */
export type Strings = typeof en;
