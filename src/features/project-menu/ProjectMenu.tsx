import { useEffect, useRef, useState } from "react";
import {
  deleteProject,
  deleteProjectMap,
  listProjects,
  saveProjectMap,
  upsertProject,
  type Project,
} from "../../projects";
import { navigateToProject } from "../../app/navigation";
import { newId } from "../../shared/newId";
import { loadMaterials } from "./materials";
import type { MaterialsItem } from "./types";
import { ProjectMenuView } from "./ProjectMenuView";
import "./projectMenu.css";

export function ProjectMenu() {
  const [projects, setProjects] = useState<Project[]>(() => listProjects());
  const [name, setName] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materials, setMaterials] = useState<MaterialsItem[]>([]);
  const [selectedSrc, setSelectedSrc] = useState<string | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const refresh = () => setProjects(listProjects());

  const closeMaterials = () => {
    setMaterialsOpen(false);
    setSelectedSrc(null);
    objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrlsRef.current = [];
  };

  useEffect(() => {
    if (!materialsOpen) return;
    let cancelled = false;

    const run = async () => {
      setMaterialsLoading(true);
      setMaterials([]);
      setSelectedSrc(null);
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];

      try {
        const list = listProjects();
        const res = await loadMaterials(list);
        if (cancelled) {
          res.objectUrls.forEach((u) => URL.revokeObjectURL(u));
          return;
        }
        objectUrlsRef.current = res.objectUrls;
        setMaterials(res.items);
      } finally {
        if (!cancelled) setMaterialsLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [materialsOpen]);

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Введите название проекта");
      return;
    }
    if (!file) {
      alert("Выберите картинку карты");
      return;
    }

    const id = newId();
    const now = Date.now();
    const project: Project = { id, name: trimmed, createdAt: now, updatedAt: now };

    upsertProject(project);
    try {
      await saveProjectMap(id, file);
      // Lightweight marker for legacy code paths (script.js also checks it).
      localStorage.setItem(`world-map-image-v1:${id}`, "__idb__");
    } catch (e) {
      console.error(e);
      alert("Не удалось сохранить карту. Возможно, браузер блокирует IndexedDB или не хватает места.");
      return;
    }

    refresh();
    navigateToProject(id);
  };

  const onDelete = (p: Project) => {
    if (!confirm(`Удалить проект \"${p.name}\"?`)) return;
    deleteProject(p.id);
    void deleteProjectMap(p.id);
    refresh();
  };

  return (
    <ProjectMenuView
      projects={projects}
      name={name}
      onNameChange={setName}
      onFileChange={setFile}
      onCreate={onCreate}
      onOpenMaterials={() => setMaterialsOpen(true)}
      onOpenProject={(id) => navigateToProject(id)}
      onDeleteProject={onDelete}
      materialsOpen={materialsOpen}
      materialsLoading={materialsLoading}
      materials={materials}
      selectedSrc={selectedSrc}
      onSelectSrc={setSelectedSrc}
      onCloseMaterials={closeMaterials}
    />
  );
}

