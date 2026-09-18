import type { Request, Response } from "express";
import type { RoomRegistry } from "../ws/roomRegistry.js";

export type GraphQLContext = {
  req: Request;
  res: Response;
  userId: string | null;
  roomRegistry: RoomRegistry;
};
