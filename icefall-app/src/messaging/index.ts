/**
 * MESSAGING — the public surface.
 *
 * Two files behind one door, because a caller opening a conversation from a
 * profile should not have to know that reading and writing live apart:
 *
 *   `conversations.ts`  the reads — the inbox, one thread, the unread count.
 *   `send.ts`           the writes — open a two-party thread, send, mark read.
 *
 * WHAT A PROFILE SCREEN NEEDS, and it is four names:
 *
 *   canMessage(theirId, myId)   may a Message control be drawn at all
 *   messageRouteFor(theirId)    where it goes — no round trip on the tap
 *   useDirectConversation(id)   the existing thread with them, if any
 *   sendToProfile(id, …)        open-and-say, creating nothing until it is said
 */
export {
  ATTACHMENT_PREVIEW,
  MESSAGING_IS_A_SNAPSHOT,
  MESSAGING_NONE,
  MESSAGING_NOT_PROVISIONED,
  MESSAGING_NO_BACKEND,
  MESSAGING_REFUSED,
  MESSAGING_SIGNED_OUT,
  MESSAGING_UNREACHABLE,
  PARTICIPANT_NAME_UNAVAILABLE,
  forgetConversations,
  loadConversations,
  refreshConversations,
  useCorrespondent,
  useDirectConversation,
  useServerConversation,
  useServerConversations,
  useThreadMessages,
  useUnreadTotal,
  type ConversationsResult,
  type Correspondent,
  type MessagingState,
  type ServerConversation,
  type ServerMessage,
  type ServerThreadKind,
  type ThreadMessages,
} from "./conversations";

export {
  MESSAGE_MAX_LENGTH,
  OPEN_NOT_PROVISIONED,
  OPEN_NO_BACKEND,
  OPEN_REFUSED,
  OPEN_SIGNED_OUT,
  OPEN_UNREACHABLE,
  OPEN_YOURSELF,
  SEND_EMPTY,
  SEND_NOT_PROVISIONED,
  SEND_NO_BACKEND,
  SEND_REFUSED,
  SEND_SIGNED_OUT,
  SEND_TOO_LONG,
  SEND_UNREACHABLE,
  canMessage,
  markThreadRead,
  messageRouteFor,
  newClientId,
  openDirectThread,
  sendMessage,
  sendToProfile,
  type OpenOutcome,
  type OpenRefusal,
  type SendOutcome,
  type SendRefusal,
} from "./send";
