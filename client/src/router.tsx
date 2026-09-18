import { createBrowserRouter } from "react-router";
import { RootLayout } from "@/routes/RootLayout";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { LoginPage } from "@/routes/LoginPage";
import { RoomsPage } from "@/routes/RoomsPage";
import { RoomPage } from "@/routes/RoomPage";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: "/", element: <RoomsPage /> },
          { path: "/rooms/:roomId", element: <RoomPage /> },
        ],
      },
    ],
  },
]);
