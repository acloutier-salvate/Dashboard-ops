import { money, moneyPrecise, number, round, safe } from "./inventory-utils.js?v=98";
import {
  automaticOrderItems,
  automaticOrderSummary,
  assistedOrderBuckets,
  calculateOrder,
  filteredProducts,
  filteredStockSettingsProducts,
  inventoryProgress,
  inventoryValue,
  isQuickInventoryProduct,
  metrics,
  minimumRecommendation,
  orderTotals,
  productCost,
  smartAlerts,
  stockGap,
  stockHealth,
  stockMinimum,
  stockTarget,
  targetRecommendation
} from "./inventory-calculations.js?v=511";

export const PRODUCT_BATCH = 180;

export function renderInventoryView(state, options){
  const list = filteredProducts(state);
  const m = metrics(state);
  const visible = visibleProducts(state, list);
  const modeList = inventoryModeProducts(state, list);
  const progress = inventoryProgress(visible);
  const countLabel = shouldUseQuickInventory(state) ? `${number(modeList.length)} prioritaires` : `${number(modeList.length)} produit(s)`;
  return `
    <header class="inventoryHero">
      <div>
        <p class="inventoryEyebrow">Inventaire intelligent manuel</p>
        <h2>Inventaire & Commande</h2>
        <p class="inventorySub">Compte ton stock, vérifie les besoins et génère ta commande en quelques minutes.</p>
      </div>
      <div class="inventoryHeroActions">
        <select id="inventoryRestaurant" aria-label="Restaurant">${restaurantOptions(options.restaurants, state.restaurant)}</select>
        <button class="inventoryBtn ghost" data-open-stock-settings type="button">Configuration stocks</button>
        <button class="inventoryBtn ghost" data-open-assisted-order type="button">Ajuster la commande</button>
        <button class="inventoryBtn ghost" data-open-inventory-history type="button">Historique</button>
        <button class="inventoryBtn red primaryCta" id="inventoryFinishGenerate" type="button">Terminer l'inventaire et générer la commande</button>
        <button class="inventoryBtn syncSecondary" id="inventoryPushSupabase" type="button">Synchroniser</button>
      </div>
    </header>

    <section class="inventoryKpis">
      ${kpi("Valeur au coût d'achat", money(m.totalValue), "Stock actuel x coût d'achat", "green", "inventoryValueKpi", "inventoryValueNote")}
      ${kpi("Produits actifs", number(m.products), `${m.categories} catégories / ${m.suppliers} fournisseurs`, "blue", "inventoryProductsKpi", "inventoryProductsNote")}
    </section>

    <section class="inventoryLayout inventoryGuidedLayout">
      <aside class="inventorySide inventoryGuidedSide">
        <section class="inventoryCommandDock" id="inventoryCommandDock">
          ${renderInventoryDockOnly(state, visible)}
        </section>
      </aside>

      <div class="inventoryMain">
        <div class="inventoryPanel inventoryControlsPanel">
          <div class="inventoryPanelHead">
            <div>
              <h3>Checklist inventaire</h3>
              <p>Commence par les produits importants. Le standing est la quantité idéale à garder en stock.</p>
            </div>
            <span id="inventoryVisibleCount">${countLabel}</span>
          </div>
          <div class="inventoryProgressCard">
            <div>
              <span>Inventaire complété</span>
              <strong id="inventoryProgressPercent">${number(progress.percent)} %</strong>
              <small id="inventoryProgressCount">${number(progress.counted)} / ${number(progress.total)} produits visibles</small>
            </div>
            <div class="inventoryProgressBar" aria-hidden="true"><i id="inventoryProgressBar" style="width:${progress.percent}%"></i></div>
          </div>
          <div class="inventoryControls">
            <input id="inventorySearch" type="search" placeholder="Rechercher produit, code, fournisseur..." value="${safe(state.search)}">
            <select id="inventoryCategory">${optionTags(options.categories, state.category)}</select>
            <select id="inventorySupplier">${optionTags(options.suppliers, state.supplier)}</select>
            <select id="inventoryLocation">${optionTags(options.locations, state.location)}</select>
            <select id="inventorySort">${optionTags([["category","Catégorie"],["supplier","Fournisseur"],["value","Valeur"],["low","Sous minimum"],["name","Nom"]], state.sort)}</select>
          </div>
          <div class="inventoryViewToggles">
            ${viewButton(state, "all", "Tous")}
            ${viewButton(state, "low", "Sous minimum")}
            ${viewButton(state, "missingCost", "Coûts à compléter")}
          </div>
        </div>

        <div class="inventoryCountGrid inventoryChecklist" id="inventoryProductList">
          ${productListMarkup(state, list)}
        </div>
        <div id="inventoryMoreSlot">${productMoreMarkup(state, list)}</div>
        <section class="inventoryPanel autoOrderPanel" id="inventoryAutoOrderPanel">
          ${renderAutoOrderOnly(state)}
        </section>
        ${renderInventoryAnalysis(state)}
        ${renderCharts(state)}
      </div>
    </section>
    <section class="inventorySecondaryGrid">
      ${renderHistoryPanel(state)}
      ${renderImportPanel(state)}
    </section>
  `;
}

export function renderProductsOnly(state){
  const list = filteredProducts(state);
  const modeList = inventoryModeProducts(state, list);
  return {
    count:`${number(modeList.length)} produit(s)`,
    products:productListMarkup(state, list),
    more:productMoreMarkup(state, list)
  };
}

export function renderInventoryDockOnly(state, visibleProductsForProgress=visibleProducts(state, filteredProducts(state))){
  const summary = automaticOrderSummary(state);
  const progress = inventoryProgress(visibleProductsForProgress);
  const autosave = state.lastAutosaveAt ? `Auto-save ${formatTime(state.lastAutosaveAt)}` : "Auto-save actif";
  return `
    <div class="inventoryDockHead">
      <span>Inventaire guidé</span>
      <strong id="inventoryDockProgress">${number(progress.percent)} %</strong>
    </div>
    <div class="inventoryProgressBar compact" aria-hidden="true"><i style="width:${progress.percent}%"></i></div>
    <div class="inventoryDockStats">
      <div><span>Produits critiques</span><strong id="inventoryDockCritical">${number(summary.criticalCount)}</strong></div>
      <div><span>À commander</span><strong id="inventoryDockToOrder">${number(summary.toOrderCount)}</strong></div>
      <div><span>Valeur commande</span><strong id="inventoryDockOrderValue">${money(summary.totalValue)}</strong></div>
      <div><span>En rupture</span><strong id="inventoryDockZero">${number(summary.zeroCount)}</strong></div>
    </div>
    <p id="inventoryAutosaveNote">${safe(autosave)}</p>
  `;
}

export function renderAutoOrderOnly(state){
  const items = automaticOrderItems(state);
  const total = round(items.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0));
  return `
    <div class="inventoryPanelHead">
      <div>
        <h3>Commande à préparer</h3>
        <p>La liste se bâtit pendant que tu comptes ton stock. Tu peux ajuster les quantités avant de terminer.</p>
      </div>
      <strong id="inventoryAutoOrderTotal">${money(total)}</strong>
    </div>
    <div class="autoOrderRows" id="inventoryAutoOrderRows">
      ${items.slice(0, 80).map(autoOrderRow).join("") || `<div class="inventoryEmpty">Aucun produit à commander selon les standings actuels.</div>`}
    </div>
    ${items.length > 80 ? `<div class="inventoryMore"><span>${number(80)} sur ${number(items.length)} produits affichés pour garder l'écran fluide.</span><button class="inventoryMiniBtn" data-open-assisted-order type="button">Voir commande complète</button></div>` : ""}
    <div class="autoOrderActions">
      <button class="inventoryBtn ghost" data-open-assisted-order type="button">Ajuster la commande</button>
    </div>
  `;
}

export function renderStockSettingsOnly(state){
  const list = filteredStockSettingsProducts(state);
  return {
    count:`${number(list.length)} produit(s)`,
    rows:list.map(stockSettingRow).join("") || `<div class="inventoryEmpty">Aucun produit selon les filtres.</div>`
  };
}

export function renderInventoryHistoryPage(state, options){
  const history = state.history || [];
  return `
    <header class="inventoryHero inventoryPageHero">
      <div>
        <p class="inventoryEyebrow">Historique inventaire</p>
        <h2>Historique des inventaires</h2>
        <p class="inventorySub">Toutes les prises sauvegardées pour le restaurant sélectionné, avec accès rapide au détail et aux corrections.</p>
      </div>
      <div class="inventoryHeroActions">
        <select id="inventoryRestaurant" aria-label="Restaurant">${restaurantOptions(options.restaurants, state.restaurant)}</select>
        <button class="inventoryBtn ghost" id="backToInventory" type="button">Retour à l'inventaire</button>
        <button class="inventoryBtn red" id="refreshInventoryHistory" type="button">Actualiser</button>
      </div>
    </header>
    <section class="inventoryPanel inventoryHistoryPage">
      <div class="inventoryPanelHead">
        <div>
          <h3>Inventaires sauvegardés</h3>
          <p>${safe(cleanManagerStatus(state.supabaseStatus) || "Sauvegarde locale active. Synchronise pour partager entre appareils.")}</p>
        </div>
        <span>${number(history.length)} version(s)</span>
      </div>
      <div class="inventoryHistoryTable">
        <div class="inventoryHistoryTableHead">
          <span>Date</span>
          <span>Utilisateur</span>
          <span>Inventaire</span>
          <span>Commande</span>
          <span>Critiques</span>
          <span>Variation</span>
          <span>Action</span>
        </div>
        ${history.map((entry, index) => historyTableRow(state, entry, index)).join("") || `<div class="inventoryEmpty">Aucun inventaire sauvegardé pour ce restaurant.</div>`}
      </div>
    </section>
  `;
}

export function renderInventoryDetailPage(state){
  const entry = historyEntryForState(state);
  if(!entry){
    return `
      <header class="inventoryHero inventoryPageHero">
        <div>
          <p class="inventoryEyebrow">Historique inventaire</p>
          <h2>Détail de l'inventaire</h2>
          <p class="inventorySub">Aucun inventaire sélectionné.</p>
        </div>
        <div class="inventoryHeroActions">
          <button class="inventoryBtn ghost" id="backToInventoryHistory" type="button">Retour à l'historique</button>
        </div>
      </header>
    `;
  }
  return `
    <header class="inventoryHero inventoryPageHero">
      <div>
        <p class="inventoryEyebrow">Correction inventaire</p>
        <h2>Détail de l'inventaire</h2>
        <p class="inventorySub">Valide les quantités sauvegardées, corrige une erreur au besoin ou duplique cet inventaire comme nouvelle base de comptage.</p>
      </div>
      <div class="inventoryHeroActions">
        <button class="inventoryBtn ghost" id="backToInventoryHistory" type="button">Retour à l'historique</button>
      </div>
    </header>
    ${historyDetail(Object.assign({}, entry, { _products:state.products }), true)}
  `;
}

export function renderStockSettingsPage(state, options){
  const markup = renderStockSettingsOnly(state);
  const settingFilter = state.settingFilter === "favorite" ? "favorite" : "all";
  return `
    <header class="inventoryHero inventoryPageHero">
      <div>
        <p class="inventoryEyebrow">Stocks par restaurant</p>
        <h2>Configuration des stocks</h2>
        <p class="inventorySub">Configure les minimums, stocks cibles et favoris une seule fois par restaurant.</p>
      </div>
      <div class="inventoryHeroActions">
        <select id="inventoryRestaurant" aria-label="Restaurant">${restaurantOptions(options.restaurants, state.restaurant)}</select>
        <button class="inventoryBtn ghost" id="backToInventory" type="button">Retour à l'inventaire</button>
        <button class="inventoryBtn red" id="saveStockSettings" type="button">Sauvegarder les réglages</button>
      </div>
    </header>
    <section class="inventoryPanel inventoryControlsPanel">
      <div class="inventoryPanelHead">
        <div><h3>Édition rapide</h3><p>Recherche, filtre, modifie en lot, puis sauvegarde tes réglages.</p></div>
        <span id="stockSettingsVisibleCount">${markup.count}</span>
      </div>
      <div class="inventoryControls">
        <input id="inventorySearch" type="search" placeholder="Rechercher produit, code, fournisseur..." value="${safe(state.search)}">
        <select id="inventoryCategory">${optionTags(options.categories, state.category)}</select>
        <select id="inventorySupplier">${optionTags(options.suppliers, state.supplier)}</select>
        <select id="stockSettingFilter">${optionTags([["all","Tous"],["favorite","Favoris"]], settingFilter)}</select>
      </div>
    </section>
    <section class="inventoryPanel stockSettingsPanel">
      <div class="stockSettingsHead">
        <span>Produit</span><span>Minimum</span><span>Cible</span><span>Favori</span><span>Fréquence</span><span>Ordre</span>
      </div>
      <div class="stockSettingsRows" id="stockSettingsRows">
        ${markup.rows}
      </div>
    </section>
  `;
}

export function renderAssistedOrderPage(state, options){
  const buckets = assistedOrderBuckets(state);
  const totals = orderTotals(state, state.assistedItems || []);
  return `
    <header class="inventoryHero inventoryPageHero">
      <div>
        <p class="inventoryEyebrow">Commande selon minimum/cible</p>
        <h2>Commande assistée</h2>
        <p class="inventorySub">Ajoute les produits sous minimum, complète jusqu'au stock cible, puis ajuste les quantités avant sauvegarde.</p>
      </div>
      <div class="inventoryHeroActions">
        <select id="inventoryRestaurant" aria-label="Restaurant">${restaurantOptions(options.restaurants, state.restaurant)}</select>
        <button class="inventoryBtn ghost" id="backToInventory" type="button">Retour à l'inventaire</button>
        <button class="inventoryBtn red primaryCta" id="inventoryFinishGenerate" type="button">Terminer l'inventaire et générer la commande</button>
      </div>
    </header>
    <section class="inventoryKpis assistedKpis">
      ${kpi("Budget food théorique", money(totals.budget), "Ventes prévues x food cost cible", "green", "assistBudgetValue")}
      ${kpi("Total commande actuelle", money(totals.orderTotal), "Quantités ajustées", "blue", "assistOrderTotal")}
      ${kpi("Écart vs budget", money(totals.budgetGap), "Budget - commande", totals.budgetGap >= 0 ? "green" : "red", "assistBudgetGap")}
      ${kpi("Food cost projeté", `${number(totals.projectedFoodCost,1)} %`, "Commande / ventes prévues", "amber", "assistFoodCost")}
    </section>
    <section class="inventoryLayout">
      <div class="inventoryMain">
        <div class="inventoryPanel">
          <div class="inventoryPanelHead">
            <div><h3>Créer la commande</h3><p>Choisis une méthode, puis ajuste manuellement les quantités.</p></div>
          </div>
          <div class="smartInputs">
            <label>Ventes prévues <input id="smartSales" type="number" min="0" step="100" value="${Number(state.order.sales || 0)}"></label>
            <label>Food cost cible % <input id="smartFoodCost" type="number" min="0" max="100" step="0.1" value="${Number(state.order.foodCost || 0)}"></label>
            <label>Jours à couvrir <input id="smartDays" type="number" min="1" step="1" value="${Number(state.order.days || 7)}"></label>
          </div>
          <div class="assistedActions">
            <button class="inventoryBtn ghost" id="addMinimumItems" type="button">Ajouter produits sous minimum</button>
            <button class="inventoryBtn ghost" id="addTargetItems" type="button">Compléter jusqu'au stock cible</button>
            <button class="inventoryBtn ghost" id="repeatLastOrder" type="button">Reprendre dernière commande</button>
          </div>
        </div>
        <div class="inventoryPanel assistedOrderPanel">
          <div class="inventoryPanelHead">
            <div><h3>Commande en préparation</h3><p id="assistedOrderStatus">${number((state.assistedItems || []).length)} produit(s) dans la commande.</p></div>
            <strong id="assistedOrderLiveTotal">${money(totals.orderTotal)}</strong>
          </div>
          <div class="assistedOrderHead">
            <span>Produit</span><span>Stock</span><span>Min</span><span>Cible</span><span>Reco</span><span>Ajusté</span><span>Coût</span><span>Total</span>
          </div>
          <div class="assistedOrderRows">
            ${(state.assistedItems || []).map(orderItemRow).join("") || `<div class="inventoryEmpty">Aucun produit ajouté. Utilise un des boutons ci-dessus.</div>`}
          </div>
        </div>
      </div>
      <aside class="inventorySide">
        <section class="inventoryPanel inventoryAlerts">
          <div class="inventoryPanelHead"><div><h3>Lecture commande</h3><p>Regroupement rapide selon les réglages actuels.</p></div></div>
          <div class="inventoryAlert red"><strong>${number(buckets.low.length)} sous minimum</strong><p>Produits dont le stock actuel est sous le minimum.</p></div>
          <div class="inventoryAlert blue"><strong>${number(buckets.favorite.length)} favoris à vérifier</strong><p>Produits marqués favoris pour ce restaurant.</p></div>
          <div class="inventoryAlert red"><strong>${number(buckets.zero.length)} à zéro</strong><p>Produits sans stock actuel inscrit.</p></div>
        </section>
      </aside>
    </section>
  `;
}

export function updateCardStatus(card, product){
  const gap = stockGap(product);
  const need = targetRecommendation(product);
  const health = stockHealth(product);
  card.classList.toggle("low", gap > 0);
  card.classList.toggle("ok", gap <= 0);
  card.classList.remove("health-green", "health-amber", "health-red", "health-neutral");
  card.classList.add(`health-${health.tone}`);
  const status = card.querySelector("[data-stock-label]");
  if(status) status.textContent = health.label;
  const ratio = card.querySelector("[data-stock-ratio]");
  if(ratio) ratio.style.setProperty("--stock-ratio", `${health.percent}%`);
  const standing = card.querySelector("[data-standing-value]");
  if(standing) standing.textContent = number(stockTarget(product), 2);
  const orderNeed = card.querySelector("[data-order-need]");
  if(orderNeed) orderNeed.textContent = number(need, 2);
  const orderCost = card.querySelector("[data-order-cost]");
  if(orderCost) orderCost.textContent = money(round(need * productCost(product)));
  const summary = card.querySelector(".inventoryMinimumNote strong");
  const value = card.querySelector(".inventoryMinimumNote span");
  if(summary) summary.textContent = gap > 0 ? `Sous minimum: ${number(gap,2)}` : "Minimum OK";
  if(value) value.textContent = money(inventoryValue(product));
}

export function updateLiveSummary(state, setter){
  const m = metrics(state);
  const order = calculateOrder(state);
  setter("inventoryValueKpi", money(m.totalValue));
  setter("inventoryValueNote", "Mis à jour en direct");
  setter("inventoryProductsKpi", number(m.products));
  setter("inventoryProductsNote", `${m.categories} catégories / ${m.suppliers} fournisseurs`);
  setter("smartBudgetValue", money(order.budget));
  setter("smartInventoryValue", money(m.totalValue));
  setter("smartRecommendedValue", money(order.recommended));
  setter("smartLowCount", `${number(order.lowItems.length)} produit(s) potentiellement en rupture`);
  setter("smartLowList", order.lowItems.slice(0,4).map((product) => product.product_name).join(", ") || "Aucune rupture selon les minimums actuels.");
}

function kpi(label, value, note, tone, valueId="", noteId=""){
  return `<article class="inventoryKpi ${tone}"><span>${safe(label)}</span><strong ${valueId ? `id="${safe(valueId)}"` : ""} data-animate-number>${safe(value)}</strong><small ${noteId ? `id="${safe(noteId)}"` : ""}>${safe(note)}</small></article>`;
}

function restaurantOptions(restaurants, selected){
  const list = restaurants.length ? restaurants : ["Restaurant"];
  return list.map((restaurant) => `<option value="${safe(restaurant)}" ${restaurant === selected ? "selected" : ""}>${safe(restaurant)}</option>`).join("");
}

function optionTags(values, selected){
  return values.map((item) => {
    const value = Array.isArray(item) ? item[0] : item;
    const label = Array.isArray(item) ? item[1] : item;
    return `<option value="${safe(value)}" ${value === selected ? "selected" : ""}>${safe(label)}</option>`;
  }).join("");
}

function viewButton(state, view, label){
  return `<button class="inventoryView ${state.view === view ? "active" : ""}" data-inventory-view="${safe(view)}" type="button">${safe(label)}</button>`;
}

function productListMarkup(state, list){
  const visible = visibleProducts(state, list);
  if(!visible.length) return `<div class="inventoryEmpty">Aucun produit selon les filtres.</div>`;
  const byCategory = new Map();
  visible.forEach((product) => {
    const category = product.category || "Non classé";
    if(!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(product);
  });
  return [...byCategory.entries()].map(([category, products]) => `
    <section class="inventoryCategoryBlock">
      <div class="inventoryCategoryHead">
        <h4>${categoryIcon(category)} ${safe(category)}</h4>
        <span>${number(products.length)} produit(s)</span>
      </div>
      <div class="inventoryCategoryProducts">
        ${products.map(productCard).join("")}
      </div>
    </section>
  `).join("");
}

function productMoreMarkup(state, list){
  const activeList = inventoryModeProducts(state, list);
  const visibleCount = visibleProducts(state, list).length;
  const quickMode = shouldUseQuickInventory(state);
  if(quickMode && list.length > activeList.length){
    return `
      <div class="inventoryMore" id="inventoryMoreWrap">
        <span>Inventaire rapide: ${number(activeList.length)} produits prioritaires sur ${number(list.length)}.</span>
        <button class="inventoryMiniBtn" id="inventoryShowAllProducts" type="button">Voir tous les produits</button>
      </div>
    `;
  }
  if(!quickMode && state.showAllInventoryProducts && isDefaultInventoryScope(state)){
    return `
      <div class="inventoryMore" id="inventoryMoreWrap">
        <span>Tous les produits sont disponibles dans la checklist.</span>
        <button class="inventoryMiniBtn" id="inventoryShowQuickProducts" type="button">Revenir à l'inventaire rapide</button>
      </div>
    `;
  }
  if(activeList.length <= visibleCount) return "";
  const nextCount = Math.min(activeList.length, visibleCount + PRODUCT_BATCH);
  return `
    <div class="inventoryMore" id="inventoryMoreWrap">
      <span>Affichage optimisé: ${number(visibleCount)} sur ${number(activeList.length)} produits.</span>
      <button class="inventoryMiniBtn" id="inventoryShowMore" type="button">Afficher jusqu'à ${number(nextCount)}</button>
    </div>
  `;
}

function visibleProducts(state, list){
  return inventoryModeProducts(state, list).slice(0, Math.max(PRODUCT_BATCH, state.visibleLimit || PRODUCT_BATCH));
}

function inventoryModeProducts(state, list){
  if(!shouldUseQuickInventory(state)) return list;
  const quick = list.filter(isQuickInventoryProduct);
  return quick.length ? quick : list.slice(0, PRODUCT_BATCH);
}

function shouldUseQuickInventory(state){
  return !state.showAllInventoryProducts && isDefaultInventoryScope(state);
}

function isDefaultInventoryScope(state){
  return !state.search && state.category === "Tous" && state.supplier === "Tous" && state.location === "Tous" && state.view === "all";
}

function productCard(product){
  const minGap = stockGap(product);
  const need = targetRecommendation(product);
  const cost = Number(product.case_cost ?? product.unit_cost);
  const value = inventoryValue(product);
  const health = stockHealth(product);
  const tone = minGap > 0 ? "low" : "ok";
  const stockLabel = product.case_cost !== null && product.case_cost !== undefined ? "Stock actuel (caisse)" : "Stock actuel (unité)";
  return `
    <article class="inventoryProduct checklistProduct ${tone} health-${health.tone}" data-product-id="${safe(product.id)}">
      <div class="inventoryProductTop">
        <div>
          <h4>${safe(product.product_name)}</h4>
          <p>${safe(product.supplier)} ${product.supplier_product_code ? "• " + safe(product.supplier_product_code) : ""}</p>
        </div>
        <div class="stockHealthPill" data-stock-label>${safe(health.label)}</div>
      </div>
      <div class="inventoryProductMeta">
        <span>${safe(product.format || "Format —")}</span>
        <span>${safe(product.storage_location || "Emplacement —")}</span>
        <span>${Number.isFinite(cost) ? `Coût achat ${moneyPrecise(cost)}` : "Coût —"}</span>
      </div>
      <div class="inventoryCounter">
        <button type="button" data-stock-step="-1" aria-label="Retirer 1">−</button>
        <label>
          <small>${safe(stockLabel)}</small>
          <input inputmode="decimal" type="number" min="0" step="0.01" value="${Number(product.current_stock || 0)}" data-stock-input>
        </label>
        <button type="button" data-stock-step="1" aria-label="Ajouter 1">+</button>
      </div>
      <div class="stockLevelTrack" data-stock-ratio style="--stock-ratio:${health.percent}%"><i></i></div>
      <div class="inventoryMinimum inventoryStanding">
        <span>Standing <strong data-standing-value>${number(stockTarget(product),2)}</strong></span>
        <span>À commander <strong data-order-need>${number(need,2)}</strong></span>
        <span>Valeur <strong data-order-cost>${money(round(need * productCost(product)))}</strong></span>
        <button class="inventoryMiniBtn" data-product-focus="${safe(product.id)}" type="button">Détail</button>
      </div>
      <div class="inventoryMinimumNote">
        <strong>${minGap > 0 ? `Sous minimum: ${number(minGap,2)}` : "Minimum OK"}</strong>
        <span>${money(value)}</span>
      </div>
    </article>
  `;
}

function autoOrderRow(item){
  return `
    <div class="autoOrderRow" data-auto-order-product="${safe(item.product_id)}" data-auto-order-unit-cost="${Number(item.unit_cost || 0)}">
      <span>
        <strong>${safe(item.product_name)}</strong>
        <small>${safe(item.supplier || "—")} ${item.supplier_product_code ? "• " + safe(item.supplier_product_code) : ""}</small>
      </span>
      <b>${number(item.current_stock,2)}</b>
      <b>${number(item.stock_cible,2)}</b>
      <b>${number(item.recommended_quantity,2)}</b>
      <input type="number" min="0" step="0.01" inputmode="decimal" data-auto-order-adjust value="${Number(item.adjusted_quantity || 0)}">
      <strong data-auto-order-total>${money(item.estimated_cost)}</strong>
    </div>
  `;
}

function categoryIcon(category){
  const key = String(category || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if(key.includes("fromage") || key.includes("lait")) return "🧀";
  if(key.includes("viande") || key.includes("charcut") || key.includes("pepperoni") || key.includes("bacon")) return "🥓";
  if(key.includes("legume") || key.includes("fruit")) return "🥬";
  if(key.includes("emballage") || key.includes("boite") || key.includes("jetable")) return "📦";
  if(key.includes("breuv") || key.includes("boisson")) return "🥤";
  if(key.includes("congel")) return "❄️";
  if(key.includes("sec")) return "🥫";
  return "🍕";
}

function formatTime(value){
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return "Auto-save actif";
  return date.toLocaleTimeString("fr-CA", { hour:"2-digit", minute:"2-digit" });
}

function cleanManagerStatus(value){
  return String(value || "")
    .replace(/Supabase/gi, "synchronisation")
    .replace(/dans la synchronisation/gi, "synchronisés")
    .replace(/Local \+ synchronisation si disponible/gi, "Sauvegarde locale active. Synchronise pour partager entre appareils.")
    .trim();
}

function stockSettingRow(product){
  return `
    <div class="stockSettingRow" data-stock-setting-product="${safe(product.id)}">
      <span><strong>${safe(product.product_name)}</strong><small>${safe(product.supplier)} ${product.supplier_product_code ? "• " + safe(product.supplier_product_code) : ""}</small></span>
      <label class="stockSettingField"><span>Minimum</span><input type="number" min="0" step="0.01" inputmode="decimal" data-setting-field="stock_minimum" value="${Number(stockMinimum(product) || 0)}"></label>
      <label class="stockSettingField"><span>Cible</span><input type="number" min="0" step="0.01" inputmode="decimal" data-setting-field="stock_cible" value="${Number(stockTarget(product) || 0)}"></label>
      <label class="stockCheck"><input type="checkbox" data-setting-field="produit_favori" ${product.produit_favori ? "checked" : ""}><span>Favori</span></label>
      <label class="stockSettingField"><span>Fréquence</span><select data-setting-field="frequence_commande">${optionTags([["hebdomadaire","Hebdomadaire"],["bihebdomadaire","Bihebdomadaire"],["occasionnel","Occasionnel"]], product.frequence_commande || "hebdomadaire")}</select></label>
      <label class="stockSettingField"><span>Ordre</span><input type="number" step="1" inputmode="numeric" data-setting-field="ordre_affichage_commande" value="${Number(product.ordre_affichage_commande || 0)}"></label>
    </div>
  `;
}

function orderItemRow(item){
  return `
    <div class="assistedOrderRow" data-order-product="${safe(item.product_id)}" data-order-unit-cost="${Number(item.unit_cost || 0)}">
      <span><strong>${safe(item.product_name)}</strong><small>${safe(item.supplier || "—")} ${item.supplier_product_code ? "• " + safe(item.supplier_product_code) : ""}</small></span>
      <b>${number(item.current_stock,2)}</b>
      <b>${number(item.stock_minimum,2)}</b>
      <b>${number(item.stock_cible,2)}</b>
      <b>${number(item.recommended_quantity,2)}</b>
      <input type="number" min="0" step="0.01" inputmode="decimal" data-order-adjusted value="${Number(item.adjusted_quantity || 0)}">
      <b>${moneyPrecise(item.unit_cost)}</b>
      <strong data-order-row-total>${money(item.estimated_cost)}</strong>
    </div>
  `;
}

function renderSmartOrder(state, m){
  const order = calculateOrder(state);
  return `
    <section class="inventoryPanel smartOrder">
      <div class="inventoryPanelHead">
        <div><h3>Commande intelligente</h3><p>Calcul manuel basé sur ventes prévues, food cost et inventaire actuel.</p></div>
      </div>
      <div class="smartInputs">
        <label>Ventes prévues <input id="smartSales" type="number" min="0" step="100" value="${Number(state.order.sales || 0)}"></label>
        <label>Food cost cible % <input id="smartFoodCost" type="number" min="0" max="100" step="0.1" value="${Number(state.order.foodCost || 0)}"></label>
        <label>Jours à couvrir <input id="smartDays" type="number" min="1" step="1" value="${Number(state.order.days || 7)}"></label>
      </div>
      <div class="smartResults">
        <div><span>Budget food théorique</span><strong id="smartBudgetValue">${money(order.budget)}</strong></div>
        <div><span>Valeur inventaire actuelle</span><strong id="smartInventoryValue">${money(m.totalValue)}</strong></div>
        <div><span>Commande recommandée</span><strong id="smartRecommendedValue">${money(order.recommended)}</strong></div>
      </div>
      <div class="smartBreak">
        <strong id="smartLowCount">${number(order.lowItems.length)} produit(s) potentiellement en rupture</strong>
        <p id="smartLowList">${order.lowItems.slice(0,4).map((product) => safe(product.product_name)).join(", ") || "Aucune rupture selon les minimums actuels."}</p>
      </div>
      <button class="inventoryBtn red wide" id="createPurchaseOrder" type="button">Créer brouillon commande</button>
    </section>
  `;
}

function renderHistoryPanel(state){
  const history = state.history || [];
  return `
    <section class="inventoryPanel inventoryHistoryPanel">
      <div class="inventoryPanelHead">
        <div>
          <h3>Inventaires passés</h3>
          <p>Historique daté du restaurant sélectionné, disponible après synchronisation.</p>
        </div>
        <button class="inventoryMiniBtn" id="refreshInventoryHistory" type="button">Actualiser</button>
      </div>
      <div class="inventoryHistoryStatus">${safe(cleanManagerStatus(state.supabaseStatus) || "Sauvegarde locale active. Synchronise pour partager entre appareils.")}</div>
      <div class="inventoryHistoryList">
        ${history.slice(0,5).map((entry) => historyRow(state, entry)).join("") || `<div class="inventoryEmpty">Aucun inventaire sauvegardé pour ce restaurant.</div>`}
      </div>
      <button class="inventoryBtn ghost wide" data-open-inventory-history type="button">Voir l'historique complet</button>
    </section>
  `;
}

function historyRow(state, entry){
  const key = entry.id || entry.count_date;
  const active = state.selectedHistoryId ? key === state.selectedHistoryId : entry === state.history[0];
  return `
    <button class="inventoryHistoryRow ${active ? "active" : ""}" type="button" data-history-detail="${safe(key)}">
      <span>
        <strong>${safe(formatDateTime(entry.count_date))}</strong>
        <small>${safe(entry.restaurant || state.restaurant)} • ${entry.source === "supabase" ? "Synchronisé" : "Local"}</small>
      </span>
      <b>${money(entry.total_value)}</b>
    </button>
  `;
}

function historyTableRow(state, entry, index=0){
  const key = entry.id || entry.count_date;
  const user = historyUser(entry);
  const previous = (state.history || [])[index + 1];
  const delta = previous ? Number(entry.total_value || 0) - Number(previous.total_value || 0) : null;
  const deltaText = delta === null ? "—" : `${delta >= 0 ? "+" : ""}${money(delta)}`;
  const deltaClass = delta === null ? "" : delta >= 0 ? "is-up" : "is-down";
  return `
    <button class="inventoryHistoryTableRow" type="button" data-history-detail="${safe(key)}">
      <span><strong>${safe(formatDateTime(entry.count_date))}</strong><small>${safe(user)}</small></span>
      <span><b>${money(entry.total_value)}</b></span>
      <span><b>${Number.isFinite(Number(entry.order_value)) ? money(entry.order_value) : "—"}</b></span>
      <span>${Number.isFinite(Number(entry.critical_count)) ? number(entry.critical_count) : "—"}</span>
      <span><em class="${deltaClass}">${safe(deltaText)}</em></span>
      <span><i>Voir détail</i></span>
    </button>
  `;
}

function historyEntryForState(state){
  const history = state.history || [];
  if(!history.length) return null;
  if(state.selectedHistoryId){
    return history.find((entry) => (entry.id || entry.count_date) === state.selectedHistoryId) || null;
  }
  return history[0] || null;
}

function historyUser(entry){
  return entry.counted_by_email || entry.counted_by_name || entry.user_email || entry.user_name || entry.counted_by || entry.user || "—";
}

function historyDetail(entry, fullPage=false){
  const productsById = new Map((entry._products || []).map((product) => [product.id, product]));
  const items = (entry.items || [])
    .slice()
    .sort((a,b) => Number(b.quantity_counted || 0) - Number(a.quantity_counted || 0) || String(a.product_name || "").localeCompare(String(b.product_name || ""), "fr"));
  return `
    <section class="inventoryHistoryDetail inventoryHistoryEditor ${fullPage ? "inventoryHistoryDetailPage" : ""}" data-history-editor="${safe(entry.id || entry.count_date)}">
      <div><span>Date</span><strong>${safe(formatDateTime(entry.count_date))}</strong></div>
      <div><span>Restaurant</span><strong>${safe(entry.restaurant || "—")}</strong></div>
      <div><span>Utilisateur</span><strong>${safe(historyUser(entry))}</strong></div>
      <div><span>Valeur totale</span><strong>${money(entry.total_value)}</strong></div>
      <div><span>Produits comptés</span><strong>${number(entry.product_count || 0)} / ${number(entry.total_products || items.length || 0)}</strong></div>
      <div><span>Valeur corrigée</span><strong id="inventoryHistoryLiveValue">${money(entry.total_value)}</strong></div>
      <label class="inventoryHistoryNote">
        <span>Note</span>
        <textarea id="inventoryHistoryNote" rows="3" placeholder="Ajouter une note ou une correction...">${safe(entry.note || "")}</textarea>
      </label>
      <div class="inventoryHistoryActions">
        ${fullPage ? `<button class="inventoryBtn ghost" id="backToInventoryHistoryAlt" type="button">Retour à l'historique</button>` : ""}
        <button class="inventoryBtn red" id="saveHistoryCorrection" type="button">Valider / sauvegarder</button>
        <button class="inventoryBtn ghost" id="duplicateHistoryInventory" type="button">Dupliquer cet inventaire</button>
      </div>
      <div class="inventoryHistoryEditorHead">
        <span>Produit</span>
        <span>Quantité</span>
        <span>Valeur</span>
        <span>Écart</span>
      </div>
      <div class="inventoryHistoryEditorItems">
        ${items.map((item) => historyEditorRow(item, productsById.get(item.product_id))).join("") || "<p><span>Aucun produit dans cet inventaire.</span><strong>0</strong></p>"}
      </div>
    </section>
  `;
}

function historyEditorRow(item, product){
  const quantity = Number(item.quantity_counted || 0);
  const unitCost = Number(item.unit_cost ?? product?.case_cost ?? product?.unit_cost ?? 0);
  const value = quantity * unitCost;
  const min = Number(product?.minimum_stock || 0);
  const gap = min > 0 ? Math.max(0, min - quantity) : 0;
  return `
    <div class="inventoryHistoryEditorRow" data-history-product="${safe(item.product_id)}" data-history-unit-cost="${Number(unitCost || 0)}" data-history-min="${Number(min || 0)}">
      <span>
        <strong>${safe(item.product_name || product?.product_name || item.product_id)}</strong>
        <small>${safe(item.category || product?.category || "—")} • ${safe(item.supplier || product?.supplier || "—")}</small>
      </span>
      <input type="number" min="0" step="0.01" inputmode="decimal" value="${Number(quantity || 0)}" data-history-qty="${safe(item.product_id)}">
      <b data-history-row-value="${safe(item.product_id)}">${money(value)}</b>
      <em data-history-row-gap="${safe(item.product_id)}" class="${gap > 0 ? "is-low" : ""}">${min > 0 ? (gap > 0 ? `Manque ${number(gap,2)}` : "OK") : "—"}</em>
    </div>
  `;
}

function formatDateTime(value){
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-CA", { dateStyle:"medium", timeStyle:"short" });
}

function renderCharts(state){
  const byCategory = new Map();
  state.products.forEach((product) => {
    if(product.active_status === false) return;
    byCategory.set(product.category, (byCategory.get(product.category) || 0) + inventoryValue(product));
  });
  const rows = [...byCategory.entries()].sort((a,b) => b[1] - a[1]).slice(0,8);
  const max = Math.max(1, ...rows.map((row) => row[1]));
  return `
    <section class="inventoryPanel">
      <div class="inventoryPanelHead"><div><h3>Valeur par catégorie</h3><p>Vue rapide du poids d'inventaire.</p></div></div>
      <div class="inventoryBars">
        ${rows.map(([cat,value]) => `<div class="inventoryBar"><span>${safe(cat)}</span><div><i style="width:${Math.max(3, value / max * 100)}%"></i></div><strong>${money(value)}</strong></div>`).join("") || "<p class='inventoryMuted'>Aucune valeur à afficher.</p>"}
      </div>
    </section>
  `;
}

function renderInventoryAnalysis(state){
  const alerts = smartAlerts(state, { money });
  return `
    <section class="inventoryPanel inventoryOpsAnalysis inventoryAlerts">
      <div class="inventoryPanelHead">
        <div><h3>Analyse OPS</h3><p>Lecture rapide transformant l'inventaire et la commande en actions.</p></div>
      </div>
      ${alerts.map((alert) => `<div class="inventoryAlert ${alert.tone}"><strong>${safe(alert.title)}</strong><p>${safe(alert.text)}</p></div>`).join("")}
    </section>
  `;
}

function renderImportPanel(state){
  return `
    <section class="inventoryPanel inventoryImport">
      <div class="inventoryPanelHead">
        <div><h3>Importer / Mettre à jour</h3><p>Les nouveaux fichiers mettent à jour les produits sans effacer les stocks déjà inscrits.</p></div>
      </div>
      <label class="inventoryDrop">
        <span>Feuille fournisseur CSV</span>
        <input id="supplierImportFile" type="file" accept=".csv,text/csv">
      </label>
      <label class="inventoryDrop">
        <span>FoodCost XLSM / XLSX</span>
        <input id="foodCostImportFile" type="file" accept=".xlsm,.xlsx,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
      </label>
      <div class="inventoryImportActions">
        <button class="inventoryBtn ghost" id="resetInventorySeed" type="button">Recharger base fournie</button>
      </div>
      <p class="inventoryMuted">${safe(state.lastImport || "Aucun import manuel pour le moment.")}</p>
    </section>
  `;
}
