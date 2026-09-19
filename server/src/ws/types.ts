import type { WebSocket } from "ws";
import type { IncomingMessage } from "node:http";

export type AuthenticatedRequest = IncomingMessage & {
  userId?: string;
  expiresAt?: number;
};

export type AuthenticatedWebSocket = WebSocket & {
  userId: string;
  isAlive: boolean;
};
