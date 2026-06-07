import { io, Socket } from 'socket.io-client';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:4000';

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (!_socket) {
    _socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket'],
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
