import { loadProjectMap, loadProjectNotes, type Project } from "../../projects";
import type { MaterialsItem } from "./types";

export type MaterialsLoadResult = {
  items: MaterialsItem[];
  // Object URLs created for map blobs; caller should revoke them when closing.
  objectUrls: string[];
};

function loadLegacyNotesFromLocalStorage(projectId: string): any[] | null {
  try {
    const raw = localStorage.getItem(`world-map-notes-v1:${projectId}`);
    if (!raw || raw === "__idb__") return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export async function loadMaterials(projects: Project[]): Promise<MaterialsLoadResult> {
  const objectUrls: string[] = [];
  const items: MaterialsItem[] = [];

  // Project maps (IndexedDB: wm/maps)
  for (const p of projects) {
    try {
      const blob = await loadProjectMap(p.id);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      items.push({ src: url, kind: "map", label: `Карта: ${p.name}` });
    } catch {
      // ignore
    }
  }

  // Note images (notes are stored in IndexedDB now, with fallback to legacy localStorage).
  for (const p of projects) {
    try {
      const noteList = (await loadProjectNotes(p.id)) ?? loadLegacyNotesFromLocalStorage(p.id);
      if (!noteList) continue;

      for (const n of noteList) {
        const noteTitle =
          n && typeof n.title === "string" && n.title.trim() ? n.title.trim() : "Без названия";
        const images = n && Array.isArray(n.images) ? n.images : [];
        for (let i = 0; i < images.length; i += 1) {
          const src = images[i];
          if (typeof src !== "string") continue;
          if (!src.startsWith("data:image/")) continue;
          items.push({
            src,
            kind: "note-image",
            label: `Заметка: ${p.name} / ${noteTitle} (#${i + 1})`,
          });
        }
      }
    } catch {
      // ignore
    }
  }

  return { items, objectUrls };
}

