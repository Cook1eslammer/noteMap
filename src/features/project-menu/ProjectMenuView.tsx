import type { Project } from "../../projects";
import type { MaterialsItem } from "./types";

type Props = {
  projects: Project[];
  name: string;
  onNameChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onCreate: () => void;
  onOpenMaterials: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (project: Project) => void;

  materialsOpen: boolean;
  materialsLoading: boolean;
  materials: MaterialsItem[];
  selectedSrc: string | null;
  onSelectSrc: (src: string | null) => void;
  onCloseMaterials: () => void;
};

export function ProjectMenuView(props: Props) {
  const {
    projects,
    name,
    onNameChange,
    onFileChange,
    onCreate,
    onOpenMaterials,
    onOpenProject,
    onDeleteProject,
    materialsOpen,
    materialsLoading,
    materials,
    selectedSrc,
    onSelectSrc,
    onCloseMaterials,
  } = props;

  return (
    <div className="pm">
      <h1 className="pm__title">Проекты</h1>
      <p className="pm__subtitle">
        Выберите проект (карту) — вместе с ней загрузятся заметки, созданные для этой карты.
      </p>

      <div className="pm__card">
        <div className="pm__row">
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Название проекта"
            className="pm__input"
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="pm__file"
          />
          <button className="btn btn--primary" type="button" onClick={onCreate}>
            Добавить карту
          </button>
          <button className="btn btn--secondary" type="button" onClick={onOpenMaterials}>
            Материалы
          </button>
        </div>
      </div>

      {materialsOpen && (
        <div id="materials-modal" className="modal">
          <div className="modal__backdrop" onClick={onCloseMaterials}></div>
          <div className="modal__content">
            <button
              className="modal__close materials__close"
              type="button"
              aria-label="Закрыть"
              onClick={onCloseMaterials}
            >
              &times;
            </button>
            <h2 className="modal__title materials__title">Материалы</h2>

            {materialsLoading ? (
              <div className="materials__loading">Загрузка…</div>
            ) : (
              <div className="materials__layout">
                <div className="materials__metaRow">
                  <div className="materials__count">Всего изображений: {materials.length}</div>
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => onSelectSrc(null)}
                    disabled={!selectedSrc}
                  >
                    Сброс просмотра
                  </button>
                </div>

                {selectedSrc && (
                  <div className="materials__preview">
                    <img src={selectedSrc} alt="" className="materials__previewImg" />
                  </div>
                )}

                <div className="materials__gridWrap">
                  <div className="materials__grid">
                    {materials.map((m, idx) => (
                      <button
                        key={`${m.kind}-${idx}`}
                        type="button"
                        className="btn btn--ghost materials__thumbBtn"
                        onClick={() => onSelectSrc(m.src)}
                        title={m.label}
                      >
                        <img
                          src={m.src}
                          alt=""
                          loading="lazy"
                          className="materials__thumbImg"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="pm__empty">Пока нет проектов.</div>
      ) : (
        <div className="pm__list">
          {projects.map((p) => (
            <div key={p.id} className="pm__item">
              <div className="pm__itemMeta">
                <div className="pm__itemName">{p.name}</div>
                <div className="pm__itemId">{p.id}</div>
              </div>
              <div className="pm__itemActions">
                <button className="btn btn--secondary" type="button" onClick={() => onOpenProject(p.id)}>
                  Открыть
                </button>
                <button className="btn btn--danger" type="button" onClick={() => onDeleteProject(p)}>
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

