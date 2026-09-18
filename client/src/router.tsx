import { createBrowserRouter } from "react-router";
import { RootLayout } from "@/routes/RootLayout";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { LoginPage } from "@/routes/LoginPage";
import { ChatLayout } from "@/routes/ChatLayout";
import { NoRoomSelected } from "@/routes/NoRoomSelected";
import { RoomRoute } from "@/routes/RoomRoute";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <ChatLayout />,
            children: [
              { path: "/", element: <NoRoomSelected /> },
              { path: "/rooms/:roomId", element: <RoomRoute /> },
            ],
          },
        ],
      },
    ],
  },
]);
