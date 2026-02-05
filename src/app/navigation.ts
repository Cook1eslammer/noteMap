export function getProjectIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("project");
}

export function navigateToMenu(): void {
  window.location.search = "";
}

export function navigateToProject(id: string): void {
  window.location.search = `?project=${encodeURIComponent(id)}`;
}

