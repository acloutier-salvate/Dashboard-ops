(function(){
  "use strict";

  const DASHBOARD_ID = "executiveDashboard";
  const DEFAULT_RESTAURANTS = [
    "Lévis","Beauport","Jonquière","Chicoutimi Nord","St-Nicolas","Dolbeau","Alma",
    "St-Augustin","Montmagny","Donnacona","Pont-Rouge","Chicoutimi Sud",
    "Saint-Raymond","Beauport Nord","Roberval","St-Lambert","La Pocatière"
  ];

  const $ = (id) => document.getElementById(id);
  const safe = (value) => String(value == null ? "" : value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
  const num = (value) => {
    if(value == null || String(value).trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const avg = (values) => {
    const nums = values.map(num).filter((n) => n != null);
    return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : null;
  };
  const money = (value) => {
    const n = num(value);
    return n == null ? "—" : n.toLocaleString("fr-CA", { style:"currency", currency:"CAD", maximumFractionDigits:0 });
  };
  const percent = (value) => {
    const n = num(value);
    return n == null ? "—" : `${n.toFixed(1).replace(".", ",")} %`;
  };
  const minutes = (value) => {
    const n = num(value);
    return n == null ? "—" : `${n.toFixed(0)} min`;
  };
  const reducedMotion = () => {
    try{ return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch(e){ return false; }
  };
  const dateLabel = (iso) => {
    if(!iso) return "—";
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-CA", { day:"numeric", month:"short" });
  };
  function canonicalRestaurant(value){
    const raw = String(value || "").trim();
    const key = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    if(key === "straymond" || key === "saintraymond") return "Saint-Raymond";
    return raw;
  }

  function getData(){
    try{
      if(Array.isArray(DATA)) return DATA;
    }catch(e){}
    return Array.isArray(window.DATA) ? window.DATA : [];
  }

  function getAllowedRestaurants(){
    try{
      if(Array.isArray(allowedRestaurants) && allowedRestaurants.length) return allowedRestaurants.map(canonicalRestaurant);
    }catch(e){}
    try{
      const saved = JSON.parse(localStorage.getItem("allowedRestaurants") || "null");
      if(Array.isArray(saved) && saved.length) return saved.map(canonicalRestaurant);
    }catch(e){}
    try{
      if(Array.isArray(RESTAURANTS) && RESTAURANTS.length) return RESTAURANTS.map(canonicalRestaurant);
    }catch(e){}
    return DEFAULT_RESTAURANTS;
  }

  function getWeeks(data){
    return [...new Set(data.map((row) => row.week).filter(Boolean))];
  }

  function selectedWeek(data){
    const value = $("dashWeek")?.value || "latest";
    if(value && value !== "latest") return value;
    const weeks = getWeeks(data);
    return weeks.length ? weeks[weeks.length - 1] : "latest";
  }

  function parseWeek(label){
    const match = String(label || "").match(/(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/);
    if(!match) return null;
    return {
      start: new Date(`${match[1]}T00:00:00`),
      end: new Date(`${match[2]}T23:59:59`),
      startIso: match[1],
      endIso: match[2]
    };
  }

  function hasOperationalData(row){
    return row && (
      num(row.sales) != null ||
      num(row.csi) != null ||
      num(row.delay) != null ||
      num(row.growth) != null
    );
  }

  function rowsForSelection(){
    const data = getData();
    const allowed = new Set(getAllowedRestaurants());
    const week = selectedWeek(data);
    return data.filter((row) => {
      if(!allowed.has(canonicalRestaurant(row.restaurant))) return false;
      if(!hasOperationalData(row)) return false;
      if(week !== "latest" && row.week !== week) return false;
      return true;
    });
  }

  function allRowsForSelectedWeek(){
    const data = getData();
    const allowed = new Set(getAllowedRestaurants());
    const week = selectedWeek(data);
    return data.filter((row) => allowed.has(canonicalRestaurant(row.restaurant)) && hasOperationalData(row) && (week === "latest" || row.week === week));
  }

  function groupRestaurants(rows){
    const map = new Map();
    rows.forEach((row) => {
      if(!hasOperationalData(row)) return;
      const restaurant = canonicalRestaurant(row.restaurant);
      const current = map.get(restaurant) || { restaurant, sales:0, csi:[], delay:[], growth:[], complaints:0 };
      current.sales += num(row.sales) || 0;
      current.csi.push(row.csi);
      current.delay.push(row.delay);
      current.growth.push(row.growth);
      map.set(restaurant, current);
    });
    const activeRestaurants = new Set(map.keys());
    const complaints = complaintsForSelection(activeRestaurants);
    const complaintCounts = complaints.reduce((acc, row) => {
      const restaurant = canonicalRestaurant(row.restaurant);
      acc[restaurant] = (acc[restaurant] || 0) + 1;
      return acc;
    }, {});
    return [...map.values()].map((item) => {
      const csi = avg(item.csi);
      const delay = avg(item.delay);
      const complaintCount = complaintCounts[item.restaurant] || 0;
      return {
        restaurant: item.restaurant,
        sales: item.sales || null,
        csi,
        delay,
        growth: avg(item.growth),
        complaints: complaintCount,
        riskScore: riskScore(csi, delay, complaintCount)
      };
    });
  }

  function complaintsReady(){
    const status = $("cfComplaintsStatus")?.textContent || $("complaintsStatus")?.textContent || "";
    return Array.isArray(window.COMPLAINTS) && (window.COMPLAINTS.length > 0 || status.includes("Plaintes importées"));
  }

  function complaintsForSelection(activeRestaurants){
    if(!complaintsReady()) return [];
    if(activeRestaurants && !activeRestaurants.size) return [];
    const week = parseWeek(selectedWeek(getData()));
    const allowed = new Set(getAllowedRestaurants());
    return (window.COMPLAINTS || []).filter((row) => {
      const restaurant = canonicalRestaurant(row.restaurant);
      if(!allowed.has(restaurant)) return false;
      if(activeRestaurants && activeRestaurants.size && !activeRestaurants.has(restaurant)) return false;
      if(week && row.date instanceof Date){
        return row.date >= week.start && row.date <= week.end;
      }
      return true;
    });
  }

  function riskScore(csi, delay, complaints){
    let score = 0;
    if(csi == null) score += 22;
    else if(csi < 82) score += 48;
    else if(csi < 85) score += 35;
    else if(csi < 88) score += 18;
    if(delay == null) score += 8;
    else if(delay > 45) score += 34;
    else if(delay > 38) score += 22;
    else if(delay > 32) score += 10;
    if(complaints >= 8) score += 34;
    else if(complaints >= 4) score += 22;
    else if(complaints >= 1) score += 8;
    return Math.min(100, score);
  }

  function riskLabel(score){
    if(score >= 70) return "Critique";
    if(score >= 45) return "Élevé";
    if(score >= 25) return "Moyen";
    return "Faible";
  }

  function riskClass(score){
    if(score >= 70) return "critical";
    if(score >= 45) return "high";
    if(score >= 25) return "medium";
    return "low";
  }

  function sparkline(values, color){
    const nums = values.map(num).filter((n) => n != null).slice(-10);
    if(nums.length < 2) return "<span></span>";
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = max - min || 1;
    const points = nums.map((value, index) => {
      const x = (index / (nums.length - 1)) * 100;
      const y = 32 - ((value - min) / span) * 26;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return `<svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><polygon points="0,36 ${points} 100,36" fill="${color}" opacity=".10"/></svg>`;
  }

  function renderKpis(rows, restaurantRows){
    const activeRestaurants = new Set(restaurantRows.map((row) => row.restaurant));
    const complaints = complaintsForSelection(activeRestaurants);
    const complaintsKnown = complaintsReady();
    const promos = activePromos();
    const sales = rows.reduce((sum, row) => sum + (num(row.sales) || 0), 0);
    const csi = avg(rows.map((row) => row.csi));
    const delay = avg(rows.map((row) => row.delay));
    const growth = avg(rows.map((row) => row.growth));
    const complaintCost = complaints.reduce((sum, row) => sum + (num(row.amount) || 0), 0);

    animateKpi("dashSales", rows.length ? sales : null, money);
    setText("dashGrowth", percent(growth));
    animateKpi("dashCsi", csi, percent);
    animateKpi("dashDelay", delay, minutes);
    animateKpi("execComplaintsKpi", complaintsKnown ? complaints.length : null, (value) => String(Math.round(value)));
    setText("execComplaintsCost", complaintsKnown ? `Coût total ${money(complaintCost)}` : "Coût total —");
    const restaurantCount = restaurantRows.filter((row) => row.sales != null || row.csi != null || row.delay != null).length;
    animateKpi("execRestaurantCount", restaurantCount || null, (value) => String(Math.round(value)));
    animateKpi("execPromoCount", promos.length ? promos.length : null, (value) => String(Math.round(value)));
    setText("execSalesTrend", growth == null ? "Période sélectionnée" : `${growth >= 0 ? "+" : ""}${growth.toFixed(1).replace(".", ",")} % vs référence`);

    const weekRows = allRowsForSelectedWeek();
    $("execSalesSpark") && ($("execSalesSpark").innerHTML = sparkline(seriesByWeek("sales", "sum"), "#5ee66b"));
    $("execCsiSpark") && ($("execCsiSpark").innerHTML = sparkline(seriesByWeek("csi", "avg"), "#8b5cf6"));
    $("execDelaySpark") && ($("execDelaySpark").innerHTML = sparkline(seriesByWeek("delay", "avg"), "#2f8cff"));
    $("execComplaintSpark") && ($("execComplaintSpark").innerHTML = sparkline(complaintsByWeek(), "#ff4d57"));
    $("execRestaurantSpark") && ($("execRestaurantSpark").innerHTML = sparkline(weekRows.map((row) => row.csi), "#f59e0b"));
    $("execPromoSpark") && ($("execPromoSpark").innerHTML = sparkline([1,2,1,3,2,4,3,5,Math.max(1,promos.length)], "#14d8c8"));
  }

  function seriesByWeek(field, mode){
    const data = getData();
    const allowed = new Set(getAllowedRestaurants());
    return getWeeks(data).map((week) => {
      const rows = data.filter((row) => row.week === week && allowed.has(canonicalRestaurant(row.restaurant)));
      if(mode === "sum") return rows.reduce((sum, row) => sum + (num(row[field]) || 0), 0);
      return avg(rows.map((row) => row[field]));
    }).filter((value) => value != null);
  }

  function complaintsByWeek(){
    if(!complaintsReady()) return [];
    const data = getData();
    const allowed = new Set(getAllowedRestaurants());
    return getWeeks(data).map((weekLabel) => {
      const week = parseWeek(weekLabel);
      if(!week) return 0;
      const active = new Set(data
        .filter((row) => allowed.has(canonicalRestaurant(row.restaurant)) && hasOperationalData(row) && row.week === weekLabel)
        .map((row) => canonicalRestaurant(row.restaurant)));
      if(!active.size) return 0;
      return (window.COMPLAINTS || []).filter((row) => active.has(canonicalRestaurant(row.restaurant)) && row.date instanceof Date && row.date >= week.start && row.date <= week.end).length;
    });
  }

  function setText(id, value){
    const el = $(id);
    if(el) el.textContent = value;
  }

  function animateKpi(id, value, formatter){
    const el = $(id);
    if(!el) return;
    if(value == null || !Number.isFinite(Number(value))){
      el.textContent = "—";
      el.dataset.execTarget = "";
      return;
    }
    const target = Number(value);
    const finalText = formatter(target);
    const key = `${target}:${finalText}`;
    if(el.dataset.execTarget === key && el.textContent === finalText) return;
    el.dataset.execTarget = key;
    if(reducedMotion() || typeof window.requestAnimationFrame !== "function"){
      el.textContent = finalText;
      return;
    }
    const nowValue = () => (window.performance && typeof window.performance.now === "function") ? window.performance.now() : Date.now();
    const startTime = nowValue();
    const duration = 620;
    const tick = () => {
      const now = nowValue();
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatter(target * eased);
      if(t < 1){
        window.requestAnimationFrame(tick);
      }else{
        el.textContent = finalText;
      }
    };
    tick();
  }

  function tableRows(rows, mode){
    if(!rows.length) return `<div class="execEmpty">Aucune donnée disponible.</div>`;
    const body = rows.slice(0,5).map((row, index) => {
      const rank = index + 1;
      const risk = riskLabel(row.riskScore);
      return `
        <div class="execTableRow ${mode === "risk" ? `riskrow ${riskClass(row.riskScore)}` : ""}">
          <span class="execRank">${rank}</span>
          <strong>${safe(row.restaurant)}</strong>
          <span>${percent(row.csi)}</span>
          <span>${money(row.sales)}</span>
          <span>${minutes(row.delay)}</span>
          ${mode === "risk" ? `<em>${risk}</em>` : ""}
        </div>`;
    }).join("");
    const header = mode === "risk"
      ? `<div class="execTableHead risk"><span></span><span>Restaurant</span><span>CSI</span><span>Ventes</span><span>Délai</span><span>Risque</span></div>`
      : `<div class="execTableHead"><span></span><span>Restaurant</span><span>CSI</span><span>Ventes</span><span>Délai</span></div>`;
    return header + body;
  }

  function renderRestaurants(restaurantRows){
    const withData = restaurantRows.filter((row) => row.sales != null || row.csi != null || row.delay != null);
    const top = [...withData].sort((a,b) => (b.csi ?? -1) - (a.csi ?? -1) || (b.sales || 0) - (a.sales || 0));
    const bottom = [...withData].sort((a,b) => (a.csi ?? 999) - (b.csi ?? 999) || (b.delay || 0) - (a.delay || 0));
    const topBox = $("execTopRestaurants");
    const bottomBox = $("execBottomRestaurants");
    if(topBox) topBox.innerHTML = tableRows(top, "top");
    if(bottomBox) bottomBox.innerHTML = tableRows(bottom, "bottom");
    renderCsiGraph(withData);
  }

  function renderCsiGraph(restaurantRows){
    const box = $("execCsiGraph");
    if(!box) return;
    const rows = restaurantRows
      .filter((row) => row.csi != null)
      .sort((a,b) => (b.csi || 0) - (a.csi || 0));
    if(!rows.length){
      box.innerHTML = `<div class="execEmpty">Aucune donnée CSI disponible.</div>`;
      return;
    }
    box.innerHTML = rows.map((row, index) => {
      const value = Math.max(0, Math.min(100, Number(row.csi) || 0));
      const tone = value >= 88 ? "good" : value >= 85 ? "watch" : "low";
      return `
        <div class="execCsiBar ${tone}" style="--bar:${value}%;--delay:${Math.min(index * 38, 420)}ms">
          <strong>${safe(row.restaurant)}</strong>
          <div class="execCsiTrack"><i></i></div>
          <span>${percent(value)}</span>
        </div>`;
    }).join("");
  }

  function renderNetworkRestaurants(restaurantRows){
    const box = $("execNetworkRestaurants");
    if(!box) return;
    const rows = restaurantRows
      .filter((row) => row.sales != null || row.csi != null || row.delay != null)
      .sort((a,b) => a.restaurant.localeCompare(b.restaurant, "fr"));
    if(!rows.length){
      box.innerHTML = `<div class="execEmpty">Aucune donnée réseau disponible.</div>`;
      return;
    }
    box.innerHTML = `
      <div class="execNetworkHead"><span>Restaurant</span><span>Ventes</span><span>CSI</span><span>Délai</span><span>Plaintes</span></div>
      ${rows.map((row) => `
        <div class="execNetworkRow">
          <strong>${safe(row.restaurant)}</strong>
          <span>${money(row.sales)}</span>
          <span>${percent(row.csi)}</span>
          <span>${minutes(row.delay)}</span>
          <span>${row.complaints == null ? "—" : row.complaints}</span>
        </div>`).join("")}`;
  }

  function activePromos(){
    let events = [];
    try{
      if(typeof window.pc409GetCalendarEvents === "function") events = window.pc409GetCalendarEvents() || [];
    }catch(e){}
    if(!events.length){
      try{ events = JSON.parse(localStorage.getItem("pc409_manual_events") || "[]"); }catch(e){}
    }
    const week = parseWeek(selectedWeek(getData()));
    const start = week ? week.start : new Date();
    const end = week ? week.end : new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59);
    return events.filter((event) => {
      const category = String(event.category || "").toLowerCase();
      if(category !== "promo" && category !== "sms") return false;
      const eventStart = new Date(`${event.start || event.date}T00:00:00`);
      const eventEnd = new Date(`${event.end || event.start || event.date}T23:59:59`);
      if(Number.isNaN(eventStart.getTime())) return false;
      return eventStart <= end && eventEnd >= start;
    }).sort((a,b) => String(a.start).localeCompare(String(b.start))).slice(0,6);
  }

  function renderPromos(){
    const box = $("execPromos");
    if(!box) return;
    const promos = activePromos();
    if(!promos.length){
      box.innerHTML = `<div class="execEmpty">Aucune promo active pour cette période.</div>`;
      return;
    }
    box.innerHTML = `
      <div class="execPromoHead"><span>Promo</span><span>Début</span><span>Fin</span><span>Statut</span></div>
      ${promos.map((event) => `
        <div class="execPromoRow">
          <strong>${safe(event.title || "Promo")}</strong>
          <span>${dateLabel(event.start)}</span>
          <span>${dateLabel(event.end || event.start)}</span>
          <em>Active</em>
        </div>`).join("")}`;
  }

  function render(){
    const dashboard = $(DASHBOARD_ID);
    if(!dashboard) return;
    const rows = rowsForSelection();
    const restaurantRows = groupRestaurants(allRowsForSelectedWeek());
    renderKpis(rows, restaurantRows);
    renderRestaurants(restaurantRows);
    renderNetworkRestaurants(restaurantRows);
    renderPromos();
    const clearLoading = () => dashboard.classList.remove("is-loading");
    if(typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => setTimeout(clearLoading, 120));
    else setTimeout(clearLoading, 120);
    setTimeout(() => { try{ window.animateVisibleValues?.($("page-dashboard")); }catch(e){} }, 80);
  }

  function installHooks(){
    if(window.__EXEC_DASH_HOOKED__) return;
    window.__EXEC_DASH_HOOKED__ = true;
    const originalUpdate = window.updateDashboard;
    if(typeof originalUpdate === "function"){
      window.updateDashboard = function(){
        const result = originalUpdate.apply(this, arguments);
        setTimeout(render, 0);
        return result;
      };
    }
    ["syncComplaints","syncComplaintsFinal"].forEach((name) => {
      const fn = window[name];
      if(typeof fn !== "function" || fn.__execWrapped) return;
      window[name] = function(){
        const result = fn.apply(this, arguments);
        Promise.resolve(result).then(() => {
          try{ if(typeof window.updateRestaurant === "function") window.updateRestaurant(); }catch(e){ console.error(e); }
          setTimeout(render, 0);
        }).catch(() => setTimeout(render, 0));
        return result;
      };
      window[name].__execWrapped = true;
    });
  }

  function bind(){
    installHooks();
    ["dashWeek"].forEach((id) => {
      const field = $(id);
      if(field) field.addEventListener("change", render);
    });
    const refresh = $("btnDashRefresh");
    if(refresh) refresh.addEventListener("click", render);
    render();
    [200, 800, 1800, 3500, 7000, 10000].forEach((delay) => {
      setTimeout(() => { installHooks(); render(); }, delay);
    });
  }

  window.renderExecutiveDashboard = render;
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind);
  }else{
    bind();
  }
})();
