import "dotenv/config";
import { WebSocketServer } from "ws";
import { registerWsHandlers } from "./ws/handlers.js";

const PORT = Number(process.env.PORT ?? 8080);
const MAX_PAYLOAD_BYTES = 16 * 1024;

const wss = new WebSocketServer({ port: PORT, maxPayload: MAX_PAYLOAD_BYTES });

registerWsHandlers(wss);

console.log(`WebSocket server listening on ws://localhost:${PORT}`);
