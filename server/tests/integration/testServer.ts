import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { TEST_DATABASE_URL } from "./testDb.js";

export const TEST_CORS_ORIGIN = "http://localhost:5173";
export const TEST_JWT_SECRET = "a".repeat(32);

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Could not determine a free port"));
        }
      });
    });
  });
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ port }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Server on port ${port} never became reachable`));
        } else {
          setTimeout(attempt, 100);
        }
      });
    };
    attempt();
  });
}

export type TestServer = {
  baseUrl: string;
  wsUrl: string;
  stop(): Promise<void>;
};

export async function startTestServer(): Promise<TestServer> {
  const port = await getFreePort();
  const serverRoot = new URL("../..", import.meta.url).pathname;

  const env = { ...process.env };
  delete env.SUPERADMIN_USERNAME;
  Object.assign(env, {
    PORT: String(port),
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: TEST_JWT_SECRET,
    JWT_ACCESS_TOKEN_EXPIRY: "15m",
    JWT_REFRESH_TOKEN_EXPIRY_DAYS: "3",
    CORS_ORIGIN: TEST_CORS_ORIGIN,
    NODE_ENV: "test",
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: "5",
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: "900",
    RATE_LIMIT_MAX_MESSAGES: "10",
    RATE_LIMIT_WINDOW_SECONDS: "10",
    RATE_LIMIT_MAX_ROOM_CREATIONS: "5",
    RATE_LIMIT_ROOM_CREATION_WINDOW_SECONDS: "300",
    // every test registers from the same IP
    RATE_LIMIT_MAX_REGISTRATIONS: "1000",
  });

  const child: ChildProcess = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: serverRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));

  let exited = false;
  child.on("exit", () => (exited = true));

  try {
    await waitForPort(port, 15_000);
  } catch (err) {
    child.kill("SIGKILL");
    throw new Error(
      `Test server failed to start: ${(err as Error).message}\n--- server output ---\n${output}`,
    );
  }

  if (exited) {
    throw new Error(`Test server exited during startup:\n${output}`);
  }

  return {
    baseUrl: `http://localhost:${port}`,
    wsUrl: `ws://localhost:${port}/ws`,
    async stop() {
      if (exited) return;
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        setTimeout(() => {
          if (!exited) child.kill("SIGKILL");
          resolve();
        }, 5000);
      });
    },
  };
}
