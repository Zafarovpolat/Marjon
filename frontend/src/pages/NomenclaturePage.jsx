// Оркестратор раздела «Номенклатура» OWNER (FE-07B).
// Точка входа: маршрутизация по типу (dishes/raw/semi) и сборка каталога блюд
// из выделенных секций nomenclature/*. Кросс-секционное состояние живёт в
// useDishesCatalog, презентационные части — в отдельных компонентах.
// Raw → RawMaterialsPage (сырьё/ингредиенты), Semi → SemiProductsPage
// (полуфабрикаты с составом и производством) — работают против существующих
// эндпоинтов /inventory/*, без Inventory Core.
import { useState } from "react";
import Icon from "../components/Icon";
import { nomenclatureConfigs } from "./nomenclature/nomenclatureConfig";
import { useDishesCatalog } from "./nomenclature/useDishesCatalog";
import DishesToolbar from "./nomenclature/DishesToolbar";
import DishesTable from "./nomenclature/DishesTable";
import DishesDialogs from "./nomenclature/DishesDialogs";
import RawMaterialsPage from "./nomenclature/RawMaterialsPage";
import SemiProductsPage from "./nomenclature/SemiProductsPage";

// Ре-экспорт чистых контрактных функций для совместимости с тестами и импортами.
export { buildNomenclatureProductPayload, mapNomenclatureProduct } from "./nomenclature/nomenclatureData";

function NomenclaturePage({ type = "dishes" }) {
  if (type === "dishes") return <DishesCatalogPage />;
  if (type === "raw") return <RawMaterialsPage />;
  if (type === "semi") return <SemiProductsPage />;
  const config = nomenclatureConfigs[type] || nomenclatureConfigs.raw;
  return (
    <section className="nomenclature-page">
      <div className="nomenclature-card">
        <div className="nomenclature-header">
          <div className="report-title-group">
            <span className="report-accent-bar" />
            <div><h1>{config.title}</h1><p>Функция пока недоступна: Inventory Core отложен.</p></div>
          </div>
        </div>
        <div className="dashboard-empty" role="status">Backend-контракт для этого раздела не зафиксирован.</div>
      </div>
    </section>
  );
}

function DishesCatalogPage() {
  const catalog = useDishesCatalog();
  const [filtersOpen, setFiltersOpen] = useState(false);

  if (catalog.apiError && !catalog.apiLoading) {
    return <section className="nomenclature-page dish-catalog-page"><div className="login-error" role="alert">{catalog.apiError}</div></section>;
  }

  return (
    <section className="nomenclature-page dish-catalog-page owner-report-view">
      <section className="dish-catalog-card owner-report-surface settings-card">
        <header className="settings-header dish-catalog-header">
          <div className="settings-title-group">
            <span className="settings-accent-bar" aria-hidden="true" />
            <div>
              <p>Меню</p>
              <h1>Блюда</h1>
            </div>
          </div>
          <div className="settings-actions dish-header-actions">
            <button
              type="button"
              className="dishes-filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls="dishes-catalog-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Icon name="bi-sliders" size={17} /> Фильтровать
            </button>
            <button type="button" className="dish-add-button" onClick={() => catalog.openDrawer()}>
              <Icon name="bi-plus" size={18} /> Добавить
            </button>
          </div>
        </header>

        {catalog.actionError ? <div className="login-error" role="alert">{catalog.actionError}</div> : null}

        <DishesToolbar
          draftFilters={catalog.draftFilters}
          setDraftFilters={catalog.setDraftFilters}
          setFilters={catalog.setFilters}
          filtersOpen={filtersOpen}
          closeFilters={() => setFiltersOpen(false)}
          categoryOptions={catalog.filterCategories}
          categoriesUnavailable={catalog.filterCategoriesError}
        />

        <DishesTable
          filteredRows={catalog.filteredRows}
          isColumnVisible={catalog.isColumnVisible}
          tableMinWidth={catalog.tableMinWidth}
          visibleColumnCount={catalog.visibleColumnCount}
          updateRow={catalog.updateRow}
          openDrawer={catalog.openDrawer}
          archiveDish={catalog.archiveDish}
          uploadDishPhoto={catalog.uploadDishPhoto}
          photoUploadingId={catalog.photoUploadingId}
          saving={catalog.saving}
          pendingDeleteId={catalog.pendingDeleteId}
        />
      </section>

      <DishesDialogs
        drawerOpen={catalog.drawerOpen}
        drawerClosing={catalog.drawerClosing}
        requestCloseDrawer={catalog.requestCloseDrawer}
        finishCloseDrawer={catalog.finishCloseDrawer}
        editing={catalog.editing}
        saving={catalog.saving}
        setDrawerOpen={catalog.setDrawerOpen}
        form={catalog.form}
        setForm={catalog.setForm}
        saveDish={catalog.saveDish}
        categoryOptions={catalog.filterCategories}
        categoriesLoading={catalog.filterCategoriesLoading}
        categoriesUnavailable={catalog.filterCategoriesError}
        printerOptions={catalog.printerOptions}
        printersLoading={catalog.printerOptionsLoading}
        printersUnavailable={catalog.printerOptionsError}
        photoPreview={catalog.photoPreview}
        handlePhotoChange={catalog.handlePhotoChange}
        modGroups={catalog.modGroups}
        setModGroups={catalog.setModGroups}
        modLoading={catalog.modLoading}
        modError={catalog.modError}
        saveModGroup={catalog.saveModGroup}
        removeModGroup={catalog.removeModGroup}
      />
    </section>
  );
}

export default NomenclaturePage;
