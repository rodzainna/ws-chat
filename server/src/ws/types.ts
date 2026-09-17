import type { WebSocket } from "ws";
import type { IncomingMessage } from "node:http";

export type AuthenticatedRequest = IncomingMessage & { userId?: string };

export type AuthenticatedWebSocket = WebSocket & { userId: string };
