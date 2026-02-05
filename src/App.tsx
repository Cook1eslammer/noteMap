import { useMemo } from "react";
import { getProjectIdFromUrl } from "./app/navigation";
import { ProjectMenu } from "./features/project-menu/ProjectMenu";
import { Workspace } from "./features/workspace/Workspace";

export function App() {
  const projectId = useMemo(() => getProjectIdFromUrl(), []);
  if (!projectId) return <ProjectMenu />;
  return <Workspace projectId={projectId} />;
}
