import type { Request, Response } from "express";
import type { RoomRegistry } from "../ws/roomRegistry.js";
import type { ConnectionRegistry } from "../ws/connectionRegistry.js";

export type GraphQLContext = {
  req: Request;
  res: Response;
  userId: string | null;
  roomRegistry: RoomRegistry;
  connectionRegistry: ConnectionRegistry;
};
