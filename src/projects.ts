export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

const PROJECTS_INDEX_KEY = "wm:projects:index:v1";
const DB_NAME = "wm";
const DB_VERSION = 2;
const MAPS_STORE = "maps";
const NOTES_STORE = "notes";

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function listProjects(): Project[] {
  const parsed = safeJsonParse<Project[]>(localStorage.getItem(PROJECTS_INDEX_KEY));
  if (!parsed || !Array.isArray(parsed)) return [];
  return parsed
    .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProjectById(id: string): Project | null {
  return listProjects().find((p) => p.id === id) ?? null;
}

export function upsertProject(project: Project): void {
  const all = listProjects();
  const idx = all.findIndex((p) => p.id === project.id);
  if (idx === -1) {
    all.push(project);
  } else {
    all[idx] = project;
  }
  localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(all));
}

export function deleteProject(id: string): void {
  const all = listProjects().filter((p) => p.id !== id);
  localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(all));

  // Clean up per-project data saved by the legacy app.
  const keys = [
    `world-map-notes-v1:${id}`,
    `world-map-image-v1:${id}`,
    `world-map-note-modal-size-v1:${id}`,
    `world-map-note-modal-position-v1:${id}`,
    `world-map-editor-modal-size-v1:${id}`,
    `world-map-editor-modal-position-v1:${id}`,
  ];
  keys.forEach((k) => localStorage.removeItem(k));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MAPS_STORE)) {
        db.createObjectStore(MAPS_STORE, { keyPath: "projectId" });
      }
      // Notes store is used by the legacy app; create it here so DB schema is consistent.
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: "projectId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function saveProjectMap(projectId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MAPS_STORE, "readwrite");
    tx.objectStore(MAPS_STORE).put({ projectId, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save map"));
  });
  db.close();
}

export async function loadProjectMap(projectId: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(MAPS_STORE, "readonly");
    const req = tx.objectStore(MAPS_STORE).get(projectId);
    req.onsuccess = () => {
      const res = req.result as { projectId: string; blob: Blob } | undefined;
      resolve(res?.blob ?? null);
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to load map"));
  });
  db.close();
  return blob;
}

export async function deleteProjectMap(projectId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MAPS_STORE, "readwrite");
    tx.objectStore(MAPS_STORE).delete(projectId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete map"));
  });
  db.close();
}

export async function loadProjectNotes(projectId: string): Promise<any[] | null> {
  const db = await openDb();
  const noteList = await new Promise<any[] | null>((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, "readonly");
    const req = tx.objectStore(NOTES_STORE).get(projectId);
    req.onsuccess = () => {
      const res = req.result as { projectId: string; notes: any[] } | undefined;
      resolve(Array.isArray(res?.notes) ? res!.notes : null);
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to read notes"));
  });
  db.close();
  return noteList;
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const val = reader.result;
      if (typeof val === "string") resolve(val);
      else reject(new Error("Failed to read file as data URL"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
