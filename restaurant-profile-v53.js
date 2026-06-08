(function(){
  "use strict";

  const VERSION = "v111";
  const CSI_TARGET = 88;
  const DELAY_TARGET = 33.23;
  const state = {
    restaurantRows:null,
    profiles:new Map(),
    loading:"",
    message:"",
    timer:0,
    bound:false
  };

  const $ = (id) => document.getElementById(id);
  const safe = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const norm = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const fixed = (value, decimals = 1) => num(value) == null ? "—" : num(value).toFixed(decimals).replace(".", ",");
  const signed = (value, suffix = "") => num(value) == null ? "—" : `${num(value) >= 0 ? "+" : ""}${fixed(value)}${suffix}`;
  const money = (value) => num(value) == null ? "—" : num(value).toLocaleString("fr-CA", {style:"currency", currency:"CAD", maximumFractionDigits:0});
  const activeRestaurant = () => $("profileRestaurant")?.value || $("restaurantSelect")?.value || "";
  const client = () => window.OPS_SUPABASE_CLIENT || null;
  const profileKey = (restaurant) => norm(restaurant);

  window.OPS_RESTAURANT_PROFILE_V53_ACTIVE = true;

  function toast(message){
    if(typeof window.toast === "function"){
      try{ window.toast(message); return; }catch(error){}
    }
    console.info(message);
  }

  function getData(){
    try{ if(Array.isArray(DATA)) return DATA.slice(); }catch(error){}
    return Array.isArray(window.DATA) ? window.DATA.slice() : [];
  }

  function getComplaints(){
    try{
      if(typeof window.getAllComplaints === "function"){
        const rows = window.getAllComplaints();
        if(Array.isArray(rows)) return rows.slice();
      }
    }catch(error){}
    return Array.isArray(window.COMPLAINTS) ? window.COMPLAINTS.slice() : [];
  }

  function complaintDate(row){
    if(row?.date instanceof Date && !Number.isNaN(row.date.getTime())) return row.date;
    const parsed = new Date(row?.dateIso || row?.date || "");
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function calculate(name){
    try{ return typeof window[name] === "function" ? window[name]() : null; }
    catch(error){ console.warn(`Restaurant profile ${name}`, error); return null; }
  }

  function director(){
    try{ return window.OPS_AI_DIRECTOR?.analyzeRestaurant?.() || null; }
    catch(error){ console.warn("Restaurant profile OPS AI", error); return null; }
  }

  function statusFor(analysis, insights){
    const risks = analysis?.risks || [];
    if(risks.some((item) => item.level === "critical")) return {label:"Intervention requise", tone:"critical"};
    if(risks.length || (insights?.current?.csi != null && insights.current.csi < CSI_TARGET)) return {label:"Attention requise", tone:"attention"};
    return {label:"Opérationnel", tone:"good"};
  }

  function profileFor(restaurant){
    return state.profiles.get(profileKey(restaurant)) || null;
  }

  async function resolveRestaurantRow(restaurant){
    if(!restaurant) return null;
    const supabase = client();
    if(!supabase) return null;
    if(!state.restaurantRows){
      const {data, error} = await supabase.from("restaurants").select("id,name,active").order("name");
      if(error) throw error;
      state.restaurantRows = data || [];
    }
    return state.restaurantRows.find((row) => norm(row.name) === norm(restaurant)) || null;
  }

  async function loadProfile(restaurant, force){
    const key = profileKey(restaurant);
    if(!key) return render();
    if(!force && state.profiles.has(key)) return render();
    const supabase = client();
    if(!supabase || !window.OPS_AUTH_READY){
      state.message = "Connexion Supabase requise pour charger les informations du restaurant.";
      return render();
    }
    state.loading = key;
    state.message = "";
    render();
    try{
      const restaurantRow = await resolveRestaurantRow(restaurant);
      if(!restaurantRow) throw new Error("Restaurant introuvable dans Supabase.");
      const {data, error} = await supabase
        .from("restaurant_profiles")
        .select("restaurant_id,franchisee,manager_name,phone,opening_date,updated_at,updated_by")
        .eq("restaurant_id", restaurantRow.id)
        .maybeSingle();
      if(error) throw error;
      state.profiles.set(key, Object.assign({
        restaurant_id:restaurantRow.id,
        restaurant_name:restaurantRow.name,
        franchisee:"",
        manager_name:"",
        phone:""
      }, data || {}));
    }catch(error){
      console.warn("Restaurant profile Supabase", error);
      const raw = String(error?.message || error || "");
      state.message = raw.includes("restaurant_profiles") || raw.includes("schema cache") || raw.includes("Could not find")
        ? "Profils restaurants non activés. Exécute SUPABASE_RESTAURANT_PROFILES_V109.sql dans Supabase."
        : `Profil restaurant indisponible : ${raw}`;
    }finally{
      state.loading = "";
      render();
    }
  }

  function infoValue(value){
    return String(value || "").trim() || "—";
  }

  function meta(label, value){
    return `<div><span>${safe(label)}</span><strong>${safe(infoValue(value))}</strong></div>`;
  }

  function summaryItem(text, stateName){
    return `<li class="${safe(stateName || "neutral")}"><i></i><span>${safe(text)}</span></li>`;
  }

  function analysisNarrative(insights, analysis){
    if(!insights?.current) return ["Aucune donnée opérationnelle disponible pour la période sélectionnée."];
    const lines = [];
    if(insights.current.csi != null) lines.push(`CSI à ${fixed(insights.current.csi)} %, ${signed(insights.current.csi - CSI_TARGET, " pts")} vs objectif ${CSI_TARGET} %.`);
    if(insights.current.delay != null) lines.push(`Délai moyen à ${fixed(insights.current.delay)} min, ${signed(insights.current.delay - DELAY_TARGET, " min")} vs cible.`);
    if(insights.complaintDelta != null) lines.push(`Plaintes ${insights.complaintDelta > 0 ? "en hausse" : insights.complaintDelta < 0 ? "en baisse" : "stables"} de ${signed(insights.complaintDelta, " %")} vs semaine précédente.`);
    if(insights.salesGrowth != null) lines.push(`Augmentation des ventes à ${signed(insights.salesGrowth, " %")} selon l'indicateur opérationnel.`);
    const recommendation = analysis?.risks?.[0]?.action || "Maintenir les pratiques actuelles et poursuivre le suivi régulier.";
    lines.push(`Recommandation : ${recommendation}`);
    return lines;
  }

  function opportunityCards(analysis){
    const rows = (analysis?.opportunities || []).slice(0, 4);
    if(!rows.length) return `<div class="opsRestaurantV53Empty">Aucune opportunité confirmée avec les données chargées.</div>`;
    return rows.map((item) => `<article><b>✓</b><div><strong>${safe(item.observation)}</strong><span>Indicateur favorable observé</span></div></article>`).join("");
  }

  function riskCards(analysis){
    const rows = (analysis?.risks || []).slice(0, 4);
    if(!rows.length) return `<div class="opsRestaurantV53Empty">Aucune intervention prioritaire détectée.</div>`;
    return rows.map((item) => `<article><b>!</b><div><strong>${safe(item.title)}</strong><span>${safe(item.observation)}</span><em>${safe(item.level === "critical" ? "Priorité élevée" : "À surveiller")}</em></div></article>`).join("");
  }

  function sparkline(values, toneName){
    const points = values.map(num).filter((value) => value != null);
    if(points.length < 2) return `<span class="opsRestaurantV53NoChart">—</span>`;
    const width = 128;
    const height = 34;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const line = points.map((value, index) => {
      const x = points.length === 1 ? 0 : index * width / (points.length - 1);
      const y = height - ((value - min) / range * (height - 6) + 3);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return `<svg class="opsRestaurantV53Spark ${safe(toneName || "good")}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${line}"></polyline></svg>`;
  }

  function trendRows(restaurant){
    return getData()
      .filter((row) => norm(row.restaurant) === norm(restaurant))
      .sort((a, b) => String(a.week || "").localeCompare(String(b.week || ""), "fr"))
      .slice(-8);
  }

  function complaintSeries(restaurant, rows){
    const complaints = getComplaints().filter((row) => norm(row.restaurant) === norm(restaurant));
    return rows.map((row) => {
      const range = String(row.week || "").match(/(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/);
      if(!range) return 0;
      const start = new Date(`${range[1]}T00:00:00`);
      const end = new Date(`${range[2]}T23:59:59`);
      return complaints.filter((item) => {
        const date = complaintDate(item);
        return date && date >= start && date <= end;
      }).length;
    });
  }

  function comparisonItem(label, current, network, lowerBetter, suffix){
    const a = num(current);
    const b = num(network);
    const max = Math.max(Math.abs(a || 0), Math.abs(b || 0), 1);
    const delta = a == null || b == null ? null : a - b;
    const good = delta == null ? "neutral" : (lowerBetter ? delta <= 0 : delta >= 0) ? "good" : "bad";
    return `<article>
      <header><strong>${safe(label)}</strong><span class="${good}">${safe(delta == null ? "—" : signed(delta, suffix || ""))}</span></header>
      <div class="opsRestaurantV53CompareTrack"><i style="width:${a == null ? 0 : Math.max(4, Math.min(100, Math.abs(a) / max * 100))}%"></i></div>
      <footer><span>Restaurant <b>${safe(a == null ? "—" : fixed(a) + (suffix || ""))}</b></span><span>Réseau <b>${safe(b == null ? "—" : fixed(b) + (suffix || ""))}</b></span></footer>
    </article>`;
  }

  function timeline(restaurant, profile){
    const items = [];
    if(profile?.updated_at) items.push({date:new Date(profile.updated_at), title:"Informations du restaurant mises à jour", type:"Profil"});
    getComplaints()
      .filter((row) => norm(row.restaurant) === norm(restaurant))
      .map((row) => ({date:complaintDate(row), title:`Plainte ${row.type || "client"}`, type:"Plaintes"}))
      .filter((item) => item.date)
      .sort((a, b) => b.date - a.date)
      .slice(0, 2)
      .forEach((item) => items.push(item));
    ["dashboard_ops_audits", "audits"].forEach((key) => {
      try{
        JSON.parse(localStorage.getItem(key) || "[]")
          .filter((row) => norm(row.restaurant || row.resto) === norm(restaurant))
          .slice(0, 2)
          .forEach((row) => items.push({date:new Date(row.date || row.createdAt), title:"Audit terrain sauvegardé", type:"Audit"}));
      }catch(error){}
    });
    try{
      for(let index = 0; index < localStorage.length; index += 1){
        const key = localStorage.key(index) || "";
        if(!key.startsWith("dashboard_ops_inventory_history_v1") || !norm(key).includes(norm(restaurant))) continue;
        const rows = JSON.parse(localStorage.getItem(key) || "[]");
        if(rows[0]?.count_date) items.push({date:new Date(rows[0].count_date), title:"Inventaire sauvegardé", type:"Inventaire"});
      }
    }catch(error){}
    const sorted = items.filter((item) => item.date instanceof Date && !Number.isNaN(item.date.getTime()))
      .sort((a, b) => b.date - a.date)
      .slice(0, 6);
    return sorted.length
      ? sorted.map((item) => `<li><time>${safe(item.date.toLocaleDateString("fr-CA", {day:"numeric", month:"short"}))}</time><div><strong>${safe(item.title)}</strong><span>${safe(item.type)}</span></div></li>`).join("")
      : `<li><div><strong>Aucune activité récente disponible.</strong><span>Les prochains événements apparaîtront ici.</span></div></li>`;
  }

  function ensureShell(){
    const page = $("page-restaurant");
    const controls = page?.querySelector(".controls");
    if(!page || !controls) return null;
    let shell = $("opsRestaurantV53Shell");
    if(!shell){
      shell = document.createElement("div");
      shell.id = "opsRestaurantV53Shell";
      shell.className = "opsRestaurantV53Shell";
      controls.insertAdjacentElement("afterend", shell);
    }
    return shell;
  }

  function ensureBottomShell(){
    const profile = $("profile");
    if(!profile) return null;
    let shell = $("opsRestaurantV53BottomShell");
    if(!shell){
      shell = document.createElement("div");
      shell.id = "opsRestaurantV53BottomShell";
      shell.className = "opsRestaurantV53Shell opsRestaurantV53BottomShell";
      profile.insertAdjacentElement("afterend", shell);
    }
    return shell;
  }

  function ensureModal(){
    let modal = $("opsRestaurantProfileModal");
    if(modal) return modal;
    modal = document.createElement("div");
    modal.id = "opsRestaurantProfileModal";
    modal.className = "opsRestaurantProfileModal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="opsRestaurantProfileBackdrop" data-v53-close-profile></div>
      <section class="opsRestaurantProfileDialog" role="dialog" aria-modal="true" aria-labelledby="opsRestaurantProfileModalTitle">
        <header>
          <div><span>Profil restaurant</span><h3 id="opsRestaurantProfileModalTitle">Modifier les informations</h3></div>
          <button type="button" aria-label="Fermer" data-v53-close-profile>×</button>
        </header>
        <label>Franchisé<textarea id="opsRestaurantFranchisee" rows="4"></textarea></label>
        <label>Gérant<input id="opsRestaurantManager" type="text"></label>
        <label>Téléphone<input id="opsRestaurantPhone" type="tel"></label>
        <div class="opsRestaurantProfileActions">
          <button type="button" class="btn" data-v53-close-profile>Annuler</button>
          <button type="button" class="btn red" id="opsRestaurantSaveProfile">Sauvegarder</button>
        </div>
      </section>`;
    document.body.appendChild(modal);
    return modal;
  }

  function openModal(){
    const restaurant = activeRestaurant();
    const profile = profileFor(restaurant);
    if(!profile) return toast(state.message || "Profil Supabase non disponible.");
    const modal = ensureModal();
    $("opsRestaurantFranchisee").value = profile.franchisee || "";
    $("opsRestaurantManager").value = profile.manager_name || "";
    $("opsRestaurantPhone").value = profile.phone || "";
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("show"));
  }

  function closeModal(){
    const modal = $("opsRestaurantProfileModal");
    if(!modal) return;
    modal.classList.remove("show");
    window.setTimeout(() => { modal.hidden = true; }, 160);
  }

  async function saveProfile(){
    const restaurant = activeRestaurant();
    const key = profileKey(restaurant);
    const existing = profileFor(restaurant);
    const supabase = client();
    if(!existing?.restaurant_id || !supabase) return toast("Profil Supabase non disponible.");
    const button = $("opsRestaurantSaveProfile");
    if(button) button.disabled = true;
    try{
      const payload = {
        restaurant_id:existing.restaurant_id,
        franchisee:$("opsRestaurantFranchisee")?.value?.trim() || null,
        manager_name:$("opsRestaurantManager")?.value?.trim() || null,
        phone:$("opsRestaurantPhone")?.value?.trim() || null,
        updated_by:window.OPS_AUTH_CONTEXT?.user?.id || null
      };
      const {data, error} = await supabase
        .from("restaurant_profiles")
        .upsert(payload, {onConflict:"restaurant_id"})
        .select("restaurant_id,franchisee,manager_name,phone,opening_date,updated_at,updated_by")
        .maybeSingle();
      if(error) throw error;
      state.profiles.set(key, Object.assign({}, existing, data || payload));
      closeModal();
      render();
      toast("Informations du restaurant sauvegardées");
    }catch(error){
      console.error("Restaurant profile save", error);
      toast(`Sauvegarde impossible : ${error.message || error}`);
    }finally{
      if(button) button.disabled = false;
    }
  }

  function render(){
    $("opsV52RestaurantSignature")?.remove();
    $("opsV52RestaurantInsight")?.remove();
    const shell = ensureShell();
    const bottomShell = ensureBottomShell();
    if(!shell || !bottomShell) return;
    const restaurant = activeRestaurant() || "Restaurant";
    const profile = profileFor(restaurant);
    const insights = calculate("calculateRestaurantInsights");
    const analysis = director();
    const status = statusFor(analysis, insights);
    const trends = trendRows(restaurant);
    const complaints = complaintSeries(restaurant, trends);
    const network = insights?.network || {};
    const networkRestaurantCount = network.activeRestaurants || 0;
    const averageSales = networkRestaurantCount ? (network.sales || 0) / networkRestaurantCount : null;
    const averageComplaints = networkRestaurantCount ? (network.complaints || 0) / networkRestaurantCount : null;
    const profileNotice = state.loading === profileKey(restaurant)
      ? "Chargement des informations Supabase..."
      : state.message;
    shell.innerHTML = `
      <section class="opsRestaurantV53Hero">
        <div>
          <span class="opsRestaurantV53Eyebrow">Fiche santé opérationnelle</span>
          <div class="opsRestaurantV53TitleRow">
            <h2>${safe(restaurant)}</h2>
            <strong class="opsRestaurantV53Status ${safe(status.tone)}"><i></i>${safe(status.label)}</strong>
          </div>
          <p>${safe(insights?.week || "Période sélectionnée")}</p>
        </div>
        <div class="opsRestaurantV53Meta">
          ${meta("Franchisé", profile?.franchisee)}
          ${meta("Gérant", profile?.manager_name)}
          ${meta("Téléphone", profile?.phone)}
        </div>
        <button class="opsRestaurantV53Edit" type="button" data-v53-edit-profile>Modifier les informations</button>
        ${profileNotice ? `<small class="opsRestaurantV53Notice">${safe(profileNotice)}</small>` : ""}
      </section>

      <section class="opsRestaurantV53Ai">
        <header><div><span>OPS AI</span><h3>Analyse OPS AI</h3></div><strong class="opsRestaurantV53AiStatus"><i></i>Lecture active</strong></header>
        <ul>${analysisNarrative(insights, analysis).map((line, index) => summaryItem(line, index === 4 ? "good" : index ? "attention" : "neutral")).join("")}</ul>
      </section>

      <div class="opsRestaurantV53FocusGrid">
        <section class="opsRestaurantV53Focus good"><h3>✓ Ce qui va bien</h3><div>${opportunityCards(analysis)}</div></section>
        <section class="opsRestaurantV53Focus critical"><h3>! Intervention requise</h3><div>${riskCards(analysis)}</div></section>
      </div>`;
    bottomShell.innerHTML = `
      <section class="opsRestaurantV53Compare">
        <header><div><span>Performance relative</span><h3>Comparatif avec le réseau</h3></div></header>
        <div>
          ${comparisonItem("CSI", insights?.current?.csi, network.csi, false, " %")}
          ${comparisonItem("Délai", insights?.current?.delay, network.delay, true, " min")}
          ${comparisonItem("Plaintes", insights?.complaints?.length, averageComplaints, true, "")}
          ${comparisonItem("Ventes", insights?.current?.sales, averageSales, false, " $")}
        </div>
      </section>

      <section class="opsRestaurantV53BottomGrid">
        <div class="opsRestaurantV53Trends">
          <header><span>8 dernières semaines</span><h3>Tendances opérationnelles</h3></header>
          <div>
            <article><span>CSI</span><strong>${safe(insights?.current?.csi == null ? "—" : fixed(insights.current.csi) + " %")}</strong>${sparkline(trends.map((row) => row.csi), "good")}</article>
            <article><span>Délai</span><strong>${safe(insights?.current?.delay == null ? "—" : fixed(insights.current.delay) + " min")}</strong>${sparkline(trends.map((row) => row.delay), "attention")}</article>
            <article><span>Plaintes</span><strong>${safe(insights?.complaints?.length == null ? "—" : String(insights.complaints.length))}</strong>${sparkline(complaints, "critical")}</article>
            <article><span>Ventes</span><strong>${safe(insights?.current?.sales == null ? "—" : money(insights.current.sales))}</strong>${sparkline(trends.map((row) => row.sales), "good")}</article>
          </div>
        </div>
        <div class="opsRestaurantV53Timeline">
          <header><span>Historique</span><h3>Activité récente</h3></header>
          <ul>${timeline(restaurant, profile)}</ul>
        </div>
      </section>`;
  }

  function schedule(forceLoad){
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      render();
      const restaurant = activeRestaurant();
      if(restaurant && (forceLoad || !state.profiles.has(profileKey(restaurant)))) loadProfile(restaurant, Boolean(forceLoad));
    }, 80);
  }

  function bind(){
    if(state.bound) return;
    state.bound = true;
    ensureModal();
    document.addEventListener("change", (event) => {
      if(event.target?.id === "profileRestaurant") schedule(true);
      if(event.target?.id === "profileWeek") schedule(false);
    }, true);
    document.addEventListener("click", (event) => {
      if(event.target.closest("[data-v53-edit-profile]")) openModal();
      if(event.target.closest("[data-v53-close-profile]")) closeModal();
      if(event.target.closest("#btnProfileRefresh")) window.setTimeout(() => schedule(true), 120);
    }, true);
    $("opsRestaurantSaveProfile")?.addEventListener("click", saveProfile);
    window.addEventListener("ops-auth-context", () => {
      state.restaurantRows = null;
      state.profiles.clear();
      state.message = "";
      schedule(true);
    });
    const profile = $("profile");
    if(profile) new MutationObserver(() => schedule(false)).observe(profile, {childList:true, subtree:true});
    [150, 900, 2600].forEach((delay) => window.setTimeout(() => schedule(delay === 900), delay));
  }

  window.renderRestaurantProfileV53 = render;
  window.refreshRestaurantProfileV53 = () => schedule(true);
  window.OPS_RESTAURANT_PROFILE_V53_VERSION = VERSION;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind, {once:true});
  }else{
    bind();
  }
})();
