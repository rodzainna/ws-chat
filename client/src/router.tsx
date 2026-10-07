import { createBrowserRouter } from "react-router";
import { RootLayout } from "@/routes/RootLayout";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AdminRoute } from "@/auth/AdminRoute";
import { LoginPage } from "@/routes/LoginPage";
import { ChatLayout } from "@/routes/ChatLayout";
import { NoRoomSelected } from "@/routes/NoRoomSelected";
import { RoomRoute } from "@/routes/RoomRoute";
import { AdminLayout } from "@/routes/AdminLayout";
import { AdminPage } from "@/routes/AdminPage";
import { TermsPage } from "@/routes/TermsPage";
import { PrivacyPage } from "@/routes/PrivacyPage";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/terms", element: <TermsPage /> },
      { path: "/privacy", element: <PrivacyPage /> },
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
          {
            element: <AdminRoute />,
            children: [
              {
                element: <AdminLayout />,
                children: [{ path: "/admin", element: <AdminPage /> }],
              },
            ],
          },
        ],
      },
    ],
  },
]);
