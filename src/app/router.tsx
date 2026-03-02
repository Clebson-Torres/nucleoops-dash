import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./App";
import { OverviewPage } from "../features/overview/OverviewPage";
import { JobsPage } from "../features/jobs/JobsPage";
import { AgentsPage } from "../features/agents/AgentsPage";
import { UsersSettingsPage } from "../features/settings/UsersSettingsPage";
import { AuthPage } from "../features/auth/AuthPage";
import { DeployAgentPage } from "../features/deploy/DeployAgentPage";
import { NetworkPage } from "../features/network/NetworkPage";

export const router = createBrowserRouter([
  { path: "/auth", element: <AuthPage /> },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <OverviewPage /> },
      { path: "jobs", element: <JobsPage /> },
      { path: "agents", element: <AgentsPage /> },
      { path: "network", element: <NetworkPage /> },
      { path: "deploy", element: <DeployAgentPage /> },
      { path: "settings/users", element: <UsersSettingsPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/overview" replace /> },
]);
