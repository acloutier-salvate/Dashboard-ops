(function(){
  "use strict";

  const VERSION = "v509";
  const CSI_TARGET = 88;
  const DEFAULT_RESTAURANTS = [
    "Lévis","Beauport","Jonquière","Chicoutimi Nord","St-Nicolas","Dolbeau","Alma",
    "St-Augustin","Montmagny","Donnacona","Pont-Rouge","Chicoutimi Sud",
    "St-Raymond","Beauport Nord","Roberval","St-Lambert","La Pocatière"
  ];

  const CONTROL_ALIASES = {
    complaintRestaurant:"cfComplaintRestaurant",
    complaintType:"cfComplaintType",
    complaintQuickWeek:"cfComplaintQuickWeek",
    complaintDate:"cfComplaintDate",
    complaintEndDate:"cfComplaintEndDate"
  };
  const $ = (id) => document.getElementById(id) || document.getElementById(CONTROL_ALIASES[id] || "");
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
  const num = (value) => {
    if(value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const avg = (values) => {
    const nums = values.map(num).filter((value) => value != null);
    return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : null;
  };
  const sum = (values) => values.reduce((total, value) => total + (num(value) || 0), 0);
  const money = (value) => {
    const n = num(value);
    return n == null ? "—" : n.toLocaleString("fr-CA", { style:"currency", currency:"CAD", maximumFractionDigits:0 });
  };
  const moneyPrecise = (value) => {
    const n = num(value);
    return n == null ? "—" : n.toLocaleString("fr-CA", { minimumFractionDigits:2, maximumFractionDigits:2 }) + " $";
  };
  const percent = (value, decimals = 1) => {
    const n = num(value);
    return n == null ? "—" : n.toFixed(decimals).replace(".", ",") + " %";
  };
  const minutes = (value) => {
    const n = num(value);
    return n == null ? "—" : Math.round(n).toLocaleString("fr-CA") + " min";
  };
  const signedPercent = (value) => {
    const n = num(value);
    if(n == null) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")} %`;
  };
  const signedNumber = (value, suffix = "") => {
    const n = num(value);
    if(n == null) return "—";
    const rounded = Math.abs(n) < 10 ? n.toFixed(1).replace(".", ",") : Math.round(n).toLocaleString("fr-CA");
    return `${n >= 0 ? "+" : ""}${rounded}${suffix}`;
  };
  const variation = (current, previous) => {
    const c = num(current);
    const p = num(previous);
    if(c == null || p == null) return null;
    if(p === 0) return c === 0 ? 0 : 100;
    return ((c - p) / Math.abs(p)) * 100;
  };
  const QUICK_MEMO_MS = 240;
  const calculationCache = new Map();
  let renderAllTimer = 0;

  function sourceLength(name){
    try{
      if(name === "data" && Array.isArray(DATA)) return DATA.length;
    }catch(e){}
    const source = name === "data" ? window.DATA : window.COMPLAINTS;
    return Array.isArray(source) ? source.length : 0;
  }

  function calculationStamp(scope){
    return [
      scope,
      sourceLength("data"),
      sourceLength("complaints"),
      $("dashWeek")?.value || "",
      $("profileRestaurant")?.value || $("restaurantSelect")?.value || "",
      $("profileWeek")?.value || $("restaurantWeek")?.value || "",
      $("complaintRestaurant")?.value || "",
      $("complaintType")?.value || "",
      $("complaintQuickWeek")?.value || "",
      $("complaintDate")?.value || "",
      $("complaintEndDate")?.value || "",
      $("auditRestaurant")?.value || "",
      $("auditDate")?.value || ""
    ].join("|");
  }

  function memoizedCalculation(scope, compute){
    const key = calculationStamp(scope);
    const now = Date.now();
    const cached = calculationCache.get(key);
    if(cached && now - cached.createdAt < QUICK_MEMO_MS) return cached.value;
    const value = compute();
    if(calculationCache.size > 36) calculationCache.clear();
    calculationCache.set(key, { createdAt:now, value });
    return value;
  }

  function getData(){
    try{
      if(Array.isArray(DATA)) return DATA.slice();
    }catch(e){}
    return Array.isArray(window.DATA) ? window.DATA.slice() : [];
  }

  function getAllowedRestaurants(){
    try{
      if(Array.isArray(allowedRestaurants) && allowedRestaurants.length) return allowedRestaurants.slice();
    }catch(e){}
    try{
      const saved = JSON.parse(localStorage.getItem("allowedRestaurants") || "null");
      if(Array.isArray(saved) && saved.length) return saved;
    }catch(e){}
    try{
      if(Array.isArray(RESTAURANTS) && RESTAURANTS.length) return RESTAURANTS.slice();
    }catch(e){}
    return DEFAULT_RESTAURANTS.slice();
  }

  function hasOperationalData(row){
    return row && (
      num(row.sales) != null ||
      num(row.csi) != null ||
      num(row.delay) != null ||
      num(row.growth) != null ||
      num(row.transactions) != null ||
      num(row.surveys) != null
    );
  }

  function sortedWeeks(data){
    return [...new Set(data.map((row) => row.week).filter(Boolean))]
      .sort((a, b) => {
        const pa = parseWeekRange(a);
        const pb = parseWeekRange(b);
        if(pa && pb) return pa.start - pb.start;
        return String(a).localeCompare(String(b), "fr");
      });
  }

  function parseWeekRange(label){
    const match = String(label || "").match(/(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/);
    if(!match) return null;
    const start = new Date(`${match[1]}T00:00:00`);
    const end = new Date(`${match[2]}T23:59:59`);
    if(Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { start, end, startIso:match[1], endIso:match[2], label:`${match[1]} au ${match[2]}` };
  }

  function selectedNetworkWeek(){
    const data = getData();
    const selected = $("dashWeek")?.value || "latest";
    if(selected && selected !== "latest" && selected !== "Réseau complet") return selected;
    const weeks = sortedWeeks(data);
    return weeks[weeks.length - 1] || "";
  }

  function selectedProfileWeek(){
    const data = getData();
    const selected = $("profileWeek")?.value || $("restaurantWeek")?.value || "latest";
    if(selected && selected !== "latest") return selected;
    const weeks = sortedWeeks(data);
    return weeks[weeks.length - 1] || "";
  }

  function previousWeekLabel(week){
    const weeks = sortedWeeks(getData());
    const index = weeks.indexOf(week);
    return index > 0 ? weeks[index - 1] : "";
  }

  function rowsForWeek(week){
    const allowed = new Set(getAllowedRestaurants());
    return getData().filter((row) => allowed.has(row.restaurant) && hasOperationalData(row) && row.week === week);
  }

  function groupRestaurantRows(rows){
    const map = new Map();
    rows.forEach((row) => {
      if(!hasOperationalData(row)) return;
      const item = map.get(row.restaurant) || { restaurant:row.restaurant, sales:0, csi:[], delay:[], growth:[], surveys:[], transactions:[] };
      item.sales += num(row.sales) || 0;
      item.csi.push(row.csi);
      item.delay.push(row.delay);
      item.growth.push(row.growth);
      item.surveys.push(row.surveys);
      item.transactions.push(row.transactions);
      map.set(row.restaurant, item);
    });
    return [...map.values()].map((item) => ({
      restaurant:item.restaurant,
      sales:item.sales || null,
      csi:avg(item.csi),
      delay:avg(item.delay),
      growth:avg(item.growth),
      surveys:sum(item.surveys) || null,
      transactions:sum(item.transactions) || null
    }));
  }

  function complaintDate(row){
    if(row && row.date instanceof Date && !Number.isNaN(row.date.getTime())) return row.date;
    const raw = row && (row.dateIso || row.date || row.createdAt || row.timestamp);
    if(!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function weekLabelFromDate(date){
    if(!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    d.setHours(0,0,0,0);
    const start = new Date(d);
    const end = new Date(d);
    end.setDate(start.getDate() + 6);
    const iso = (value) => value.toISOString().slice(0,10);
    return `${iso(start)} au ${iso(end)}`;
  }

  function getComplaints(){
    try{
      if(typeof window.getAllComplaints === "function"){
        const list = window.getAllComplaints();
        if(Array.isArray(list)) return list.slice();
      }
    }catch(e){}
    return Array.isArray(window.COMPLAINTS) ? window.COMPLAINTS.slice() : [];
  }

  function complaintsForRange(range, activeRestaurants){
    const allowed = new Set(getAllowedRestaurants().map(norm));
    const active = activeRestaurants ? new Set([...activeRestaurants].map(norm)) : null;
    return getComplaints().filter((row) => {
      const restaurantKey = norm(row.restaurant);
      if(!allowed.has(restaurantKey)) return false;
      if(active && !active.has(restaurantKey)) return false;
      const date = complaintDate(row);
      if(range && date){
        if(date < range.start || date > range.end) return false;
      }
      return true;
    });
  }

  function networkStats(week){
    const rows = rowsForWeek(week);
    const grouped = groupRestaurantRows(rows);
    const active = new Set(grouped.map((row) => row.restaurant));
    const complaints = complaintsForRange(parseWeekRange(week), active);
    return {
      week,
      grouped,
      activeRestaurants:grouped.length,
      sales:sum(grouped.map((row) => row.sales)),
      csi:avg(grouped.map((row) => row.csi)),
      delay:avg(grouped.map((row) => row.delay)),
      complaints:complaints.length,
      complaintAmount:sum(complaints.map((row) => row.amount))
    };
  }

  function selectedComplaintFilters(){
    const allComplaints = getComplaints();
    const labels = [...new Set(allComplaints.map((row) => weekLabelFromDate(complaintDate(row))).filter(Boolean))]
      .sort((a, b) => parseWeekRange(a).start - parseWeekRange(b).start);
    const weekValue = $("complaintQuickWeek")?.value || "latest";
    const resolvedWeek = weekValue === "latest" ? (labels[labels.length - 1] || "") : weekValue;
    const customStart = $("complaintDate")?.value || "";
    const customEnd = $("complaintEndDate")?.value || "";
    let range = parseWeekRange(resolvedWeek);
    if(customStart || customEnd){
      const start = customStart ? new Date(`${customStart}T00:00:00`) : new Date(0);
      const end = customEnd ? new Date(`${customEnd}T23:59:59`) : new Date(8640000000000000);
      range = { start, end, label:customStart && customEnd ? `${customStart} au ${customEnd}` : "Période personnalisée" };
    }
    return {
      restaurant:$("complaintRestaurant")?.value || "Tous",
      type:$("complaintType")?.value || "Tous",
      week:resolvedWeek,
      range
    };
  }

  function currentComplaintRows(){
    const filters = selectedComplaintFilters();
    const restaurantKey = norm(filters.restaurant);
    const typeKey = norm(filters.type);
    return complaintsForRange(filters.range).filter((row) => {
      if(filters.restaurant !== "Tous" && norm(row.restaurant) !== restaurantKey) return false;
      if(filters.type !== "Tous" && norm(row.type) !== typeKey) return false;
      return true;
    });
  }

  function previousRange(range){
    if(!range || !range.start || !range.end) return null;
    const days = Math.max(1, Math.round((range.end - range.start) / 86400000) + 1);
    const start = new Date(range.start);
    const end = new Date(range.end);
    start.setDate(start.getDate() - days);
    end.setDate(end.getDate() - days);
    return { start, end };
  }

  function categoryStats(rows){
    const map = new Map();
    rows.forEach((row) => {
      const name = row.type || "Non précisé";
      const item = map.get(name) || { name, count:0, amount:0 };
      item.count += 1;
      item.amount += num(row.amount) || 0;
      map.set(name, item);
    });
    return [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount || a.name.localeCompare(b.name, "fr"));
  }

  function complaintSixWeekAverage(filters){
    const labels = [...new Set(getComplaints().map((row) => weekLabelFromDate(complaintDate(row))).filter(Boolean))]
      .sort((a, b) => parseWeekRange(a).start - parseWeekRange(b).start);
    const current = filters.week || labels[labels.length - 1] || "";
    const index = labels.indexOf(current);
    const sample = labels.slice(Math.max(0, index - 6), Math.max(0, index));
    if(!sample.length) return { count:null, amount:null };
    const restaurantKey = norm(filters.restaurant);
    const typeKey = norm(filters.type);
    const totals = sample.map((week) => {
      const rows = complaintsForRange(parseWeekRange(week)).filter((row) => {
        if(filters.restaurant !== "Tous" && norm(row.restaurant) !== restaurantKey) return false;
        if(filters.type !== "Tous" && norm(row.type) !== typeKey) return false;
        return true;
      });
      return { count:rows.length, amount:sum(rows.map((row) => row.amount)) };
    });
    return { count:avg(totals.map((row) => row.count)), amount:avg(totals.map((row) => row.amount)) };
  }

  function tone(value, inverse){
    const n = num(value);
    if(n == null || Math.abs(n) < .5) return "neutral";
    const good = inverse ? n < 0 : n > 0;
    return good ? "good" : "bad";
  }

  function metric(label, value, detail, state){
    return `<div class="opsIntelModalMetric ${state || "neutral"}"><span>${safe(label)}</span><strong>${safe(value)}</strong><small>${safe(detail || "")}</small></div>`;
  }

  function bullet(text, state){
    return `<li><i class="${state || "neutral"}"></i><span>${safe(text)}</span></li>`;
  }

  function calculateNetworkTrends(){
    return memoizedCalculation("network", calculateNetworkTrendsFresh);
  }

  function calculateNetworkTrendsFresh(){
    const week = selectedNetworkWeek();
    const previous = previousWeekLabel(week);
    const current = networkStats(week);
    const previousStats = previous ? networkStats(previous) : null;
    const currentMap = new Map(current.grouped.map((row) => [row.restaurant, row]));
    const previousMap = new Map((previousStats?.grouped || []).map((row) => [row.restaurant, row]));
    const movement = [...currentMap.values()].map((row) => {
      const before = previousMap.get(row.restaurant);
      return {
        restaurant:row.restaurant,
        csiDelta:before && row.csi != null && before.csi != null ? row.csi - before.csi : null,
        salesDelta:before ? variation(row.sales || 0, before.sales || 0) : null,
        delayDelta:before && row.delay != null && before.delay != null ? row.delay - before.delay : null
      };
    }).filter((row) => row.csiDelta != null || row.salesDelta != null || row.delayDelta != null);
    const score = (row) => (row.csiDelta || 0) * 2 + (row.salesDelta || 0) / 10 - (row.delayDelta || 0);
    const improvement = movement.slice().sort((a, b) => score(b) - score(a));
    const decline = improvement.slice().reverse();
    return {
      week,
      previous,
      current,
      previousStats,
      salesVariation:previousStats ? variation(current.sales, previousStats.sales) : null,
      csiVariation:previousStats && current.csi != null && previousStats.csi != null ? current.csi - previousStats.csi : null,
      delayVariation:previousStats && current.delay != null && previousStats.delay != null ? current.delay - previousStats.delay : null,
      complaintVariation:previousStats ? variation(current.complaints, previousStats.complaints) : null,
      improvement:improvement[0] || null,
      decline:decline[0] || null,
      notableImprovement:improvement.filter((row) => (row.csiDelta || 0) >= 2 || (row.salesDelta || 0) >= 10).slice(0, 3),
      notableDecline:decline.filter((row) => (row.csiDelta || 0) <= -2 || (row.delayDelta || 0) >= 5 || (row.salesDelta || 0) <= -10).slice(0, 3)
    };
  }

  function calculateRestaurantInsights(){
    return memoizedCalculation("restaurant", calculateRestaurantInsightsFresh);
  }

  function calculateRestaurantInsightsFresh(){
    const restaurant = $("profileRestaurant")?.value || $("restaurantSelect")?.value || "";
    const week = selectedProfileWeek();
    const previous = previousWeekLabel(week);
    const current = groupRestaurantRows(rowsForWeek(week)).find((row) => norm(row.restaurant) === norm(restaurant));
    const before = previous ? groupRestaurantRows(rowsForWeek(previous)).find((row) => norm(row.restaurant) === norm(restaurant)) : null;
    const active = restaurant ? new Set([restaurant]) : null;
    const complaints = complaintsForRange(parseWeekRange(week), active);
    const previousComplaints = previous ? complaintsForRange(parseWeekRange(previous), active) : [];
    const network = networkStats(week);
    const weeks = sortedWeeks(getData());
    const index = weeks.indexOf(week);
    const sample = weeks.slice(Math.max(0, index - 6), Math.max(0, index));
    const complaintAverage = sample.length ? avg(sample.map((label) => complaintsForRange(parseWeekRange(label), active).length)) : null;
    return {
      restaurant,
      week,
      current,
      network,
      salesGrowth:current?.growth ?? null,
      salesDelta:before ? variation(current?.sales || 0, before.sales || 0) : null,
      csiDelta:current && before && current.csi != null && before.csi != null ? current.csi - before.csi : null,
      delayDelta:current && before && current.delay != null && before.delay != null ? current.delay - before.delay : null,
      complaintDelta:variation(complaints.length, previousComplaints.length),
      complaints,
      complaintAverage
    };
  }

  function calculateComplaintInsights(){
    return memoizedCalculation("complaints", calculateComplaintInsightsFresh);
  }

  function calculateComplaintInsightsFresh(){
    const filters = selectedComplaintFilters();
    const rows = currentComplaintRows();
    const previous = previousRange(filters.range);
    const restaurantKey = norm(filters.restaurant);
    const typeKey = norm(filters.type);
    const previousRows = complaintsForRange(previous).filter((row) => {
      if(filters.restaurant !== "Tous" && norm(row.restaurant) !== restaurantKey) return false;
      if(filters.type !== "Tous" && norm(row.type) !== typeKey) return false;
      return true;
    });
    const cats = categoryStats(rows);
    const costly = cats.slice().sort((a, b) => b.amount - a.amount || b.count - a.count)[0] || null;
    const amount = sum(rows.map((row) => row.amount));
    const previousAmount = sum(previousRows.map((row) => row.amount));
    return {
      filters,
      rows,
      previousRows,
      topCategory:cats[0] || null,
      costly,
      amount,
      countVariation:variation(rows.length, previousRows.length),
      amountVariation:variation(amount, previousAmount),
      avg6:complaintSixWeekAverage(filters)
    };
  }

  function getAudits(){
    const out = [];
    ["dashboard_ops_audits", "audits"].forEach((key) => {
      try{
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        if(Array.isArray(list)) out.push(...list);
      }catch(e){}
    });
    return out.map((item) => ({
      ...item,
      restaurant:item.restaurant || item.resto || item.name || "",
      date:item.date || item.createdAt || item.auditDate || "",
      score:num(item.score ?? item.csi ?? item.auditScore),
      bad:num(item.bad ?? item.nonConformes ?? item.nonconformes ?? item.issues)
    })).filter((item) => item.restaurant || item.date || item.score != null || item.bad != null)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }

  function calculateAuditInsights(){
    return memoizedCalculation("audit", calculateAuditInsightsFresh);
  }

  function calculateAuditInsightsFresh(){
    const restaurant = $("auditRestaurant")?.value || "";
    const audits = getAudits();
    const scoped = restaurant ? audits.filter((item) => norm(item.restaurant) === norm(restaurant)) : audits;
    const latest = scoped[0] || null;
    const previous = scoped[1] || null;
    const weak = [...audits.reduce((map, item) => {
      const key = item.restaurant || "Réseau";
      const current = map.get(key) || { restaurant:key, bad:0, count:0 };
      current.bad += num(item.bad) || 0;
      current.count += 1;
      map.set(key, current);
      return map;
    }, new Map()).values()].sort((a, b) => b.bad - a.bad).slice(0, 3);
    return {
      restaurant,
      latest,
      previous,
      scoreDelta:latest && previous && latest.score != null && previous.score != null ? latest.score - previous.score : null,
      weak,
      count:scoped.length
    };
  }

  function getEvents(){
    try{
      if(typeof window.pc409GetCalendarEvents === "function"){
        const list = window.pc409GetCalendarEvents();
        if(Array.isArray(list)) return list.slice();
      }
    }catch(e){}
    try{
      const stored = JSON.parse(localStorage.getItem("pc409_manual_events") || "[]");
      return Array.isArray(stored) ? stored : [];
    }catch(e){}
    return [];
  }

  function eventDate(event){
    const raw = event?.date || event?.start || event?.startDate || event?.dateIso;
    if(!raw) return null;
    const parsed = new Date(String(raw).length <= 10 ? `${raw}T12:00:00` : raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function currentCalendarRange(){
    const today = new Date();
    const day = today.getDay() || 7;
    const start = new Date(today);
    start.setDate(today.getDate() - day + 1);
    start.setHours(0,0,0,0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23,59,59,999);
    return { start, end };
  }

  function calculatePromoInsights(){
    return memoizedCalculation("calendar", calculatePromoInsightsFresh);
  }

  function calculatePromoInsightsFresh(){
    const events = getEvents();
    const range = currentCalendarRange();
    const current = events.filter((event) => {
      const date = eventDate(event);
      return date && date >= range.start && date <= range.end;
    });
    const upcoming = events.filter((event) => {
      const date = eventDate(event);
      return date && date > range.end;
    }).sort((a, b) => eventDate(a) - eventDate(b)).slice(0, 5);
    const sms = current.filter((event) => /sms|message|communication/i.test(`${event.title || ""} ${event.type || ""} ${event.category || ""}`));
    return {
      current,
      upcoming,
      sms,
      csi:networkStats(selectedNetworkWeek()).csi,
      complaints:complaintsForRange({ start:range.start, end:range.end }).length
    };
  }

  function updateDashboardBadges(){
    const trends = calculateNetworkTrends();
    setKpiBadge("dashSales", signedPercent(trends.salesVariation), tone(trends.salesVariation));
    const csiTargetGap = trends.current.csi == null ? null : trends.current.csi - CSI_TARGET;
    setKpiBadge("dashCsi", signedNumber(csiTargetGap, " pts"), tone(csiTargetGap));
    setKpiBadge("dashDelay", signedNumber(trends.delayVariation, " min"), tone(trends.delayVariation, true));
    setKpiBadge("execComplaintsKpi", signedPercent(trends.complaintVariation), tone(trends.complaintVariation, true));
  }

  function setKpiBadge(id, label, state){
    const value = $(id);
    const card = value ? value.closest(".execKpi") : null;
    if(!card) return;
    let badge = card.querySelector(".opsIntelBadge");
    if(!badge){
      badge = document.createElement("span");
      badge.className = "opsIntelBadge";
      (card.querySelector(".execKpiTop") || card).appendChild(badge);
    }
    badge.className = `opsIntelBadge ${state || "neutral"}`;
    badge.textContent = label;
  }

  function ensureButton(container, id, label, className, scope){
    if(!container || $(id)) return;
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = `${className} opsIntelOpenBtn`;
    button.dataset.opsIntel = scope;
    button.textContent = label;
    container.appendChild(button);
  }

  function ensureButtons(){
    ensureButton(document.querySelector("#page-dashboard .execControls"), "opsIntelBtnDashboard", "Lecture OPS", "execBtn", "dashboard");
    ensureButton(document.querySelector("#page-restaurant .controls"), "opsIntelBtnRestaurant", "Lecture OPS", "btn", "restaurant");
    ensureButton(document.querySelector("#page-complaints .controls"), "opsIntelBtnComplaints", "Lecture OPS", "btn", "complaints");
    ensureButton(document.querySelector("#page-audit .controls"), "opsIntelBtnAudit", "Lecture OPS", "btn", "audit");
    ensureButton(document.querySelector("#page-calendar .pc409-top-actions"), "opsIntelBtnCalendar", "Lecture OPS", "pc409-action", "calendar");
  }

  function removeLegacyPanels(){
    ["opsIntelDashboardPanel","opsIntelRestaurantPanel","opsIntelComplaintsPanel","opsIntelAuditPanel","opsIntelCalendarPanel"].forEach((id) => {
      const el = $(id);
      if(el) el.remove();
    });
  }

  function ensureModal(){
    let modal = $("opsIntelModal");
    if(modal) return modal;
    modal = document.createElement("div");
    modal.id = "opsIntelModal";
    modal.className = "opsIntelModal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="opsIntelBackdrop" data-ops-intel-close></div>
      <section class="opsIntelDialog" role="dialog" aria-modal="true" aria-labelledby="opsIntelTitle">
        <button class="opsIntelClose" type="button" aria-label="Fermer" data-ops-intel-close>×</button>
        <div id="opsIntelModalBody"></div>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => {
      if(event.target.closest("[data-ops-intel-close]")) closeModal();
    });
    document.addEventListener("keydown", (event) => {
      if(event.key === "Escape" && !modal.hidden) closeModal();
    });
    return modal;
  }

  function openModal(scope){
    const modal = ensureModal();
    const body = $("opsIntelModalBody");
    body.innerHTML = renderScope(scope);
    modal.hidden = false;
    document.body.classList.add("opsIntelModalOpen");
    setTimeout(() => modal.classList.add("show"), 20);
  }

  function closeModal(){
    const modal = $("opsIntelModal");
    if(!modal) return;
    modal.classList.remove("show");
    document.body.classList.remove("opsIntelModalOpen");
    setTimeout(() => { modal.hidden = true; }, 180);
  }

  function modalHeader(title, subtitle, scope){
    return `
      <header class="opsIntelModalHead">
        <span>Intelligence OPS</span>
        <h2 id="opsIntelTitle">${safe(title)}</h2>
        <p>${safe(subtitle)}</p>
        <em>${safe(scope || "")}</em>
      </header>`;
  }

  function renderScope(scope){
    if(scope === "restaurant") return renderRestaurantReading();
    if(scope === "complaints") return renderComplaintReading();
    if(scope === "audit") return renderAuditReading();
    if(scope === "calendar") return renderCalendarReading();
    return renderDashboardReading();
  }

  function renderDashboardReading(){
    const data = calculateNetworkTrends();
    const current = data.current;
    const improvement = data.improvement
      ? `${data.improvement.restaurant} (${data.improvement.csiDelta != null ? signedNumber(data.improvement.csiDelta, " pts CSI") : signedPercent(data.improvement.salesDelta) + " ventes"})`
      : "—";
    const decline = data.decline
      ? `${data.decline.restaurant} (${data.decline.csiDelta != null ? signedNumber(data.decline.csiDelta, " pts CSI") : signedPercent(data.decline.salesDelta) + " ventes"})`
      : "—";
    const improved = data.notableImprovement.length
      ? data.notableImprovement.map((row) => bullet(`${row.restaurant}: CSI ${row.csiDelta != null ? signedNumber(row.csiDelta, " pts") : "—"}, ventes ${signedPercent(row.salesDelta)}`, "good")).join("")
      : bullet("Aucune amélioration notable détectée sur cette période.", "neutral");
    const declined = data.notableDecline.length
      ? data.notableDecline.map((row) => bullet(`${row.restaurant}: CSI ${row.csiDelta != null ? signedNumber(row.csiDelta, " pts") : "—"}, délais ${row.delayDelta != null ? signedNumber(row.delayDelta, " min") : "—"}`, "bad")).join("")
      : bullet("Aucune détérioration notable détectée sur cette période.", "neutral");
    return `
      ${modalHeader("Lecture réseau", "Vue exécutive des tendances reliées aux données déjà chargées.", data.week || "Période sélectionnée")}
      <div class="opsIntelModalGrid">
        ${metric("Ventes réseau", money(current.sales), signedPercent(data.salesVariation), tone(data.salesVariation))}
        ${metric("CSI réseau", percent(current.csi), current.csi == null ? `objectif ${CSI_TARGET} %` : `${signedNumber(current.csi - CSI_TARGET, " pts")} vs objectif ${CSI_TARGET} %`, tone(current.csi == null ? null : current.csi - CSI_TARGET))}
        ${metric("Délais réseau", minutes(current.delay), signedNumber(data.delayVariation, " min"), tone(data.delayVariation, true))}
        ${metric("Plaintes réseau", String(current.complaints), signedPercent(data.complaintVariation), tone(data.complaintVariation, true))}
      </div>
      <div class="opsIntelModalSplit">
        <section><h3>Top progression</h3><strong>${safe(improvement)}</strong><ul>${improved}</ul></section>
        <section><h3>Plus forte baisse</h3><strong>${safe(decline)}</strong><ul>${declined}</ul></section>
      </div>`;
  }

  function renderRestaurantReading(){
    const data = calculateRestaurantInsights();
    const lines = [];
    if(data.current && data.current.csi != null){
      const csiTargetGap = data.current.csi - CSI_TARGET;
      lines.push(bullet(`CSI ${csiTargetGap >= 0 ? "au-dessus" : "sous"} l'objectif ${CSI_TARGET} % (${signedNumber(csiTargetGap, " pts")}).`, tone(csiTargetGap)));
    }
    if(data.delayDelta != null) lines.push(bullet(`Délais ${data.delayDelta <= 0 ? "meilleurs" : "plus élevés"} vs semaine précédente (${signedNumber(data.delayDelta, " min")}).`, tone(data.delayDelta, true)));
    if(data.complaintDelta != null) lines.push(bullet(`Plaintes ${data.complaintDelta <= 0 ? "sous contrôle" : "en hausse"} vs semaine précédente (${signedPercent(data.complaintDelta)}).`, tone(data.complaintDelta, true)));
    if(data.salesGrowth != null) lines.push(bullet(`Augmentation ventes ${data.salesGrowth >= 0 ? "positive" : "négative"} (${signedPercent(data.salesGrowth)}).`, tone(data.salesGrowth)));
    if(data.current && data.network.csi != null && data.current.csi != null){
      const delta = data.current.csi - data.network.csi;
      lines.push(bullet(`CSI ${delta >= 0 ? "au-dessus" : "sous"} la moyenne réseau (${signedNumber(delta, " pts")}).`, tone(delta)));
    }
    if(data.current && data.network.delay != null && data.current.delay != null){
      const delta = data.current.delay - data.network.delay;
      lines.push(bullet(`Délais ${delta <= 0 ? "sous" : "au-dessus de"} la moyenne réseau (${signedNumber(delta, " min")}).`, tone(delta, true)));
    }
    if(data.complaintAverage != null){
      const delta = data.complaints.length - data.complaintAverage;
      lines.push(bullet(`Plaintes ${delta <= 0 ? "sous" : "au-dessus de"} la moyenne 6 semaines (${signedNumber(delta)}).`, tone(delta, true)));
    }
    return `
      ${modalHeader("Lecture restaurant", "Analyse rapide de la fiche restaurant.", data.restaurant || "Restaurant")}
      <div class="opsIntelModalGrid">
        ${metric("CSI", data.current ? percent(data.current.csi) : "—", data.current && data.current.csi != null ? `${signedNumber(data.current.csi - CSI_TARGET, " pts")} vs objectif ${CSI_TARGET} %` : `objectif ${CSI_TARGET} %`, tone(data.current && data.current.csi != null ? data.current.csi - CSI_TARGET : null))}
        ${metric("Délais", data.current ? minutes(data.current.delay) : "—", data.delayDelta != null ? signedNumber(data.delayDelta, " min") : "vs semaine précédente", tone(data.delayDelta, true))}
        ${metric("Plaintes", String(data.complaints.length), data.complaintDelta != null ? signedPercent(data.complaintDelta) : "vs semaine précédente", tone(data.complaintDelta, true))}
        ${metric("Ventes", data.current ? money(data.current.sales) : "—", data.salesGrowth != null ? `${signedPercent(data.salesGrowth)} augmentation ventes` : "augmentation ventes —", tone(data.salesGrowth))}
      </div>
      <section class="opsIntelModalBlock"><h3>Points à surveiller</h3><ul>${lines.length ? lines.join("") : bullet("Données insuffisantes pour générer une lecture complète.", "neutral")}</ul></section>`;
  }

  function renderComplaintReading(){
    const data = calculateComplaintInsights();
    const unusual = data.avg6.count != null && data.rows.length > Math.max(data.avg6.count * 1.35, data.avg6.count + 3);
    return `
      ${modalHeader("Lecture plaintes", "Résumé intelligent de la sélection active dans l’onglet Plaintes.", data.filters.range?.label || data.filters.week || "Période")}
      <div class="opsIntelModalGrid">
        ${metric("Catégorie fréquente", data.topCategory ? data.topCategory.name : "—", data.topCategory ? `${data.topCategory.count} plainte(s)` : "aucune donnée", "neutral")}
        ${metric("Catégorie coûteuse", data.costly ? data.costly.name : "—", data.costly ? moneyPrecise(data.costly.amount) : "aucune donnée", "neutral")}
        ${metric("Volume vs précédent", signedPercent(data.countVariation), `${data.previousRows.length} avant`, tone(data.countVariation, true))}
        ${metric("Montant vs précédent", signedPercent(data.amountVariation), "compensation", tone(data.amountVariation, true))}
      </div>
      <section class="opsIntelModalBlock">
        <h3>Résumé</h3>
        <ul>
          ${bullet(`Sélection actuelle: ${data.rows.length} plainte(s), ${moneyPrecise(data.amount)}.`, "neutral")}
          ${bullet(`Moyenne 6 semaines: ${data.avg6.count == null ? "—" : data.avg6.count.toFixed(1).replace(".", ",")} plainte(s), ${data.avg6.amount == null ? "—" : moneyPrecise(data.avg6.amount)}.`, "neutral")}
          ${bullet(unusual ? "Hausse inhabituelle détectée vs moyenne 6 semaines." : "Aucune hausse inhabituelle détectée vs moyenne 6 semaines.", unusual ? "bad" : "good")}
        </ul>
      </section>`;
  }

  function renderAuditReading(){
    const data = calculateAuditInsights();
    const lines = [];
    if(data.latest && data.previous && data.scoreDelta != null) lines.push(bullet(`Score ${data.scoreDelta >= 0 ? "en hausse" : "en baisse"} vs audit précédent (${signedNumber(data.scoreDelta, " pts")}).`, tone(data.scoreDelta)));
    if(data.latest && data.latest.bad != null) lines.push(bullet(`${data.latest.bad} point(s) faible(s) au dernier audit.`, data.latest.bad > 0 ? "bad" : "good"));
    if(data.count) lines.push(bullet(`${data.count} audit(s) disponible(s) pour cette lecture.`, "neutral"));
    const weak = data.weak.length
      ? data.weak.map((item) => bullet(`${item.restaurant}: ${item.bad} non-conformité(s) cumulée(s).`, item.bad > 0 ? "bad" : "neutral")).join("")
      : bullet("Aucun point faible récurrent détecté.", "neutral");
    return `
      ${modalHeader("Lecture audit", "Synthèse rapide basée sur l’historique local d’audit.", data.restaurant || "Réseau")}
      <div class="opsIntelModalSplit">
        <section><h3>Évolution</h3><ul>${lines.length ? lines.join("") : bullet("Aucune donnée d'audit historique disponible pour l'instant.", "neutral")}</ul></section>
        <section><h3>Points faibles récurrents</h3><ul>${weak}</ul></section>
      </div>`;
  }

  function renderCalendarReading(){
    const data = calculatePromoInsights();
    const upcoming = data.upcoming.length
      ? data.upcoming.map((event) => {
        const date = eventDate(event);
        return bullet(`${event.title || event.name || "Événement"} - ${date ? date.toLocaleDateString("fr-CA", { day:"numeric", month:"short" }) : "date à confirmer"}`, "neutral");
      }).join("")
      : bullet("Aucune promo à venir enregistrée.", "neutral");
    return `
      ${modalHeader("Lecture calendrier", "Vue légère des promos et opérations calendrier.", "Cette semaine")}
      <div class="opsIntelModalGrid">
        ${metric("Promos actives", String(data.current.length), "calendrier", data.current.length ? "good" : "neutral")}
        ${metric("Jours SMS", String(data.sms.length), "communications", data.sms.length ? "neutral" : "good")}
        ${metric("CSI réseau", percent(data.csi), "si disponible", "neutral")}
        ${metric("Plaintes semaine", String(data.complaints), "si données chargées", data.complaints ? "bad" : "good")}
      </div>
      <section class="opsIntelModalBlock"><h3>À venir</h3><ul>${upcoming}</ul></section>`;
  }

  function renderAll(){
    removeLegacyPanels();
    ensureButtons();
    try{ updateDashboardBadges(); }catch(e){ console.warn("OPS Intelligence dashboard", e); }
  }

  function scheduleRenderAll(delay = 80){
    window.clearTimeout(renderAllTimer);
    renderAllTimer = window.setTimeout(renderAll, delay);
  }

  function wrapFunction(name){
    const fn = window[name];
    if(typeof fn !== "function" || fn.__opsIntelWrapped) return;
    const wrapped = function(){
      const result = fn.apply(this, arguments);
      scheduleRenderAll(80);
      return result;
    };
    wrapped.__opsIntelWrapped = true;
    window[name] = wrapped;
  }

  function bind(){
    ["updateDashboard","updateRestaurant","renderExecutiveDashboard","renderComplaints","syncComplaints","renderPc409Calendar","loadReports"].forEach(wrapFunction);
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-ops-intel]");
      if(button){
        event.preventDefault();
        openModal(button.dataset.opsIntel || "dashboard");
        return;
      }
      if(event.target.closest(".nav,[data-page],[data-pc409-view],#pc409Today,#pc409Prev,#pc409Next,#btnSaveAudit,#btnComplaintsApply,#btnProfileRefresh,#btnDashRefresh")){
        scheduleRenderAll(140);
      }
    }, true);
    ["dashWeek","profileRestaurant","profileWeek","complaintRestaurant","complaintType","complaintQuickWeek","complaintDate","complaintEndDate","auditRestaurant","auditDate"].forEach((id) => {
      const el = $(id);
      if(el) el.addEventListener("change", () => scheduleRenderAll(80));
    });
    [100, 600, 1400, 3200, 6500].forEach((delay) => setTimeout(renderAll, delay));
  }

  window.calculateNetworkTrends = calculateNetworkTrends;
  window.calculateRestaurantInsights = calculateRestaurantInsights;
  window.calculateComplaintInsights = calculateComplaintInsights;
  window.calculateAuditInsights = calculateAuditInsights;
  window.calculatePromoInsights = calculatePromoInsights;
  window.renderOpsIntelligence = renderAll;
  window.openOpsIntelligenceReading = openModal;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind, { once:true });
  }else{
    bind();
  }
})();
