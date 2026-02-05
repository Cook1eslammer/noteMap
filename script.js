(() => {
  const PROJECT_ID =
    new URLSearchParams(window.location.search).get("project") || "default";

  const STORAGE_KEY = `world-map-notes-v1:${PROJECT_ID}`;
  const MAP_IMAGE_KEY = `world-map-image-v1:${PROJECT_ID}`;
  const NOTE_MODAL_SIZE_KEY = `world-map-note-modal-size-v1:${PROJECT_ID}`;
  const NOTE_MODAL_POSITION_KEY = `world-map-note-modal-position-v1:${PROJECT_ID}`;
  const EDITOR_MODAL_SIZE_KEY = `world-map-editor-modal-size-v1:${PROJECT_ID}`;
  const EDITOR_MODAL_POSITION_KEY = `world-map-editor-modal-position-v1:${PROJECT_ID}`;

  const DB_NAME = "wm";
  const DB_VERSION = 2;
  const MAPS_STORE = "maps";
  const NOTES_STORE = "notes";

  /** @type {string | null} */
  let currentMapObjectUrl = null;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(MAPS_STORE)) {
          db.createObjectStore(MAPS_STORE, { keyPath: "projectId" });
        }
        if (!db.objectStoreNames.contains(NOTES_STORE)) {
          db.createObjectStore(NOTES_STORE, { keyPath: "projectId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(req.error || new Error("Failed to open IndexedDB"));
    });
  }

  async function idbGetMapBlob(projectId) {
    const db = await openDb();
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(MAPS_STORE, "readonly");
      const req = tx.objectStore(MAPS_STORE).get(projectId);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error || new Error("Failed to load map"));
    });
    db.close();
    return blob;
  }

  async function idbPutMapBlob(projectId, blob) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(MAPS_STORE, "readwrite");
      tx.objectStore(MAPS_STORE).put({ projectId, blob });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to save map"));
    });
    db.close();
  }

  async function idbGetNotes(projectId) {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, "readonly");
      const req = tx.objectStore(NOTES_STORE).get(projectId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () =>
        reject(req.error || new Error("Failed to load notes"));
    });
    db.close();
    return record && Array.isArray(record.notes) ? record.notes : null;
  }

  async function idbPutNotes(projectId, notesToSave) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, "readwrite");
      tx.objectStore(NOTES_STORE).put({ projectId, notes: notesToSave });
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error("Failed to save notes"));
    });
    db.close();
  }

  function setMapFromBlob(blob) {
    if (currentMapObjectUrl) {
      URL.revokeObjectURL(currentMapObjectUrl);
      currentMapObjectUrl = null;
    }
    const url = URL.createObjectURL(blob);
    currentMapObjectUrl = url;
    mapImage.src = url;
  }

  async function loadStoredMap() {
    // Prefer IndexedDB for map storage (big images won't fit localStorage).
    try {
      const blob = await idbGetMapBlob(PROJECT_ID);
      if (blob) {
        setMapFromBlob(blob);
        return;
      }
    } catch (e) {
      console.error("Failed to load map from IndexedDB", e);
    }

    // Fallback: legacy localStorage dataURL (also try migrating it to IndexedDB).
    try {
      const storedMap = localStorage.getItem(MAP_IMAGE_KEY);
      if (!storedMap || storedMap === "__idb__") return;
      mapImage.src = storedMap;

      try {
        const resp = await fetch(storedMap);
        const blob = await resp.blob();
        await idbPutMapBlob(PROJECT_ID, blob);
        // Keep only a small marker; dataURL can exceed localStorage limits quickly.
        localStorage.setItem(MAP_IMAGE_KEY, "__idb__");
      } catch (migrateErr) {
        console.warn("Failed to migrate stored map to IndexedDB", migrateErr);
      }
    } catch (e) {
      console.error("Failed to load stored map image", e);
    }
  }

  /** @typedef {{ id: string; title: string; description: string; x: number; y: number; images?: string[]; thumb?: string; type?: "note" | "link"; targetProjectId?: string }} Note */

  /** @type {Note[]} */
  let notes = [];
  let activeNoteId = null;
  let editingNoteId = null;

  const appRoot = document.querySelector(".app");
  const mapContainer = document.getElementById("map-container");
  const mapViewport = document.getElementById("map-viewport");
  const mapImage = document.getElementById("map-image");
  const markersLayer = document.getElementById("markers-layer");

  const searchInput = document.getElementById("search-input");
  const notesList = document.getElementById("notes-list");
  const emptyNotes = document.getElementById("empty-notes");
  const clearNotesBtn = document.getElementById("clear-notes");

  const noteModal = document.getElementById("note-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const modalCloseBtn = document.getElementById("modal-close");
  const modalOpenMapBtn = document.getElementById("modal-open-map");
  const modalEditBtn = document.getElementById("modal-edit");
  const modalDeleteBtn = document.getElementById("modal-delete");

  // Note windows are created as independent clones, so multiple can be open at once.

  const editorModal = document.getElementById("editor-modal");
  const editorTitle = document.getElementById("editor-title");
  const noteForm = document.getElementById("note-form");
  const noteTypeSelect = document.getElementById("note-type");
  const noteTypeLabel = document.getElementById("note-type-label");
  const linkFields = document.getElementById("link-fields");
  const linkTargetSelect = document.getElementById("link-target-select");
  const linkCreateToggle = document.getElementById("link-create-toggle");
  const linkCreateFields = document.getElementById("link-create-fields");
  const linkNewNameInput = document.getElementById("link-new-name");
  const linkNewMapInput = document.getElementById("link-new-map");
  const linkNewCreateBtn = document.getElementById("link-new-create");
  const noteTitleInput = document.getElementById("note-title");
  const noteDescriptionInput = document.getElementById("note-description");
  const editorCancelBtn = document.getElementById("editor-cancel");

  const mapUploadInput = document.getElementById("map-upload");
  const toggleSidebarBtn = document.getElementById("toggle-sidebar");
  const zoomInBtn = document.getElementById("zoom-in");
  const zoomOutBtn = document.getElementById("zoom-out");
  const zoomResetBtn = document.getElementById("zoom-reset");
  const zoomLabel = document.getElementById("zoom-label");
  const newNoteBtn = document.getElementById("new-note");
  const newObjectBtn = document.getElementById("new-object");
  const newObjectMenu = document.getElementById("new-object-menu");
  const noteImagesInput = document.getElementById("note-images");
  const noteImagesPreview = document.getElementById("note-images-preview");

  let scale = 1;
  let baseFitScale = 1;
  // Minimum scale is normally 40%, but for very large images we allow zooming out
  // down to the "fit-to-window" scale so the whole map can be seen.
  let minScale = 0.4;
  const MAX_SCALE = 4;
  let translateX = 0;
  let translateY = 0;

  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartTranslateX = 0;
  let panStartTranslateY = 0;
  let clickStartX = 0;
  let clickStartY = 0;
  let clickMoved = false;

  let placingNewNote = false;
  /** @type {"marker" | "link" | "text"} */
  let placingType = "marker";
  /** @type {string[]} */
  let editorImages = [];
  /** @type {string | null} */
  let editorThumb = null;
  /** @type {string | null} */
  let editorLinkTargetId = null;

  let isResizing = false;
  let resizeDirection = "";
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartWidth = 0;
  let resizeStartHeight = 0;
  let resizeStartLeft = 0;
  let resizeStartTop = 0;
  /** @type {HTMLElement | null} */
  let activeResizeElement = null;
  /** @type {(() => void) | null} */
  let onResizeStop = null;

  let isDraggingModal = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartLeft = 0;
  let dragStartTop = 0;
  /** @type {HTMLElement | null} */
  let activeDragElement = null;
  /** @type {(() => void) | null} */
  let onDragStop = null;

  // Simple window-manager: whichever window you click becomes topmost.
  let topWindowZ = 110;

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  const PROJECTS_INDEX_KEY = "wm:projects:index:v1";

  function readProjectsIndex() {
    try {
      const raw = localStorage.getItem(PROJECTS_INDEX_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function upsertProjectIndexEntry(entry) {
    const all = readProjectsIndex();
    const idx = all.findIndex((p) => p && p.id === entry.id);
    if (idx === -1) all.push(entry);
    else all[idx] = entry;
    try {
      localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn("Failed to update projects index", e);
    }
  }

  function getProjectNameById(id) {
    const all = readProjectsIndex();
    const p = all.find((x) => x && x.id === id);
    return p && typeof p.name === "string" ? p.name : id;
  }

  function randomProjectId() {
    try {
      return crypto.randomUUID();
    } catch {
      return `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  }

  function setLinkUiVisibility() {
    const type = noteTypeSelect ? String(noteTypeSelect.value || "marker") : "marker";
    if (linkFields) linkFields.style.display = type === "link" ? "" : "none";
  }

  function setNoteType(type) {
    const normalized = type === "link" ? "link" : type === "text" ? "text" : "marker";
    if (noteTypeSelect) noteTypeSelect.value = normalized;
    if (noteTypeLabel) {
      noteTypeLabel.textContent =
        normalized === "link" ? "Ссылка" : normalized === "text" ? "Текст" : "Метка";
    }
    setLinkUiVisibility();
  }

  function populateLinkTargetSelect(selectedId) {
    if (!linkTargetSelect) return;
    const current = PROJECT_ID;
    const all = readProjectsIndex()
      .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
      .filter((p) => p.id !== current)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    linkTargetSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Выберите карту...";
    linkTargetSelect.appendChild(placeholder);

    all.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      linkTargetSelect.appendChild(opt);
    });

    if (selectedId) {
      linkTargetSelect.value = selectedId;
    }
  }

  function navigateToProject(id) {
    try {
      // Keep a lightweight breadcrumb stack for back navigation later.
      const key = "wm:navStack:v1";
      const raw = sessionStorage.getItem(key);
      const stack = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(stack) ? stack : [];
      next.push(PROJECT_ID);
      sessionStorage.setItem(key, JSON.stringify(next.slice(-20)));
    } catch {
      // ignore
    }
    window.location.search = `?project=${encodeURIComponent(id)}`;
  }

  /**
   * Bring a floating window to the front (above other floating windows).
   * @param {HTMLElement} modalEl
   */
  function bringModalToFront(modalEl) {
    topWindowZ += 1;
    modalEl.style.zIndex = String(topWindowZ);
  }

  // We intentionally do NOT persist modal sizes across page reloads.
  // Users can resize within a session; sizes are kept by inline styles while the page is open.
  function restoreModalSize(_modalEl, _sizeKey) {}
  function saveModalSize(_modalEl, _sizeKey) {}

  function restoreModalPosition(modalEl, positionKey) {
    try {
      const saved = localStorage.getItem(positionKey);
      const content = modalEl.querySelector(".modal__content");
      if (!content) return;

      if (saved) {
        const { left, top } = JSON.parse(saved);
        if (left !== undefined && top !== undefined) {
          content.style.left = `${left}px`;
          content.style.top = `${top}px`;
          return;
        }
      }

      // First open: center it.
      setTimeout(() => {
        const rect = content.getBoundingClientRect();
        const left = (window.innerWidth - rect.width) / 2;
        const top = (window.innerHeight - rect.height) / 2;
        content.style.left = `${left}px`;
        content.style.top = `${top}px`;
      }, 0);
    } catch (e) {
      console.error("Failed to restore modal position", e);
    }
  }

  function saveModalPosition(modalEl, positionKey) {
    try {
      const content = modalEl.querySelector(".modal__content");
      if (!content) return;
      const left = parseFloat(content.style.left) || 0;
      const top = parseFloat(content.style.top) || 0;
      localStorage.setItem(positionKey, JSON.stringify({ left, top }));
    } catch (e) {
      console.error("Failed to save modal position", e);
    }
  }

  function clampPanToBounds() {
    if (!mapContainer || !mapViewport) return;

    const contRect = mapContainer.getBoundingClientRect();
    const contWidth = contRect.width || 0;
    const contHeight = contRect.height || 0;
    const baseWidth = mapViewport.offsetWidth || contWidth;
    const baseHeight = mapViewport.offsetHeight || contHeight;

    const mapWidth = baseWidth * scale;
    const mapHeight = baseHeight * scale;

    const margin = 80; // РЅРµР±РѕР»СЊС€РѕР№ Р·Р°РїР°СЃ, С‡С‚РѕР±С‹ РјРѕР¶РЅРѕ Р±С‹Р»Рѕ С‡СѓС‚СЊ В«РІС‹РґРµСЂРЅСѓС‚СЊВ» РєР°СЂС‚Сѓ

    let minX;
    let maxX;
    if (mapWidth <= contWidth) {
      const centeredX = (contWidth - mapWidth) / 2;
      minX = centeredX;
      maxX = centeredX;
    } else {
      minX = contWidth - mapWidth - margin;
      maxX = margin;
    }

    let minY;
    let maxY;
    if (mapHeight <= contHeight) {
      const centeredY = (contHeight - mapHeight) / 2;
      minY = centeredY;
      maxY = centeredY;
    } else {
      minY = contHeight - mapHeight - margin;
      maxY = margin;
    }

    translateX = clamp(translateX, minX, maxX);
    translateY = clamp(translateY, minY, maxY);
  }

  function applyTransform() {
    clampPanToBounds();
    mapViewport.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    }
  }

  function normalizeNote(raw) {
    const n = raw || {};
    const images = Array.isArray(n.images) ? n.images.filter((x) => typeof x === "string") : [];
    return {
      ...n,
      images,
      type: n.type === "link" ? "link" : n.type === "text" ? "text" : "marker",
      targetProjectId: typeof n.targetProjectId === "string" ? n.targetProjectId : undefined,
      thumb: typeof n.thumb === "string" ? n.thumb : undefined,
      x: typeof n.x === "number" ? n.x : undefined,
      y: typeof n.y === "number" ? n.y : undefined,
    };
  }

  async function loadNotes() {
    // Prefer IndexedDB to avoid localStorage quota issues (data loss).
    try {
      const fromDb = await idbGetNotes(PROJECT_ID);
      if (fromDb && Array.isArray(fromDb)) {
        notes = fromDb.map(normalizeNote);
        return;
      }
    } catch (e) {
      console.error("Failed to load notes from IndexedDB", e);
    }

    // Fallback / migration from legacy localStorage.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw || raw === "__idb__") return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        notes = parsed.map(normalizeNote);
        try {
          await idbPutNotes(PROJECT_ID, notes);
          localStorage.setItem(STORAGE_KEY, "__idb__");
        } catch (migrateErr) {
          console.warn("Failed to migrate notes to IndexedDB", migrateErr);
        }
      }
    } catch (e) {
      console.error("Failed to parse notes from storage", e);
    }
  }

  async function saveNotes() {
    try {
      await idbPutNotes(PROJECT_ID, notes);
      try {
        localStorage.setItem(STORAGE_KEY, "__idb__");
      } catch {
        // ignore
      }
    } catch (e) {
      console.error("Failed to save notes to IndexedDB", e);
      alert(
        "Не удалось сохранить заметки. Возможно, отключен IndexedDB или закончилось место в браузере.",
      );
    }
  }

  function createMarkerElement(note) {
    const marker = document.createElement("button");
    marker.className = "marker";
    marker.dataset.noteId = note.id;
    marker.style.left = `${note.x}%`;
    marker.style.top = `${note.y}%`;
    marker.title = note.title;

    const pulse = document.createElement("div");
    pulse.className = "marker__pulse";
    marker.appendChild(pulse);

    marker.addEventListener("click", (e) => {
      e.stopPropagation();
      openNoteModal(note.id);
    });

    marker.addEventListener("mouseenter", () => highlightPair(note.id, true));
    marker.addEventListener("mouseleave", () => highlightPair(note.id, false));

    return marker;
  }

  function renderMarkers() {
    markersLayer.innerHTML = "";
    notes.forEach((note) => {
      if (note.type === "text") return;
      if (typeof note.x !== "number" || typeof note.y !== "number") return;
      const marker = createMarkerElement(note);
      markersLayer.appendChild(marker);
    });
  }

  function createNoteListItem(note) {
    const li = document.createElement("li");
    li.className = "note-item";
    li.dataset.noteId = note.id;

    if (note.thumb) {
      li.classList.add("note-item--has-thumb");
      const thumb = document.createElement("img");
      thumb.className = "note-item__thumb";
      thumb.src = note.thumb;
      thumb.alt = "";
      thumb.loading = "lazy";
      li.appendChild(thumb);
    } else if (note.type === "link" && note.targetProjectId) {
      const badge = document.createElement("span");
      badge.className = "note-item__badge";
      badge.title = "Ссылка на карту";
      badge.textContent = "MAP";
      li.appendChild(badge);
    } else if (note.type === "text") {
      const badge = document.createElement("span");
      badge.className = "note-item__badge";
      badge.title = "Текстовая заметка";
      badge.textContent = "TXT";
      li.appendChild(badge);
    } else if (note.images && note.images.length > 0) {
      const badge = document.createElement("span");
      badge.className = "note-item__badge";
      badge.title = "Есть изображения";
      badge.textContent = "IMG";
      li.appendChild(badge);
    }

    const title = document.createElement("div");
    title.className = "note-item__title";
    title.textContent = note.title || "Без названия";

    const meta = document.createElement("div");
    meta.className = "note-item__meta";

    const preview = document.createElement("p");
    preview.className = "note-item__preview";
    const text = (note.description || "").trim().replace(/\s+/g, " ");
    preview.textContent = text.length > 80 ? text.slice(0, 77) + "…" : text || "Без описания";

    const coords = document.createElement("span");
    coords.className = "note-item__coords";
    if (typeof note.x === "number" && typeof note.y === "number") {
      coords.textContent = `${note.x.toFixed(1)}%, ${note.y.toFixed(1)}%`;
    } else {
      coords.textContent = "";
      coords.style.display = "none";
    }

    meta.appendChild(preview);
    meta.appendChild(coords);

    // РљРЅРѕРїРєР° РЅР°СЃС‚СЂРѕРµРє СЃ РІС‹РїР°РґР°СЋС‰РёРј РјРµРЅСЋ
    const settingsBtn = document.createElement("button");
    settingsBtn.className = "note-item__settings";
    settingsBtn.innerHTML = "⚙";
    settingsBtn.type = "button";
    settingsBtn.title = "Настройки";
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleNoteMenu(note.id);
    });

    const menu = document.createElement("div");
    menu.className = "note-item__menu";
    menu.dataset.noteId = note.id;
    menu.style.display = "none";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "note-item__menu-item note-item__menu-item--delete";
    deleteBtn.textContent = "Удалить?";
    deleteBtn.dataset.state = "confirm";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteNoteClick(note.id, deleteBtn);
    });

    menu.appendChild(deleteBtn);

    const settingsContainer = document.createElement("div");
    settingsContainer.className = "note-item__settings-container";
    settingsContainer.appendChild(settingsBtn);
    settingsContainer.appendChild(menu);

    li.appendChild(title);
    li.appendChild(meta);
    li.appendChild(settingsContainer);

    li.addEventListener("click", (e) => {
      if (!e.target.closest(".note-item__settings-container")) {
        openNoteModal(note.id);
      }
    });
    li.addEventListener("mouseenter", () => highlightPair(note.id, true));
    li.addEventListener("mouseleave", () => highlightPair(note.id, false));

    return li;
  }

  function toggleNoteMenu(noteId) {
    const allMenus = document.querySelectorAll(".note-item__menu");
    const targetMenu = document.querySelector(`.note-item__menu[data-note-id="${noteId}"]`);
    
    allMenus.forEach((menu) => {
      if (menu !== targetMenu) {
        menu.style.display = "none";
        const deleteBtn = menu.querySelector(".note-item__menu-item--delete");
        if (deleteBtn) {
          deleteBtn.textContent = "Удалить?";
          deleteBtn.dataset.state = "confirm";
        }
      }
    });

    if (targetMenu) {
      targetMenu.style.display = targetMenu.style.display === "none" ? "block" : "none";
    }
  }

  function handleDeleteNoteClick(noteId, button) {
    if (button.dataset.state === "confirm") {
      button.textContent = "Точно?";
      button.dataset.state = "final";
    } else {
      const idx = notes.findIndex((n) => n.id === noteId);
      if (idx !== -1) {
        notes.splice(idx, 1);
        void saveNotes();
        renderMarkers();
        renderNotesList();
        if (activeNoteId === noteId) {
          activeNoteId = null;
          closeNoteModal();
        }
        highlightPair(noteId, false);
      }
    }
  }

  function renderNotesList() {
    const filter = (searchInput.value || "").trim().toLowerCase();
    notesList.innerHTML = "";
    const filtered = !filter
      ? notes
      : notes.filter(
          (n) =>
            n.title.toLowerCase().includes(filter) ||
            n.description.toLowerCase().includes(filter),
        );

    filtered.forEach((note) => {
      const item = createNoteListItem(note);
      notesList.appendChild(item);
    });

    emptyNotes.style.display = filtered.length === 0 ? "block" : "none";
  }

  function highlightPair(noteId, on) {
    const marker = markersLayer.querySelector(`.marker[data-note-id="${noteId}"]`);
    const item = notesList.querySelector(`.note-item[data-note-id="${noteId}"]`);
    if (marker) {
      marker.classList.toggle("marker--highlight", on);
    }
    if (item) {
      item.classList.toggle("note-item--highlight", on);
    }
  }

  function setupFloatingWindow(modalEl, contentEl, titleEl, closeBtnEl) {
    if (!modalEl || !contentEl || !titleEl) return;

    const oldHandles = contentEl.querySelectorAll(".modal__resize-handle");
    oldHandles.forEach((h) => h.remove());

    const directions = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
    directions.forEach((dir) => {
      const handle = document.createElement("div");
      handle.className = `modal__resize-handle modal__resize-handle--${dir}`;
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        bringModalToFront(modalEl);
        startResize(e, dir, contentEl, () => {});
      });
      contentEl.appendChild(handle);
    });

    contentEl.addEventListener("mousedown", () => bringModalToFront(modalEl));

    titleEl.addEventListener("mousedown", (e) => {
      if (closeBtnEl && e.target === closeBtnEl) return;
      e.preventDefault();
      bringModalToFront(modalEl);
      startDragModal(e, contentEl, () => {});
    });
  }

  function positionNewNoteWindow(contentEl) {
    setTimeout(() => {
      const rect = contentEl.getBoundingClientRect();
      const baseLeft = (window.innerWidth - rect.width) / 2;
      const baseTop = (window.innerHeight - rect.height) / 2;
      // Use index (0-based) so the very first window opens centered.
      const openCount = document.querySelectorAll(".note-modal").length;
      const openIndex = Math.max(0, openCount - 1);
      const offset = (openIndex % 10) * 22;

      const left = Math.max(0, Math.min(baseLeft + offset, window.innerWidth - rect.width));
      const top = Math.max(0, Math.min(baseTop + offset, window.innerHeight - rect.height));

      contentEl.style.left = `${left}px`;
      contentEl.style.top = `${top}px`;
    }, 0);
  }

  function stripIds(rootEl) {
    if (!rootEl) return;
    if (rootEl.id) rootEl.id = "";
    rootEl.querySelectorAll("[id]").forEach((el) => {
      el.id = "";
    });
  }

  function closeTopmostNoteWindow() {
    const windows = Array.from(document.querySelectorAll(".note-modal"));
    if (!windows.length) return false;
    let topEl = windows[0];
    let topZ = Number.parseInt(topEl.style.zIndex || "0", 10) || 0;
    windows.forEach((w) => {
      const z = Number.parseInt(w.style.zIndex || "0", 10) || 0;
      if (z >= topZ) {
        topZ = z;
        topEl = w;
      }
    });
    topEl.remove();
    return true;
  }

  function getTopmostNoteWindowFor(noteId) {
    const windows = Array.from(
      document.querySelectorAll(`.note-modal[data-note-id="${noteId}"]`),
    );
    if (!windows.length) return null;
    let topEl = windows[0];
    let topZ = Number.parseInt(topEl.style.zIndex || "0", 10) || 0;
    windows.forEach((w) => {
      const z = Number.parseInt(w.style.zIndex || "0", 10) || 0;
      if (z >= topZ) {
        topZ = z;
        topEl = w;
      }
    });
    return topEl;
  }

  function openNoteModal(noteId) {
    const note = notes.find((n) => n.id === noteId);
    if (!note || !noteModal) return;

    // If this note is already open, just bring its window to the front
    // instead of opening a duplicate.
    const existing = getTopmostNoteWindowFor(noteId);
    if (existing) {
      bringModalToFront(existing);
      // If duplicates exist from older sessions/bugs, keep only the topmost one.
      document
        .querySelectorAll(`.note-modal[data-note-id="${noteId}"]`)
        .forEach((el) => {
          if (el !== existing) el.remove();
        });
      return;
    }

    const modalEl = noteModal.cloneNode(true);
    modalEl.classList.remove("modal--hidden");
    modalEl.classList.add("note-modal");
    modalEl.dataset.noteId = noteId;

    const titleEl = modalEl.querySelector("#modal-title");
    const bodyEl = modalEl.querySelector("#modal-body");
    const closeBtnEl = modalEl.querySelector("#modal-close");
    const editBtnEl = modalEl.querySelector("#modal-edit");
    const deleteBtnEl = modalEl.querySelector("#modal-delete");
    const openMapBtnEl = modalEl.querySelector("#modal-open-map");
    const contentEl = modalEl.querySelector(".modal__content");

    if (titleEl) titleEl.textContent = note.title || "Без названия";

    const wrapper = document.createElement("div");

    if (note.images && note.images.length > 0) {
      note.images.forEach((src) => {
        const imageDiv = document.createElement("div");
        imageDiv.className = "note-image";
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        imageDiv.appendChild(img);
        wrapper.appendChild(imageDiv);
      });
    }

    const text = document.createElement("p");
    text.className = "note-text";
    text.textContent = note.description || "Без описания";
    wrapper.appendChild(text);

    if (note.type === "link" && note.targetProjectId) {
      const hint = document.createElement("p");
      hint.className = "note-text";
      hint.textContent = `Ссылка на карту: ${getProjectNameById(note.targetProjectId)}`;
      wrapper.appendChild(hint);

      if (openMapBtnEl) {
        openMapBtnEl.style.display = "";
        openMapBtnEl.onclick = () => navigateToProject(note.targetProjectId);
      }
    } else if (openMapBtnEl) {
      openMapBtnEl.style.display = "none";
      openMapBtnEl.onclick = null;
    }

    if (bodyEl) {
      bodyEl.innerHTML = "";
      bodyEl.appendChild(wrapper);
    }

    if (closeBtnEl) {
      closeBtnEl.addEventListener("click", () => modalEl.remove());
    }

    if (editBtnEl) {
      editBtnEl.addEventListener("click", () => {
        const current = notes.find((n) => n.id === noteId);
        if (!current) return;
        openEditorModal(
          {
            title: current.title,
            description: current.description,
            images: Array.isArray(current.images) ? current.images : [],
            thumb: typeof current.thumb === "string" ? current.thumb : null,
            type:
              current.type === "link" ? "link" : current.type === "text" ? "text" : "marker",
            targetProjectId:
              current.type === "link" && typeof current.targetProjectId === "string"
                ? current.targetProjectId
                : null,
          },
          current.id,
        );
      });
    }

    if (deleteBtnEl) {
      deleteBtnEl.addEventListener("click", () => {
        const idx = notes.findIndex((n) => n.id === noteId);
        if (idx === -1) return;
        if (!confirm("Удалить эту заметку?")) return;
        notes.splice(idx, 1);
        void saveNotes();
        renderMarkers();
        renderNotesList();
        highlightPair(noteId, false);
        document
          .querySelectorAll(`.note-modal[data-note-id="${noteId}"]`)
          .forEach((el) => el.remove());
      });
    }

    stripIds(modalEl);
    document.body.appendChild(modalEl);

    if (contentEl && titleEl) {
      setupFloatingWindow(modalEl, contentEl, titleEl, closeBtnEl);
      positionNewNoteWindow(contentEl);
    }

    bringModalToFront(modalEl);
  }

  function restoreNoteModalSize() {
    restoreModalSize(noteModal, NOTE_MODAL_SIZE_KEY);
  }

  function restoreNoteModalPosition() {
    try {
      const saved = localStorage.getItem(NOTE_MODAL_POSITION_KEY);
      const content = noteModal.querySelector(".modal__content");
      if (!content) return;

      if (saved) {
        const { left, top } = JSON.parse(saved);
        if (left !== undefined && top !== undefined) {
          content.style.left = `${left}px`;
          content.style.top = `${top}px`;
          return;
        }
      }
      // First open (or if position wasn't saved): center it.
      setTimeout(() => {
        const rect = content.getBoundingClientRect();
        const left = (window.innerWidth - rect.width) / 2;
        const top = (window.innerHeight - rect.height) / 2;
        content.style.left = `${left}px`;
        content.style.top = `${top}px`;
      }, 0);
    } catch (e) {
      console.error("Failed to restore note modal position", e);
    }
  }

  function saveNoteModalPosition() {
    try {
      const content = noteModal.querySelector(".modal__content");
      if (content) {
        const left = parseFloat(content.style.left) || 0;
        const top = parseFloat(content.style.top) || 0;
        localStorage.setItem(NOTE_MODAL_POSITION_KEY, JSON.stringify({ left, top }));
      }
    } catch (e) {
      console.error("Failed to save note modal position", e);
    }
  }

  function saveNoteModalSize() {
    // no-op: do not persist sizes across reloads
  }

  function setupNoteModalResize() {
    const content = noteModal.querySelector(".modal__content");
    if (!content) return;

    // Remove old resize handles, if any.
    const oldHandles = content.querySelectorAll(".modal__resize-handle");
    oldHandles.forEach((h) => h.remove());

    const directions = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
    directions.forEach((dir) => {
      const handle = document.createElement("div");
      handle.className = `modal__resize-handle modal__resize-handle--${dir}`;
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        bringModalToFront(noteModal);
        startResize(e, dir, content, () => {
          saveNoteModalSize();
          saveNoteModalPosition();
        });
      });
      content.appendChild(handle);
    });
  }

  function startResize(event, direction, element, onStop) {
    isResizing = true;
    resizeDirection = direction;
    resizeStartX = event.clientX;
    resizeStartY = event.clientY;
    const rect = element.getBoundingClientRect();
    resizeStartWidth = rect.width;
    resizeStartHeight = rect.height;
    resizeStartLeft = rect.left;
    resizeStartTop = rect.top;
    activeResizeElement = element;
    onResizeStop = typeof onStop === "function" ? onStop : null;

    document.addEventListener("mousemove", handleResize);
    document.addEventListener("mouseup", stopResize);
  }

  function handleResize(event) {
    if (!isResizing) return;
    const content = activeResizeElement;
    if (!content) return;

    const deltaX = event.clientX - resizeStartX;
    const deltaY = event.clientY - resizeStartY;

    let newWidth = resizeStartWidth;
    let newHeight = resizeStartHeight;
    let newLeft = resizeStartLeft;
    let newTop = resizeStartTop;

    if (resizeDirection.includes("e")) {
      newWidth = Math.max(400, resizeStartWidth + deltaX);
    }
    if (resizeDirection.includes("w")) {
      newWidth = Math.max(400, resizeStartWidth - deltaX);
      newLeft = resizeStartLeft + deltaX;
    }
    if (resizeDirection.includes("s")) {
      newHeight = Math.max(300, resizeStartHeight + deltaY);
    }
    if (resizeDirection.includes("n")) {
      newHeight = Math.max(300, resizeStartHeight - deltaY);
      newTop = resizeStartTop + deltaY;
    }

    const maxWidth = window.innerWidth - 40;
    const maxHeight = window.innerHeight - 40;

    newWidth = Math.min(newWidth, maxWidth);
    newHeight = Math.min(newHeight, maxHeight);

    content.style.width = `${newWidth}px`;
    content.style.height = `${newHeight}px`;

    // When resizing from west/north edges, update position to keep the dragged edge under cursor.
    if (resizeDirection.includes("w")) {
      content.style.left = `${newLeft}px`;
    }
    if (resizeDirection.includes("n")) {
      content.style.top = `${newTop}px`;
    }
    // When resizing from east/south edges, position doesn't change.
  }

  function stopResize() {
    if (isResizing) {
      isResizing = false;
      if (onResizeStop) onResizeStop();
      activeResizeElement = null;
      onResizeStop = null;
      document.removeEventListener("mousemove", handleResize);
      document.removeEventListener("mouseup", stopResize);
    }
  }

  function setupNoteModalDrag() {
    if (noteModal.dataset.dragInit === "1") return;
    noteModal.dataset.dragInit = "1";

    const title = noteModal.querySelector(".modal__title");
    const content = noteModal.querySelector(".modal__content");
    if (!title || !content) return;

    content.addEventListener("mousedown", () => bringModalToFront(noteModal));

    title.addEventListener("mousedown", (e) => {
      // Don't start drag when clicking the close button.
      if (e.target === modalCloseBtn) return;
      e.preventDefault();
      bringModalToFront(noteModal);
      startDragModal(e, content, () => saveNoteModalPosition());
    });
  }

  function startDragModal(event, element, onStop) {
    isDraggingModal = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    const rect = element.getBoundingClientRect();
    dragStartLeft = rect.left;
    dragStartTop = rect.top;
    activeDragElement = element;
    onDragStop = typeof onStop === "function" ? onStop : null;

    document.addEventListener("mousemove", handleDragModal);
    document.addEventListener("mouseup", stopDragModal);
  }

  function handleDragModal(event) {
    if (!isDraggingModal) return;

    const content = activeDragElement;
    if (!content) return;

    const deltaX = event.clientX - dragStartX;
    const deltaY = event.clientY - dragStartY;

    let newLeft = dragStartLeft + deltaX;
    let newTop = dragStartTop + deltaY;

    // Constrain movement within the viewport.
    const maxLeft = window.innerWidth - content.offsetWidth;
    const maxTop = window.innerHeight - content.offsetHeight;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    content.style.left = `${newLeft}px`;
    content.style.top = `${newTop}px`;
  }

  function stopDragModal() {
    if (isDraggingModal) {
      isDraggingModal = false;
      if (onDragStop) onDragStop();
      activeDragElement = null;
      onDragStop = null;
      document.removeEventListener("mousemove", handleDragModal);
      document.removeEventListener("mouseup", stopDragModal);
    }
  }

  function closeNoteModal() {
    saveNoteModalSize();
    saveNoteModalPosition();
    noteModal.classList.add("modal--hidden");
  }

  function setupEditorModalResize() {
    const content = editorModal.querySelector(".modal__content");
    if (!content) return;

    const oldHandles = content.querySelectorAll(".modal__resize-handle");
    oldHandles.forEach((h) => h.remove());

    const directions = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
    directions.forEach((dir) => {
      const handle = document.createElement("div");
      handle.className = `modal__resize-handle modal__resize-handle--${dir}`;
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        bringModalToFront(editorModal);
        startResize(e, dir, content, () => {
          saveModalSize(editorModal, EDITOR_MODAL_SIZE_KEY);
          saveModalPosition(editorModal, EDITOR_MODAL_POSITION_KEY);
        });
      });
      content.appendChild(handle);
    });
  }

  function setupEditorModalDrag() {
    if (editorModal.dataset.dragInit === "1") return;
    editorModal.dataset.dragInit = "1";

    const title = editorModal.querySelector(".modal__title");
    const content = editorModal.querySelector(".modal__content");
    if (!title || !content) return;

    content.addEventListener("mousedown", () => bringModalToFront(editorModal));
    title.addEventListener("mousedown", (e) => {
      e.preventDefault();
      bringModalToFront(editorModal);
      startDragModal(e, content, () =>
        saveModalPosition(editorModal, EDITOR_MODAL_POSITION_KEY),
      );
    });
  }

  function openEditorModal(initial, noteId) {
    editingNoteId = noteId || null;
    setNoteType(initial?.type);
    editorLinkTargetId =
      initial?.type === "link" && typeof initial?.targetProjectId === "string"
        ? initial.targetProjectId
        : null;
    populateLinkTargetSelect(editorLinkTargetId);
    if (linkCreateFields) linkCreateFields.style.display = "none";
    if (linkNewNameInput) linkNewNameInput.value = "";
    if (linkNewMapInput) linkNewMapInput.value = "";
    editorTitle.textContent = noteId ? "Редактирование заметки" : "Новая заметка";
    noteTitleInput.value = initial?.title || "";
    noteDescriptionInput.value = initial?.description || "";
    editorImages = Array.isArray(initial?.images) ? [...initial.images] : [];
    editorThumb = typeof initial?.thumb === "string" ? initial.thumb : null;
    if (noteImagesInput) {
      noteImagesInput.value = "";
    }
    renderEditorImagesPreview();
    editorModal.classList.remove("modal--hidden");
    bringModalToFront(editorModal);
    restoreModalSize(editorModal, EDITOR_MODAL_SIZE_KEY);
    restoreModalPosition(editorModal, EDITOR_MODAL_POSITION_KEY);
    setupEditorModalResize();
    setupEditorModalDrag();
    noteTitleInput.focus();
  }

  function closeEditorModal() {
    saveModalSize(editorModal, EDITOR_MODAL_SIZE_KEY);
    saveModalPosition(editorModal, EDITOR_MODAL_POSITION_KEY);
    editorModal.classList.add("modal--hidden");
    editingNoteId = null;
    placingNewNote = false;
    editorThumb = null;
    editorLinkTargetId = null;
  }

  function renderEditorImagesPreview() {
    if (!noteImagesPreview) return;
    noteImagesPreview.innerHTML = "";
    editorImages.forEach((src) => {
      const item = document.createElement("div");
      item.className = "images-preview__item";
      const img = document.createElement("img");
      img.src = src;
      item.appendChild(img);
      noteImagesPreview.appendChild(item);
    });
  }

  async function createThumbnailFromBlob(blob, maxSize) {
    const size = typeof maxSize === "number" ? maxSize : 48;
    const bitmap = await createImageBitmap(blob);
    try {
      const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", 0.78);
    } finally {
      bitmap.close();
    }
  }

  async function createThumbnailFromDataUrl(dataUrl) {
    try {
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      return await createThumbnailFromBlob(blob, 48);
    } catch (e) {
      console.warn("Failed to create thumbnail", e);
      return null;
    }
  }

  async function ensureThumbnailsForNotes() {
    const targets = notes.filter((n) => !n.thumb && n.images && n.images.length > 0);
    if (!targets.length) return;

    let changed = false;
    for (const n of targets) {
      const dataUrl = n.images && n.images[0];
      if (!dataUrl) continue;
      const thumb = await createThumbnailFromDataUrl(dataUrl);
      if (thumb) {
        n.thumb = thumb;
        changed = true;
      }
    }

    if (changed) {
      void saveNotes();
      renderNotesList();
    }
  }

  function createNoteAtPosition(xPct, yPct) {
    openEditorModal({ title: "", description: "", images: [], type: placingType }, null);
    editorModal.dataset.x = String(xPct);
    editorModal.dataset.y = String(yPct);
  }

  function handleMapClick(event) {
    if (!placingNewNote) return;
    if (clickMoved) return;

    if (placingType === "text") {
      // Text notes are not tied to map coordinates.
      placingNewNote = false;
      openEditorModal({ title: "", description: "", images: [], type: "text" }, null);
      delete editorModal.dataset.x;
      delete editorModal.dataset.y;
      return;
    }

    // Get click coords relative to the map container.
    const containerRect = mapContainer.getBoundingClientRect();
    const cx = event.clientX - containerRect.left;
    const cy = event.clientY - containerRect.top;

    // Convert with viewport transform (translate + scale).
    const mapX = (cx - translateX) / scale;
    const mapY = (cy - translateY) / scale;

    // Ensure click is within the map image bounds (in its natural size).
    const mapWidth = mapViewport.offsetWidth || mapImage.naturalWidth || 1;
    const mapHeight = mapViewport.offsetHeight || mapImage.naturalHeight || 1;

    if (mapX < 0 || mapX > mapWidth || mapY < 0 || mapY > mapHeight) {
      // Click outside of map image.
      return;
    }

    // Convert to percentage coords relative to the image.
    const x = (mapX / mapWidth) * 100;
    const y = (mapY / mapHeight) * 100;

    const clampedX = Math.min(100, Math.max(0, x));
    const clampedY = Math.min(100, Math.max(0, y));

    placingNewNote = false;
    createNoteAtPosition(clampedX, clampedY);
  }

  function handleMapMouseDown(event) {
    // Pan the map using the middle mouse button only.
    if (event.button !== 1) return;
    if (
      event.target !== mapImage &&
      event.target !== mapContainer &&
      event.target !== mapViewport &&
      !event.target.classList.contains("map__markers-layer")
    ) {
      return;
    }
    isPanning = true;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panStartTranslateX = translateX;
    panStartTranslateY = translateY;
    clickStartX = event.clientX;
    clickStartY = event.clientY;
    clickMoved = false;
  }

  function handleMapMouseMove(event) {
    if (!isPanning) return;
    const dx = event.clientX - panStartX;
    const dy = event.clientY - panStartY;
    if (!clickMoved) {
      const dist = Math.hypot(event.clientX - clickStartX, event.clientY - clickStartY);
      if (dist > 5) {
        clickMoved = true;
      }
    }
    translateX = panStartTranslateX + dx;
    translateY = panStartTranslateY + dy;
    applyTransform();
  }

  function handleMapMouseUp() {
    isPanning = false;
    clickMoved = false;
  }

  function handleMapWheel(event) {
    event.preventDefault();
    const rect = mapContainer.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;

    const delta = -event.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    const newScale = clamp(scale * factor, minScale, MAX_SCALE);
    if (newScale === scale) return;

    // Map point under the cursor before zoom (in "image pixels").
    const mapX = (cursorX - translateX) / scale;
    const mapY = (cursorY - translateY) / scale;

    // After zoom, keep the same map point under the cursor.
    translateX = cursorX - mapX * newScale;
    translateY = cursorY - mapY * newScale;

    scale = newScale;
    applyTransform();
  }

  function handleNoteFormSubmit(event) {
    event.preventDefault();
    const title = noteTitleInput.value.trim() || "Без названия";
    const description = noteDescriptionInput.value.trim() || "";

    const noteType = noteTypeSelect ? String(noteTypeSelect.value || "marker") : "marker";
    if (noteType === "link") {
      const selected =
        (linkTargetSelect && String(linkTargetSelect.value || "")) || editorLinkTargetId || "";
      if (!selected) {
        alert("Выберите карту, на которую будет вести ссылка.");
        return;
      }
      if (selected === PROJECT_ID) {
        alert("Нельзя сделать ссылку на текущую карту.");
        return;
      }
      editorLinkTargetId = selected;
    } else {
      editorLinkTargetId = null;
    }

    if (editingNoteId) {
      notes = notes.map((n) =>
        n.id === editingNoteId
          ? {
              ...n,
              title,
              description,
              images: editorImages,
              thumb: editorThumb || n.thumb,
              type: noteType === "link" ? "link" : noteType === "text" ? "text" : "marker",
              targetProjectId: editorLinkTargetId || undefined,
            }
          : n,
      );
    } else {
      const x = noteType === "text" ? undefined : parseFloat(editorModal.dataset.x || "50");
      const y = noteType === "text" ? undefined : parseFloat(editorModal.dataset.y || "50");
      const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const note = {
        id,
        title,
        description,
        x,
        y,
        images: editorImages,
        thumb: editorThumb || undefined,
        type: noteType === "link" ? "link" : noteType === "text" ? "text" : "marker",
        targetProjectId: editorLinkTargetId || undefined,
      };
      notes.push(note);

      if (note.type !== "link" && !note.thumb && note.images && note.images[0]) {
        // Best-effort: generate an icon thumbnail from the first image.
        void createThumbnailFromDataUrl(note.images[0]).then((thumb) => {
          if (!thumb) return;
          const target = notes.find((n) => n.id === id);
          if (!target) return;
          target.thumb = thumb;
          void saveNotes();
          renderNotesList();
        });
      }
    }

    void saveNotes();
    renderMarkers();
    renderNotesList();
    closeEditorModal();
    placingNewNote = false;
  }

  function handleDeleteActiveNote() {
    if (!activeNoteId) return;
    const idx = notes.findIndex((n) => n.id === activeNoteId);
    if (idx === -1) return;
    if (!confirm("Удалить эту заметку?")) return;
    const id = activeNoteId;
    notes.splice(idx, 1);
    activeNoteId = null;
    void saveNotes();
    renderMarkers();
    renderNotesList();
    closeNoteModal();
    highlightPair(id, false);
  }

  function handleEditActiveNote() {
    if (!activeNoteId) return;
    const note = notes.find((n) => n.id === activeNoteId);
    if (!note) return;
    openEditorModal(
      {
        title: note.title,
        description: note.description,
        images: Array.isArray(note.images) ? note.images : [],
        thumb: typeof note.thumb === "string" ? note.thumb : null,
        type: note.type === "link" ? "link" : note.type === "text" ? "text" : "marker",
        targetProjectId:
          note.type === "link" && typeof note.targetProjectId === "string"
            ? note.targetProjectId
            : null,
      },
      note.id,
    );
  }

  function handleClearAllNotes() {
    if (!notes.length) return;
    if (!confirm("Удалить все заметки на карте?")) return;
    notes = [];
    void saveNotes();
    renderMarkers();
    renderNotesList();
    activeNoteId = null;
    closeNoteModal();
  }

  function handleUploadChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    // Show immediately and store in IndexedDB (localStorage can't handle big images).
    setMapFromBlob(file);
    scale = 1;
    translateX = 0;
    translateY = 0;
    applyTransform();

    idbPutMapBlob(PROJECT_ID, file)
      .then(() => {
        try {
          localStorage.setItem(MAP_IMAGE_KEY, "__idb__");
        } catch (e) {
          // Non-fatal; IndexedDB still has the actual blob.
          console.warn("Failed to store map marker in localStorage", e);
        }
      })
      .catch((err) => {
        console.error("Failed to store map in IndexedDB", err);
      });
  }

  async function init() {
    await loadNotes();
    await loadStoredMap();
    renderMarkers();
    renderNotesList();
    void ensureThumbnailsForNotes();

    mapContainer.addEventListener("click", handleMapClick);
    mapContainer.addEventListener("mousedown", handleMapMouseDown);
    window.addEventListener("mousemove", handleMapMouseMove);
    window.addEventListener("mouseup", handleMapMouseUp);
    mapContainer.addEventListener("wheel", handleMapWheel, { passive: false });

    searchInput.addEventListener("input", () => renderNotesList());
    clearNotesBtn.addEventListener("click", handleClearAllNotes);

    // Note windows are created dynamically (can be multiple). The template modal in the DOM is not used directly.

    // noteTypeSelect is now a hidden input (type is chosen via "Новый объект" and
    // is immutable during editing), so no change handler is needed here.

    if (linkTargetSelect) {
      linkTargetSelect.addEventListener("change", () => {
        const val = String(linkTargetSelect.value || "");
        editorLinkTargetId = val || null;
      });
    }

    if (linkCreateToggle && linkCreateFields) {
      linkCreateToggle.addEventListener("click", () => {
        linkCreateFields.style.display =
          linkCreateFields.style.display === "none" ? "" : "none";
      });
    }

    if (linkNewCreateBtn) {
      linkNewCreateBtn.addEventListener("click", async () => {
        const name = linkNewNameInput ? String(linkNewNameInput.value || "").trim() : "";
        const file =
          linkNewMapInput && linkNewMapInput.files ? linkNewMapInput.files[0] : null;

        if (!name) {
          alert("Введите название новой карты.");
          return;
        }
        if (!file) {
          alert("Выберите изображение новой карты.");
          return;
        }

        const id = randomProjectId();
        const now = Date.now();
        upsertProjectIndexEntry({ id, name, createdAt: now, updatedAt: now });

        try {
          await idbPutMapBlob(id, file);
          try {
            localStorage.setItem(`world-map-image-v1:${id}`, "__idb__");
          } catch {
            // ignore
          }
        } catch (e) {
          console.error(e);
          alert("Не удалось сохранить новую карту.");
          return;
        }

        // Reuse the chosen map image as the link-note icon (thumbnail).
        try {
          const thumb = await createThumbnailFromBlob(file, 48);
          if (thumb) editorThumb = thumb;
        } catch (e) {
          console.warn("Failed to create link-note thumbnail from map image", e);
        }

        editorLinkTargetId = id;
        populateLinkTargetSelect(id);
        if (linkCreateFields) linkCreateFields.style.display = "none";
        if (linkNewNameInput) linkNewNameInput.value = "";
        if (linkNewMapInput) linkNewMapInput.value = "";
      });
    }

    // Editor closes via the "Cancel" button, backdrop click, or Escape.

    editorCancelBtn.addEventListener("click", closeEditorModal);
    noteForm.addEventListener("submit", handleNoteFormSubmit);
    editorModal.addEventListener("click", (e) => {
      if (
        e.target === editorModal ||
        e.target === editorModal.querySelector(".modal__backdrop")
      ) {
        closeEditorModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!editorModal.classList.contains("modal--hidden")) {
          closeEditorModal();
        } else if (closeTopmostNoteWindow()) {
          // closed the topmost note window
        } else {
          // Close any open note menus.
          const allMenus = document.querySelectorAll(".note-item__menu");
          allMenus.forEach((menu) => {
            menu.style.display = "none";
            const deleteBtn = menu.querySelector(".note-item__menu-item--delete");
            if (deleteBtn) {
              deleteBtn.textContent = "Удалить?";
              deleteBtn.dataset.state = "confirm";
            }
          });
        }
      }
    });

    // Close menus when clicking outside.
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".note-item__settings-container")) {
        const allMenus = document.querySelectorAll(".note-item__menu");
        allMenus.forEach((menu) => {
          if (menu.style.display === "block") {
            menu.style.display = "none";
            const deleteBtn = menu.querySelector(".note-item__menu-item--delete");
            if (deleteBtn) {
              deleteBtn.textContent = "Удалить?";
              deleteBtn.dataset.state = "confirm";
            }
          }
        });
      }
    });

    mapUploadInput.addEventListener("change", handleUploadChange);

    if (newNoteBtn) {
      newNoteBtn.addEventListener("click", () => {
        placingNewNote = true;
        placingType = "marker";
        // If the user panned the map previously, clickMoved may still be true and
        // would block note placement. Reset it when entering "place note" mode.
        clickMoved = false;
      });
    }

    if (newObjectBtn && newObjectMenu) {
      newObjectBtn.addEventListener("click", () => {
        const visible = newObjectMenu.style.display !== "none";
        newObjectMenu.style.display = visible ? "none" : "block";
      });

      newObjectMenu.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        const t = btn.dataset.type;
        if (t !== "marker" && t !== "link" && t !== "text") return;

        newObjectMenu.style.display = "none";
        placingType = t;

        if (placingType === "text") {
          placingNewNote = false;
          openEditorModal({ title: "", description: "", images: [], type: "text" }, null);
          delete editorModal.dataset.x;
          delete editorModal.dataset.y;
          return;
        }

        placingNewNote = true;
        clickMoved = false;
      });

      // Close on outside click
      document.addEventListener("click", (e) => {
        if (
          e.target.closest("#new-object") ||
          e.target.closest("#new-object-menu")
        ) {
          return;
        }
        newObjectMenu.style.display = "none";
      });
    }

    if (noteImagesInput) {
      noteImagesInput.addEventListener("change", (event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        let remaining = files.length;
        files.forEach((file) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result;
            if (typeof dataUrl === "string") {
              editorImages.push(dataUrl);
            }
            if (!editorThumb) {
              void createThumbnailFromBlob(file, 48).then((thumb) => {
                if (thumb) editorThumb = thumb;
              });
            }
            remaining -= 1;
            if (remaining === 0) {
              renderEditorImagesPreview();
            }
          };
          reader.readAsDataURL(file);
        });
      });
    }

    if (toggleSidebarBtn && appRoot) {
      toggleSidebarBtn.addEventListener("click", () => {
        appRoot.classList.toggle("app--sidebar-hidden");
      });
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener("click", () => {
        scale = clamp(scale * 1.2, minScale, MAX_SCALE);
        applyTransform();
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener("click", () => {
        scale = clamp(scale / 1.2, minScale, MAX_SCALE);
        applyTransform();
      });
    }
    if (zoomResetBtn) {
      zoomResetBtn.addEventListener("click", () => {
        scale = baseFitScale;
        translateX = 0;
        translateY = 0;
        applyTransform();
      });
    }

    mapImage.addEventListener("load", () => {
      if (!mapImage.naturalWidth || !mapImage.naturalHeight) return;
      mapViewport.style.width = `${mapImage.naturalWidth}px`;
      mapViewport.style.height = `${mapImage.naturalHeight}px`;

      const contRect = mapContainer.getBoundingClientRect();
      const contWidth = contRect.width || 1;
      const contHeight = contRect.height || 1;
      const fitScale = Math.min(
        contWidth / mapImage.naturalWidth,
        contHeight / mapImage.naturalHeight,
      );

      baseFitScale = Math.min(1, fitScale);
      minScale = Math.min(0.4, baseFitScale);
      scale = baseFitScale;
      translateX = 0;
      translateY = 0;
      applyTransform();
    });

    applyTransform();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void init());
  } else {
    void init();
  }
})();


