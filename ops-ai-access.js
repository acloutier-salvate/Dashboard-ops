(function(){
  "use strict";

  const VERSION = "v533";
  const ROLE_LABELS = {
    super_admin:"Super Admin",
    co:"Conseiller Opérations",
    franchise:"Franchisé",
    manager:"Gérant",
    user:"Employé"
  };

  const norm = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const avg = (rows, key) => {
    const values = rows.map((row) => num(row?.[key])).filter((value) => value != null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const sum = (rows, key) => rows.reduce((total, row) => total + (num(row?.[key]) || 0), 0);
  const round = (value, decimals = 1) => {
    const n = num(value);
    return n == null ? null : Number(n.toFixed(decimals));
  };

  function currentContext(){
    const ctx = window.OPS_AUTH_CONTEXT || {};
    const role = ctx.role || window.OPS_AUTH_ROLE || "user";
    const user = ctx.user || window.OPS_AUTH_USER || null;
    const restaurants = Array.isArray(ctx.restaurants) && ctx.restaurants.length
      ? ctx.restaurants.slice()
      : (Array.isArray(window.OPS_AUTH_ALLOWED_RESTAURANTS) ? window.OPS_AUTH_ALLOWED_RESTAURANTS.slice() : []);
    return {
      user,
      role,
      roleLabel:ROLE_LABELS[role] || ROLE_LABELS.user,
      allowedRestaurants:role === "super_admin" && !restaurants.length ? allRestaurants() : uniqueRestaurants(restaurants)
    };
  }

  function allRestaurants(){
    try{
      if(Array.isArray(RESTAURANTS)) return uniqueRestaurants(RESTAURANTS);
    }catch(error){}
    if(Array.isArray(window.RESTAURANTS)) return uniqueRestaurants(window.RESTAURANTS);
    try{
      if(Array.isArray(allowedRestaurants)) return uniqueRestaurants(allowedRestaurants);
    }catch(error){}
    return [];
  }

  function uniqueRestaurants(items){
    const seen = new Set();
    return (items || []).map((item) => String(item || "").trim()).filter((item) => {
      const key = norm(item);
      if(!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function canAccessRestaurant(name, ctx = currentContext()){
    if(!name) return true;
    if(ctx.role === "super_admin") return true;
    const key = norm(name);
    return ctx.allowedRestaurants.some((restaurant) => norm(restaurant) === key);
  }

  function detectRestaurant(question){
    const key = norm(question);
    const known = allRestaurants();
    return known.find((restaurant) => key.includes(norm(restaurant))) || "";
  }

  function isTodayQuestion(question){
    const key = norm(question);
    return key.includes("quedoisjefaire") || key.includes("aujourdhui") || key.includes("prioritesdujour") || key.includes("interventionsdujour");
  }

  function activeRestaurant(){
    const ids = [
      "profileRestaurant",
      "restaurantSelect",
      "dashboardRestaurant",
      "dashRestaurant",
      "cfComplaintRestaurant",
      "complaintRestaurant",
      "inventoryRestaurant",
      "inventoryRestaurantSelect"
    ];
    for(const id of ids){
      const value = document.getElementById(id)?.value;
      if(value && value !== "Tous" && value !== "Réseau complet" && value !== "latest") return value;
    }
    return "";
  }

  function activePageId(){
    return document.querySelector(".page.active")?.id || "";
  }

  function scopeForActivePage(question, ctx){
    const activePage = activePageId();
    const explicitRestaurant = detectRestaurant(question);
    const pageRestaurant = activeRestaurant();
    const todayMode = isTodayQuestion(question);
    const isDashboard = activePage === "page-dashboard" || activePage === "page-executive-dashboard";
    const isRestaurant = activePage === "page-restaurant";
    const isInventory = activePage === "page-inventory";
    const isComplaints = activePage === "page-complaints";

    if(explicitRestaurant){
      return { activePage, selected:explicitRestaurant, network:false, todayMode:false, instruction:`Analyser uniquement le restaurant nommé dans la question: ${explicitRestaurant}.` };
    }
    if(isDashboard || todayMode){
      return { activePage, selected:"", network:true, todayMode:true, instruction:"L'utilisateur est dans le Centre de contrôle. Analyser le réseau complet autorisé et citer seulement les KPI réseau présents dans le contexte." };
    }
    if(isRestaurant && pageRestaurant){
      return { activePage, selected:pageRestaurant, network:false, todayMode:false, instruction:`L'utilisateur est dans l'onglet Restaurant. Analyser uniquement le restaurant sélectionné: ${pageRestaurant}.` };
    }
    if(isInventory && pageRestaurant){
      return { activePage, selected:pageRestaurant, network:false, todayMode:false, instruction:`L'utilisateur est dans l'inventaire. Relier l'analyse au restaurant sélectionné si possible: ${pageRestaurant}.` };
    }
    if(isComplaints){
      return { activePage, selected:pageRestaurant || "", network:!pageRestaurant, todayMode:!pageRestaurant, instruction:pageRestaurant ? `L'utilisateur est dans Plaintes. Analyser les plaintes du restaurant sélectionné: ${pageRestaurant}.` : "L'utilisateur est dans Plaintes. Analyser les plaintes du réseau autorisé." };
    }
    return { activePage, selected:pageRestaurant || "", network:!pageRestaurant, todayMode:!pageRestaurant, instruction:pageRestaurant ? `Analyser le restaurant sélectionné: ${pageRestaurant}.` : "Analyser le réseau autorisé. Si la question exige un restaurant précis et qu'il manque, demander lequel." };
  }

  function currentWeek(){
    const ids = ["profileWeek","restaurantWeek","dashboardWeek","dashWeek","cfComplaintQuickWeek","complaintQuickWeek"];
    for(const id of ids){
      const value = document.getElementById(id)?.value;
      if(value) return value;
    }
    return "";
  }

  function parseDate(value){
    if(value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const text = String(value || "").trim();
    if(!text) return null;
    const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function parseQuestionWeekRange(question){
    const text = String(question || "").toLowerCase();
    const months = {
      janvier:1, fevrier:2, février:2, mars:3, avril:4, mai:5, juin:6,
      juillet:7, aout:8, août:8, septembre:9, octobre:10, novembre:11, decembre:12, décembre:12
    };
    const iso = text.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
    if(iso){
      return { start:iso[1], end:iso[2], label:`${iso[1]} au ${iso[2]}` };
    }
    const fr = text.match(/(\d{1,2})\s+([a-zéûôîàèùç]+)\s+(?:au|a|à|-)\s+(\d{1,2})\s+([a-zéûôîàèùç]+)?\s*(\d{4})/i);
    if(fr){
      const startDay = Number(fr[1]);
      const startMonth = months[fr[2]] || null;
      const endDay = Number(fr[3]);
      const endMonth = months[fr[4]] || startMonth;
      const year = Number(fr[5]);
      if(startMonth && endMonth && year){
        const start = `${year}-${String(startMonth).padStart(2,"0")}-${String(startDay).padStart(2,"0")}`;
        const end = `${year}-${String(endMonth).padStart(2,"0")}-${String(endDay).padStart(2,"0")}`;
        return { start, end, label:`${start} au ${end}` };
      }
    }
    return null;
  }

  function rowMatchesQuestionWeek(row, range){
    if(!range) return false;
    const week = String(row?.week || row?.period || row?.dateRange || "");
    if(week.includes(range.start) && week.includes(range.end)) return true;
    const rowDate = parseDate(row?.date || row?.dateIso || row?.created_at);
    if(!rowDate) return false;
    const start = parseDate(range.start);
    const end = parseDate(range.end);
    if(start) start.setHours(0,0,0,0);
    if(end) end.setHours(23,59,59,999);
    return (!start || rowDate >= start) && (!end || rowDate <= end);
  }

  function complaintActiveRange(){
    const customStart = document.getElementById("cfComplaintDate")?.value || document.getElementById("complaintDate")?.value || "";
    const customEnd = document.getElementById("cfComplaintEndDate")?.value || document.getElementById("complaintEndDate")?.value || "";
    if(customStart || customEnd){
      const start = parseDate(customStart);
      const end = parseDate(customEnd || customStart);
      if(start) start.setHours(0,0,0,0);
      if(end) end.setHours(23,59,59,999);
      return { start, end, label:[customStart, customEnd].filter(Boolean).join(" au ") };
    }
    const weekValue = document.getElementById("cfComplaintQuickWeek")?.value || document.getElementById("complaintQuickWeek")?.value || currentWeek();
    const match = String(weekValue || "").match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
    if(match){
      const start = parseDate(match[1]);
      const end = parseDate(match[2]);
      if(start) start.setHours(0,0,0,0);
      if(end) end.setHours(23,59,59,999);
      return { start, end, label:`${match[1]} au ${match[2]}` };
    }
    return null;
  }

  function filterComplaintsByActivePeriod(rows){
    const range = complaintActiveRange();
    if(!range?.start && !range?.end) return { rows:rows || [], range:null };
    const filtered = (rows || []).filter((row) => {
      const d = parseDate(row?.date || row?.dateIso || row?.created_at || row?.week);
      if(!d) return false;
      if(range.start && d < range.start) return false;
      if(range.end && d > range.end) return false;
      return true;
    });
    return { rows:filtered, range };
  }

  function visibleRows(){
    let rows = [];
    try{
      if(Array.isArray(DATA)) rows = DATA.slice();
    }catch(error){}
    if(!rows.length && Array.isArray(window.DATA)) rows = window.DATA.slice();
    const ctx = currentContext();
    return rows.filter((row) => canAccessRestaurant(row?.restaurant, ctx));
  }

  function visibleComplaints(){
    let rows = [];
    try{
      if(typeof window.getAllComplaints === "function"){
        const all = window.getAllComplaints();
        if(Array.isArray(all)) rows = all.slice();
      }
    }catch(error){}
    if(!rows.length && Array.isArray(window.COMPLAINTS)) rows = window.COMPLAINTS.slice();
    const ctx = currentContext();
    return rows.filter((row) => canAccessRestaurant(row?.restaurant, ctx));
  }

  function groupByRestaurant(rows){
    const map = new Map();
    rows.forEach((row) => {
      const restaurant = row?.restaurant || "Non précisé";
      const item = map.get(restaurant) || { restaurant, rows:[] };
      item.rows.push(row);
      map.set(restaurant, item);
    });
    return [...map.values()].map((item) => ({
      restaurant:item.restaurant,
      count:item.rows.length,
      sales:round(sum(item.rows, "sales"), 0),
      csi:round(avg(item.rows, "csi"), 1),
      delay:round(avg(item.rows, "delay"), 1),
      complaints:round(sum(item.rows, "complaints"), 0),
      foodCost:round(avg(item.rows, "foodCost"), 1),
      laborCost:round(avg(item.rows, "laborCost"), 1)
    })).sort((a, b) => (b.count || 0) - (a.count || 0));
  }

  function groupComplaints(rows){
    const typeMap = new Map();
    rows.forEach((row) => {
      const label = row?.type || row?.category || "Non précisé";
      const item = typeMap.get(label) || { label, count:0, amount:0 };
      item.count += 1;
      item.amount += num(row?.amount) || 0;
      typeMap.set(label, item);
    });
    return [...typeMap.values()].sort((a, b) => b.count - a.count || b.amount - a.amount).slice(0, 8);
  }

  function money(value){
    const n = num(value);
    return n == null ? "—" : n.toLocaleString("fr-CA", { style:"currency", currency:"CAD", maximumFractionDigits:0 });
  }

  function pct(value){
    const n = num(value);
    return n == null ? "—" : `${n.toLocaleString("fr-CA", { maximumFractionDigits:1 })} %`;
  }

  function exactOperationalResultAnswer(question){
    const key = norm(question);
    const asksResult = key.includes("resultat") || key.includes("resultats") || key.includes("performance") || key.includes("chiffre") || key.includes("semaine");
    if(!asksResult) return null;
    const restaurant = detectRestaurant(question) || activeRestaurant();
    const range = parseQuestionWeekRange(question);
    if(!restaurant || !range) return null;
    const ctx = currentContext();
    if(!canAccessRestaurant(restaurant, ctx)){
      return `Je ne peux pas analyser ${restaurant}, car ce restaurant n'est pas dans tes accès.`;
    }
    const rows = visibleRows().filter((row) => norm(row.restaurant) === norm(restaurant) && rowMatchesQuestionWeek(row, range));
    if(!rows.length){
      return `Je ne trouve pas de ligne KPI chargée pour ${restaurant} pour la semaine ${range.label}. Vérifie que le CSV KPI contient bien cette semaine et que la synchronisation est terminée.`;
    }
    const complaints = visibleComplaints().filter((row) => norm(row.restaurant) === norm(restaurant) && rowMatchesQuestionWeek(row, range));
    const totals = {
      sales:round(sum(rows, "sales"), 0),
      csi:round(avg(rows, "csi"), 1),
      delay:round(avg(rows, "delay"), 1),
      complaintsKpi:round(sum(rows, "complaints"), 0),
      growth:round(avg(rows, "growth"), 1),
      foodCost:round(avg(rows, "foodCost"), 1),
      laborCost:round(avg(rows, "laborCost"), 1),
      complaintRows:complaints.length,
      complaintAmount:round(complaints.reduce((total, row) => total + (num(row?.amount) || 0), 0), 0)
    };
    return [
      `Voici les résultats exacts chargés dans Dashboard OPS pour ${restaurant}, semaine ${range.label} :`,
      "",
      `- Ventes : ${money(totals.sales)}`,
      `- CSI : ${pct(totals.csi)}`,
      `- Délai livraison : ${totals.delay == null ? "—" : `${totals.delay} min`}`,
      `- Augmentation ventes : ${pct(totals.growth)}`,
      `- Food Cost : ${pct(totals.foodCost)}`,
      `- Labor Cost : ${pct(totals.laborCost)}`,
      `- Plaintes KPI : ${totals.complaintsKpi ?? "—"}`,
      `- Plaintes visibles dans le CSV plaintes pour cette semaine : ${totals.complaintRows}`,
      `- Dédommagement plaintes : ${money(totals.complaintAmount)}`,
      "",
      "Ces chiffres proviennent des données actuellement chargées dans le logiciel, sans estimation OpenAI."
    ].join("\n");
  }

  function buildDataSummary(question){
    const ctx = currentContext();
    const scope = scopeForActivePage(question, ctx);
    const selected = scope.selected;
    const todayMode = scope.todayMode || scope.network;
    if(!selected && !todayMode && scope.activePage !== "page-dashboard"){
      return { needsRestaurant:true, denied:false, reason:"restaurant_required" };
    }
    const allowed = canAccessRestaurant(selected, ctx);
    if(selected && !allowed){
      return { denied:true, restaurant:selected, reason:"restaurant_not_allowed" };
    }
    const allKpiRows = visibleRows();
    const allComplaints = visibleComplaints();
    const periodComplaints = filterComplaintsByActivePeriod(allComplaints);
    const kpiRows = todayMode && !selected ? allKpiRows : allKpiRows.filter((row) => !selected || norm(row.restaurant) === norm(selected));
    const complaintSourceRows = periodComplaints.rows;
    const complaints = todayMode && !selected ? complaintSourceRows : complaintSourceRows.filter((row) => !selected || norm(row.restaurant) === norm(selected));
    const week = currentWeek();
    const activePage = scope.activePage;
    const inventoryValue = document.getElementById("inventoryValueKpi")?.textContent?.trim() || "";
    const inventoryAlerts = [...document.querySelectorAll("#page-inventory .inventoryAlert strong")]
      .map((el) => el.textContent.trim())
      .filter(Boolean)
      .slice(0, 5);
    return {
      denied:false,
      needsRestaurant:false,
      auth:{
        user:{
          id:ctx.user?.id || "",
          email:ctx.user?.email || ""
        },
        role:ctx.role,
        roleLabel:ctx.roleLabel,
        allowedRestaurants:ctx.role === "super_admin" ? ["Tous"] : ctx.allowedRestaurants
      },
      scopeRestaurant:selected || "Réseau autorisé",
      scopeMode:selected ? "restaurant" : "network",
      scopeInstruction:scope.instruction,
      activePage,
      week,
      selectedRestaurant:selected || null,
      selectedPeriod:week || null,
      complaintPeriod:periodComplaints.range?.label || null,
      permissions:{
        role:ctx.role,
        roleLabel:ctx.roleLabel,
        allowedRestaurants:ctx.role === "super_admin" ? ["Tous"] : ctx.allowedRestaurants
      },
      kpi:{
        rows:kpiRows.length,
        restaurants:groupByRestaurant(kpiRows).slice(0, 30),
        totals:{
          sales:round(sum(kpiRows, "sales"), 0),
          csi:round(avg(kpiRows, "csi"), 1),
          delay:round(avg(kpiRows, "delay"), 1),
          complaints:round(sum(kpiRows, "complaints"), 0),
          growth:round(avg(kpiRows, "growth"), 1),
          foodCost:round(avg(kpiRows, "foodCost"), 1),
          laborCost:round(avg(kpiRows, "laborCost"), 1)
        }
      },
      complaints:{
        rows:complaints.length,
        amount:round(complaints.reduce((total, row) => total + (num(row?.amount) || 0), 0), 0),
        topCauses:groupComplaints(complaints)
      },
      inventory:{
        value:inventoryValue || null,
        alerts:inventoryAlerts
      },
      trendContext:buildTrendContext(kpiRows, complaints),
      completeOpsFile:buildCompleteOpsFile({
        ctx,
        selected,
        selectedPeriod:week || null,
        todayMode,
        allKpiRows,
        scopedKpiRows:kpiRows,
        allComplaints,
        scopedComplaints:complaints
      })
    };
  }

  function buildCompleteOpsFile(input){
    const allKpiRows = input.allKpiRows || [];
    const scopedKpiRows = input.scopedKpiRows || [];
    const allComplaints = input.allComplaints || [];
    const scopedComplaints = input.scopedComplaints || [];
    const restaurants = groupByRestaurant(scopedKpiRows);
    const allRestaurantStats = groupByRestaurant(allKpiRows);
    const complaintDetails = scopedComplaints
      .slice(-80)
      .map((row) => ({
        date:row?.date || row?.created_at || row?.week || "",
        restaurant:row?.restaurant || "",
        type:row?.type || row?.category || "",
        amount:round(row?.amount, 2),
        description:String(row?.description || row?.details || row?.comment || "").slice(0, 220)
      }));
    return {
      scope:{
        restaurant:input.selected || "Réseau autorisé complet",
        period:input.selectedPeriod || null,
        todayMode:Boolean(input.todayMode),
        userRole:input.ctx.roleLabel,
        userRoleKey:input.ctx.role,
        restaurantsAuthorized:input.ctx.role === "super_admin" ? allRestaurants() : input.ctx.allowedRestaurants
      },
      dashboard:{
        totalRows:scopedKpiRows.length,
        networkTotals:{
          sales:round(sum(scopedKpiRows, "sales"), 0),
          csi:round(avg(scopedKpiRows, "csi"), 1),
          delay:round(avg(scopedKpiRows, "delay"), 1),
          complaints:round(sum(scopedKpiRows, "complaints"), 0),
          growth:round(avg(scopedKpiRows, "growth"), 1),
          foodCost:round(avg(scopedKpiRows, "foodCost"), 1),
          laborCost:round(avg(scopedKpiRows, "laborCost"), 1)
        },
        kpiAvailable:{
          csi:round(avg(scopedKpiRows, "csi"), 1),
          plaintes:round(sum(scopedKpiRows, "complaints"), 0),
          delaiLivraison:round(avg(scopedKpiRows, "delay"), 1),
          foodCost:round(avg(scopedKpiRows, "foodCost"), 1),
          laborCost:round(avg(scopedKpiRows, "laborCost"), 1)
        },
        topRestaurants:restaurants.filter((item) => item.csi != null).sort((a, b) => Number(b.csi) - Number(a.csi)).slice(0, 8),
        restaurantsToWatch:restaurants.filter((item) => item.csi != null).sort((a, b) => Number(a.csi) - Number(b.csi)).slice(0, 8),
        fullNetworkRestaurantCount:allRestaurantStats.length
      },
      complaints:{
        total:scopedComplaints.length,
        amount:round(scopedComplaints.reduce((total, row) => total + (num(row?.amount) || 0), 0), 0),
        topCauses:groupComplaints(scopedComplaints),
        recentDetails:complaintDetails
      },
      audit:readAuditFile(input.selected),
      inventory:readInventoryFile(input.selected),
      orders:readOrderFile(input.selected),
      previousWeeks:previousWeeksFromRows(scopedKpiRows, scopedComplaints, 4),
      calendar:readCalendarFile(),
      sourceHealth:{
        csvRows:allKpiRows.length,
        complaintRows:allComplaints.length,
        generatedAt:new Date().toISOString()
      }
    };
  }

  function parseLocalJson(key, fallback){
    try{
      const value = localStorage.getItem(key);
      if(!value) return fallback;
      return JSON.parse(value);
    }catch(error){
      return fallback;
    }
  }

  function readAuditFile(selected){
    const keys = ["dashboard_ops_audits", "audits"];
    const rows = keys.flatMap((key) => {
      const value = parseLocalJson(key, []);
      return Array.isArray(value) ? value : [];
    }).filter((audit) => !selected || !audit?.restaurant || norm(audit.restaurant) === norm(selected));
    return {
      count:rows.length,
      latest:rows.slice(0, 5).map((audit) => ({
        date:audit.date || audit.created_at || "",
        restaurant:audit.restaurant || "",
        score:audit.score || "",
        csi:audit.csi || "",
        notes:String(audit.notes || audit.summary || "").slice(0, 350)
      }))
    };
  }

  function readInventoryFile(selected){
    const active = localStorageSnapshot("dashboard_ops_inventory_v1", selected, 4);
    const history = localStorageSnapshot("dashboard_ops_inventory_history_v1", selected, 8);
    return {
      activeDrafts:active,
      history,
      currentVisible:{
        value:document.getElementById("inventoryValueKpi")?.textContent?.trim() || null,
        products:document.getElementById("inventoryProductsKpi")?.textContent?.trim() || null,
        progress:document.getElementById("inventoryDockProgress")?.textContent?.trim() || null,
        toOrder:document.getElementById("inventoryDockToOrder")?.textContent?.trim() || null,
        orderValue:document.getElementById("inventoryDockOrderValue")?.textContent?.trim() || null
      }
    };
  }

  function readOrderFile(selected){
    const rows = parseLocalJson("dashboard_ops_inventory_orders_v1", []);
    const list = Array.isArray(rows) ? rows.filter((order) => !selected || !order?.restaurant || norm(order.restaurant) === norm(selected)) : [];
    const latest = list.slice(0, 6).map((order) => ({
      date:order.order_date || order.created_at || "",
      restaurant:order.restaurant || "",
      projectedSales:round(order.projected_sales, 0),
      targetFoodCost:round(order.target_foodcost, 1),
      currentInventoryValue:round(order.current_inventory_value, 0),
      recommendedOrderValue:round(order.recommended_order_value, 0),
      items:Array.isArray(order.items) ? order.items.slice(0, 20).map((item) => ({
        product:item.product_name || item.product_id || "",
        quantity:round(item.adjusted_quantity ?? item.recommended_quantity, 2),
        estimatedCost:round(item.estimated_cost, 2)
      })) : []
    }));
    return {
      count:list.length,
      latest,
      lastSixForSmartOrder:latest
    };
  }

  function readCalendarFile(){
    const calendarText = [...document.querySelectorAll("#page-calendar .pc409-event, #page-calendar [data-calendar-event], .calendarEvent")]
      .map((el) => el.textContent.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .slice(0, 20);
    const localEvents = Object.keys(localStorage)
      .filter((key) => key.toLowerCase().includes("calendar") || key.toLowerCase().includes("event"))
      .slice(0, 8)
      .map((key) => ({ key, value:String(localStorage.getItem(key) || "").slice(0, 500) }));
    return { visibleEvents:calendarText, localEventSources:localEvents };
  }

  function localStorageSnapshot(prefix, selected, limit){
    const out = [];
    for(let i = 0; i < localStorage.length; i += 1){
      const key = localStorage.key(i);
      if(!key || !key.startsWith(prefix)) continue;
      if(selected && !norm(key).includes(norm(selected))) continue;
      const value = parseLocalJson(key, null);
      out.push(summarizeStorageValue(key, value));
      if(out.length >= limit) break;
    }
    return out;
  }

  function summarizeStorageValue(key, value){
    if(Array.isArray(value)){
      return { key, count:value.length, latest:value.slice(0, 5).map(compactObject) };
    }
    if(value && typeof value === "object"){
      return {
        key,
        updatedAt:value.updatedAt || value.count_date || value.order_date || null,
        products:Array.isArray(value.products) ? value.products.length : null,
        countedProducts:Array.isArray(value.products) ? value.products.filter((p) => Number(p.current_stock || 0) > 0 || p.inventory_counted).length : null,
        order:value.order ? compactObject(value.order) : null,
        assistedItems:Array.isArray(value.assistedItems) ? value.assistedItems.slice(0, 8).map(compactObject) : null,
        latest:Array.isArray(value.items) ? value.items.slice(0, 8).map(compactObject) : null
      };
    }
    return { key, value:String(value || "").slice(0, 500) };
  }

  function compactObject(item){
    if(!item || typeof item !== "object") return item;
    const keep = {};
    ["date","count_date","order_date","restaurant","product_name","name","score","current_stock","quantity_counted","adjusted_quantity","recommended_quantity","estimated_cost","inventory_value","order_value","critical_count","zero_count","notes"].forEach((key) => {
      if(item[key] != null && item[key] !== "") keep[key] = item[key];
    });
    return keep;
  }

  function buildTrendContext(kpiRows, complaints){
    const latestInventory = document.querySelector("#inventoryHistoryList .inventoryHistoryCard, #inventoryHistoryList [data-inventory-id], .inventoryHistoryItem");
    const latestOrder = document.querySelector("#purchaseOrderHistoryList .inventoryHistoryCard, #purchaseOrderHistoryList [data-order-id], .purchaseOrderItem");
    const latestAudit = document.querySelector("#auditHistoryList .auditHistoryItem, #auditList .auditCard, .auditSavedCard");
    return {
      currentWeek:currentWeek() || null,
      previousWeeks:previousWeeksFromRows(kpiRows, complaints, 4),
      lastAudit:latestAudit?.textContent?.trim()?.replace(/\s+/g, " ").slice(0, 500) || null,
      lastOrder:latestOrder?.textContent?.trim()?.replace(/\s+/g, " ").slice(0, 500) || null,
      lastInventory:latestInventory?.textContent?.trim()?.replace(/\s+/g, " ").slice(0, 500) || null
    };
  }

  function previousWeeksFromRows(kpiRows, complaints, limit){
    const map = new Map();
    [...(kpiRows || []), ...(complaints || [])].forEach((row) => {
      const week = row?.week || row?.period || row?.dateRange || row?.date || row?.created_at || "";
      const label = String(week || "").slice(0, 24);
      if(!label) return;
      const item = map.get(label) || { label, kpiRows:0, complaintRows:0, sales:0, complaints:0, csiValues:[], delayValues:[] };
      if(kpiRows.includes(row)){
        item.kpiRows += 1;
        item.sales += num(row?.sales) || 0;
        item.complaints += num(row?.complaints) || 0;
        if(num(row?.csi) != null) item.csiValues.push(num(row.csi));
        if(num(row?.delay) != null) item.delayValues.push(num(row.delay));
      }else{
        item.complaintRows += 1;
      }
      map.set(label, item);
    });
    return [...map.values()].slice(-limit).map((item) => ({
      week:item.label,
      sales:round(item.sales, 0),
      csi:item.csiValues.length ? round(item.csiValues.reduce((a, b) => a + b, 0) / item.csiValues.length, 1) : null,
      delay:item.delayValues.length ? round(item.delayValues.reduce((a, b) => a + b, 0) / item.delayValues.length, 1) : null,
      complaints:item.complaints || item.complaintRows || 0
    }));
  }

  function approximateTokens(payload){
    return Math.ceil(JSON.stringify(payload || "").length / 4);
  }

  async function recordUsage(entry){
    const started = entry.startedAt || Date.now();
    const ctx = currentContext();
    const duration = Math.max(0, Date.now() - started);
    const payload = {
      user_id:ctx.user?.id || null,
      user_email:ctx.user?.email || "",
      role:ctx.role,
      restaurant_name:entry.restaurant || null,
      analysis_type:entry.analysisType || "assistant",
      provider:entry.provider || "local",
      approx_tokens:entry.approxTokens || 0,
      response_ms:duration,
      allowed_restaurants_count:ctx.role === "super_admin" ? null : ctx.allowedRestaurants.length,
      success:entry.success !== false,
      metadata:entry.metadata || {}
    };
    try{
      if(window.supabase && window.OPS_AUTH_CONFIG?.supabaseUrl && window.OPS_AUTH_CONFIG?.supabaseAnonKey){
        const client = window.supabase.createClient(window.OPS_AUTH_CONFIG.supabaseUrl, window.OPS_AUTH_CONFIG.supabaseAnonKey);
        await client.from("ops_ai_usage_log").insert(payload);
      }
    }catch(error){}
    try{
      if(typeof window.opsRecordActivity === "function"){
        await window.opsRecordActivity({
          action:"Requête OPS AI",
          module:"OPS AI",
          restaurant_name:payload.restaurant_name,
          metadata:{
            provider:payload.provider,
            analysis_type:payload.analysis_type,
            approx_tokens:payload.approx_tokens,
            response_ms:payload.response_ms
          }
        });
      }
    }catch(error){}
  }

  async function callAiProvider(question, summary, localAnswer){
    if(!window.OPS_AI_PROVIDER?.analyzeRequest){
      return { provider:"provider_error", text:"OpenAI n'a pas été appelé. Erreur réelle : provider_frontend_absent. Vérifie que aiProvider.js est chargé.", usage:null, metadata:{ reason:"provider_frontend_absent" } };
    }
    const result = await window.OPS_AI_PROVIDER.analyzeRequest({
      question,
      localAnswer,
      context:summary,
      analysisType:classifyQuestion(question)
    });
    return {
      provider:result.provider || "local",
      text:String(result.answer || localAnswer || "").trim() || localAnswer,
      usage:result.usage || null,
      metadata:result.metadata || {}
    };
  }

  function setLastSource(provider, metadata){
    const clean = provider || "fallback";
    window.OPS_AI_LAST_SOURCE = {
      provider:clean,
      label:clean === "openai" ? "Source : OpenAI" : clean === "provider_error" ? "Source : Erreur provider" : "Source : Fallback",
      metadata:metadata || {},
      at:new Date().toISOString()
    };
  }

  async function authToken(){
    try{
      if(!window.supabase || !window.OPS_AUTH_CONFIG?.supabaseUrl || !window.OPS_AUTH_CONFIG?.supabaseAnonKey) return "";
      const client = window.supabase.createClient(window.OPS_AUTH_CONFIG.supabaseUrl, window.OPS_AUTH_CONFIG.supabaseAnonKey);
      const { data } = await client.auth.getSession();
      return data?.session?.access_token || "";
    }catch(error){
      return "";
    }
  }

  function classifyQuestion(question){
    const key = norm(question);
    if(key.includes("plainte") || key.includes("compensation")) return "complaints";
    if(key.includes("inventaire") || key.includes("stock") || key.includes("commande")) return "inventory";
    if(key.includes("audit")) return "audit";
    if(key.includes("csi")) return "csi";
    if(key.includes("vente")) return "sales";
    if(key.includes("delai") || key.includes("livraison")) return "delay";
    return "assistant";
  }

  async function answerWithPermissions(question, localAnswer){
    const startedAt = Date.now();
    const exactAnswer = exactOperationalResultAnswer(question);
    if(exactAnswer){
      setLastSource("dashboard", { reason:"exact_operational_result", version:VERSION });
      await recordUsage({
        startedAt,
        restaurant:detectRestaurant(question) || activeRestaurant() || null,
        analysisType:"exact_result",
        provider:"dashboard",
        approxTokens:approximateTokens({ question, exactAnswer }),
        success:true,
        metadata:{ deterministic:true, version:VERSION }
      });
      return exactAnswer;
    }
    const summary = buildDataSummary(question);
    if(summary.needsRestaurant){
      setLastSource("guard", { reason:summary.reason });
      await recordUsage({
        startedAt,
        restaurant:null,
        analysisType:"restaurant_required",
        provider:"guard",
        approxTokens:approximateTokens({ question }),
        success:false,
        metadata:{ reason:summary.reason, version:VERSION }
      });
      return "Quel restaurant veux-tu analyser ?";
    }
    if(summary.denied){
      const text = `Je ne peux pas analyser ${summary.restaurant}, car ce restaurant n'est pas dans tes accès.`;
      setLastSource("guard", { reason:summary.reason });
      await recordUsage({
        startedAt,
        restaurant:summary.restaurant,
        analysisType:"denied",
        provider:"guard",
        approxTokens:approximateTokens({ question }),
        success:false,
        metadata:{ reason:summary.reason }
      });
      return text;
    }
    const approxTokens = approximateTokens({ question, summary, localAnswer });
    try{
      const result = await callAiProvider(question, summary, localAnswer);
      setLastSource(result.provider, result.metadata);
      await recordUsage({
        startedAt,
        restaurant:summary.scopeRestaurant,
        analysisType:classifyQuestion(question),
        provider:result.provider,
        approxTokens:result.usage?.totalTokens || approxTokens,
        success:true,
        metadata:{ provider_architecture:true, version:VERSION }
      });
      return result.text;
    }catch(error){
      await recordUsage({
        startedAt,
        restaurant:summary.scopeRestaurant,
        analysisType:classifyQuestion(question),
        provider:"local",
        approxTokens,
        success:true,
        metadata:{ provider_error:String(error?.message || error), fallback:true, version:VERSION }
      });
      setLastSource("fallback", { provider_error:String(error?.message || error), fallback:true, version:VERSION });
      return `OpenAI n'a pas répondu. Source : Fallback. Raison : ${String(error?.message || error)}`;
    }
  }

  window.OPS_AI_ACCESS = {
    version:VERSION,
    currentContext,
    canAccessRestaurant,
    buildDataSummary,
    answerWithPermissions,
    recordUsage,
    approximateTokens
  };
})();
