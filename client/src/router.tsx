import { createBrowserRouter } from "react-router";
import { RootLayout } from "@/routes/layouts/RootLayout";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AdminRoute } from "@/auth/AdminRoute";
import { LoginPage } from "@/routes/pages/LoginPage";
import { ChatLayout } from "@/routes/layouts/ChatLayout";
import { NoRoomSelected } from "@/routes/pages/NoRoomSelected";
import { RoomRoute } from "@/routes/pages/RoomRoute";
import { AdminLayout } from "@/routes/layouts/AdminLayout";
import { AdminPage } from "@/routes/pages/AdminPage";
import { TermsPage } from "@/routes/pages/TermsPage";
import { PrivacyPage } from "@/routes/pages/PrivacyPage";

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
