import type { Project } from "../../projects";
import { navigateToMenu } from "../../app/navigation";

type Props = {
  project: Project | null;
};

export function WorkspaceView({ project }: Props) {
  return (
    <>
      <div className="app">
        <main className="map">
          <div className="map__toolbar">
            <button className="btn btn--ghost" type="button" onClick={navigateToMenu}>
              Меню
            </button>
            <button id="toggle-sidebar" className="btn btn--secondary map__toolbar-btn" type="button">
              Заметки
            </button>
            <div className="map__toolbar-spacer"></div>
            <div className="map__zoom-controls">
              <button id="zoom-out" className="btn btn--ghost" type="button">
                −
              </button>
              <span id="zoom-label" className="map__zoom-label">
                100%
              </span>
              <button id="zoom-in" className="btn btn--ghost" type="button">
                +
              </button>
              <button id="zoom-reset" className="btn btn--ghost" type="button">
                Сброс
              </button>
            </div>
            <label className="file-upload">
              <input id="map-upload" type="file" accept="image/*" />
              <span>Загрузить карту</span>
            </label>
          </div>

          <div id="map-container" className="map__container">
            <div id="map-viewport" className="map__viewport">
              <img id="map-image" src="map-placeholder.jpg" alt="Карта мира" className="map__image" />
              <div id="markers-layer" className="map__markers-layer"></div>
            </div>
          </div>
        </main>

        <aside className="sidebar">
          <h1 className="sidebar__title">{project?.name ?? "Карта"}</h1>

          <div className="sidebar__section">
            <label className="field">
              <span className="field__label">Поиск заметок</span>
              <input
                id="search-input"
                className="field__input"
                type="text"
                placeholder="Название или текст..."
              />
            </label>
          </div>

          <div className="sidebar__section">
            <p className="sidebar__hint">
              Нажмите “Новый объект”, затем выберите тип. Маркеры сохраняются в браузере.
            </p>
          </div>

          <div className="sidebar__section sidebar__notes">
            <div className="sidebar__notes-header">
              <h2 className="sidebar__subtitle">Заметки</h2>
              <div className="new-object">
                <button id="new-object" className="btn btn--primary-hover" type="button">
                  Новый объект
                </button>
                <div id="new-object-menu" className="new-object__menu" style={{ display: "none" }}>
                  <button className="new-object__item" type="button" data-type="link">
                    Ссылка
                  </button>
                  <button className="new-object__item" type="button" data-type="marker">
                    Метка
                  </button>
                  <button className="new-object__item" type="button" data-type="text">
                    Текст
                  </button>
                </div>
              </div>
              <button
                id="clear-notes"
                className="btn btn--ghost"
                title="Удалить все заметки"
                type="button"
              >
                Очистить
              </button>
            </div>
            <ul id="notes-list" className="notes-list"></ul>
            <div id="empty-notes" className="empty-notes">
              Пока нет ни одной заметки.
            </div>
          </div>
        </aside>
      </div>

      <div id="note-modal" className="modal modal--hidden">
        <div className="modal__backdrop"></div>
        <div className="modal__content">
          <button id="modal-close" className="modal__close" aria-label="Закрыть" type="button">
            &times;
          </button>
          <h2 id="modal-title" className="modal__title"></h2>
          <div id="modal-body" className="modal__body"></div>
          <div className="modal__footer">
            <button id="modal-open-map" className="btn btn--primary" type="button" style={{ display: "none" }}>
              Открыть карту
            </button>
            <button id="modal-edit" className="btn btn--secondary" type="button">
              Редактировать
            </button>
            <button id="modal-delete" className="btn btn--danger" type="button">
              Удалить
            </button>
          </div>
        </div>
      </div>

      <div id="editor-modal" className="modal modal--hidden">
        <div className="modal__backdrop"></div>
        <div className="modal__content">
          <h2 id="editor-title" className="modal__title">
            Новая заметка
          </h2>
          <form id="note-form" className="form">
            <div className="field">
              <span className="field__label">Тип</span>
              <div id="note-type-label" className="field__static">
                Метка
              </div>
              <input id="note-type" type="hidden" defaultValue="marker" />
            </div>

            <div id="link-fields" style={{ display: "none" }}>
              <label className="field">
                <span className="field__label">Карта</span>
                <select id="link-target-select" className="field__input"></select>
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button id="link-create-toggle" className="btn btn--secondary" type="button">
                  Создать новую карту
                </button>
                <div id="link-create-fields" style={{ display: "none", flex: "1 1 auto" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      id="link-new-name"
                      className="field__input"
                      type="text"
                      placeholder="Название новой карты"
                      style={{ flex: "1 1 220px" }}
                    />
                    <input
                      id="link-new-map"
                      className="field__input"
                      type="file"
                      accept="image/*"
                      style={{ flex: "1 1 220px" }}
                    />
                    <button id="link-new-create" className="btn btn--primary" type="button">
                      Создать и выбрать
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <label className="field">
              <span className="field__label">Название</span>
              <input id="note-title" className="field__input" type="text" required />
            </label>
            <label className="field">
              <span className="field__label">Краткое описание</span>
              <textarea id="note-description" className="field__textarea" rows={5} required></textarea>
            </label>
            <label className="field">
              <span className="field__label">Изображения для заметки</span>
              <input id="note-images" className="field__input" type="file" accept="image/*" multiple />
            </label>
            <div id="note-images-preview" className="images-preview"></div>
            <div className="modal__footer">
              <button type="button" id="editor-cancel" className="btn btn--ghost">
                Отмена
              </button>
              <button type="submit" className="btn btn--primary">
                Сохранить
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

