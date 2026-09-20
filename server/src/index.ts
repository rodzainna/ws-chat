import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { parseCookie } from "cookie";
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@as-integrations/express5";
import depthLimit from "graphql-depth-limit";
import { WebSocketServer } from "ws";
import { registerWsHandlers } from "./ws/handlers.js";
import { RoomRegistry } from "./ws/roomRegistry.js";
import { ConnectionRegistry } from "./ws/connectionRegistry.js";
import type { AuthenticatedRequest } from "./ws/types.js";
import { isDevelopment } from "./env.js";
import { disconnectPrisma } from "./db/prisma.js";
import { findActiveUserById } from "./db/users.js";
import { verifyToken } from "./auth/jwt.js";
import { ACCESS_TOKEN_COOKIE } from "./auth/cookies.js";
import { typeDefs } from "./graphql/schema.js";
import { resolvers } from "./graphql/resolvers.js";
import type { GraphQLContext } from "./graphql/context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST_DIR = path.join(__dirname, "../../client/dist");

const PORT = Number(process.env.PORT ?? 8080);
const MAX_WS_PAYLOAD_BYTES = 16 * 1024;
const SHUTDOWN_GRACE_MS = 3000;
const MAX_QUERY_DEPTH = 10;

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
// one proxy hop in production; without this req.ip is the proxy's address
// and IP-keyed login rate limiting is useless
app.set("trust proxy", 1);

const httpServer = http.createServer(app);

const wss = new WebSocketServer({
  server: httpServer,
  path: "/ws",
  maxPayload: MAX_WS_PAYLOAD_BYTES,
  // the origin check only stops other webpages; non-browser clients can fake
  // Origin, so the JWT check below is the real auth
  verifyClient: (info, callback) => {
    if (info.origin !== getCorsOrigin()) {
      callback(false, 403, "Origin not allowed");
      return;
    }
    const token = parseCookie(info.req.headers.cookie ?? "")[
      ACCESS_TOKEN_COOKIE
    ];
    if (!token) {
      callback(false, 401, "Authentication required");
      return;
    }
    verifyToken(token)
      .then(async (result) => {
        if (!result) {
          callback(false, 401, "Authentication required");
          return;
        }
        const { userId, expiresAt } = result;
        const user = await findActiveUserById(userId);
        if (!user) {
          callback(false, 401, "Authentication required");
          return;
        }
        (info.req as AuthenticatedRequest).userId = userId;
        (info.req as AuthenticatedRequest).expiresAt = expiresAt;
        callback(true);
      })
      .catch((err: unknown) => {
        console.error("Unexpected error verifying WS access token:", err);
        callback(false, 401, "Authentication required");
      });
  },
});
const roomRegistry = new RoomRegistry();
const connectionRegistry = new ConnectionRegistry();
registerWsHandlers(wss, roomRegistry, connectionRegistry);

const apollo = new ApolloServer<GraphQLContext>({
  typeDefs,
  resolvers,
  introspection: isDevelopment(),
  validationRules: [depthLimit(MAX_QUERY_DEPTH)],
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  // Apollo's own signal handlers re-send the signal and ran shutdown() twice;
  // ours below also drains the WS clients Apollo doesn't know about
  stopOnTerminationSignals: false,
  // Apollo doesn't redact unexpected errors (a DB outage leaked raw Prisma
  // text). Expected failures are userErrors, so anything internal is hidden.
  formatError: (formattedError, error) => {
    if (
      !isDevelopment() &&
      formattedError.extensions?.code === "INTERNAL_SERVER_ERROR"
    ) {
      console.error("Unexpected GraphQL error:", error);
      return {
        message: "Internal server error",
        extensions: { code: "INTERNAL_SERVER_ERROR" },
      };
    }
    return formattedError;
  },
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
      let userId: string | null = null;
      let accessTokenExpiresAt: Date | null = null;
      if (typeof token === "string") {
        try {
          const result = await verifyToken(token);
          if (result) {
            userId = result.userId;
            accessTokenExpiresAt = new Date(result.expiresAt);
          }
        } catch (err) {
          console.error("Unexpected error verifying access token:", err);
        }
      }
      return {
        req,
        res,
        userId,
        accessTokenExpiresAt,
        roomRegistry,
        connectionRegistry,
      };
    },
  }),
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use(express.static(CLIENT_DIST_DIR));
// SPA fallback for client-side routes. Path-less middleware because
// Express 5 dropped the bare "*" wildcard.
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }
  res.sendFile(path.join(CLIENT_DIST_DIR, "index.html"), (err: unknown) => {
    if (!err) return;
    console.error("Failed to serve SPA index.html:", err);
    if (!res.headersSent) res.status(500).send("Internal server error");
  });
});

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
