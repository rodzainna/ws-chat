import { WebSocket } from "ws";
import { TEST_CORS_ORIGIN } from "./testServer.js";

type GraphQLResult<T> = {
  data: T | null;
  errors?: { message: string }[];
  cookies: string[];
};

function cookieNameValue(setCookieHeader: string): string {
  return setCookieHeader.split(";")[0];
}

export async function graphqlRequest<T>(
  baseUrl: string,
  query: string,
  variables: Record<string, unknown> = {},
  cookieHeader = "",
): Promise<GraphQLResult<T>> {
  const response = await fetch(`${baseUrl}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as {
    data: T | null;
    errors?: { message: string }[];
  };
  const cookies = response.headers.getSetCookie().map(cookieNameValue);
  return { ...body, cookies };
}

export function mergeCookies(existing: string, fresh: string[]): string {
  const jar = new Map<string, string>();
  for (const pair of existing
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)) {
    const [name] = pair.split("=");
    jar.set(name, pair);
  }
  for (const pair of fresh) {
    const [name] = pair.split("=");
    jar.set(name, pair);
  }
  return [...jar.values()].join("; ");
}

export type TestUser = { id: string; username: string; cookies: string };

const REGISTER_MUTATION = `
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      user { id username }
      userErrors { field message }
    }
  }
`;

export async function registerUser(
  baseUrl: string,
  username: string,
): Promise<TestUser> {
  const result = await graphqlRequest<{
    register: {
      user: { id: string; username: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(baseUrl, REGISTER_MUTATION, {
    input: {
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    },
  });
  const user = result.data?.register.user;
  if (!user) {
    throw new Error(
      `registerUser(${username}) failed: ${JSON.stringify(result.data?.register.userErrors ?? result.errors)}`,
    );
  }
  return {
    id: user.id,
    username: user.username,
    cookies: mergeCookies("", result.cookies),
  };
}

const CREATE_ROOM_MUTATION = `
  mutation CreateRoom($input: CreateRoomInput!) {
    createRoom(input: $input) {
      room { id name isPrivate }
      userErrors { field message }
    }
  }
`;

export async function createRoom(
  baseUrl: string,
  owner: TestUser,
  name: string,
  isPrivate = false,
): Promise<{ id: string; name: string; isPrivate: boolean }> {
  const result = await graphqlRequest<{
    createRoom: {
      room: { id: string; name: string; isPrivate: boolean } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    baseUrl,
    CREATE_ROOM_MUTATION,
    { input: { name, isPrivate } },
    owner.cookies,
  );
  const room = result.data?.createRoom.room;
  if (!room) {
    throw new Error(
      `createRoom(${name}) failed: ${JSON.stringify(result.data?.createRoom.userErrors ?? result.errors)}`,
    );
  }
  return room;
}

const ADD_ROOM_MEMBER_MUTATION = `
  mutation AddRoomMember($roomId: ID!, $username: String!) {
    addRoomMember(roomId: $roomId, username: $username) {
      room { id }
      userErrors { field message }
    }
  }
`;

export async function addRoomMember(
  baseUrl: string,
  owner: TestUser,
  roomId: string,
  username: string,
): Promise<void> {
  const result = await graphqlRequest<{
    addRoomMember: {
      room: { id: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(baseUrl, ADD_ROOM_MEMBER_MUTATION, { roomId, username }, owner.cookies);
  if (!result.data?.addRoomMember.room) {
    throw new Error(
      `addRoomMember(${username}) failed: ${JSON.stringify(result.data?.addRoomMember.userErrors ?? result.errors)}`,
    );
  }
}

const DEACTIVATE_USER_MUTATION = `
  mutation DeactivateUser($userId: ID!) {
    deactivateUser(userId: $userId) {
      user { id isActive }
      userErrors { field message }
    }
  }
`;

export async function deactivateUser(
  baseUrl: string,
  admin: TestUser,
  userId: string,
): Promise<void> {
  const result = await graphqlRequest<{
    deactivateUser: {
      user: { id: string; isActive: boolean } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(baseUrl, DEACTIVATE_USER_MUTATION, { userId }, admin.cookies);
  if (!result.data?.deactivateUser.user) {
    throw new Error(
      `deactivateUser(${userId}) failed: ${JSON.stringify(result.data?.deactivateUser.userErrors ?? result.errors)}`,
    );
  }
}

const LOGOUT_MUTATION = `mutation { logout { success } }`;

export async function logout(baseUrl: string, user: TestUser): Promise<void> {
  await graphqlRequest(baseUrl, LOGOUT_MUTATION, {}, user.cookies);
}

const SET_GLOBAL_ROLE_MUTATION = `
  mutation SetGlobalRole($userId: ID!, $role: GlobalRole!) {
    setGlobalRole(userId: $userId, role: $role) {
      user { id globalRole }
      userErrors { field message }
    }
  }
`;

export async function setGlobalRole(
  baseUrl: string,
  admin: TestUser,
  userId: string,
  role: "ADMIN" | "USER" | "RESTRICTED",
): Promise<void> {
  const result = await graphqlRequest<{
    setGlobalRole: {
      user: { id: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(baseUrl, SET_GLOBAL_ROLE_MUTATION, { userId, role }, admin.cookies);
  if (!result.data?.setGlobalRole.user) {
    throw new Error(
      `setGlobalRole(${userId}, ${role}) failed: ${JSON.stringify(result.data?.setGlobalRole.userErrors ?? result.errors)}`,
    );
  }
}

export type ReceivedMessage = Record<string, unknown> & { type: string };

export type TestSocket = {
  send(frame: Record<string, unknown>): void;
  waitFor(
    predicate: (message: ReceivedMessage) => boolean,
    timeoutMs?: number,
  ): Promise<ReceivedMessage>;
  assertNoneWithin(
    predicate: (message: ReceivedMessage) => boolean,
    timeoutMs?: number,
  ): Promise<void>;
  close(): void;
};

export function connectSocket(
  wsUrl: string,
  cookieHeader: string,
): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl, {
      headers: { Cookie: cookieHeader },
      origin: TEST_CORS_ORIGIN,
    });
    const received: ReceivedMessage[] = [];
    const consumed = new Set<ReceivedMessage>();

    socket.on("message", (data: Buffer) => {
      received.push(JSON.parse(data.toString()) as ReceivedMessage);
    });
    socket.on("open", () => {
      resolve({
        send: (frame) => socket.send(JSON.stringify(frame)),
        waitFor: (predicate, timeoutMs = 2000) =>
          new Promise((res, rej) => {
            const deadline = Date.now() + timeoutMs;
            const poll = () => {
              const match = received.find(
                (m) => !consumed.has(m) && predicate(m),
              );
              if (match) {
                consumed.add(match);
                res(match);
                return;
              }
              if (Date.now() > deadline) {
                rej(
                  new Error(
                    `Timed out waiting for a matching message. Received so far: ${JSON.stringify(received)}`,
                  ),
                );
                return;
              }
              setTimeout(poll, 20);
            };
            poll();
          }),
        assertNoneWithin: async (predicate, timeoutMs = 500) => {
          await new Promise((res) => setTimeout(res, timeoutMs));
          const match = received.find((m) => !consumed.has(m) && predicate(m));
          if (match) {
            throw new Error(
              `Expected no matching message, but received: ${JSON.stringify(match)}`,
            );
          }
        },
        close: () => socket.close(),
      });
    });
    socket.on("error", reject);
  });
}
