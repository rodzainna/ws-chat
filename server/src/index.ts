import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8080);

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket) => {
  console.log("client connected");

  socket.on("message", (data: Buffer) => {
    console.log("received:", data.toString());
  });

  socket.on("close", () => {
    console.log("client disconnected");
  });
});

console.log(`WebSocket server listening on ws://localhost:${PORT}`);
