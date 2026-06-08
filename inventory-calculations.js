import {
  norm,
  normalizeLocation,
  round
} from "./inventory-utils.js?v=98";

export const FREQUENCY_OPTIONS = ["hebdomadaire", "bihebdomadaire", "occasionnel"];
const QUICK_INVENTORY_KEYWORDS = [
  "fromage",
  "mozzarella",
  "parmesan",
  "pate",
  "sauce",
  "pepperoni",
  "bacon",
  "poulet",
  "boite",
  "emballage",
  "breuvage",
  "boisson",
  "pepsi",
  "coke",
  "7up",
  "root beer",
  "eau"
];

export function inventoryValue(product){
  const stock = Number(product?.current_stock || 0);
  const cost = Number(product?.case_cost ?? product?.unit_cost ?? 0);
  return Math.max(0, stock * cost);
}

export function stockGap(product){
  return Math.max(0, stockMinimum(product) - Number(product?.current_stock || 0));
}

export function stockMinimum(product){
  return Math.max(0, Number(product?.stock_minimum ?? product?.minimum_stock ?? 0));
}

export function stockTarget(product){
  return Math.max(0, Number(product?.stock_cible ?? product?.stock_minimum ?? product?.minimum_stock ?? 0));
}

export function productCost(product){
  return Number(product?.case_cost ?? product?.unit_cost ?? 0);
}

export function targetRecommendation(product){
  return Math.max(0, stockTarget(product) - Number(product?.current_stock || 0));
}

export function minimumRecommendation(product){
  return Math.max(0, stockMinimum(product) - Number(product?.current_stock || 0));
}

export function productKey(product){
  return `${norm(product?.supplier_product_code)}|${norm(product?.product_name)}|${norm(product?.supplier)}`;
}

export function normalizeProducts(products, createId){
  const seen = new Map();
  products.forEach((raw) => {
    const product = Object.assign({
      id:raw.id || createId("product"),
      category:"Non classé",
      supplier:"",
      supplier_product_code:"",
      product_name:"",
      format:"Caisse",
      unit_type:"UN",
      unit_size:null,
      case_cost:null,
      unit_cost:null,
      storage_location:"Sec",
      minimum_stock:0,
      stock_minimum:0,
      stock_cible:0,
      produit_essentiel:false,
      produit_favori:false,
      frequence_commande:"hebdomadaire",
      ordre_affichage_commande:0,
      current_stock:0,
      inventory_value:0,
      active_status:true,
      source:"manual"
    }, raw);

    product.category = String(product.category || "").trim() || "Non classé";
    product.supplier = String(product.supplier || "").trim() || "Fournisseur";
    product.product_name = String(product.product_name || "").trim() || "Produit sans nom";
    product.supplier_product_code = String(product.supplier_product_code || "").trim();
    product.storage_location = normalizeLocation(product.storage_location);
    product.current_stock = Number(product.current_stock || 0);
    product.minimum_stock = Number(product.minimum_stock || 0);
    product.stock_minimum = Math.max(0, Number(product.stock_minimum ?? product.minimum_stock ?? 0));
    product.stock_cible = Math.max(0, Number(product.stock_cible ?? product.stock_minimum ?? product.minimum_stock ?? 0));
    product.minimum_stock = product.stock_minimum;
    product.produit_essentiel = product.produit_essentiel === true || product.produit_essentiel === "true";
    product.produit_favori = product.produit_favori === true || product.produit_favori === "true";
    product.frequence_commande = FREQUENCY_OPTIONS.includes(product.frequence_commande) ? product.frequence_commande : "hebdomadaire";
    product.ordre_affichage_commande = Number(product.ordre_affichage_commande || 0);
    product._base_current_stock = Number(product.current_stock || 0);
    product._base_minimum_stock = Number(product.minimum_stock || 0);
    product.case_cost = product.case_cost === null || product.case_cost === "" ? null : Number(product.case_cost);
    product.unit_cost = product.unit_cost === null || product.unit_cost === "" ? null : Number(product.unit_cost);
    product.inventory_value = inventoryValue(product);

    const key = productKey(product);
    if(!seen.has(key)){
      seen.set(key, product);
    }else{
      const current = seen.get(key);
      current.foodcost_usage_count = Math.max(Number(current.foodcost_usage_count || 0), Number(product.foodcost_usage_count || 0));
      current.unit_cost = current.unit_cost ?? product.unit_cost;
      current.case_cost = current.case_cost ?? product.case_cost;
    }
  });

  return [...seen.values()].sort((a,b) => (a.category + a.product_name).localeCompare(b.category + b.product_name, "fr"));
}

export function filteredProducts(state){
  let list = state.products.filter((product) => product.active_status !== false);
  const q = norm(state.search);
  if(q){
    list = list.filter((product) => [
      product.product_name,
      product.supplier,
      product.supplier_product_code,
      product.category,
      product.storage_location
    ].some((value) => norm(value).includes(q)));
  }
  if(state.category !== "Tous") list = list.filter((product) => product.category === state.category);
  if(state.supplier !== "Tous") list = list.filter((product) => product.supplier === state.supplier);
  if(state.location !== "Tous") list = list.filter((product) => product.storage_location === state.location);
  if(state.view === "low") list = list.filter((product) => stockGap(product) > 0);
  if(state.view === "missingCost") list = list.filter((product) => !Number.isFinite(Number(product.case_cost ?? product.unit_cost)));

  const sorters = {
    category:(a,b) => (a.category + a.product_name).localeCompare(b.category + b.product_name, "fr"),
    supplier:(a,b) => (a.supplier + a.product_name).localeCompare(b.supplier + b.product_name, "fr"),
    value:(a,b) => inventoryValue(b) - inventoryValue(a),
    low:(a,b) => stockGap(b) - stockGap(a),
    order:(a,b) => Number(a.ordre_affichage_commande || 0) - Number(b.ordre_affichage_commande || 0) || a.product_name.localeCompare(b.product_name, "fr"),
    name:(a,b) => a.product_name.localeCompare(b.product_name, "fr")
  };
  return list.sort(sorters[state.sort] || sorters.category);
}

export function isQuickInventoryProduct(product){
  if(product?.produit_favori) return true;
  if(targetRecommendation(product) > 0) return true;
  const hay = norm(`${product?.category || ""} ${product?.product_name || ""} ${product?.storage_location || ""}`);
  return QUICK_INVENTORY_KEYWORDS.some((keyword) => hay.includes(keyword));
}

export function isInventoryCounted(product){
  return product?._inventory_counted === true || Number(product?.current_stock || 0) > 0;
}

export function inventoryProgress(products=[]){
  const total = products.length;
  const counted = products.filter(isInventoryCounted).length;
  return {
    total,
    counted,
    percent:total ? Math.round(counted / total * 100) : 0
  };
}

export function stockHealth(product){
  const target = stockTarget(product);
  const stock = Number(product?.current_stock || 0);
  if(target <= 0){
    return { tone:"neutral", label:"Standing à configurer", ratio:0, percent:0 };
  }
  const ratio = Math.max(0, Math.min(1, stock / target));
  if(ratio >= .7) return { tone:"green", label:"Stock confortable", ratio, percent:Math.round(ratio * 100) };
  if(ratio >= .3) return { tone:"amber", label:"À surveiller", ratio, percent:Math.round(ratio * 100) };
  return { tone:"red", label:"À commander", ratio, percent:Math.round(ratio * 100) };
}

export function metrics(state){
  const active = state.products.filter((product) => product.active_status !== false);
  const totalValue = active.reduce((sum, product) => sum + inventoryValue(product), 0);
  const low = active.filter((product) => stockGap(product) > 0);
  const missingCost = active.filter((product) => !Number.isFinite(Number(product.case_cost ?? product.unit_cost)));
  return {
    products:active.length,
    totalValue,
    low:low.length,
    missingCost:missingCost.length,
    suppliers:new Set(active.map((product) => product.supplier).filter(Boolean)).size,
    categories:new Set(active.map((product) => product.category).filter(Boolean)).size
  };
}

export function calculateOrder(state){
  const sales = Number(state.order.sales || 0);
  const foodCost = Number(state.order.foodCost || 0) / 100;
  const budget = Math.max(0, sales * foodCost);
  const currentInventoryValue = metrics(state).totalValue;
  const recommended = Math.max(0, budget - currentInventoryValue);
  const lowItems = state.products
    .filter((product) => product.active_status !== false && stockGap(product) > 0)
    .sort((a,b) => stockGap(b) - stockGap(a));
  return { budget, inventoryValue:currentInventoryValue, recommended, lowItems };
}

export function filteredStockSettingsProducts(state){
  let list = filteredProducts(state);
  if(state.settingFilter === "favorite") list = list.filter((product) => product.produit_favori);
  return list.sort((a,b) => Number(a.ordre_affichage_commande || 0) - Number(b.ordre_affichage_commande || 0) || a.product_name.localeCompare(b.product_name, "fr"));
}

export function assistedOrderItems(state, mode="minimum"){
  const products = state.products.filter((product) => product.active_status !== false);
  const rows = products.map((product) => {
    const recommended = mode === "minimum" ? minimumRecommendation(product) : targetRecommendation(product);
    return orderItemFromProduct(product, recommended);
  }).filter((item) => item.recommended_quantity > 0);
  return rows.sort((a,b) => Number(a.ordre_affichage_commande || 0) - Number(b.ordre_affichage_commande || 0) || a.product_name.localeCompare(b.product_name, "fr"));
}

export function assistedOrderBuckets(state){
  const active = state.products.filter((product) => product.active_status !== false);
  return {
    low:active.filter((product) => minimumRecommendation(product) > 0),
    essential:active.filter((product) => product.produit_essentiel && targetRecommendation(product) > 0),
    favorite:active.filter((product) => product.produit_favori),
    zero:active.filter((product) => Number(product.current_stock || 0) <= 0)
  };
}

export function automaticOrderItems(state){
  const manual = new Map((state.assistedItems || []).map((item) => [item.product_id, item]));
  return state.products
    .filter((product) => product.active_status !== false)
    .map((product) => {
      const recommended = targetRecommendation(product);
      if(recommended <= 0) return null;
      const item = orderItemFromProduct(product, recommended);
      const override = manual.get(product.id);
      if(override){
        item.adjusted_quantity = Math.max(0, Number(override.adjusted_quantity ?? item.adjusted_quantity ?? 0));
        item.estimated_cost = round(item.adjusted_quantity * Number(item.unit_cost || 0));
      }
      return item;
    })
    .filter(Boolean)
    .sort((a,b) => Number(a.ordre_affichage_commande || 0) - Number(b.ordre_affichage_commande || 0) || a.product_name.localeCompare(b.product_name, "fr"));
}

export function automaticOrderSummary(state){
  const items = automaticOrderItems(state);
  const active = state.products.filter((product) => product.active_status !== false);
  const critical = active.filter((product) => targetRecommendation(product) > 0 && stockHealth(product).tone === "red");
  const zero = active.filter((product) => Number(product.current_stock || 0) <= 0 && stockTarget(product) > 0);
  return {
    items,
    criticalCount:critical.length,
    toOrderCount:items.length,
    zeroCount:zero.length,
    totalValue:round(items.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0))
  };
}

export function orderItemFromProduct(product, quantity){
  const adjusted = Math.max(0, Number(quantity || 0));
  const cost = productCost(product);
  return {
    product_id:product.id,
    product_name:product.product_name,
    category:product.category,
    supplier:product.supplier,
    supplier_product_code:product.supplier_product_code,
    current_stock:Number(product.current_stock || 0),
    stock_minimum:stockMinimum(product),
    stock_cible:stockTarget(product),
    recommended_quantity:adjusted,
    adjusted_quantity:adjusted,
    unit_cost:cost,
    estimated_cost:round(adjusted * cost),
    produit_essentiel:Boolean(product.produit_essentiel),
    produit_favori:Boolean(product.produit_favori),
    frequence_commande:product.frequence_commande || "hebdomadaire",
    ordre_affichage_commande:Number(product.ordre_affichage_commande || 0)
  };
}

export function orderTotals(state, items=[]){
  const order = calculateOrder(state);
  const total = items.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0);
  const projectedFoodCost = Number(state.order.sales || 0) > 0 ? total / Number(state.order.sales || 0) * 100 : 0;
  return {
    budget:round(order.budget),
    inventoryValue:round(order.inventoryValue),
    theoreticalRecommendation:round(order.recommended),
    orderTotal:round(total),
    budgetGap:round(order.budget - total),
    projectedFoodCost:round(projectedFoodCost)
  };
}

export function inventorySnapshot(state, source="local", forcedDate=null){
  const date = forcedDate || new Date().toISOString();
  const items = state.products
    .filter((product) => product.active_status !== false)
    .map((product) => ({
      product_id:product.id,
      product_name:product.product_name,
      category:product.category,
      supplier:product.supplier,
      quantity_counted:Number(product.current_stock || 0),
      unit_cost:Number(product.case_cost ?? product.unit_cost ?? 0),
      estimated_value:round(Number(product.current_stock || 0) * Number(product.case_cost ?? product.unit_cost ?? 0))
    }));
  const totalValue = items.reduce((sum, item) => sum + Number(item.estimated_value || 0), 0);
  const countedItems = items.filter((item) => Number(item.quantity_counted || 0) > 0);
  return {
    id:`${source}-${date}`,
    source,
    restaurant:state.restaurant,
    count_date:date,
    total_value:round(totalValue),
    product_count:countedItems.length,
    total_products:items.length,
    note:"",
    items
  };
}

export function optionValues(products, key){
  return ["Tous", ...new Set(products.map((product) => product[key]).filter(Boolean).sort((a,b) => a.localeCompare(b, "fr")))];
}

export function smartAlerts(state, formatters){
  const m = metrics(state);
  const topLow = state.products.filter((product) => stockGap(product) > 0).sort((a,b) => stockGap(b) - stockGap(a))[0];
  const expensive = state.products.filter((product) => inventoryValue(product) > 0).sort((a,b) => inventoryValue(b) - inventoryValue(a))[0];
  return [
    topLow
      ? { tone:"red", title:"Rupture potentielle", text:`${topLow.product_name}: minimum ${topLow.minimum_stock}, stock ${topLow.current_stock}.` }
      : { tone:"green", title:"Minimums OK", text:"Aucun produit sous minimum selon les seuils actuels." },
    m.missingCost
      ? { tone:"amber", title:"Coûts incomplets", text:`${m.missingCost} produit(s) doivent avoir un coût pour fiabiliser les commandes.` }
      : { tone:"green", title:"Coûts prêts", text:"Les produits actifs ont un coût exploitable." },
    expensive
      ? { tone:"blue", title:"Valeur élevée", text:`${expensive.product_name} représente ${formatters.money(inventoryValue(expensive))} en inventaire.` }
      : { tone:"blue", title:"Inventaire manuel", text:"Commence par inscrire les stocks exacts dans les cartes produits." }
  ];
}
