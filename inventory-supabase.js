import { normalizeLocation, round, uid } from "./inventory-utils.js?v=98";
import { inventoryValue, normalizeProducts } from "./inventory-calculations.js?v=98";

let cachedClient = null;

const REQUIRED_TABLES = [
  { name:"restaurants", columns:"id,name" },
  { name:"user_restaurants", columns:"user_id,restaurant_id" },
  { name:"products", columns:"id" },
  { name:"inventory_counts", columns:"id" },
  { name:"purchase_orders", columns:"id" },
  { name:"purchase_order_items", columns:"id" },
  { name:"product_stock_settings", columns:"restaurant_id,product_id" }
];

export function supabaseClient(){
  if(window.OPS_SUPABASE_CLIENT) return window.OPS_SUPABASE_CLIENT;
  if(!window.supabase || !window.OPS_AUTH_CONFIG?.supabaseUrl || !window.OPS_AUTH_CONFIG?.supabaseAnonKey) return null;
  if(!cachedClient){
    cachedClient = window.supabase.createClient(window.OPS_AUTH_CONFIG.supabaseUrl, window.OPS_AUTH_CONFIG.supabaseAnonKey, {
      auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
    });
  }
  return cachedClient;
}

function missingClientReason(){
  if(!window.supabase) return "Librairie Supabase non chargée dans la page.";
  if(!window.OPS_AUTH_CONFIG?.supabaseUrl || !window.OPS_AUTH_CONFIG?.supabaseAnonKey){
    return "Configuration Supabase absente: URL ou anon key manquante.";
  }
  if(!window.OPS_AUTH_READY) return "Session Supabase non prête: reconnecte-toi avant de synchroniser.";
  return "";
}

function describeSupabaseError(error, context="Supabase"){
  const message = String(error?.message || error || "Erreur inconnue");
  const code = String(error?.code || "");
  if(code === "42P01" || /Could not find the table|relation .* does not exist|schema cache/i.test(message)){
    return `${context}: table introuvable via l'API Supabase. Le script inventaire n'est pas complet dans ce projet ou le cache API n'a pas été rechargé.`;
  }
  if(code === "42703" || /column .* does not exist/i.test(message)){
    return `${context}: colonne manquante dans Supabase. Le setup SQL d'inventaire doit être remis à jour.`;
  }
  if(code === "42501" || /row-level security|permission denied|violates row-level security/i.test(message)){
    return `${context}: policy RLS bloque l'accès. Vérifie que le compte est super_admin ou que les policies inventaire sont créées.`;
  }
  if(/JWT|session|auth/i.test(message)){
    return `${context}: session expirée ou invalide. Déconnecte-toi puis reconnecte-toi.`;
  }
  if(/Failed to fetch|NetworkError|fetch/i.test(message)){
    return `${context}: connexion réseau impossible vers Supabase.`;
  }
  return `${context}: ${message}`;
}

function projectLabel(){
  try{
    const url = new URL(window.OPS_AUTH_CONFIG?.supabaseUrl || "");
    return url.hostname.replace(".supabase.co", "");
  }catch{
    return "projet Supabase inconnu";
  }
}

function isMissingTableError(error){
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || /Could not find the table|relation .* does not exist|schema cache/i.test(message);
}

async function verifyInventoryTables(client){
  const issues = [];
  for(const table of REQUIRED_TABLES){
    const { error } = await client.from(table.name).select(table.columns).limit(1);
    if(error){
      issues.push({
        table:table.name,
        missing:isMissingTableError(error),
        message:describeSupabaseError(error, `Table ${table.name}`),
        raw:error?.message || String(error)
      });
    }
  }
  return issues;
}

function inventoryReadinessMessage(issues){
  if(!issues.length) return "Supabase inventaire prêt";
  const project = projectLabel();
  const missingSettings = issues.find((issue) => issue.missing && issue.table === "product_stock_settings");
  if(missingSettings){
    return `Table product_stock_settings: introuvable dans l'API du projet ${project}. Exécute SUPABASE_STOCK_SETTINGS_V98.sql dans Supabase, puis recharge l'app.`;
  }
  const missingInventory = issues.find((issue) => issue.missing && ["products","inventory_counts","purchase_orders","purchase_order_items"].includes(issue.table));
  const authTablesOk = !issues.some((issue) => ["restaurants","user_restaurants"].includes(issue.table));
  if(missingInventory && authTablesOk){
    return `Table ${missingInventory.table}: introuvable dans l'API du projet ${project}. L'app utilise maintenant la session Supabase principale. Si ce message reste visible, exécute SUPABASE_INVENTORY_API_FIX_V97.sql dans ce projet puis recharge l'app.`;
  }
  if(missingInventory){
    return `Table ${missingInventory.table}: introuvable dans l'API du projet ${project}. Exécute SUPABASE_INVENTORY_API_FIX_V97.sql dans ce projet Supabase, puis recharge l'app.`;
  }
  return issues[0].message;
}

export async function diagnoseInventorySupabase(){
  const client = supabaseClient();
  const reason = missingClientReason();
  if(reason) return { ready:false, message:reason, issues:[reason] };
  try{
    const { data, error } = await client.auth.getSession();
    if(error) return { ready:false, message:describeSupabaseError(error, "Session Supabase"), issues:[describeSupabaseError(error, "Session Supabase")] };
    if(!data?.session) return { ready:false, message:"Aucune session Supabase active. Reconnecte-toi avant de synchroniser.", issues:["Aucune session Supabase active."] };
    const issues = await verifyInventoryTables(client);
    if(issues.length) return { ready:false, message:inventoryReadinessMessage(issues), issues:issues.map((issue) => issue.message) };
    return { ready:true, message:"Supabase inventaire prêt", issues:[] };
  }catch(error){
    const message = describeSupabaseError(error, "Diagnostic Supabase");
    return { ready:false, message, issues:[message] };
  }
}

export async function restaurantIdForCurrent(state, client=supabaseClient()){
  if(!client || state.restaurant === "Réseau complet") return null;
  const { data, error } = await client.from("restaurants").select("id,name").ilike("name", state.restaurant).maybeSingle();
  if(error) return null;
  return data?.id || null;
}

export async function loadSupabaseSnapshot(state){
  const client = supabaseClient();
  if(!client || !window.OPS_AUTH_READY) return false;
  try{
    const { data, error } = await client.from("products").select("id,current_stock,minimum_stock,storage_location,active_status");
    if(error || !Array.isArray(data) || !data.length) return false;
    const byId = new Map(data.map((product) => [product.id, product]));
    state.products.forEach((product) => {
      const remote = byId.get(product.id);
      if(!remote) return;
      product.current_stock = Number(remote.current_stock || product.current_stock || 0);
      product.minimum_stock = Number(remote.minimum_stock || product.minimum_stock || 0);
      product.storage_location = normalizeLocation(remote.storage_location || product.storage_location);
      product.active_status = remote.active_status !== false;
      product.inventory_value = inventoryValue(product);
    });
    return true;
  }catch(error){
    console.warn("Inventaire Supabase non chargé:", error.message || error);
    return false;
  }
}

export async function loadProductStockSettings(state){
  const client = supabaseClient();
  if(!client || !window.OPS_AUTH_READY || state.restaurant === "Réseau complet") return false;
  try{
    const restaurantId = await restaurantIdForCurrent(state, client);
    if(!restaurantId) return false;
    const { data, error } = await client
      .from("product_stock_settings")
      .select("product_id,stock_minimum,stock_cible,produit_essentiel,produit_favori,frequence_commande,ordre_affichage_commande")
      .eq("restaurant_id", restaurantId);
    if(error) throw error;
    const byProduct = new Map((data || []).map((row) => [row.product_id, row]));
    state.products.forEach((product) => {
      const setting = byProduct.get(product.id);
      if(!setting) return;
      product.stock_minimum = Number(setting.stock_minimum || 0);
      product.stock_cible = Number(setting.stock_cible || 0);
      product.minimum_stock = product.stock_minimum;
      product.produit_essentiel = setting.produit_essentiel === true;
      product.produit_favori = setting.produit_favori === true;
      product.frequence_commande = setting.frequence_commande || "hebdomadaire";
      product.ordre_affichage_commande = Number(setting.ordre_affichage_commande || 0);
    });
    state.supabaseStatus = "Réglages de stock Supabase synchronisés";
    return true;
  }catch(error){
    state.supabaseStatus = describeSupabaseError(error, "Réglages de stock");
    console.warn(state.supabaseStatus);
    return false;
  }
}

export async function saveProductStockSettings(state, options={}){
  const client = supabaseClient();
  if(!client || !window.OPS_AUTH_READY || state.restaurant === "Réseau complet"){
    options.toast?.("Sélectionne un restaurant avant de sauvegarder les réglages.");
    return false;
  }
  try{
    const restaurantId = await restaurantIdForCurrent(state, client);
    if(!restaurantId) throw new Error("Restaurant introuvable dans Supabase");
    const userId = window.OPS_AUTH_USER?.id || null;
    const rows = state.products
      .filter((product) => product.active_status !== false)
      .map((product) => ({
        restaurant_id:restaurantId,
        product_id:product.id,
        stock_minimum:Number(product.stock_minimum ?? product.minimum_stock ?? 0),
        stock_cible:Number(product.stock_cible ?? product.stock_minimum ?? product.minimum_stock ?? 0),
        produit_essentiel:Boolean(product.produit_essentiel),
        produit_favori:Boolean(product.produit_favori),
        frequence_commande:product.frequence_commande || "hebdomadaire",
        ordre_affichage_commande:Number(product.ordre_affichage_commande || 0),
        updated_by:userId,
        updated_at:new Date().toISOString()
      }));
    for(let i=0; i<rows.length; i+=250){
      const { error } = await client
        .from("product_stock_settings")
        .upsert(rows.slice(i, i+250), { onConflict:"restaurant_id,product_id" });
      if(error) throw error;
    }
    state.supabaseStatus = "Réglages minimum/cible sauvegardés dans Supabase";
    options.toast?.("Configuration des stocks sauvegardée");
    return true;
  }catch(error){
    const message = describeSupabaseError(error, "Sauvegarde réglages stock");
    state.supabaseStatus = message;
    options.toast?.(message);
    return false;
  }
}

export async function loadSupabaseHistory(state, mergeHistory){
  const client = supabaseClient();
  if(!client || !window.OPS_AUTH_READY || state.restaurant === "Réseau complet"){
    state.supabaseStatus = "Historique local seulement";
    return false;
  }
  try{
    const restaurantId = await restaurantIdForCurrent(state, client);
    if(!restaurantId){
      state.supabaseStatus = "Restaurant introuvable dans Supabase";
      return false;
    }
    const { data, error } = await client
      .from("inventory_counts")
      .select("id,product_id,quantity_counted,count_date,notes,counted_by,products(product_name,category,supplier,case_cost,unit_cost)")
      .eq("restaurant_id", restaurantId)
      .order("count_date", { ascending:false })
      .limit(12000);
    if(error) throw error;

    const grouped = new Map();
    (data || []).forEach((row) => {
      const key = row.count_date;
      const product = Array.isArray(row.products) ? row.products[0] : row.products;
      const unitCost = Number(product?.case_cost ?? product?.unit_cost ?? 0);
      const item = {
        product_id:row.product_id,
        count_id:row.id,
        product_name:product?.product_name || row.product_id,
        category:product?.category || "",
        supplier:product?.supplier || "",
        quantity_counted:Number(row.quantity_counted || 0),
        unit_cost:unitCost,
        estimated_value:round(Number(row.quantity_counted || 0) * unitCost)
      };
      const entry = grouped.get(key) || {
        id:`supabase-${key}`,
        source:"supabase",
        restaurant:state.restaurant,
        count_date:key,
        total_value:0,
        product_count:0,
        total_products:0,
        counted_by:row.counted_by || "",
        note:"",
        items:[]
      };
      const rowNote = String(row.notes || "");
      if(rowNote && !rowNote.startsWith("Inventaire manuel Dashboard OPS")) entry.note = entry.note || rowNote;
      entry.items.push(item);
      entry.total_value = round(entry.total_value + item.estimated_value);
      entry.total_products += 1;
      if(item.quantity_counted > 0) entry.product_count += 1;
      grouped.set(key, entry);
    });

    const entries = [...grouped.values()];
    mergeHistory(entries, true);
    state.supabaseStatus = entries.length ? "Historique Supabase synchronisé" : "Aucun inventaire Supabase pour ce restaurant";
    return true;
  }catch(error){
    const message = describeSupabaseError(error, "Historique inventaire");
    console.warn(message);
    state.supabaseStatus = message;
    return false;
  }
}

export async function saveCorrectedSupabaseHistory(entry, options={}){
  const client = supabaseClient();
  if(!client || !window.OPS_AUTH_READY || !entry?.items?.length) return false;
  const rows = entry.items.filter((item) => item.count_id);
  if(!rows.length) return false;
  try{
    for(let i=0; i<rows.length; i+=150){
      const chunk = rows.slice(i, i+150);
      for(const item of chunk){
        const { error } = await client
          .from("inventory_counts")
          .update({
            quantity_counted:Number(item.quantity_counted || 0),
            notes:entry.note || null
          })
          .eq("id", item.count_id);
        if(error) throw error;
      }
    }
    return true;
  }catch(error){
    const message = describeSupabaseError(error, "Correction inventaire");
    entry._supabaseError = message;
    console.warn(message);
    options.toast?.(message);
    return false;
  }
}

export async function syncProductsToSupabase(state, options={}){
  const silent = Boolean(options.silent);
  const client = supabaseClient();
  const readiness = await diagnoseInventorySupabase();
  if(!client || !readiness.ready){
    state.supabaseStatus = readiness.message || "Diagnostic Supabase incomplet: impossible de déterminer le blocage.";
    if(!silent) options.toast?.(state.supabaseStatus);
    return false;
  }
  try{
    state.products = normalizeProducts(state.products, uid);
    const rows = state.products.map((product) => ({
      id:product.id,
      category:product.category,
      supplier:product.supplier,
      supplier_product_code:product.supplier_product_code,
      product_name:product.product_name,
      format:product.format,
      unit_type:product.unit_type,
      unit_size:product.unit_size,
      case_cost:product.case_cost,
      unit_cost:product.unit_cost,
      storage_location:normalizeLocation(product.storage_location),
      minimum_stock:product.minimum_stock,
      current_stock:product.current_stock,
      inventory_value:inventoryValue(product),
      active_status:product.active_status !== false
    }));
    for(let i=0; i<rows.length; i+=250){
      const { error } = await client.from("products").upsert(rows.slice(i, i+250), { onConflict:"id" });
      if(error) throw error;
    }
    if(!silent) options.toast?.("Produits synchronisés dans Supabase");
    state.supabaseStatus = "Produits synchronisés dans Supabase";
    return true;
  }catch(error){
    const message = describeSupabaseError(error, "Synchronisation produits");
    console.error(message, error);
    state.supabaseStatus = message;
    if(!silent) options.toast?.(message);
    return false;
  }
}

export async function insertSupabaseCounts(state, countDate, options={}){
  const client = supabaseClient();
  if(!client || !window.OPS_AUTH_READY || state.restaurant === "Réseau complet") return false;
  try{
    const restaurantId = await restaurantIdForCurrent(state, client);
    if(!restaurantId) return false;
    const productsReady = await syncProductsToSupabase(state, { silent:true });
    if(!productsReady){
      options.toast?.(state.supabaseStatus || "Synchronisation produits Supabase bloquée");
      return false;
    }
    const userId = window.OPS_AUTH_USER?.id || null;
    const now = countDate || new Date().toISOString();
    const sessionId = uid("count");
    const rows = state.products
      .filter((product) => product.active_status !== false)
      .map((product) => ({
        restaurant_id:restaurantId,
        product_id:product.id,
        quantity_counted:Number(product.current_stock || 0),
        counted_by:userId,
        count_date:now,
        notes:`Inventaire manuel Dashboard OPS • ${sessionId}`
      }));
    for(let i=0; i<rows.length; i+=250){
      const { error } = await client.from("inventory_counts").insert(rows.slice(i, i+250));
      if(error) throw error;
    }
    return true;
  }catch(error){
    const message = describeSupabaseError(error, "Sauvegarde inventaire");
    console.warn(message);
    state.supabaseStatus = message;
    options.toast?.(`Inventaire sauvegardé localement seulement. ${message}`);
    return false;
  }
}

export async function savePurchaseOrderToSupabase(state, purchaseOrder){
  const client = supabaseClient();
  if(!client || !window.OPS_AUTH_READY || state.restaurant === "Réseau complet") return false;
  try{
    const restaurantId = await restaurantIdForCurrent(state, client);
    if(!restaurantId) return false;
    const { data, error } = await client.from("purchase_orders").insert({
      restaurant_id:restaurantId,
      order_date:purchaseOrder.order_date,
      projected_sales:purchaseOrder.projected_sales,
      target_foodcost:purchaseOrder.target_foodcost,
      projected_food_budget:purchaseOrder.projected_food_budget,
      current_inventory_value:purchaseOrder.current_inventory_value,
      recommended_order_value:purchaseOrder.recommended_order_value,
      status:purchaseOrder.status,
      created_by:window.OPS_AUTH_USER?.id || null
    }).select("id").single();
    if(error) throw error;
    const orderId = data?.id;
    if(!orderId || !purchaseOrder.items?.length) return true;
    const rows = purchaseOrder.items.map((item) => ({
      purchase_order_id:orderId,
      product_id:item.product_id,
      recommended_quantity:item.recommended_quantity,
      adjusted_quantity:item.adjusted_quantity,
      estimated_cost:item.estimated_cost
    }));
    for(let i=0; i<rows.length; i+=250){
      const { error:itemsError } = await client.from("purchase_order_items").insert(rows.slice(i, i+250));
      if(itemsError) throw itemsError;
    }
    return true;
  }catch(error){
    console.warn("Commande Supabase non sauvegardée:", error.message || error);
    return false;
  }
}

export async function loadLatestPurchaseOrderFromSupabase(state){
  const client = supabaseClient();
  if(!client || !window.OPS_AUTH_READY || state.restaurant === "Réseau complet") return null;
  try{
    const restaurantId = await restaurantIdForCurrent(state, client);
    if(!restaurantId) return null;
    const { data, error } = await client
      .from("purchase_orders")
      .select("id,restaurant_id,order_date,projected_sales,target_foodcost,projected_food_budget,current_inventory_value,recommended_order_value,status,purchase_order_items(product_id,recommended_quantity,adjusted_quantity,estimated_cost)")
      .eq("restaurant_id", restaurantId)
      .order("order_date", { ascending:false })
      .limit(1)
      .maybeSingle();
    if(error) throw error;
    return data || null;
  }catch(error){
    console.warn("Dernière commande Supabase non chargée:", error.message || error);
    return null;
  }
}
