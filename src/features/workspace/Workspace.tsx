import { useEffect, useMemo } from "react";
import { getProjectById } from "../../projects";
import { WorkspaceView } from "./WorkspaceView";

export function Workspace({ projectId }: { projectId: string }) {
  const project = useMemo(() => getProjectById(projectId), [projectId]);

  useEffect(() => {
    // Legacy app is DOM-driven and binds to IDs. Only load it for the workspace.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    void import("../../../script.js");
  }, []);

  return <WorkspaceView project={project} />;
}

