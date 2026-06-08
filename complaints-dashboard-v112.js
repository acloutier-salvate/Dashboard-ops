(function(){
  "use strict";

  const VERSION = "v509";
  const STORAGE_KEY = "dashboard_ops_complaints_dashboard_collapsed";
  const $ = (id) => document.getElementById(id);
  const safe = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const norm = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const num = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const money = (value) => {
    const parsed = num(value);
    return parsed == null ? "—" : parsed.toLocaleString("fr-CA", {style:"currency", currency:"CAD", minimumFractionDigits:2, maximumFractionDigits:2});
  };
  const fixed = (value, decimals = 1) => {
    const parsed = num(value);
    return parsed == null ? "—" : parsed.toFixed(decimals).replace(".", ",");
  };
  const percent = (value) => {
    const parsed = num(value);
    return parsed == null ? "—" : `${parsed >= 0 ? "+" : ""}${fixed(parsed)} %`;
  };
  const dateOf = (row) => {
    if(row?.date instanceof Date && !Number.isNaN(row.date.getTime())) return row.date;
    const parsed = new Date(row?.dateIso || row?.date || "");
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const sum = (rows, selector) => rows.reduce((total, row) => total + (num(selector(row)) || 0), 0);
  const variation = (current, previous) => {
    if(previous === 0) return current === 0 ? 0 : null;
    return (current - previous) / Math.abs(previous) * 100;
  };

  let renderTimer = 0;
  let bound = false;
  let lastMarkup = "";
  let lastSource = null;
  let lastRenderKey = "";

  function getAll(){
    try{
      if(typeof window.getAllComplaints === "function"){
        const rows = window.getAllComplaints();
        if(Array.isArray(rows)) return rows.slice();
      }
    }catch(error){}
    return Array.isArray(window.COMPLAINTS) ? window.COMPLAINTS.slice() : [];
  }

  function getFiltered(){
    try{
      if(typeof window.filteredComplaints === "function"){
        const rows = window.filteredComplaints();
        if(Array.isArray(rows)) return rows.slice();
      }
    }catch(error){}
    return getAll();
  }

  function selectedScope(){
    return {
      restaurant:$("cfComplaintRestaurant")?.value || $("complaintRestaurant")?.value || "Tous",
      type:$("cfComplaintType")?.value || $("complaintType")?.value || "Tous"
    };
  }

  function scopedAllRows(){
    const scope = selectedScope();
    return getAll().filter((row) => {
      if(scope.restaurant !== "Tous" && norm(row.restaurant) !== norm(scope.restaurant)) return false;
      if(scope.type !== "Tous" && norm(row.type) !== norm(scope.type)) return false;
      return Boolean(dateOf(row));
    });
  }

  function causeFor(row){
    const text = norm(`${row?.type || ""} ${row?.description || ""} ${row?.product || ""}`);
    if(/manquant|oubli|missing|item/.test(text)) return "Produit manquant";
    if(/froid|froide|cold/.test(text)) return "Pizza froide";
    if(/cuisson|cuit|brul|brûl|cru|cook/.test(text)) return "Cuisson";
    if(/delai|délai|retard|livraison|attente|delay/.test(text)) return "Délai";
    if(/service|employ|courtois|attitude|accueil/.test(text)) return "Service";
    return "Autres";
  }

  function causeStats(rows){
    const order = ["Produit manquant","Pizza froide","Cuisson","Délai","Service","Autres"];
    const map = new Map(order.map((name) => [name, {name, count:0, amount:0}]));
    rows.forEach((row) => {
      const item = map.get(causeFor(row));
      item.count += 1;
      item.amount += num(row.amount) || 0;
    });
    return [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
  }

  function dayStats(rows){
    const names = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
    const map = new Map();
    rows.forEach((row) => {
      const date = dateOf(row);
      if(!date) return;
      const name = names[date.getDay()];
      map.set(name, (map.get(name) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function latestDate(rows){
    return rows.reduce((latest, row) => {
      const date = dateOf(row);
      return date && (!latest || date > latest) ? date : latest;
    }, null) || new Date();
  }

  function periodRows(rows, end, days, offsetDays = 0){
    const periodEnd = new Date(end);
    periodEnd.setHours(23,59,59,999);
    periodEnd.setDate(periodEnd.getDate() - offsetDays);
    const start = new Date(periodEnd);
    start.setHours(0,0,0,0);
    start.setDate(start.getDate() - days + 1);
    return rows.filter((row) => {
      const date = dateOf(row);
      return date && date >= start && date <= periodEnd;
    });
  }

  function trend(rows, days){
    const end = latestDate(rows);
    const current = periodRows(rows, end, days);
    const previous = periodRows(rows, end, days, days);
    const countsByDay = new Map();
    current.forEach((row) => {
      const date = dateOf(row);
      if(!date) return;
      const key = date.toISOString().slice(0, 10);
      countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
    });
    const daily = [];
    for(let offset = days - 1; offset >= 0; offset -= 1){
      const date = new Date(end);
      date.setHours(0,0,0,0);
      date.setDate(date.getDate() - offset);
      const key = date.toISOString().slice(0, 10);
      daily.push({
        key,
        label:date.toLocaleDateString("fr-CA", {day:"numeric", month:"short"}),
        count:countsByDay.get(key) || 0
      });
    }
    return {
      days,
      current,
      previous,
      daily,
      countVariation:variation(current.length, previous.length),
      amount:sum(current, (row) => row.amount),
      previousAmount:sum(previous, (row) => row.amount)
    };
  }

  function sparkline(points){
    const values = points.map((item) => item.count);
    const width = 680;
    const height = 120;
    const max = Math.max(...values, 1);
    const coords = values.map((value, index) => {
      const x = values.length === 1 ? 0 : index * width / (values.length - 1);
      const y = height - 12 - value / max * (height - 24);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const area = `0,${height} ${coords} ${width},${height}`;
    return `<svg class="opsComplaintsV112Spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="${area}"></polygon>
      <polyline points="${coords}"></polyline>
    </svg>`;
  }

  function getTransactions(){
    const data = (() => {
      try{ if(Array.isArray(DATA)) return DATA; }catch(error){}
      return Array.isArray(window.DATA) ? window.DATA : [];
    })();
    const scope = selectedScope();
    const rows = getFiltered();
    const dates = rows.map(dateOf).filter(Boolean);
    if(!dates.length) return null;
    const start = new Date(Math.min(...dates));
    const end = new Date(Math.max(...dates));
    const total = data.filter((row) => {
      if(scope.restaurant !== "Tous" && norm(row.restaurant) !== norm(scope.restaurant)) return false;
      const match = String(row.week || "").match(/(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/);
      if(!match) return false;
      const weekStart = new Date(`${match[1]}T00:00:00`);
      const weekEnd = new Date(`${match[2]}T23:59:59`);
      return weekStart <= end && weekEnd >= start;
    }).reduce((totalValue, row) => totalValue + (num(row.transactions) || 0), 0);
    return total || null;
  }

  function tone(value, lowerBetter = true){
    const parsed = num(value);
    if(parsed == null || parsed === 0) return "neutral";
    return (lowerBetter ? parsed < 0 : parsed > 0) ? "good" : "bad";
  }

  function kpi(label, value, note, toneName){
    return `<article class="opsComplaintsV112Kpi ${safe(toneName || "neutral")}"><span>${safe(label)}</span><strong>${safe(value)}</strong><small>${safe(note)}</small></article>`;
  }

  function donut(items, total, kind = "causes"){
    const palette = kind === "days"
      ? ["#4b87f5","#40b7db","#54c77b","#f5bd4b","#e54242","#9c4cdb","#7386aa"]
      : ["#e54242","#ff7c32","#f5bd4b","#54c77b","#9c4cdb","#7386aa"];
    let cursor = 0;
    const segments = items.map((item, index) => {
      const share = total ? item.count / total * 100 : 0;
      const start = cursor;
      cursor += share;
      return `${palette[index % palette.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    }).join(",");
    const legend = items.map((item, index) => {
      const share = total ? item.count / total * 100 : 0;
      return `<li><i style="background:${palette[index % palette.length]}"></i><span>${safe(item.name)}</span><strong>${fixed(share, 0)} %</strong><small>${item.count}</small></li>`;
    }).join("");
    return `<div class="opsComplaintsV112DonutWrap">
      <div class="opsComplaintsV112Donut" style="--donut:${segments || "#283341 0% 100%"}"><span><strong>${total}</strong><small>Total</small></span></div>
      <ul class="opsComplaintsV112Legend">${legend}</ul>
    </div>`;
  }

  function observations(rows, causes, trend30){
    const dominant = causes[0];
    const days = dayStats(rows);
    const topDay = days[0];
    const items = [];
    if(dominant?.count) items.push(`Cause dominante : ${dominant.name} avec ${dominant.count} plainte(s).`);
    if(topDay) items.push(`Journée la plus représentée : ${topDay[0]} avec ${topDay[1]} plainte(s).`);
    if(trend30.countVariation != null) items.push(`Volume sur 30 jours : ${percent(trend30.countVariation)} vs les 30 jours précédents.`);
    if(!items.length) items.push("Les données disponibles ne permettent pas encore d'établir une tendance.");
    return items;
  }

  function executiveLines(rows, causes, trend30){
    if(!rows.length) return ["Aucune plainte ne correspond à la sélection active.", "Le suivi demeure prêt dès qu'une plainte est chargée."];
    const dominant = causes[0];
    const days = dayStats(rows);
    const topDay = days[0];
    const lines = [];
    if(trend30.countVariation == null) lines.push("La comparaison des 30 derniers jours sera disponible après une période historique complète.");
    else if(trend30.countVariation > 0) lines.push(`Les plaintes sont en hausse de ${percent(trend30.countVariation)} sur les 30 derniers jours.`);
    else if(trend30.countVariation < 0) lines.push(`Les plaintes diminuent de ${percent(Math.abs(trend30.countVariation)).replace("+", "")} sur les 30 derniers jours.`);
    else lines.push("Le volume de plaintes est stable sur les 30 derniers jours.");
    if(dominant?.count) lines.push(`La cause dominante est « ${dominant.name} » avec ${dominant.count} plainte(s).`);
    if(topDay) lines.push(`${topDay[0][0].toUpperCase()}${topDay[0].slice(1)} est la journée la plus représentée avec ${topDay[1]} plainte(s).`);
    lines.push(`La compensation totale de la sélection est de ${money(sum(rows, (row) => row.amount))}.`);
    return lines.slice(0, 4);
  }

  function actions(causes, trend30, selected){
    const result = [];
    const dominant = causes[0];
    if(trend30.countVariation != null && trend30.countVariation > 20){
      result.push({level:"high", label:"Priorité élevée", text:"Analyser immédiatement la hausse du volume de plaintes sur 30 jours."});
    }
    if(dominant?.count){
      result.push({level:dominant.count >= Math.max(3, selected.length * .35) ? "high" : "medium", label:dominant.count >= Math.max(3, selected.length * .35) ? "Priorité élevée" : "Priorité moyenne", text:`Revoir le processus lié à « ${dominant.name} ».`});
    }
    if(sum(selected, (row) => row.amount) > 0){
      result.push({level:"medium", label:"Priorité moyenne", text:"Valider les compensations les plus élevées et leurs causes récurrentes."});
    }
    if(!result.length) result.push({level:"low", label:"Priorité faible", text:"Maintenir le suivi régulier et la classification détaillée des plaintes."});
    return result.slice(0, 3);
  }

  function panelHeader(){
    return `<header class="opsComplaintsV112Header">
      <div><span>Centre d'analyse plaintes</span><h3>Tableau de bord Plaintes</h3><p>Lecture exécutive et tendances à partir des plaintes déjà chargées.</p></div>
      <button type="button" class="opsComplaintsV112Toggle" id="opsComplaintsV112Toggle" aria-expanded="true"><span>Replier</span><i>⌃</i></button>
    </header>`;
  }

  function render(){
    const host = $("opsComplaintsDashboardV112");
    if(!host) return;
    const source = Array.isArray(window.COMPLAINTS) ? window.COMPLAINTS : null;
    const scope = selectedScope();
    let allowedRestaurants = "";
    try{
      if(Array.isArray(window.OPS_AUTH_ALLOWED_RESTAURANTS)) allowedRestaurants = window.OPS_AUTH_ALLOWED_RESTAURANTS.join("|");
      else if(Array.isArray(window.allowedRestaurants)) allowedRestaurants = window.allowedRestaurants.join("|");
    }catch(error){}
    const renderKey = [
      scope.restaurant,
      scope.type,
      $("cfComplaintQuickWeek")?.value || $("complaintQuickWeek")?.value || "",
      $("cfComplaintDate")?.value || $("complaintDate")?.value || "",
      $("cfComplaintEndDate")?.value || $("complaintEndDate")?.value || "",
      host.classList.contains("collapsed") ? "collapsed" : "expanded",
      source?.length || 0,
      allowedRestaurants
    ].join("|");
    if(source && source === lastSource && renderKey === lastRenderKey && host.firstElementChild) return;
    const selected = getFiltered();
    const scoped = scopedAllRows();
    const causes = causeStats(selected);
    const trend30 = trend(scoped, 30);
    const trend90 = trend(scoped, 90);
    const amount = sum(selected, (row) => row.amount);
    const transactions = getTransactions();
    const ratio = transactions ? selected.length / transactions * 1000 : null;
    const average = selected.length ? amount / selected.length : 0;
    const insights = observations(selected, causes, trend30);
    const recommended = actions(causes, trend30, selected);
    const summary = executiveLines(selected, causes, trend30);
    const days = dayStats(selected).map(([name, count]) => ({name:`${name[0].toUpperCase()}${name.slice(1)}`, count}));
    const collapsed = host.classList.contains("collapsed");
    const markup = `${panelHeader()}
      <div class="opsComplaintsV112Body">
        <section class="opsComplaintsV112Overview">
          <article class="opsComplaintsV112Executive">
            <div><span>OPS AI</span><h4>Résumé exécutif</h4><ul>${summary.map((item) => `<li><i></i><span>${safe(item)}</span></li>`).join("")}</ul></div>
            <strong><i></i>Analyse active</strong>
          </article>
          <section class="opsComplaintsV112Kpis">
            ${kpi("Plaintes totales", String(selected.length), "sélection active", selected.length ? "bad" : "good")}
            ${kpi("Plaintes / 1000 commandes", ratio == null ? "—" : fixed(ratio, 2), transactions ? `${Math.round(transactions).toLocaleString("fr-CA")} transactions` : "transactions indisponibles", ratio == null ? "neutral" : ratio > 2 ? "bad" : "good")}
            ${kpi("Compensation totale", money(amount), "sélection active", amount ? "bad" : "good")}
            ${kpi("Compensation moyenne", money(average), "par plainte", average ? "neutral" : "good")}
          </section>
        </section>
        <section class="opsComplaintsV112Grid opsComplaintsV112Analytics">
          <article class="opsComplaintsV112Card opsComplaintsV112Causes"><header><span>Répartition</span><h4>Top causes</h4></header>${donut(causes, selected.length)}</article>
          <article class="opsComplaintsV112Card opsComplaintsV112Trend opsComplaintsV112TrendWide"><header><span>Vue récente</span><h4>Tendances 30 jours</h4><strong class="${tone(trend30.countVariation)}">${safe(percent(trend30.countVariation))}</strong></header>${sparkline(trend30.daily)}<footer><span>${trend30.current.length} plainte(s)</span><span>${safe(money(trend30.amount))}</span></footer></article>
          <article class="opsComplaintsV112Card opsComplaintsV112Days"><header><span>Répartition</span><h4>Par jour</h4></header>${donut(days, selected.length, "days")}</article>
        </section>
        <section class="opsComplaintsV112Grid opsComplaintsV112GridBottom">
          <article class="opsComplaintsV112Card opsComplaintsV112LongTerm"><header><span>Vue long terme</span><h4>Tendances 90 jours</h4><strong class="${tone(trend90.countVariation)}">${safe(percent(trend90.countVariation))}</strong></header><div><section><span>Plaintes</span><strong>${trend90.current.length}</strong></section><section><span>Compensation</span><strong>${safe(money(trend90.amount))}</strong></section><section><span>Moyenne</span><strong>${safe(money(trend90.current.length ? trend90.amount / trend90.current.length : 0))}</strong></section></div>${sparkline(trend90.daily)}</article>
          <article class="opsComplaintsV112Card"><header><span>OPS AI</span><h4>Analyse opérationnelle</h4></header><ul>${insights.map((item) => `<li><i></i><span>${safe(item)}</span></li>`).join("")}</ul></article>
          <article class="opsComplaintsV112Card"><header><span>Suivi terrain</span><h4>Actions recommandées</h4></header><div class="opsComplaintsV112Actions">${recommended.map((item) => `<article class="${safe(item.level)}"><strong>${safe(item.label)}</strong><span>${safe(item.text)}</span></article>`).join("")}</div></article>
        </section>
      </div>`;
    if(markup !== lastMarkup || !host.firstElementChild){
      host.innerHTML = markup;
      lastMarkup = markup;
    }
    lastSource = source;
    lastRenderKey = renderKey;
    const toggle = $("opsComplaintsV112Toggle");
    if(toggle){
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.querySelector("span").textContent = collapsed ? "Déplier" : "Replier";
      toggle.querySelector("i").textContent = collapsed ? "⌄" : "⌃";
    }
  }

  function ensure(){
    const page = $("page-complaints");
    if(!page) return null;
    let host = $("opsComplaintsDashboardV112");
    if(!host){
      host = document.createElement("section");
      host.id = "opsComplaintsDashboardV112";
      host.className = "opsComplaintsV112";
      try{
        if(localStorage.getItem(STORAGE_KEY) === "1") host.classList.add("collapsed");
      }catch(error){}
    }
    const anchor = $("opsV52ComplaintsInsight") || page.querySelector(".controls") || page.querySelector(".complaintCsvSource") || page.firstElementChild;
    if(anchor && host.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", host);
    return host;
  }

  function schedule(){
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
      if(ensure()) render();
    }, 90);
  }

  function bind(){
    if(bound) return;
    bound = true;
    schedule();
    document.addEventListener("click", (event) => {
      if(event.target.closest("#opsComplaintsV112Toggle")){
        const host = $("opsComplaintsDashboardV112");
        if(!host) return;
        host.classList.toggle("collapsed");
        try{ localStorage.setItem(STORAGE_KEY, host.classList.contains("collapsed") ? "1" : "0"); }catch(error){}
        schedule();
      }
      if(event.target.closest("#cfBtnComplaintsApply, #cfBtnComplaintsSync, #btnComplaintsApply, #btnComplaintsSync")) schedule();
    }, true);
    document.addEventListener("change", (event) => {
      if(["cfComplaintRestaurant","cfComplaintType","cfComplaintQuickWeek","cfComplaintDate","cfComplaintEndDate","complaintRestaurant","complaintType","complaintQuickWeek","complaintDate","complaintEndDate"].includes(event.target?.id)) schedule();
    }, true);
    const observer = new MutationObserver(schedule);
    const watch = () => {
      const total = $("cfComplaintsTotal") || $("complaintsTotal");
      if(total) observer.observe(total, {childList:true, characterData:true, subtree:true});
    };
    [200, 900, 2600].forEach((delay) => window.setTimeout(() => { ensure(); watch(); schedule(); }, delay));
  }

  window.renderComplaintsDashboardV112 = render;
  window.OPS_COMPLAINTS_DASHBOARD_V112 = {version:VERSION, render, schedule};

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, {once:true});
  else bind();
})();
