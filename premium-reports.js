(function(){
  "use strict";

  const REPORT_LOGO = "salvatore-logo.jpg";
  let cachedComplaints = [];

  function $(id){ return document.getElementById(id); }
  function esc(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[char]));
  }
  function num(value){
    if(value == null || String(value).trim() === "") return null;
    const parsed = Number(String(value).replace(/\s/g,"").replace(",",".").replace(/[^0-9.-]/g,""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  function money(value){
    const n = num(value);
    return n == null ? "—" : n.toLocaleString("fr-CA", {style:"currency", currency:"CAD", maximumFractionDigits:0});
  }
  function money2(value){
    const n = num(value);
    return n == null ? "—" : n.toLocaleString("fr-CA", {style:"currency", currency:"CAD", minimumFractionDigits:2, maximumFractionDigits:2});
  }
  function pct(value, digits=1){
    const n = num(value);
    return n == null ? "—" : `${n.toLocaleString("fr-CA", {minimumFractionDigits:digits, maximumFractionDigits:digits})} %`;
  }
  function minutes(value){
    const n = num(value);
    return n == null ? "—" : `${n.toLocaleString("fr-CA", {maximumFractionDigits:1})} min`;
  }
  function avg(values){
    const nums = values.map(num).filter(v => v != null);
    return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : null;
  }
  function sum(values){
    return values.map(num).filter(v => v != null).reduce((total, value) => total + value, 0);
  }
  function iso(date){
    if(!date) return "";
    const d = date instanceof Date ? date : new Date(date);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0,10);
  }
  function addDays(date, days, endOfDay){
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    d.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return d;
  }
  function parseWeekRange(label){
    const match = String(label || "").match(/(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/);
    if(!match) return null;
    return {
      start:new Date(`${match[1]}T00:00:00`),
      end:new Date(`${match[2]}T23:59:59`),
      label:`${match[1]} au ${match[2]}`
    };
  }
  function dateLabel(value){
    if(!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-CA", {year:"numeric", month:"short", day:"numeric"});
  }
  function nowLabel(){
    return new Date().toLocaleString("fr-CA", {dateStyle:"long", timeStyle:"short"});
  }
  function getData(){
    try{ if(Array.isArray(DATA)) return DATA.slice(); }catch(e){}
    return Array.isArray(window.DATA) ? window.DATA.slice() : [];
  }
  function getAllowedRestaurants(){
    try{ if(Array.isArray(allowedRestaurants) && allowedRestaurants.length) return allowedRestaurants.slice(); }catch(e){}
    try{
      const saved = JSON.parse(localStorage.getItem("allowedRestaurants") || "null");
      if(Array.isArray(saved) && saved.length) return saved;
    }catch(e){}
    try{ if(Array.isArray(RESTAURANTS) && RESTAURANTS.length) return RESTAURANTS.slice(); }catch(e){}
    return ["Lévis","Beauport","Jonquière","Chicoutimi Nord","St-Nicolas","Dolbeau","Alma","St-Augustin","Montmagny","Donnacona","Pont-Rouge","Chicoutimi Sud","Saint-Raymond","Beauport Nord","La Pocatière","Roberval","St-Lambert"];
  }
  function hasData(row){
    return row && (num(row.sales) != null || num(row.csi) != null || num(row.delay) != null || num(row.growth) != null);
  }
  function selectedDataRows(restaurant, week){
    try{
      if(typeof selectedRows === "function") return selectedRows(restaurant, week).filter(hasData);
    }catch(e){}
    const allowed = new Set(getAllowedRestaurants());
    let rows = getData().filter(row => allowed.has(row.restaurant) && hasData(row));
    if(restaurant && restaurant !== "Réseau complet") rows = rows.filter(row => row.restaurant === restaurant);
    if(week && week !== "latest") return rows.filter(row => row.week === week);
    const weeks = [...new Set(rows.map(row => row.week).filter(Boolean))];
    const last = weeks[weeks.length - 1];
    return last ? rows.filter(row => row.week === last) : rows;
  }
  function effectiveWeek(rows, requested){
    if(requested && requested !== "latest") return requested;
    const weeks = [...new Set(rows.map(row => row.week).filter(Boolean))];
    return weeks[weeks.length - 1] || "latest";
  }
  function getComplaintRows(){
    try{
      const rows = typeof window.getAllComplaints === "function" ? window.getAllComplaints() : null;
      if(Array.isArray(rows) && rows.length) return rows;
    }catch(e){}
    if(Array.isArray(cachedComplaints) && cachedComplaints.length) return cachedComplaints;
    if(Array.isArray(window.COMPLAINTS) && window.COMPLAINTS.length) return window.COMPLAINTS;
    return [];
  }
  async function ensureComplaintsReady(){
    const rows = getComplaintRows();
    if(rows.length) return rows;
    try{
      const sync = window.syncComplaintsFinal || window.syncComplaints;
      if(typeof sync === "function"){
        const synced = await sync();
        if(Array.isArray(synced)) cachedComplaints = synced;
      }
    }catch(e){
      console.warn("Complaint sync before report failed", e);
    }
    return getComplaintRows();
  }
  function complaintDate(row){
    if(row?.date instanceof Date) return row.date;
    return row?.dateIso ? new Date(`${row.dateIso}T12:00:00`) : new Date(row?.date || "");
  }
  function complaintsInRange(rows, range){
    if(!range) return rows.slice();
    return rows.filter(row => {
      const d = complaintDate(row);
      if(Number.isNaN(d.getTime())) return false;
      if(range.start && d < range.start) return false;
      if(range.end && d > range.end) return false;
      return true;
    });
  }
  function complaintsForRestaurant(restaurant, range){
    const rows = getComplaintRows().filter(row => {
      if(!restaurant || restaurant === "Réseau complet" || restaurant === "Tous") return true;
      return String(row.restaurant || "").trim() === restaurant;
    });
    return complaintsInRange(rows, range);
  }
  function groupBy(rows, getKey){
    const map = new Map();
    rows.forEach(row => {
      const key = getKey(row) || "—";
      const item = map.get(key) || {label:key, count:0, amount:0};
      item.count += 1;
      item.amount += num(row.amount) || 0;
      map.set(key, item);
    });
    return [...map.values()].sort((a,b) => b.count - a.count || b.amount - a.amount || a.label.localeCompare(b.label, "fr"));
  }
  function variation(current, previous){
    if(previous == null) return null;
    if(previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / Math.abs(previous)) * 100;
  }
  function delta(value, lowerBetter=true){
    const n = num(value);
    if(n == null || n === 0) return "neutral";
    return lowerBetter ? (n < 0 ? "good" : "bad") : (n > 0 ? "good" : "bad");
  }
  function table(headers, rows, empty="Aucune donnée disponible."){
    const body = rows.length
      ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")
      : `<tr><td class="empty" colspan="${headers.length}">${esc(empty)}</td></tr>`;
    return `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
  }
  function barList(items, opts={}){
    const max = Math.max(1, ...items.map(item => num(item.value) || 0));
    return `<div class="pdfBars">${items.length ? items.map(item => {
      const value = num(item.value);
      const width = value == null ? 0 : Math.max(4, Math.min(100, value / max * 100));
      return `<div class="pdfBarRow"><strong>${esc(item.label)}</strong><div><span style="width:${width.toFixed(2)}%"></span></div><em>${esc(item.display || (opts.percent ? pct(value, 1) : String(value ?? "—")))}</em></div>`;
    }).join("") : `<div class="empty">Aucune donnée disponible.</div>`}</div>`;
  }
  function reportStyles(){
    return `<style>
      @page{size:A4;margin:13mm}
      *{box-sizing:border-box}
      body{margin:0;background:#edf1f7;color:#111827;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.45}
      .pdfToolbar{position:sticky;top:0;z-index:10;display:flex;justify-content:flex-end;gap:10px;padding:14px 22px;background:rgba(5,10,19,.92);border-bottom:1px solid rgba(255,255,255,.12);backdrop-filter:blur(18px)}
      .pdfToolbar button{border:1px solid rgba(255,255,255,.14);border-radius:12px;background:#172233;color:#fff;font-weight:850;padding:11px 15px;cursor:pointer}
      .pdfToolbar .primary{background:linear-gradient(135deg,#e11d2e,#b81424);border-color:#fb5a66;box-shadow:0 14px 32px rgba(225,29,46,.25)}
      .pdfReport{max-width:1180px;margin:0 auto;padding:28px}
      .pdfHero{overflow:hidden;position:relative;border-radius:26px;padding:28px;color:#fff;background:radial-gradient(circle at 78% 8%,rgba(225,29,46,.42),transparent 34%),linear-gradient(135deg,#07111e,#111827 58%,#280812);box-shadow:0 30px 80px rgba(15,23,42,.22)}
      .pdfBrand{display:flex;align-items:center;gap:14px;margin-bottom:26px}
      .pdfBrand img{width:52px;height:52px;border-radius:14px;object-fit:contain;background:#fff;padding:6px}
      .pdfBrand strong{display:block;text-transform:uppercase;letter-spacing:.12em;font-size:13px}.pdfBrand span{color:#aeb8c9;font-size:12px}
      h1{font-size:34px;letter-spacing:-.025em;margin:0 0 8px}p{margin:0}.muted{color:#64748b}
      .pdfHero p{color:#d8e0ec}.pdfContext{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px}
      .pdfContext div{padding:14px;border-radius:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}
      .eyebrow{display:block;margin-bottom:5px;color:#8fa0b7;text-transform:uppercase;letter-spacing:.08em;font-size:10.5px;font-weight:950}
      .pdfContext strong{font-size:14px}.pdfKpis{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin:18px 0}
      .pdfKpi,.pdfPanel{background:#fff;border:1px solid #dbe3ee;border-radius:18px;box-shadow:0 16px 44px rgba(15,23,42,.08)}
      .pdfKpi{padding:18px}.pdfKpi strong{display:block;font-size:25px;letter-spacing:-.02em}.pdfKpi small{display:block;color:#64748b;font-weight:750;margin-top:5px}
      .pdfGrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pdfPanel{padding:20px;margin-bottom:16px;overflow:hidden}
      .pdfPanel.wide{grid-column:1/-1}.pdfPanel h2{margin:0 0 14px;font-size:18px;letter-spacing:-.01em}
      .summary{padding:16px;border-radius:16px;background:linear-gradient(135deg,#f8fafc,#edf4ff);border:1px solid #dce7f6;color:#334155;font-size:15px}
      table{width:100%;border-collapse:collapse;font-size:12.5px}th{text-align:left;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-size:10px;border-bottom:1px solid #e2e8f0;padding:9px 8px}td{border-bottom:1px solid #eef2f7;padding:10px 8px;vertical-align:top}tr:last-child td{border-bottom:0}
      .empty{text-align:center!important;color:#64748b;font-weight:850;padding:22px!important}.good{color:#16a34a!important}.bad{color:#dc2626!important}.neutral{color:#64748b!important}
      .pdfBars{display:grid;gap:12px}.pdfBarRow{display:grid;grid-template-columns:minmax(110px,.9fr) 1.4fr 66px;gap:12px;align-items:center}.pdfBarRow strong{font-size:12.5px}.pdfBarRow div{height:11px;border-radius:999px;background:#e6edf5;overflow:hidden}.pdfBarRow span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#ef4444,#f97316,#22c55e)}.pdfBarRow em{font-style:normal;color:#334155;font-weight:850;text-align:right}
      .pdfFooter{text-align:center;color:#64748b;font-size:11px;margin:22px 0 8px}
      @media(max-width:820px){.pdfReport{padding:14px}.pdfHero{padding:22px}h1{font-size:27px}.pdfContext,.pdfKpis,.pdfGrid{grid-template-columns:1fr}.pdfToolbar{justify-content:stretch}.pdfToolbar button{flex:1}.pdfPanel{overflow-x:auto}table{min-width:720px}.pdfBarRow{grid-template-columns:1fr}.pdfBarRow em{text-align:left}}
      @media print{body{background:#fff}.pdfToolbar{display:none}.pdfReport{max-width:none;padding:0}.pdfHero,.pdfKpi,.pdfPanel{box-shadow:none}.pdfHero{border-radius:18px}.pdfPanel,.pdfKpi{break-inside:avoid}.pdfPanel.wide{break-inside:auto}tr{break-inside:avoid}}
    </style>`;
  }
  function renderPremiumPdfReport(report){
    const logo = esc(new URL(REPORT_LOGO, window.location.href).href);
    const kpis = report.kpis.map(kpi => `<div class="pdfKpi"><span class="eyebrow">${esc(kpi.label)}</span><strong class="${esc(kpi.className || "")}">${esc(kpi.value ?? "—")}</strong><small>${esc(kpi.note || "")}</small></div>`).join("");
    const sections = report.sections.map(section => `<section class="pdfPanel ${section.wide ? "wide" : ""}"><h2>${esc(section.title)}</h2>${section.html}</section>`).join("");
    const meta = report.meta.map(item => `<div><span class="eyebrow">${esc(item.label)}</span><strong>${esc(item.value || "—")}</strong></div>`).join("");
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(report.title)}</title>${reportStyles()}</head><body>
      <div class="pdfToolbar"><button type="button" onclick="window.close()">Fermer</button><button class="primary" type="button" onclick="window.print()">Imprimer / Enregistrer PDF</button></div>
      <main class="pdfReport">
        <section class="pdfHero">
          <div class="pdfBrand"><img src="${logo}" alt="Dashboard OPS"><div><strong>Dashboard OPS</strong><span>${esc(report.badge || "Rapport premium")}</span></div></div>
          <h1>${esc(report.title)}</h1><p>${esc(report.subtitle || "")}</p>
          <div class="pdfContext">${meta}</div>
        </section>
        <section class="pdfKpis">${kpis}</section>
        <section class="pdfGrid">${sections}</section>
        <div class="pdfFooter">${esc(report.footer || `Genere le ${nowLabel()}`)}</div>
      </main>
    </body></html>`;
  }

  async function addOpenAiReportSummary(report, type){
    try{
      if(!window.OPS_AI_PROVIDER?.generateFranchiseeReport || !window.OPS_AI_ACCESS?.buildDataSummary) return report;
      const question = type === "network"
        ? "Prépare un rapport exécutif réseau premium avec les données visibles."
        : type === "restaurant"
          ? "Prépare un rapport restaurant premium avec les données visibles."
          : "Prépare un rapport plaintes premium avec les données visibles.";
      const context = window.OPS_AI_ACCESS.buildDataSummary(question);
      const result = await window.OPS_AI_PROVIDER.generateFranchiseeReport({
        question,
        localAnswer:report.summary || "",
        context,
        reportPreview:{
          title:report.title,
          meta:report.meta,
          kpis:report.kpis,
          footer:report.footer
        }
      });
      const answer = String(result?.answer || "").trim();
      if(answer){
        report.sections.unshift({
          title:"Analyse OPS AI",
          wide:true,
          html:`<div class="summary">${esc(answer).replace(/\n/g, "<br>")}</div>`
        });
      }
    }catch(error){
      console.warn("Analyse OpenAI rapport indisponible:", error?.message || error);
    }
    return report;
  }

  function readComplaintFilters(){
    const restaurant = $("cfComplaintRestaurant")?.value || $("complaintRestaurant")?.value || "Tous";
    const type = $("cfComplaintType")?.value || $("complaintType")?.value || "Tous";
    const week = $("cfComplaintQuickWeek")?.value || $("complaintQuickWeek")?.value || "all";
    const start = $("cfComplaintDate")?.value || $("complaintDate")?.value || "";
    const end = $("cfComplaintEndDate")?.value || $("complaintEndDate")?.value || "";
    let range = null;
    if(start || end){
      range = {
        start:start ? new Date(`${start}T00:00:00`) : null,
        end:end ? new Date(`${end}T23:59:59`) : null,
        label:start && end ? `${start} au ${end}` : start ? `Depuis ${start}` : `Jusqu'au ${end}`
      };
    }else if(week && week !== "all" && week !== "latest"){
      range = parseWeekRange(week);
    }
    return {restaurant, type, week, range, periodLabel:range?.label || "Toutes les plaintes importées"};
  }
  function buildComplaintReportData(){
    const filters = readComplaintFilters();
    const all = getComplaintRows().filter(row => {
      if(filters.restaurant !== "Tous" && row.restaurant !== filters.restaurant) return false;
      if(filters.type !== "Tous" && String(row.type || "") !== filters.type) return false;
      return true;
    });
    const rows = complaintsInRange(all, filters.range);
    const amount = sum(rows.map(row => row.amount));
    const categories = groupBy(rows, row => row.type || "Non précisé");
    let previousRows = [];
    if(filters.range?.start && filters.range?.end){
      const days = Math.max(1, Math.round((filters.range.end - filters.range.start) / 86400000) + 1);
      previousRows = complaintsInRange(all, {
        start:addDays(filters.range.start, -days, false),
        end:addDays(filters.range.end, -days, true)
      });
    }
    const sixWeeks = [];
    if(filters.range?.start && filters.range?.end){
      const days = Math.max(1, Math.round((filters.range.end - filters.range.start) / 86400000) + 1);
      for(let i=0;i<6;i++){
        const start = addDays(filters.range.start, -days * i, false);
        const end = addDays(filters.range.end, -days * i, true);
        const weekRows = complaintsInRange(all, {start, end});
        sixWeeks.push({label:i === 0 ? "Actuelle" : `Semaine -${i}`, period:`${iso(start)} au ${iso(end)}`, count:weekRows.length, amount:sum(weekRows.map(row => row.amount))});
      }
    }
    const previousAmount = sum(previousRows.map(row => row.amount));
    const avg6Count = sixWeeks.length ? avg(sixWeeks.map(item => item.count)) : null;
    const avg6Amount = sixWeeks.length ? avg(sixWeeks.map(item => item.amount)) : null;
    const countVar = previousRows.length || rows.length ? variation(rows.length, previousRows.length) : null;
    const amountVar = previousRows.length || rows.length ? variation(amount, previousAmount) : null;
    const summary = rows.length
      ? `${filters.restaurant === "Tous" ? "Le réseau" : filters.restaurant} affiche ${rows.length} plainte(s) pour ${money2(amount)} sur ${filters.periodLabel}. La catégorie dominante est ${categories[0]?.label || "—"}.`
      : `Aucune plainte visible pour cette sélection. Le rapport garde tout de même la trace du restaurant, de la période et du filtre utilisé.`;
    return {
      title:"Rapport plaintes",
      subtitle:"Analyse des plaintes selon les filtres actifs.",
      badge:"Rapport plaintes",
      meta:[
        {label:"Restaurant", value:filters.restaurant === "Tous" ? "Réseau complet" : filters.restaurant},
        {label:"Période", value:filters.periodLabel},
        {label:"Type", value:filters.type === "Tous" ? "Tous les types" : filters.type},
        {label:"Généré", value:nowLabel()}
      ],
      kpis:[
        {label:"Plaintes", value:String(rows.length), note:"Période sélectionnée"},
        {label:"Montant", value:money2(amount), note:"Compensation totale"},
        {label:"Variation plaintes", value:countVar == null ? "—" : pct(countVar), note:"vs période précédente", className:delta(countVar, true)},
        {label:"Variation montant", value:amountVar == null ? "—" : pct(amountVar), note:"vs période précédente", className:delta(amountVar, true)},
        {label:"Moyenne 6 semaines", value:avg6Count == null ? "—" : avg6Count.toLocaleString("fr-CA",{maximumFractionDigits:1}), note:avg6Amount == null ? "—" : money2(avg6Amount)}
      ],
      sections:[
        {title:"Résumé exécutif", html:`<div class="summary">${esc(summary)}</div>`, wide:true},
        {title:"Plaintes par catégorie", html:table(["Catégorie","Plaintes","Montant"], categories.map(item => [esc(item.label), String(item.count), money2(item.amount)]))},
        {title:"Graphique catégories", html:barList(categories.map(item => ({label:item.label, value:item.count, display:String(item.count)})))},
        {title:"Historique 6 semaines", wide:true, html:table(["Semaine","Période","Plaintes","Montant"], sixWeeks.map(item => [esc(item.label), esc(item.period), String(item.count), money2(item.amount)]), "Moyenne non disponible pour cette sélection.")},
        {title:"Liste détaillée des plaintes", wide:true, html:table(["Date","Restaurant","Type","Client","Montant","Ticket","Détail"], rows.map(row => [esc(iso(complaintDate(row)) || row.dateIso || "—"), esc(row.restaurant || "—"), esc(row.type || "—"), esc(row.client || "—"), money2(row.amount || 0), esc(row.ticket || "—"), esc(row.description || row.reason || "—")]), "Aucune plainte pour cette sélection.")}
      ],
      footer:`Source CSV live plaintes | ${rows.length} plainte(s) dans le rapport`
    };
  }

  function buildRestaurantReportData(){
    const restaurant = $("profileRestaurant")?.value || $("restaurantSelect")?.value || getAllowedRestaurants()[0] || "Restaurant";
    const requestedWeek = $("profileWeek")?.value || $("restaurantWeek")?.value || "latest";
    const rows = selectedDataRows(restaurant, requestedWeek);
    const row = rows[rows.length - 1] || {};
    const week = row.week || effectiveWeek(selectedDataRows(restaurant, "latest"), requestedWeek);
    const range = parseWeekRange(week);
    const complaints = complaintsForRestaurant(restaurant, range);
    const complaintAmount = sum(complaints.map(item => item.amount));
    const dataRows = getData().filter(item => item.restaurant === restaurant && hasData(item)).slice(-8);
    const summary = row.restaurant
      ? `${restaurant} affiche ${money(row.sales)} en ventes, un CSI de ${pct(row.csi)} et un délai moyen de ${minutes(row.delay)} pour ${week}. Les plaintes visibles totalisent ${complaints.length} dossier(s) pour ${money2(complaintAmount)}.`
      : `${restaurant} n'a pas de données réseau visibles pour la période sélectionnée. Les cartes affichent les plaintes disponibles si elles existent.`;
    const watch = [];
    if(num(row.csi) != null && num(row.csi) < 88) watch.push("CSI sous l'objectif 88%.");
    if(num(row.delay) != null && num(row.delay) > 40) watch.push("Délai de livraison à surveiller.");
    if(complaints.length) watch.push("Valider les plaintes récurrentes de la période.");
    if(!watch.length) watch.push("Aucun point majeur automatiquement détecté.");
    return {
      title:"Rapport restaurant",
      subtitle:"Snapshot opérationnel du restaurant sélectionné.",
      badge:"Rapport restaurant",
      meta:[
        {label:"Restaurant", value:restaurant},
        {label:"Période", value:week || "—"},
        {label:"Généré", value:nowLabel()},
        {label:"Source", value:"Google Sheets + Plaintes"}
      ],
      kpis:[
        {label:"Ventes", value:money(row.sales), note:"Semaine sélectionnée"},
        {label:"CSI", value:pct(row.csi), note:"Objectif 88%"},
        {label:"Délais", value:minutes(row.delay), note:"Livraison"},
        {label:"Plaintes", value:String(complaints.length), note:"Période sélectionnée"},
        {label:"Montant plaintes", value:money2(complaintAmount), note:"Compensation totale"}
      ],
      sections:[
        {title:"Résumé exécutif", html:`<div class="summary">${esc(summary)}</div>`, wide:true},
        {title:"Évolution récente", html:table(["Semaine","Ventes","CSI","Délais"], dataRows.map(item => [esc(item.week || "—"), money(item.sales), pct(item.csi), minutes(item.delay)]))},
        {title:"Graphique CSI", html:barList(dataRows.map(item => ({label:(item.week || "").replace(/^(\d{4})-/,""), value:num(item.csi), display:pct(item.csi)})), {percent:true})},
        {title:"Points à surveiller", html:`<ul>${watch.map(item => `<li>${esc(item)}</li>`).join("")}</ul>`},
        {title:"Plaintes de la période", wide:true, html:table(["Date","Type","Client","Montant","Ticket"], complaints.map(row => [esc(iso(complaintDate(row)) || row.dateIso || "—"), esc(row.type || "—"), esc(row.client || "—"), money2(row.amount || 0), esc(row.ticket || "—")]), "Aucune plainte pour cette période.")}
      ],
      footer:`Rapport restaurant | ${restaurant} | ${week || "—"}`
    };
  }

  function activePromos(range){
    let events = [];
    try{ if(typeof window.pc409GetCalendarEvents === "function") events = window.pc409GetCalendarEvents() || []; }catch(e){}
    return events.filter(event => {
      const text = `${event.title || ""} ${event.category || ""}`.toLowerCase();
      if(!text.includes("promo") && event.category !== "hockey" && event.category !== "sms") return false;
      if(!range) return true;
      const start = new Date(`${event.start || event.date || ""}T00:00:00`);
      const end = new Date(`${event.end || event.start || event.date || ""}T23:59:59`);
      if(Number.isNaN(start.getTime())) return true;
      return end >= range.start && start <= range.end;
    }).slice(0, 8);
  }
  function buildNetworkReportData(){
    const requestedWeek = $("dashWeek")?.value || "latest";
    const rows = selectedDataRows("Réseau complet", requestedWeek);
    const week = effectiveWeek(rows, requestedWeek);
    const range = parseWeekRange(week);
    const complaints = complaintsForRestaurant("Réseau complet", range);
    const complaintAmount = sum(complaints.map(row => row.amount));
    const sorted = rows.slice().sort((a,b) => (num(b.csi) || 0) - (num(a.csi) || 0));
    const bottom = rows.slice().filter(row => num(row.csi) != null).sort((a,b) => (num(a.csi) || 0) - (num(b.csi) || 0));
    const promos = activePromos(range);
    const totalSales = sum(rows.map(row => row.sales));
    const avgCsi = avg(rows.map(row => row.csi));
    const avgDelay = avg(rows.map(row => row.delay));
    const summary = rows.length
      ? `Le réseau complet compte ${rows.length} restaurant(s) avec données pour ${week}. Les ventes réseau totalisent ${money(totalSales)}, le CSI moyen est ${pct(avgCsi)} et le délai moyen est ${minutes(avgDelay)}.`
      : "Aucune donnée réseau disponible pour cette période. Le rapport affiche les sections prévues avec des valeurs neutres.";
    return {
      title:"Rapport réseau",
      subtitle:"Executive snapshot du réseau complet.",
      badge:"Executive snapshot",
      meta:[
        {label:"Vue", value:"Réseau complet"},
        {label:"Période", value:week || "—"},
        {label:"Restaurants actifs", value:String(rows.length || "—")},
        {label:"Généré", value:nowLabel()}
      ],
      kpis:[
        {label:"Ventes réseau", value:money(totalSales), note:"Restaurants avec données"},
        {label:"CSI réseau", value:pct(avgCsi), note:"Moyenne réseau"},
        {label:"Délais réseau", value:minutes(avgDelay), note:"Moyenne réseau"},
        {label:"Plaintes réseau", value:String(complaints.length), note:money2(complaintAmount)},
        {label:"Promos actives", value:String(promos.length), note:"Calendrier OPS"}
      ],
      sections:[
        {title:"Résumé exécutif", html:`<div class="summary">${esc(summary)}</div>`, wide:true},
        {title:"Top restaurants", html:table(["Restaurant","Ventes","CSI","Délais"], sorted.slice(0,5).map(row => [esc(row.restaurant), money(row.sales), pct(row.csi), minutes(row.delay)]))},
        {title:"Restaurants en bas de classement", html:table(["Restaurant","Ventes","CSI","Délais"], bottom.slice(0,5).map(row => [esc(row.restaurant), money(row.sales), pct(row.csi), minutes(row.delay)]))},
        {title:"Graphique CSI réseau", wide:true, html:barList(sorted.map(row => ({label:row.restaurant, value:num(row.csi), display:pct(row.csi)})), {percent:true})},
        {title:"Promos actives", wide:true, html:table(["Promo","Début","Fin","Catégorie"], promos.map(event => [esc(event.title || "Promo"), esc(dateLabel(event.start || event.date)), esc(dateLabel(event.end || event.start || event.date)), esc(event.category || "—")]), "Aucune promo active pour cette période.")}
      ],
      footer:`Executive snapshot | ${week || "—"}`
    };
  }

  async function exportPremiumPdfReport(type){
    showOpsLoader(type === "network" ? "Préparation du rapport réseau..." : type === "restaurant" ? "Préparation du rapport restaurant..." : "Préparation du rapport plaintes...");
    try{
      if(type === "complaints" || type === "restaurant" || type === "network"){
        await ensureComplaintsReady();
      }
      const report = type === "restaurant"
        ? buildRestaurantReportData()
        : type === "network"
          ? buildNetworkReportData()
          : buildComplaintReportData();
      await addOpenAiReportSummary(report, type);
      const reportWindow = window.open("", "_blank");
      if(!reportWindow){
        alert("Le rapport n'a pas pu s'ouvrir. Autorise les popups pour Dashboard OPS, puis réessaie.");
        return;
      }
      reportWindow.document.open();
      reportWindow.document.write(renderPremiumPdfReport(report));
      reportWindow.document.close();
      reportWindow.focus();
    }catch(error){
      console.error(error);
      alert("Erreur pendant la génération du rapport : " + (error.message || error));
    }finally{
      hideOpsLoader();
    }
  }

  function ensureLoader(){
    let loader = $("opsGlobalLoader");
    if(loader) return loader;
    loader = document.createElement("div");
    loader.id = "opsGlobalLoader";
    loader.className = "opsGlobalLoader hidden";
    loader.innerHTML = `<div><span></span><strong id="opsGlobalLoaderText">Chargement...</strong></div>`;
    document.body.appendChild(loader);
    return loader;
  }
  function showOpsLoader(text){
    const loader = ensureLoader();
    const label = $("opsGlobalLoaderText");
    if(label) label.textContent = text || "Chargement...";
    loader.classList.remove("hidden");
    clearTimeout(showOpsLoader.timer);
    showOpsLoader.timer = setTimeout(hideOpsLoader, 14000);
  }
  function hideOpsLoader(){
    const loader = $("opsGlobalLoader");
    if(loader) loader.classList.add("hidden");
    clearTimeout(showOpsLoader.timer);
  }
  function installPolish(){
    ensureLoader();
    showOpsLoader("Synchronisation du Dashboard OPS...");
    setTimeout(hideOpsLoader, 900);
    document.addEventListener("click", event => {
      const id = event.target?.id || "";
      if(["btnSyncSheet","btnComplaintsSync","cfBtnComplaintsSync","btnSyncComplaintsConfig"].includes(id)){
        showOpsLoader("Synchronisation des données...");
      }
      const nav = event.target?.closest?.(".nav");
      if(nav){
        document.body.classList.add("opsTabSwitching");
        setTimeout(() => document.body.classList.remove("opsTabSwitching"), 420);
      }
    }, true);
    ["syncSheet","syncComplaints","syncComplaintsFinal"].forEach(name => {
      const fn = window[name];
      if(typeof fn !== "function" || fn.__premiumLoaderWrapped) return;
      window[name] = function(){
        showOpsLoader("Synchronisation des données...");
        const result = fn.apply(this, arguments);
        Promise.resolve(result).finally(() => setTimeout(hideOpsLoader, 250));
        return result;
      };
      window[name].__premiumLoaderWrapped = true;
    });
  }
  function bindReportButtons(){
    const profilePdf = $("btnProfilePdf");
    if(profilePdf){
      profilePdf.onclick = event => {
        event.preventDefault();
        exportPremiumPdfReport("restaurant");
      };
    }
    const networkPdf = $("btnNetworkPdf");
    if(networkPdf){
      networkPdf.onclick = event => {
        event.preventDefault();
        exportPremiumPdfReport("network");
      };
    }
    ["btnComplaintPdf","cfBtnComplaintPdf"].forEach(id => {
      const button = $(id);
      if(button){
        button.onclick = event => {
          event.preventDefault();
          exportPremiumPdfReport("complaints");
        };
      }
    });
  }
  function boot(){
    installPolish();
    bindReportButtons();
    [700, 1800, 4200, 8000].forEach(delay => setTimeout(bindReportButtons, delay));
  }

  window.buildComplaintReportData = buildComplaintReportData;
  window.buildRestaurantReportData = buildRestaurantReportData;
  window.buildNetworkReportData = buildNetworkReportData;
  window.renderPremiumPdfReport = renderPremiumPdfReport;
  window.exportPremiumPdfReport = exportPremiumPdfReport;
  window.exportComplaintReportPdf = function(){ return exportPremiumPdfReport("complaints"); };
  window.exportRestaurantReportPdf = function(){ return exportPremiumPdfReport("restaurant"); };
  window.exportNetworkReportPdf = function(){ return exportPremiumPdfReport("network"); };

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
