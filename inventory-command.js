import {
  money,
  moneyPrecise,
  number,
  norm,
  normalizeLocation,
  round,
  safe,
  text,
  uid
} from "./inventory-utils.js?v=98";
import {
  assistedOrderItems,
  automaticOrderItems,
  automaticOrderSummary,
  filteredProducts,
  inventorySnapshot,
  inventoryValue,
  metrics,
  orderItemFromProduct,
  orderTotals,
  normalizeProducts,
  optionValues,
  productKey,
  stockMinimum,
  stockTarget,
  targetRecommendation
} from "./inventory-calculations.js?v=511";
import {
  createLocalPurchaseOrder,
  latestLocalPurchaseOrderForRestaurant,
  saveAssistedPurchaseOrder
} from "./inventory-orders.js?v=511";
import {
  importSupplierCsvFile,
  parseFoodCostWorkbook
} from "./inventory-imports.js?v=98";
import {
  insertSupabaseCounts,
  loadLatestPurchaseOrderFromSupabase,
  loadProductStockSettings,
  loadSupabaseHistory,
  loadSupabaseSnapshot,
  saveCorrectedSupabaseHistory,
  saveProductStockSettings,
  savePurchaseOrderToSupabase,
  syncProductsToSupabase
} from "./inventory-supabase.js?v=98";
import {
  PRODUCT_BATCH,
  renderAssistedOrderPage,
  renderInventoryDetailPage,
  renderInventoryHistoryPage,
  renderStockSettingsPage,
  renderStockSettingsOnly,
  renderInventoryView,
  renderAutoOrderOnly,
  renderInventoryDockOnly,
  renderProductsOnly as renderProductsMarkup,
  updateCardStatus,
  updateLiveSummary
} from "./inventory-render.js?v=512";

const DATA_URL = "inventory-data.json?v=86";
const STORAGE_KEY = "dashboard_ops_inventory_v1";
const SOURCE_KEY = "dashboard_ops_inventory_source_v1";
const HISTORY_KEY = "dashboard_ops_inventory_history_v1";
const DEFAULT_DAYS = 7;

const state = {
  loaded:false,
  products:[],
  recipes:[],
  recipeIngredients:[],
  stats:null,
  restaurant:"Réseau complet",
  search:"",
  category:"Tous",
  supplier:"Tous",
  location:"Tous",
  sort:"category",
  view:"all",
  settingFilter:"all",
  showAllInventoryProducts:false,
  screen:"main",
  selectedHistoryId:null,
  assistedItems:[],
  visibleLimit:PRODUCT_BATCH,
  dirty:false,
  lastImport:"",
  history:[],
  supabaseStatus:"",
  lastAutosaveAt:"",
  order:{ sales:40000, foodCost:32, days:DEFAULT_DAYS },
  context:null
};

const $ = (id) => document.getElementById(id);
let saveTimer = 0;
let summaryFrame = 0;

function toast(message){
  if(typeof window.toast === "function") window.toast(message);
  else console.info(message);
}

function allowedRestaurants(){
  const auth = window.OPS_AUTH_ALLOWED_RESTAURANTS;
  if(Array.isArray(auth) && auth.length) return auth.slice();
  if(Array.isArray(window.RESTAURANTS) && window.RESTAURANTS.length) return window.RESTAURANTS.slice();
  return ["Lévis","Beauport","Jonquière","Chicoutimi Nord","St-Nicolas","Dolbeau","Alma","St-Augustin","Montmagny","Donnacona","Pont-Rouge","Chicoutimi Sud","Saint-Raymond","Beauport Nord","Roberval","St-Lambert","La Pocatière"];
}

function storageScope(){
  const user = window.OPS_AUTH_USER?.id || window.OPS_AUTH_USER?.email || "local";
  return `${STORAGE_KEY}:${user}:${norm(state.restaurant || "restaurant") || "restaurant"}`;
}

function historyScope(){
  const user = window.OPS_AUTH_USER?.id || window.OPS_AUTH_USER?.email || "local";
  return `${HISTORY_KEY}:${user}:${norm(state.restaurant || "restaurant") || "restaurant"}`;
}

function sourceScope(){
  const user = window.OPS_AUTH_USER?.id || window.OPS_AUTH_USER?.email || "local";
  return `${SOURCE_KEY}:${user}`;
}

function loadSourceState(){
  try{
    const saved = JSON.parse(localStorage.getItem(sourceScope()) || "{}");
    if(Array.isArray(saved.products) && saved.products.length){
      state.products = normalizeProducts(saved.products, uid);
      state.recipes = Array.isArray(saved.recipes) ? saved.recipes : state.recipes;
      state.recipeIngredients = Array.isArray(saved.recipeIngredients) ? saved.recipeIngredients : state.recipeIngredients;
      state.lastImport = saved.lastImport || state.lastImport;
    }
  }catch(error){
    console.warn("Source inventaire locale ignorée:", error.message || error);
  }
}

function saveSourceState(){
  const payload = {
    updatedAt:new Date().toISOString(),
    products:state.products.map((product) => Object.assign({}, product, {
      current_stock:Number(product._base_current_stock || 0),
      minimum_stock:Number(product._base_minimum_stock || 0),
      inventory_value:0
    })),
    recipes:state.recipes,
    recipeIngredients:state.recipeIngredients,
    lastImport:state.lastImport
  };
  try{
    localStorage.setItem(sourceScope(), JSON.stringify(payload));
  }catch(error){
    console.warn("Source inventaire trop volumineuse pour localStorage:", error.message || error);
  }
}

function loadLocalState(){
  try{
    return JSON.parse(localStorage.getItem(storageScope()) || "{}");
  }catch{
    return {};
  }
}

function saveLocalState(){
  if(saveTimer){
    clearTimeout(saveTimer);
    saveTimer = 0;
  }
  const payload = {
    updatedAt:new Date().toISOString(),
    products:state.products.map((product) => ({
      id:product.id,
      current_stock:Number(product.current_stock || 0),
      minimum_stock:Number(product.minimum_stock || 0),
      stock_minimum:Number(product.stock_minimum ?? product.minimum_stock ?? 0),
      stock_cible:Number(product.stock_cible ?? product.stock_minimum ?? product.minimum_stock ?? 0),
      produit_essentiel:Boolean(product.produit_essentiel),
      produit_favori:Boolean(product.produit_favori),
      frequence_commande:product.frequence_commande || "hebdomadaire",
      ordre_affichage_commande:Number(product.ordre_affichage_commande || 0),
      inventory_counted:Boolean(product._inventory_counted),
      storage_location:normalizeLocation(product.storage_location),
      active_status:product.active_status !== false
    })),
    order:state.order,
    assistedItems:state.assistedItems || [],
    lastImport:state.lastImport
  };
  localStorage.setItem(storageScope(), JSON.stringify(payload));
  state.lastAutosaveAt = new Date().toISOString();
  const note = $("inventoryAutosaveNote");
  if(note) note.textContent = "Auto-save " + new Date(state.lastAutosaveAt).toLocaleTimeString("fr-CA", { hour:"2-digit", minute:"2-digit" });
}

function saveLocalStateSoon(){
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    saveLocalState();
  }, 260);
}

function loadLocalHistory(){
  try{
    return JSON.parse(localStorage.getItem(historyScope()) || "[]");
  }catch{
    return [];
  }
}

function saveLocalHistory(history){
  const clean = history.slice(0, 60).map((entry) => {
    const copy = Object.assign({}, entry);
    delete copy._products;
    return copy;
  });
  localStorage.setItem(historyScope(), JSON.stringify(clean));
}

function mergeHistory(entries, preferNew=false){
  const map = new Map(state.history.map((entry) => [entry.count_date || entry.id, entry]));
  entries.forEach((entry) => {
    const key = entry.count_date || entry.id;
    if(preferNew || !map.has(key)) map.set(key, entry);
  });
  state.history = [...map.values()].sort((a,b) => new Date(b.count_date) - new Date(a.count_date)).slice(0, 60);
}

function saveSnapshotToLocal(snapshot){
  const history = loadLocalHistory().filter((entry) => entry.count_date !== snapshot.count_date);
  history.unshift(snapshot);
  saveLocalHistory(history);
  mergeHistory([snapshot], true);
}

function loadLocalCorrections(){
  return loadLocalHistory().filter((entry) => entry.corrected_at);
}

function applyLocalState(){
  const saved = loadLocalState();
  state.products.forEach((product) => {
    product.current_stock = Number(product._base_current_stock || 0);
    product.minimum_stock = Number(product._base_minimum_stock || 0);
    product.stock_minimum = Number(product._base_minimum_stock || 0);
    product.stock_cible = Number(product.stock_cible ?? product.stock_minimum ?? 0);
    product.produit_essentiel = Boolean(product.produit_essentiel);
    product.produit_favori = Boolean(product.produit_favori);
    product.frequence_commande = product.frequence_commande || "hebdomadaire";
    product.ordre_affichage_commande = Number(product.ordre_affichage_commande || 0);
    product._inventory_counted = false;
    product.inventory_value = inventoryValue(product);
  });
  const byId = new Map((saved.products || []).map((product) => [product.id, product]));
  state.products.forEach((product) => {
    const local = byId.get(product.id);
    if(!local) return;
    product.current_stock = Number(local.current_stock || 0);
    product.minimum_stock = Number(local.minimum_stock || 0);
    product.stock_minimum = Number(local.stock_minimum ?? local.minimum_stock ?? 0);
    product.stock_cible = Number(local.stock_cible ?? product.stock_minimum ?? 0);
    product.minimum_stock = product.stock_minimum;
    product.produit_essentiel = Boolean(local.produit_essentiel);
    product.produit_favori = Boolean(local.produit_favori);
    product.frequence_commande = local.frequence_commande || product.frequence_commande || "hebdomadaire";
    product.ordre_affichage_commande = Number(local.ordre_affichage_commande || 0);
    product._inventory_counted = Boolean(local.inventory_counted) || Number(product.current_stock || 0) > 0;
    product.storage_location = normalizeLocation(local.storage_location || product.storage_location);
    product.active_status = local.active_status !== false;
    product.inventory_value = inventoryValue(product);
  });
  if(saved.order) state.order = Object.assign({}, state.order, saved.order);
  if(Array.isArray(saved.assistedItems)) state.assistedItems = saved.assistedItems;
  if(saved.lastImport) state.lastImport = saved.lastImport;
  if(saved.updatedAt) state.lastAutosaveAt = saved.updatedAt;
}

function ensureCurrentRestaurant(){
  const restaurants = allowedRestaurants();
  if(!restaurants.length) return;
  if(!restaurants.includes(state.restaurant)){
    state.restaurant = restaurants[0];
    applyLocalState();
  }
}

async function loadSeedData(){
  if(state.loaded) return;
  const root = $("inventoryOps");
  if(root) root.classList.add("is-loading");
  try{
    const response = await fetch(DATA_URL, { cache:"no-store" });
    if(!response.ok) throw new Error("Base inventaire introuvable");
    const data = await response.json();
    state.products = normalizeProducts(data.products || [], uid);
    state.recipes = data.recipes || [];
    state.recipeIngredients = data.recipe_ingredients || [];
    state.stats = data.stats || null;
    loadSourceState();
    applyLocalState();
    mergeHistory(loadLocalHistory());
    state.loaded = true;
    state.lastImport = state.lastImport || `Base initiale: ${state.products.length} produits`;
    await loadSupabaseSnapshot(state);
    await Promise.all([
      loadProductStockSettings(state),
      loadSupabaseHistory(state, mergeHistory)
    ]);
    mergeHistory(loadLocalCorrections(), true);
  }catch(error){
    console.error(error);
    state.products = [];
    state.loaded = true;
    state.lastImport = "Aucune base chargée";
  }finally{
    if(root) root.classList.remove("is-loading");
  }
}

function render(){
  const root = $("inventoryOps");
  if(!root) return;
  ensureCurrentRestaurant();
  const options = renderOptions();
  if(state.screen === "history"){
    root.innerHTML = renderInventoryHistoryPage(state, options);
  }else if(state.screen === "detail"){
    root.innerHTML = renderInventoryDetailPage(state, options);
  }else if(state.screen === "settings"){
    root.innerHTML = renderStockSettingsPage(state, options);
  }else if(state.screen === "assisted"){
    root.innerHTML = renderAssistedOrderPage(state, options);
  }else{
    root.innerHTML = renderInventoryView(state, options);
  }
  bind();
  root.classList.remove("is-loading");
}

function renderOptions(){
  const restaurants = allowedRestaurants();
  if(!restaurants.includes(state.restaurant)) state.restaurant = restaurants[0] || "Restaurant";
  return {
    restaurants,
    categories:optionValues(state.products, "category"),
    suppliers:optionValues(state.products, "supplier"),
    locations:optionValues(state.products, "storage_location")
  };
}

function resetVisibleProducts(){
  state.visibleLimit = PRODUCT_BATCH;
}

function refreshProductsOnly(){
  if(state.screen === "settings"){
    applyStockSettingsFromDom();
    const rows = $("stockSettingsRows");
    if(!rows) return render();
    const markup = renderStockSettingsOnly(state);
    rows.innerHTML = markup.rows;
    const counter = $("stockSettingsVisibleCount");
    if(counter) counter.textContent = markup.count;
    return;
  }
  const box = $("inventoryProductList");
  if(!box) return render();
  const markup = renderProductsMarkup(state);
  box.innerHTML = markup.products;
  const counter = $("inventoryVisibleCount");
  if(counter) counter.textContent = markup.count;
  const moreSlot = $("inventoryMoreSlot");
  if(moreSlot) moreSlot.innerHTML = markup.more;
  $("inventoryShowMore")?.addEventListener("click", showMoreProducts);
  $("inventoryShowAllProducts")?.addEventListener("click", showAllInventoryProducts);
  $("inventoryShowQuickProducts")?.addEventListener("click", showQuickInventoryProducts);
  refreshInventoryLivePanels();
}

function bind(){
  $("inventoryRestaurant")?.addEventListener("change", (event) => {
    saveLocalState();
    state.restaurant = event.target.value;
    state.history = [];
    state.selectedHistoryId = null;
    state.assistedItems = [];
    state.supabaseStatus = "";
    mergeHistory(loadLocalHistory());
    applyLocalState();
    Promise.all([loadProductStockSettings(state), loadSupabaseHistory(state, mergeHistory)]).finally(render);
  });

  $("inventorySearch")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    resetVisibleProducts();
    refreshProductsOnly();
  });
  $("inventoryCategory")?.addEventListener("change", (event) => { state.category = event.target.value; resetVisibleProducts(); render(); });
  $("inventorySupplier")?.addEventListener("change", (event) => { state.supplier = event.target.value; resetVisibleProducts(); render(); });
  $("inventoryLocation")?.addEventListener("change", (event) => { state.location = event.target.value; resetVisibleProducts(); render(); });
  $("inventorySort")?.addEventListener("change", (event) => { state.sort = event.target.value; resetVisibleProducts(); refreshProductsOnly(); });

  document.querySelectorAll("[data-inventory-view]").forEach((button) => {
    button.addEventListener("click", () => { state.view = button.dataset.inventoryView; resetVisibleProducts(); render(); });
  });

  const productList = $("inventoryProductList");
  productList?.addEventListener("input", handleProductListInput);
  productList?.addEventListener("click", handleProductListClick);
  $("inventoryShowMore")?.addEventListener("click", showMoreProducts);
  $("inventoryShowAllProducts")?.addEventListener("click", showAllInventoryProducts);
  $("inventoryShowQuickProducts")?.addEventListener("click", showQuickInventoryProducts);
  $("inventorySaveCount")?.addEventListener("click", saveInventoryCount);
  document.querySelectorAll("#inventoryFinishGenerate").forEach((button) => {
    button.addEventListener("click", finishInventoryAndGenerateOrder);
  });
  $("inventoryPushSupabase")?.addEventListener("click", syncInventorySupabase);
  document.querySelectorAll("[data-open-stock-settings]").forEach((button) => {
    button.addEventListener("click", () => { state.screen = "settings"; render(); });
  });
  document.querySelectorAll("[data-open-assisted-order]").forEach((button) => {
    button.addEventListener("click", () => { state.screen = "assisted"; render(); });
  });
  document.querySelectorAll("[data-open-inventory-history]").forEach((button) => {
    button.addEventListener("click", () => {
      state.screen = "history";
      render();
    });
  });
  $("backToInventory")?.addEventListener("click", () => {
    state.screen = "main";
    state.selectedHistoryId = null;
    render();
  });
  $("stockSettingFilter")?.addEventListener("change", (event) => { state.settingFilter = event.target.value; render(); });
  $("saveStockSettings")?.addEventListener("click", saveStockSettings);
  $("addMinimumItems")?.addEventListener("click", () => setAssistedItems("minimum"));
  $("addTargetItems")?.addEventListener("click", () => setAssistedItems("target"));
  $("repeatLastOrder")?.addEventListener("click", repeatLastOrder);
  $("saveAssistedOrder")?.addEventListener("click", saveAssistedOrder);
  document.querySelector(".assistedOrderRows")?.addEventListener("input", handleAssistedOrderInput);
  $("inventoryAutoOrderPanel")?.addEventListener("input", handleAutoOrderInput);
  $("inventoryAutoOrderPanel")?.addEventListener("click", handleAutoOrderClick);
  $("inventorySaveAutoOrder")?.addEventListener("click", saveAutomaticOrder);
  $("backToInventoryHistory")?.addEventListener("click", () => {
    state.screen = "history";
    render();
  });
  $("backToInventoryHistoryAlt")?.addEventListener("click", () => {
    state.screen = "history";
    render();
  });
  $("refreshInventoryHistory")?.addEventListener("click", async () => {
    await loadSupabaseHistory(state, mergeHistory);
    mergeHistory(loadLocalCorrections(), true);
    render();
  });
  document.querySelectorAll("[data-history-detail], [data-history-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedHistoryId = button.dataset.historyDetail || button.dataset.historyId;
      state.screen = "detail";
      render();
    });
  });
  document.querySelector("[data-history-editor]")?.addEventListener("input", handleHistoryEditorInput);
  $("createPurchaseOrder")?.addEventListener("click", createPurchaseOrder);
  $("saveHistoryCorrection")?.addEventListener("click", saveHistoryCorrections);
  $("duplicateHistoryInventory")?.addEventListener("click", duplicateSelectedHistory);
  [["smartSales","sales"],["smartFoodCost","foodCost"],["smartDays","days"]].forEach(([id,key]) => {
    $(id)?.addEventListener("input", (event) => {
      state.order[key] = Number(event.target.value || 0);
      saveLocalStateSoon();
      render();
    });
  });
  $("supplierImportFile")?.addEventListener("change", importSupplierFile);
  $("foodCostImportFile")?.addEventListener("change", importFoodCostFile);
  $("resetInventorySeed")?.addEventListener("click", resetSeed);
}

async function syncInventorySupabase(){
  const button = $("inventoryPushSupabase");
  if(button) button.disabled = true;
  try{
    const synced = await syncProductsToSupabase(state, { toast });
    if(synced){
      await loadSupabaseHistory(state, mergeHistory);
      mergeHistory(loadLocalCorrections(), true);
    }
    render();
  }finally{
    if(button) button.disabled = false;
  }
}

function productFromEvent(event){
  const card = event.target.closest?.(".inventoryProduct");
  if(!card) return { card:null, product:null };
  return { card, product:state.products.find((product) => product.id === card.dataset.productId) || null };
}

function handleProductListInput(event){
  const input = event.target.closest?.("[data-stock-input], [data-min-input]");
  if(!input) return;
  const { card, product } = productFromEvent(event);
  if(!card || !product) return;
  if(input.matches("[data-stock-input]")){
    product.current_stock = Math.max(0, Number(input.value || 0));
    product._inventory_counted = true;
    product.inventory_value = inventoryValue(product);
  }else{
    product.minimum_stock = Math.max(0, Number(input.value || 0));
    product.stock_minimum = product.minimum_stock;
    product.stock_cible = Math.max(Number(product.stock_cible || 0), product.stock_minimum);
  }
  state.dirty = true;
  saveLocalStateSoon();
  updateCardStatus(card, product);
  scheduleInventoryLiveSummary();
  refreshInventoryLivePanels();
}

function handleProductListClick(event){
  const stepButton = event.target.closest?.("[data-stock-step]");
  if(stepButton){
    const { card } = productFromEvent(event);
    const input = card?.querySelector("[data-stock-input]");
    if(!input) return;
    const step = Number(stepButton.dataset.stockStep || 0);
    const next = Math.max(0, Number(input.value || 0) + step);
    input.value = Number(next.toFixed(2));
    input.dispatchEvent(new Event("input", { bubbles:true }));
    return;
  }

  const detailButton = event.target.closest?.("[data-product-focus]");
  if(detailButton){
    const product = state.products.find((item) => item.id === detailButton.dataset.productFocus);
    if(product) showProductDetail(product);
  }
}

function showMoreProducts(){
  state.visibleLimit = Math.min(filteredProducts(state).length, Math.max(PRODUCT_BATCH, state.visibleLimit || PRODUCT_BATCH) + PRODUCT_BATCH);
  refreshProductsOnly();
}

function showAllInventoryProducts(){
  state.showAllInventoryProducts = true;
  state.visibleLimit = PRODUCT_BATCH;
  refreshProductsOnly();
}

function showQuickInventoryProducts(){
  state.showAllInventoryProducts = false;
  state.visibleLimit = PRODUCT_BATCH;
  refreshProductsOnly();
}

function refreshInventoryLivePanels(){
  if(state.screen !== "main") return;
  const dock = $("inventoryCommandDock");
  if(dock) dock.innerHTML = renderInventoryDockOnly(state);
  const autoOrder = $("inventoryAutoOrderPanel");
  if(autoOrder) autoOrder.innerHTML = renderAutoOrderOnly(state);
}

function scheduleInventoryLiveSummary(){
  if(summaryFrame) return;
  summaryFrame = requestAnimationFrame(() => {
    summaryFrame = 0;
    updateLiveSummary(state, (id, value) => {
      const element = $(id);
      if(element) element.textContent = value;
    });
  });
}

function handleHistoryEditorInput(event){
  if(!event.target.closest?.("[data-history-qty]")) return;
  updateHistoryDetailTotals();
}

function updateHistoryDetailTotals(){
  let total = 0;
  let counted = 0;
  document.querySelectorAll("[data-history-qty]").forEach((input) => {
    const row = input.closest(".inventoryHistoryEditorRow");
    const quantity = Math.max(0, Number(input.value || 0));
    const unitCost = Number(row?.dataset.historyUnitCost || 0);
    const min = Number(row?.dataset.historyMin || 0);
    const value = round(quantity * unitCost);
    const gap = min > 0 ? Math.max(0, min - quantity) : 0;
    total += value;
    if(quantity > 0) counted++;
    const valueElement = row?.querySelector("[data-history-row-value]");
    if(valueElement) valueElement.textContent = money(value);
    const gapElement = row?.querySelector("[data-history-row-gap]");
    if(gapElement){
      gapElement.textContent = min > 0 ? (gap > 0 ? `Manque ${number(gap,2)}` : "OK") : "—";
      gapElement.classList.toggle("is-low", gap > 0);
    }
  });
  const liveValue = $("inventoryHistoryLiveValue");
  if(liveValue) liveValue.textContent = money(total);
  const liveCount = $("inventoryHistoryLiveCount");
  if(liveCount) liveCount.textContent = number(counted);
}

function selectedHistoryEntry(){
  if(!state.history.length) return null;
  if(state.selectedHistoryId){
    return state.history.find((entry) => (entry.id || entry.count_date) === state.selectedHistoryId) || null;
  }
  return state.history[0] || null;
}

function recalculateHistoryEntry(entry){
  let totalValue = 0;
  let counted = 0;
  entry.items = (entry.items || []).map((item) => {
    const product = state.products.find((p) => p.id === item.product_id);
    const unitCost = Number(item.unit_cost ?? product?.case_cost ?? product?.unit_cost ?? 0);
    const quantity = Math.max(0, Number(item.quantity_counted || 0));
    const next = Object.assign({}, item, {
      quantity_counted:quantity,
      unit_cost:unitCost,
      estimated_value:round(quantity * unitCost)
    });
    totalValue += next.estimated_value;
    if(quantity > 0) counted++;
    return next;
  });
  entry.total_value = round(totalValue);
  entry.product_count = counted;
  entry.total_products = entry.items.length;
  entry.corrected_at = new Date().toISOString();
  return entry;
}

function persistHistoryEntry(entry){
  const key = entry.count_date || entry.id;
  state.history = state.history.map((item) => (item.count_date || item.id) === key ? entry : item);
  if(!state.history.some((item) => (item.count_date || item.id) === key)) state.history.unshift(entry);
  state.history.sort((a,b) => new Date(b.count_date) - new Date(a.count_date));
  saveLocalHistory(state.history);
}

async function saveHistoryCorrections(){
  const entry = selectedHistoryEntry();
  if(!entry) return;
  const inputs = document.querySelectorAll("[data-history-qty]");
  const quantities = new Map([...inputs].map((input) => [input.dataset.historyQty, Math.max(0, Number(input.value || 0))]));
  entry.items = (entry.items || []).map((item) => quantities.has(item.product_id)
    ? Object.assign({}, item, { quantity_counted:quantities.get(item.product_id) })
    : item
  );
  const note = $("inventoryHistoryNote");
  entry.note = text(note?.value || "");
  recalculateHistoryEntry(entry);
  persistHistoryEntry(entry);
  const synced = await saveCorrectedSupabaseHistory(entry, { toast });
  toast(synced ? "Corrections sauvegardées dans l'historique" : `Corrections sauvegardées localement${entry._supabaseError ? " — synchronisation à vérifier" : ""}`);
  render();
}

function duplicateSelectedHistory(){
  const entry = selectedHistoryEntry();
  if(!entry) return;
  const byProduct = new Map((entry.items || []).map((item) => [item.product_id, Number(item.quantity_counted || 0)]));
  state.products.forEach((product) => {
    product.current_stock = Math.max(0, Number(byProduct.get(product.id) || 0));
    product._inventory_counted = Number(byProduct.get(product.id) || 0) > 0;
    product.inventory_value = inventoryValue(product);
  });
  state.dirty = true;
  saveLocalState();
  state.view = "all";
  state.screen = "main";
  resetVisibleProducts();
  toast("Inventaire dupliqué dans la saisie active");
  render();
}

function resetActiveInventory(){
  state.products.forEach((product) => {
    product.current_stock = 0;
    product._inventory_counted = false;
    product.inventory_value = inventoryValue(product);
  });
  state.assistedItems = [];
  state.dirty = false;
  resetVisibleProducts();
  saveLocalState();
}

function showProductDetail(product){
  const usage = state.recipeIngredients.filter((ingredient) =>
    norm(ingredient.ingredient_code) === norm(product.supplier_product_code) ||
    norm(ingredient.ingredient_name) === norm(product.product_name)
  );
  const names = [...new Set(usage.map((ingredient) => ingredient.recipe_name).filter(Boolean))].slice(0,8);
  const detail = `
Produit: ${product.product_name}
Code: ${product.supplier_product_code || "—"}
Fournisseur: ${product.supplier || "—"}
Format: ${product.format || "—"}
Coût d'achat: ${moneyPrecise(product.case_cost ?? product.unit_cost)}
Stock: ${product.current_stock}
Minimum: ${product.minimum_stock}
Stock cible: ${stockTarget(product)}
Favori: ${product.produit_favori ? "Oui" : "Non"}
Emplacement: ${product.storage_location}
Recettes liées: ${names.join(", ") || "—"}
  `.trim();
  alert(detail);
}

async function saveInventoryCount(){
  saveLocalState();
  const snapshot = inventorySnapshot(state, "local");
  const orderSummary = automaticOrderSummary(state);
  snapshot.order_value = orderSummary.totalValue;
  snapshot.critical_count = orderSummary.criticalCount;
  snapshot.zero_count = orderSummary.zeroCount;
  snapshot.counted_by = window.OPS_AUTH_USER?.id || "";
  snapshot.user_email = window.OPS_AUTH_USER?.email || "";
  snapshot.user_name = window.OPS_AUTH_USER?.email || "";
  saveSnapshotToLocal(snapshot);
  state.dirty = false;
  const saved = await insertSupabaseCounts(state, snapshot.count_date, { toast });
  if(saved){
    await loadSupabaseHistory(state, mergeHistory);
    mergeHistory(loadLocalCorrections(), true);
  }
  resetActiveInventory();
  toast(saved ? "Inventaire sauvegardé et synchronisé" : "Inventaire sauvegardé localement");
  render();
}

async function finishInventoryAndGenerateOrder(){
  const buttons = [...document.querySelectorAll("#inventoryFinishGenerate")];
  buttons.forEach((button) => {
    button.disabled = true;
    button.textContent = "Traitement en cours...";
  });
  try{
    state.assistedItems = automaticOrderItems(state);
    saveLocalState();

    const snapshot = inventorySnapshot(state, "local");
    const orderSummary = automaticOrderSummary(state);
    snapshot.order_value = orderSummary.totalValue;
    snapshot.critical_count = orderSummary.criticalCount;
    snapshot.zero_count = orderSummary.zeroCount;
    snapshot.counted_by = window.OPS_AUTH_USER?.id || "";
    snapshot.user_email = window.OPS_AUTH_USER?.email || "";
    snapshot.user_name = window.OPS_AUTH_USER?.email || "";
    saveSnapshotToLocal(snapshot);

    const inventorySaved = await insertSupabaseCounts(state, snapshot.count_date, { toast });

    const purchaseOrder = saveAssistedPurchaseOrder(state, state.assistedItems);
    await savePurchaseOrderToSupabase(state, purchaseOrder);

    if(inventorySaved){
      await loadSupabaseHistory(state, mergeHistory);
      mergeHistory(loadLocalCorrections(), true);
    }

    resetActiveInventory();
    toast("Inventaire terminé. La commande a été générée avec succès.");
    render();
  }finally{
    buttons.forEach((button) => {
      button.disabled = false;
      button.textContent = "Terminer l'inventaire et générer la commande";
    });
  }
}

async function createPurchaseOrder(){
  const purchaseOrder = createLocalPurchaseOrder(state);
  saveLocalState();
  const saved = await savePurchaseOrderToSupabase(state, purchaseOrder);
  toast(saved ? "Brouillon commande créé et synchronisé" : "Brouillon commande créé localement");
  render();
}

function applyStockSettingsFromDom(){
  document.querySelectorAll("[data-stock-setting-product]").forEach((row) => {
    const product = state.products.find((item) => item.id === row.dataset.stockSettingProduct);
    if(!product) return;
    row.querySelectorAll("[data-setting-field]").forEach((input) => {
      const field = input.dataset.settingField;
      if(field === "produit_essentiel" || field === "produit_favori"){
        product[field] = Boolean(input.checked);
      }else if(field === "frequence_commande"){
        product[field] = input.value || "hebdomadaire";
      }else{
        product[field] = Math.max(0, Number(input.value || 0));
      }
    });
    product.minimum_stock = stockMinimum(product);
    product.stock_cible = Math.max(stockTarget(product), product.stock_minimum);
  });
}

async function saveStockSettings(){
  applyStockSettingsFromDom();
  saveLocalState();
  const saved = await saveProductStockSettings(state, { toast });
  toast(saved ? "Réglages sauvegardés" : "Réglages sauvegardés localement seulement");
  render();
}

function mergeAssistedItems(items){
  const map = new Map((state.assistedItems || []).map((item) => [item.product_id, item]));
  items.forEach((item) => {
    const existing = map.get(item.product_id);
    map.set(item.product_id, existing ? Object.assign({}, existing, item, {
      adjusted_quantity:Number(existing.adjusted_quantity || item.adjusted_quantity || 0),
      estimated_cost:round(Number(existing.adjusted_quantity || item.adjusted_quantity || 0) * Number(item.unit_cost || 0))
    }) : item);
  });
  state.assistedItems = [...map.values()].sort((a,b) => Number(a.ordre_affichage_commande || 0) - Number(b.ordre_affichage_commande || 0) || String(a.product_name).localeCompare(String(b.product_name), "fr"));
}

function setAssistedItems(mode){
  mergeAssistedItems(assistedOrderItems(state, mode));
  render();
}

async function repeatLastOrder(){
  let order = await loadLatestPurchaseOrderFromSupabase(state);
  if(!order) order = latestLocalPurchaseOrderForRestaurant(state.restaurant);
  const rawItems = order?.purchase_order_items || order?.items || [];
  if(!rawItems.length){
    toast("Aucune dernière commande à reprendre pour ce restaurant");
    return;
  }
  const byProduct = new Map(state.products.map((product) => [product.id, product]));
  state.assistedItems = rawItems.map((item) => {
    const product = byProduct.get(item.product_id);
    const quantity = Number(item.adjusted_quantity ?? item.recommended_quantity ?? 0);
    return product ? orderItemFromProduct(product, quantity) : Object.assign({}, item, {
      adjusted_quantity:quantity,
      recommended_quantity:quantity,
      unit_cost:quantity > 0 ? Number(item.estimated_cost || 0) / quantity : 0
    });
  }).filter((item) => item.product_id);
  toast("Dernière commande reprise");
  render();
}

function handleAssistedOrderInput(event){
  const input = event.target.closest?.("[data-order-adjusted]");
  if(!input) return;
  const row = input.closest(".assistedOrderRow");
  const id = row?.dataset.orderProduct;
  const item = state.assistedItems.find((entry) => entry.product_id === id);
  if(!item) return;
  item.adjusted_quantity = Math.max(0, Number(input.value || 0));
  item.estimated_cost = round(item.adjusted_quantity * Number(item.unit_cost || row?.dataset.orderUnitCost || 0));
  const total = row.querySelector("[data-order-row-total]");
  if(total) total.textContent = money(item.estimated_cost);
  const totals = orderTotals(state, state.assistedItems);
  const liveTotal = $("assistedOrderLiveTotal");
  if(liveTotal) liveTotal.textContent = money(totals.orderTotal);
  const orderTotal = $("assistOrderTotal");
  if(orderTotal) orderTotal.textContent = money(totals.orderTotal);
  const gap = $("assistBudgetGap");
  if(gap) gap.textContent = money(totals.budgetGap);
  const projected = $("assistFoodCost");
  if(projected) projected.textContent = `${number(totals.projectedFoodCost,1)} %`;
}

function handleAutoOrderInput(event){
  const input = event.target.closest?.("[data-auto-order-adjust]");
  if(!input) return;
  const row = input.closest(".autoOrderRow");
  const id = row?.dataset.autoOrderProduct;
  const product = state.products.find((item) => item.id === id);
  if(!product) return;
  const base = orderItemFromProduct(product, targetRecommendation(product));
  base.adjusted_quantity = Math.max(0, Number(input.value || 0));
  base.estimated_cost = round(base.adjusted_quantity * Number(base.unit_cost || row?.dataset.autoOrderUnitCost || 0));
  const map = new Map((state.assistedItems || []).map((item) => [item.product_id, item]));
  map.set(id, base);
  state.assistedItems = [...map.values()].filter((item) => item.product_id);
  const total = row.querySelector("[data-auto-order-total]");
  if(total) total.textContent = money(base.estimated_cost);
  saveLocalStateSoon();
  updateAutoOrderTotalsOnly();
}

function handleAutoOrderClick(event){
  if(event.target.closest?.("[data-open-assisted-order]")){
    state.screen = "assisted";
    render();
    return;
  }
  if(event.target.closest?.("#inventorySaveAutoOrder")){
    saveAutomaticOrder();
  }
}

async function saveAutomaticOrder(){
  state.assistedItems = automaticOrderItems(state);
  await saveAssistedOrder();
}

function updateAutoOrderTotalsOnly(){
  const items = automaticOrderItems(state);
  const total = round(items.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0));
  const totalElement = $("inventoryAutoOrderTotal");
  if(totalElement) totalElement.textContent = money(total);
  const dock = $("inventoryCommandDock");
  if(dock) dock.innerHTML = renderInventoryDockOnly(state);
}

async function saveAssistedOrder(){
  if(!state.assistedItems.length){
    toast("Ajoute au moins un produit à la commande");
    return;
  }
  const purchaseOrder = saveAssistedPurchaseOrder(state, state.assistedItems);
  const saved = await savePurchaseOrderToSupabase(state, purchaseOrder);
  toast(saved ? "Commande sauvegardée et synchronisée" : "Commande sauvegardée localement");
  render();
}

async function importSupplierFile(event){
  const file = event.target.files?.[0];
  if(!file) return;
  try{
    const products = await importSupplierCsvFile(file);
    mergeProducts(products, `Feuille fournisseur importée: ${products.length} produits`);
  }catch(error){
    console.error(error);
    toast("Import fournisseur impossible");
  }finally{
    event.target.value = "";
  }
}

async function importFoodCostFile(event){
  const file = event.target.files?.[0];
  if(!file) return;
  try{
    const parsed = await parseFoodCostWorkbook(file);
    state.recipes = parsed.recipes;
    state.recipeIngredients = parsed.recipeIngredients;
    mergeProducts(parsed.products, `FoodCost importé: ${parsed.recipes.length} recettes, ${parsed.products.length} ingrédients`);
  }catch(error){
    console.error(error);
    toast(error.message || "Import FoodCost impossible");
  }finally{
    event.target.value = "";
  }
}

async function resetSeed(){
  state.loaded = false;
  state.products = [];
  try{ localStorage.removeItem(sourceScope()); }catch(error){}
  await loadSeedData();
  state.lastImport = "Base fournie rechargée";
  saveLocalState();
  render();
}

function mergeProducts(newProducts, message){
  const preserved = new Map(state.products.map((product) => [productKey(product), product]));
  const merged = normalizeProducts([...state.products, ...newProducts], uid);
  merged.forEach((product) => {
    const previous = preserved.get(productKey(product));
    if(previous){
      product.current_stock = previous.current_stock;
      product.minimum_stock = previous.minimum_stock;
      product.stock_minimum = previous.stock_minimum ?? previous.minimum_stock;
      product.stock_cible = previous.stock_cible ?? product.stock_minimum;
      product.produit_essentiel = previous.produit_essentiel;
      product.produit_favori = previous.produit_favori;
      product.frequence_commande = previous.frequence_commande;
      product.ordre_affichage_commande = previous.ordre_affichage_commande;
      product.storage_location = normalizeLocation(previous.storage_location || product.storage_location);
      product.active_status = previous.active_status;
    }
    product.inventory_value = inventoryValue(product);
  });
  state.products = merged;
  state.lastImport = `${message} • ${new Date().toLocaleString("fr-CA")}`;
  saveSourceState();
  saveLocalState();
  toast("Import terminé");
  render();
}

async function init(){
  await loadSeedData();
  render();
}

window.renderInventoryCommand = async function renderInventoryCommand(){
  await init();
};

window.addEventListener("ops-auth-context", () => {
  state.context = window.OPS_AUTH_CONTEXT || null;
  state.loaded = false;
  init();
});

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", () => {
    if($("page-inventory")?.classList.contains("active")) init();
  }, { once:true });
}else if($("page-inventory")?.classList.contains("active")){
  init();
}
