import { createBrowserRouter } from "react-router";
import { RootLayout } from "./components/layouts/RootLayout";
import { ProjectManagement } from "./pages/ProjectManagement";
import { ProjectWorkspace } from "./pages/ProjectWorkspace";
import { ProjectEditor } from "./pages/ProjectEditor";
import { NotFound } from "./pages/NotFound";
import { ErrorBoundary } from "./pages/ErrorBoundary";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, Component: ProjectManagement },
      { path: "new-workspace", Component: ProjectEditor },
      { path: "project/:projectId", Component: ProjectWorkspace },
      { path: "project/:projectId/edit", Component: ProjectEditor },
      { path: "*", Component: NotFound },
    ],
  },
]);