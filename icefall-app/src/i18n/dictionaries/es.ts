import type { Strings } from "@/i18n/dictionaries/en";
import type { DeepPartial } from "@/i18n/types";

/**
 * SPANISH — SETTINGS SCREEN ONLY.
 *
 * The one language beyond English this pass actually translated, and it stops
 * at the Settings screen: every string below is plain, everyday interface
 * text (a menu row, a short description of what it opens) rather than the
 * kind of mountaineering or medical language `@/coach/language.ts` refuses to
 * machine-translate. Nothing here instructs anyone to do anything on a
 * mountain, so it carries none of that risk — but it is still one person's
 * translation and not a professionally reviewed one, which is why the picker
 * that offers it says so plainly rather than presenting it as finished.
 *
 * Typed as `DeepPartial<Strings>` rather than `Strings` on purpose: this
 * dictionary is deep-merged onto the English source in `@/i18n/index`, so a
 * key left out here simply reads in English rather than breaking anything —
 * the mechanism a future, larger translation would rely on too.
 */
export const es: DeepPartial<Strings> = {
  settings: {
    title: "Ajustes",
    verified: "Verificado",
    notVerified: "No verificado",
    viewProfile: "Ver perfil",
    shareProfile: "Compartir perfil",

    groups: {
      appearance: "Apariencia",
      coachLanguage: "Idioma del entrenador",
      appLanguage: "Idioma de la aplicación",
      profile: "Perfil",
      account: "Cuenta",
      privacySafety: "Privacidad y seguridad",
      professional: "Profesional",
      mountains: "Montañas",
      activityData: "Actividad y datos",
      membership: "Membresía",
      notifications: "Notificaciones",
      support: "Ayuda",
      legal: "Legal",
      accountManagement: "Gestión de la cuenta",
    },

    rows: {
      editProfile: {
        title: "Editar perfil",
        detail: "Tu nombre, foto, biografía, experiencia y lo que buscas.",
      },
      verification: {
        title: "Verificación",
        detail: "Comprueba partes de tu perfil de forma independiente.",
      },
      passport: {
        title: "Pasaporte de Montaña",
        detail: "Ábrelo, compártelo y elige quién puede verlo.",
      },
      accountDetails: {
        title: "Datos de la cuenta",
        detail: "Correo electrónico, teléfono, ID de miembro y métodos de acceso conectados.",
      },
      security: {
        title: "Seguridad",
        detail: "Contraseña, verificación en dos pasos y los dispositivos en los que has iniciado sesión.",
      },
      privacy: {
        title: "Privacidad",
        detail: "Controla quién puede ver tu perfil y tu actividad en la montaña.",
      },
      location: {
        title: "Ubicación",
        detail: "ICEFALL solo usa una posición aproximada, y solo si lo permites.",
      },
      safety: {
        title: "Seguridad y protección",
        detail: "Personas bloqueadas, denuncias, y cómo ICEFALL mantiene seguras las interacciones.",
      },
      professionalCentre: {
        title: "Centro profesional",
        detail: "Solicita ser guía o socio de expedición, o la insignia Sherpa.",
      },
      coachingProfile: {
        title: "Perfil de entrenamiento",
        detail: "Tus días de entrenamiento, equipo, limitaciones, altitud y la fecha de tu objetivo.",
      },
      myMountains: {
        title: "Mis montañas",
        detail: "Tus objetivos, sus fechas y cuál va primero.",
      },
      mountainCV: {
        title: "CV de montaña",
        detail: "Lo que realmente has escalado, reunido a partir de tus propios registros.",
      },
      dataActivity: {
        title: "Datos y actividad",
        detail: "Exporta todo lo que ICEFALL guarda, o bórralo.",
      },
      devicesApps: {
        title: "Dispositivos y apps",
        detail: "Relojes, apps de salud y cualquier otra fuente que pueda enviar datos.",
      },
      connectedAccounts: {
        title: "Cuentas conectadas",
        detail: "Strava y otros servicios vinculados a esta cuenta.",
      },
      ringHealth: {
        title: "Anillo y datos de salud",
        detail: "Tu anillo Oura, sus lecturas y tu permiso para guardarlas.",
      },
      offlineData: {
        title: "Datos sin conexión",
        detail: "Lo que se guarda en este dispositivo para usar sin señal.",
      },
      subscription: {
        title: "Suscripción",
        detail: "Tu plan, lo que incluye y cómo cambiarlo.",
      },
      referrals: {
        title: "Equipo de expedición",
        detail: "Invita a gente y gana meses Pro cuando se suscriban.",
      },
      notificationPrefs: {
        title: "Preferencias de notificaciones",
        detail: "Elige exactamente para qué puede interrumpirte ICEFALL.",
      },
      helpSupport: {
        title: "Ayuda y soporte",
        detail: "Consigue ayuda, informa de un error o de un problema de seguridad.",
      },
      showGuides: {
        title: "Mostrar de nuevo las guías",
        detail:
          "Inicio, Explorar, grabar, Entrenador y tu perfil se explican una vez en tu primera visita. Esto trae las cinco de vuelta.",
        cleared: "Restablecido",
      },
      legalDocs: {
        title: "Términos y políticas",
        detail: "Términos, privacidad, normas de la comunidad, reservas y reembolsos.",
      },
      about: {
        title: "Acerca de ICEFALL",
        detail: "Versión, créditos y de dónde vienen los datos.",
      },
      manage: {
        title: "Cerrar sesión o eliminar la cuenta",
        detail: "Cierra sesión en este dispositivo, o elimina tu cuenta y sus datos.",
      },
    },
  },
};
