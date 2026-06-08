(function(){
  "use strict";

  const VERSION = "v108";
  const CSI_TARGET = 88;
  const $ = (id) => document.getElementById(id);
  const complaintControl = (id) => $(id) || $({
    complaintRestaurant:"cfComplaintRestaurant"
  }[id] || "");
  const safe = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const number = (value, decimals = 1) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(decimals).replace(".", ",") : "—";
  };
  const percent = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${number(n)} %` : "—";
  };
  const points = (value, suffix = " pts") => {
    const n = Number(value);
    return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${number(n)}${suffix}` : "—";
  };
  const tone = (value, inverse) => {
    const n = Number(value);
    if(!Number.isFinite(n) || Math.abs(n) < .5) return "neutral";
    return (inverse ? n < 0 : n > 0) ? "good" : "bad";
  };

  let timer = 0;
  let observersReady = false;

  function calculate(name){
    if(typeof window[name] !== "function") return null;
    try{
      return window[name]();
    }catch(error){
      console.warn(`Enterprise surface ${name}`, error);
      return null;
    }
  }

  function createSurface(id, className){
    const el = document.createElement("section");
    el.id = id;
    el.className = className;
    return el;
  }

  function placeAfter(anchor, id, className){
    if(!anchor) return null;
    let el = $(id);
    if(!el){
      el = createSurface(id, className);
      anchor.insertAdjacentElement("afterend", el);
    }
    return el;
  }

  function placeFirst(host, id, className){
    if(!host) return null;
    let el = $(id);
    if(!el){
      el = createSurface(id, className);
      host.insertAdjacentElement("afterbegin", el);
    }
    return el;
  }

  function update(el, html){
    if(!el || el.dataset.opsV52Html === html) return;
    el.dataset.opsV52Html = html;
    el.innerHTML = html;
  }

  function badge(label, value, state){
    return `<span class="opsV52Badge ${safe(state || "neutral")}"><b>${safe(label)}</b>${safe(value)}</span>`;
  }

  function directorSummary(scope){
    try{
      return window.OPS_AI_DIRECTOR?.executiveSummary?.(scope) || null;
    }catch(error){
      console.warn("Enterprise surface OPS AI summary", error);
      return null;
    }
  }

  function summaryColumns(summary){
    if(!summary) return "";
    const list = (title, items, state) => `<section class="opsV52SummaryColumn ${state}">
      <h4>${safe(title)}</h4>
      <ul>${items.slice(0, 3).map((item) => `<li>${safe(item)}</li>`).join("")}</ul>
    </section>`;
    return `<div class="opsV52SummaryGrid">
      ${list("Ce qui va bien", summary.positive, "good")}
      ${list("À surveiller", summary.watch, "attention")}
      ${list("Action prioritaire", summary.action, "bad")}
    </div>`;
  }

  function summaryHeader(eyebrow, title, subtitle, scope){
    return `<header class="opsV52InsightHead">
      <div>
        <span class="opsV52Eyebrow">${safe(eyebrow)}</span>
        <h3>${safe(title)}</h3>
        <p>${safe(subtitle)}</p>
      </div>
      ${scope ? `<button class="opsV52DetailBtn" type="button" data-v52-reading="${safe(scope)}">Lecture détaillée</button>` : ""}
    </header>`;
  }

  function renderDashboard(){
    const anchor = document.querySelector("#page-dashboard .execDashHero");
    const data = calculate("calculateNetworkTrends");
    const panel = placeAfter(anchor, "opsV52DashboardInsight", "opsV52Insight opsV52DashboardInsight");
    if(!panel) return;
    if(!data){
      update(panel, `${summaryHeader("Intelligence OPS", "Résumé exécutif du réseau", "Synchronisation des indicateurs en cours.", "dashboard")}`);
      return;
    }
    const improvement = data.improvement?.restaurant || "—";
    const decline = data.decline?.restaurant || "—";
    const concerns = Array.isArray(data.notableDecline) ? data.notableDecline.length : 0;
    const sentence = concerns
      ? `${concerns} restaurant(s) présentent une détérioration notable sur la période. ${decline} mérite la première vérification terrain.`
      : "Aucune détérioration notable n'est détectée sur la période sélectionnée.";
    update(panel, `${summaryHeader("Intelligence OPS", "Résumé exécutif du réseau", sentence, "dashboard")}
      <div class="opsV52BadgeRow">
        ${badge("Ventes", percent(data.salesVariation), tone(data.salesVariation))}
        ${badge(`CSI vs objectif ${CSI_TARGET} %`, points(data.current?.csi == null ? null : data.current.csi - CSI_TARGET), tone(data.current?.csi == null ? null : data.current.csi - CSI_TARGET))}
        ${badge("Délais", points(data.delayVariation, " min"), tone(data.delayVariation, true))}
        ${badge("Plaintes", percent(data.complaintVariation), tone(data.complaintVariation, true))}
        ${badge("Top progression", improvement, "good")}
      </div>
      ${summaryColumns(directorSummary("network"))}`);
  }

  function restaurantName(){
    return $("profileRestaurant")?.value || $("restaurantSelect")?.value || "Restaurant";
  }

  function renderRestaurant(){
    const host = $("profile");
    if(!host) return;
    if(window.OPS_RESTAURANT_PROFILE_V53_ACTIVE){
      $("opsV52RestaurantSignature")?.remove();
      $("opsV52RestaurantInsight")?.remove();
      return;
    }
    const data = calculate("calculateRestaurantInsights");
    const name = data?.restaurant || restaurantName();
    const signature = placeFirst(host, "opsV52RestaurantSignature", "opsV52RestaurantSignature");
    if(signature){
      update(signature, `<div class="opsV52RestaurantTitle">
          <span class="opsV52Eyebrow">Fiche santé opérationnelle</span>
          <h3>${safe(name)}</h3>
          <p>${safe(data?.week || "Période sélectionnée")}</p>
        </div>
        <div class="opsV52RestaurantMeta">
          <div><span>Franchisé</span><strong>—</strong></div>
          <div><span>Gérant</span><strong>—</strong></div>
          <div><span>Téléphone</span><strong>—</strong></div>
          <div><span>Date d'ouverture</span><strong>—</strong></div>
          <div><span>Statut opérationnel</span><strong>—</strong></div>
        </div>`);
    }
    const panel = placeAfter(signature, "opsV52RestaurantInsight", "opsV52Insight opsV52RestaurantInsight");
    if(!panel) return;
    if(!data?.current){
      update(panel, `${summaryHeader("Analyse automatique", "Lecture rapide du restaurant", "Aucune donnée opérationnelle disponible pour la période sélectionnée.", "restaurant")}`);
      return;
    }
    const signals = [
      badge(`CSI vs objectif ${CSI_TARGET} %`, points(data.current?.csi == null ? null : data.current.csi - CSI_TARGET), tone(data.current?.csi == null ? null : data.current.csi - CSI_TARGET)),
      badge("Délais", points(data.delayDelta, " min"), tone(data.delayDelta, true)),
      badge("Plaintes", percent(data.complaintDelta), tone(data.complaintDelta, true)),
      badge("Ventes", percent(data.salesDelta), tone(data.salesDelta))
    ].join("");
    const issues = [];
    if(Number(data.csiDelta) < 0) issues.push("CSI en baisse");
    if(Number(data.delayDelta) > 0) issues.push("délais à surveiller");
    if(Number(data.complaintDelta) > 0) issues.push("plaintes en hausse");
    const sentence = issues.length
      ? `Priorité recommandée : vérifier ${issues.join(", ")} avant le prochain suivi terrain.`
      : "Les indicateurs chargés ne montrent pas de détérioration notable cette semaine.";
    update(panel, `${summaryHeader("Analyse automatique", "Lecture rapide du restaurant", sentence, "restaurant")}
      <div class="opsV52BadgeRow">${signals}</div>
      ${summaryColumns(directorSummary("restaurant"))}`);
  }

  function renderComplaints(){
    const anchor = document.querySelector("#page-complaints .controls");
    const panel = placeAfter(anchor, "opsV52ComplaintsInsight", "opsV52Insight opsV52ComplaintsInsight");
    if(!panel) return;
    const data = calculate("calculateComplaintInsights");
    if(!data){
      update(panel, `${summaryHeader("Intelligence OPS", "Analyse des causes principales", "Synchronise les plaintes pour générer la lecture.", "complaints")}`);
      return;
    }
    const frequent = data.topCategory ? `${data.topCategory.name} (${data.topCategory.count})` : "—";
    const costly = data.costly ? data.costly.name : "—";
    const sentence = data.rows?.length
      ? `${data.rows.length} plainte(s) visibles. La catégorie dominante est ${frequent}.`
      : "Aucune plainte visible pour la sélection active.";
    update(panel, `${summaryHeader("Intelligence OPS", "Analyse des causes principales", sentence, "complaints")}
      <div class="opsV52BadgeRow">
        ${badge("Volume", percent(data.countVariation), tone(data.countVariation, true))}
        ${badge("Compensations", percent(data.amountVariation), tone(data.amountVariation, true))}
        ${badge("Cause fréquente", frequent, "neutral")}
        ${badge("Cause coûteuse", costly, "neutral")}
      </div>`);
  }

  function renderInventory(){
    const root = $("inventoryOps");
    const anchor = root?.querySelector(".inventoryKpis");
    const panel = placeAfter(anchor, "opsV52InventoryInsight", "opsV52Insight opsV52InventoryInsight");
    if(!panel) return;
    const alerts = [...root.querySelectorAll(".inventoryAlert strong")]
      .map((el) => el.textContent.trim())
      .filter(Boolean)
      .slice(0, 4);
    const sentence = alerts.length
      ? `Lecture stock actuelle : ${alerts.join(" · ")}.`
      : "La lecture de rupture apparaîtra lorsque les produits et réglages de stock seront chargés.";
    update(panel, `${summaryHeader("Intelligence inventaire", "Produits à surveiller", sentence, "")}`);
  }

  function removeReportsInsight(){
    $("opsV52ReportsInsight")?.remove();
  }

  function renderSidebar(){
    const brand = document.querySelector(".hero .brand");
    if(!brand) return;
    let context = $("opsV52SidebarContext");
    if(!context){
      context = document.createElement("div");
      context.id = "opsV52SidebarContext";
      context.className = "opsV52SidebarContext";
      brand.insertAdjacentElement("afterend", context);
    }
    const active = document.querySelector(".page.active")?.id || "";
    const selected = active === "page-restaurant"
      ? restaurantName()
      : active === "page-inventory"
        ? ($("inventoryRestaurant")?.value || "Réseau complet")
        : active === "page-complaints"
          ? (complaintControl("complaintRestaurant")?.value || "Réseau complet")
          : "Réseau complet";
    update(context, `<span>Contexte actif</span><strong>${safe(selected === "Tous" ? "Réseau complet" : selected)}</strong>`);

    const complaintsNav = document.querySelector('.menu .nav[data-page="complaints"]');
    if(complaintsNav){
      let navBadge = complaintsNav.querySelector(".opsV52NavBadge");
      const data = calculate("calculateComplaintInsights");
      const count = Array.isArray(data?.rows) ? data.rows.length : 0;
      if(count){
        if(!navBadge){
          navBadge = document.createElement("span");
          navBadge.className = "opsV52NavBadge";
          complaintsNav.appendChild(navBadge);
        }
        navBadge.textContent = count > 99 ? "99+" : String(count);
        navBadge.title = `${count} plainte(s) dans la sélection active`;
      }else if(navBadge){
        navBadge.remove();
      }
    }
  }

  function renderAdminRoute(){
    const selected = document.querySelector('.menu .nav[data-page="admin"].opsAdminRouteActive');
    if(!selected){
      document.querySelector('.menu .nav[data-admin-section="overview"]')?.classList.add("opsAdminRouteActive");
    }
  }

  function render(){
    renderDashboard();
    renderRestaurant();
    renderComplaints();
    renderInventory();
    removeReportsInsight();
    renderSidebar();
    renderAdminRoute();
  }

  function schedule(){
    window.clearTimeout(timer);
    timer = window.setTimeout(render, 90);
  }

  function observe(){
    if(observersReady) return;
    observersReady = true;
    ["executiveDashboard","profile","page-complaints","inventoryOps","page-admin"].forEach((id) => {
      const target = $(id);
      if(target) new MutationObserver(schedule).observe(target, { childList:true, subtree:true });
    });
  }

  function bind(){
    observe();
    document.addEventListener("click", (event) => {
      const reading = event.target.closest("[data-v52-reading]");
      if(reading){
        event.preventDefault();
        window.openOpsIntelligenceReading?.(reading.dataset.v52Reading || "dashboard");
        return;
      }
      const adminRoute = event.target.closest('.menu .nav[data-page="admin"][data-admin-section]');
      if(adminRoute){
        document.querySelectorAll('.menu .nav[data-page="admin"]').forEach((nav) => nav.classList.remove("opsAdminRouteActive"));
        adminRoute.classList.add("opsAdminRouteActive");
        window.setOpsAdminSection?.(adminRoute.dataset.adminSection || "overview");
      }
      schedule();
    }, true);
    document.addEventListener("change", schedule, true);
    window.addEventListener("ops-auth-context", schedule);
    [100, 650, 1600, 3400, 6400].forEach((delay) => window.setTimeout(render, delay));
  }

  window.renderOpsEnterpriseSurfaces = render;
  window.OPS_ENTERPRISE_SURFACES_VERSION = VERSION;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind, { once:true });
  }else{
    bind();
  }
})();
