import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000';
const SOCKET_TRANSPORTS = (import.meta.env.VITE_SOCKET_TRANSPORTS ?? 'websocket')
  .split(',')
  .map((transport: string) => transport.trim())
  .filter(Boolean);

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (!_socket) {
    _socket = io(SERVER_URL, {
      autoConnect: false,
      transports: SOCKET_TRANSPORTS,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return _socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  _socket?.disconnect();
  _socket = null;
}
