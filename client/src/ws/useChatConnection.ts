import { createContext, useContext } from "react";
import type { ChatConnectionContextValue } from "./ChatConnectionProvider";

export const ChatConnectionContext =
  createContext<ChatConnectionContextValue | null>(null);

export function useChatConnection(): ChatConnectionContextValue {
  const context = useContext(ChatConnectionContext);
  if (!context) {
    throw new Error(
      "useChatConnection must be used within a ChatConnectionProvider",
    );
  }
  return context;
}
