import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@as-integrations/express5";
import { WebSocketServer } from "ws";
import { registerWsHandlers } from "./ws/handlers.js";
import { isDevelopment } from "./env.js";
import { disconnectPrisma } from "./db/prisma.js";
import { verifyToken } from "./auth/jwt.js";
import { ACCESS_TOKEN_COOKIE } from "./auth/cookies.js";
import { typeDefs } from "./graphql/schema.js";
import { resolvers } from "./graphql/resolvers.js";
import type { GraphQLContext } from "./graphql/context.js";

const PORT = Number(process.env.PORT ?? 8080);
const MAX_WS_PAYLOAD_BYTES = 16 * 1024;
const SHUTDOWN_GRACE_MS = 3000;

let cachedCorsOrigin: string | undefined;
function getCorsOrigin(): string {
  if (!cachedCorsOrigin) {
    const raw = process.env.CORS_ORIGIN;
    if (!raw) {
      throw new Error("CORS_ORIGIN environment variable is not set");
    }
    cachedCorsOrigin = raw;
  }
  return cachedCorsOrigin;
}

const app = express();

const httpServer = http.createServer(app);

const wss = new WebSocketServer({
  server: httpServer,
  path: "/ws",
  maxPayload: MAX_WS_PAYLOAD_BYTES,
  verifyClient: (info, callback) => {
    if (info.origin === getCorsOrigin()) {
      callback(true);
    } else {
      callback(false, 403, "Origin not allowed");
    }
  },
});
registerWsHandlers(wss);

const apollo = new ApolloServer<GraphQLContext>({
  typeDefs,
  resolvers,
  introspection: isDevelopment(),
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  // Apollo's own signal handlers re-send the signal and ran shutdown() twice;
  // ours below also drains the WS clients Apollo doesn't know about
  stopOnTerminationSignals: false,
});

await apollo.start();

app.use(
  "/graphql",
  cors({ origin: getCorsOrigin(), credentials: true }),
  cookieParser(),
  express.json(),
  expressMiddleware(apollo, {
    context: async ({ req, res }) => {
      const token: unknown = req.cookies[ACCESS_TOKEN_COOKIE];
      const userId =
        typeof token === "string" ? await verifyToken(token) : null;
      return { req, res, userId };
    },
  }),
);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// httpServer.close() waits for every connection, including WS sockets, so
// close them first (then terminate stragglers) or one open socket stalls a
// redeploy until SIGKILL
async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  try {
    for (const client of wss.clients) {
      client.close(1001, "Server shutting down");
    }
    await delay(SHUTDOWN_GRACE_MS);
    for (const client of wss.clients) {
      if (client.readyState !== client.CLOSED) {
        client.terminate();
      }
    }
    await apollo.stop();
    await disconnectPrisma();
    httpServer.close(() => process.exit(0));
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
}
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => void shutdown(signal));
}

httpServer.listen(PORT, () => {
  console.log(
    `Server listening on http://localhost:${PORT} — GraphQL at /graphql, WS upgrade at /ws`,
  );
});
