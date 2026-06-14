export const SOCKET_EVENTS = {
  // Room lifecycle
  ROOM_CREATE:    'room:create',
  ROOM_JOIN:      'room:join',
  ROOM_LEAVE:     'room:leave',
  ROOM_PEEK:      'room:peek',
  ROOM_RECREATE:  'room:recreate',
  ROOM_GONE:      'room:gone',
  // Messaging
  MESSAGE_SEND:       'message:send',
  MESSAGE_RECEIVED:   'message:received',
  MESSAGE_TRANSLATING:'message:translating',
  // Participants
  PARTICIPANT_JOINED: 'participant:joined',
  PARTICIPANT_LEFT:   'participant:left',
  PARTICIPANT_LIST:   'participant:list',
} as const

export type SocketEventName = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS]
