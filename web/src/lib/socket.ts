import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000';
const SOCKET_TRANSPORTS = (import.meta.env.VITE_SOCKET_TRANSPORTS ?? 'websocket')
  .split(',')
  .map((transport: string) => transport.trim())
  .filter(Boolean);
export const SOLOROOM_SOCKET = import.meta.env.WEB_SOLOROOM_SOCKET === 'yes';

let _socket: Socket | null = null;
let _authToken: string | null = null;

export function getSocket(): Socket {
  if (!_socket) {
    _socket = io(SERVER_URL, {
      autoConnect: false,
      transports: SOCKET_TRANSPORTS,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: _authToken ? { token: _authToken } : {},
    });
  }
  return _socket;
}

// Cache the bearer token so the server can identify the user on the socket
// handshake. Web auth is cookie-based, but the cross-origin dev socket won't
// carry the cookie, so we hand the server the token explicitly. Applied to any
// existing socket (and reconnections) as well as future ones.
export function setSocketAuthToken(token: string | null) {
  _authToken = token;
  if (_socket) {
    _socket.auth = token ? { token } : {};
  }
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (_authToken) s.auth = { token: _authToken };
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  _socket?.disconnect();
  _socket = null;
}
