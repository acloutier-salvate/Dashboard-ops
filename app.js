
const RESTAURANTS = ["Lévis","Beauport","Jonquière","Chicoutimi Nord","St-Nicolas","Dolbeau","Alma","St-Augustin","Montmagny","Donnacona","Pont-Rouge","Chicoutimi Sud","Saint-Raymond","Beauport Nord","Roberval","St-Lambert","La Pocatière"];
window.OPS_ARCHITECTURE_V40 = {
  complaintsEngine: "complaints-isolated-v31.js",
  calendarEngine: "pc409-independent-calendar-v432",
  legacyComplaintsDisabled: true,
  legacyCalendarDisabled: true
};
let DATA = [];
let allowedRestaurants = [...RESTAURANTS];
let sb = null;
let currentUser = null;
let answers = {};
const QUESTIONS = ["Vérifier qu’il y a suffisamment de pâte sortie pour le rush. La pâte doit atteindre 13℃ avant l’ouverture (11h00) ou avant le début du souper (15h30).", "Vérifier que les sauces à poutine sont bien à 74℉ avant l’ouverture du restaurant à 11h00.", "Vérifier que les sauces à poutine ont été filtrées et qu’elles ne contiennent pas de grumeaux. L’insert doit être propre.", "Vérifier les tables de garnitures pour assurer que tous les ingrédients sont datés et ne contiennent pas d’ingrédients expirés.", "Vérifier qu’il y a suffisamment d’ingrédients en back-up pour la période de pointe.", "Vérifier s’il y a des pré-tapes de faites pour la période de pointe.", "Vérifier que l’espace friteuse et sortie de four est bien rempli avec des contenants pour emporter. Les outils de travail doivent être disponibles.", "Vérifier que l’huile des friteuses a été filtrée. L’affiche pour la rotation des huiles est présente et la procédure est suivie.", "Vérifier que les assainisseurs sont bien en place et que leur concentration est bonne (200 ppm).", "Vérifier que tous les équipiers sont en uniforme complet et qu’aucun bijou n’est porté.", "Vérifier le foyer / lobby pour s’assurer que le restaurant est prêt à accueillir les clients : plancher bien lavé, chaises bien placées et propres, vitrines et portes bien lavées, aucun résidu sur le plancher, comptoir désencombré et bien rangé, toilette client propre si applicable.", "Vérifier que les télés menu et la musique fonctionnent.", "Vérifier que le registre de température est bien rempli et que le bon format est en place.", "Vérifier la propreté générale du restaurant.", "Vérifier la propreté extérieure du restaurant.", "Vérifier l’horaire de la journée, le plan de match utilisé et l’horaire pour la semaine courante."];
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQVnbsslU6yfX4CNcXAH1cw4-7DFrZyMLt6NJmymwITALwvloEfZ9u0hhg_gNUNE8XmvgAZNO-LUG5z/pub?output=csv";
let sheetSyncPromise = null;

function $(id){ return document.getElementById(id); }
function val(id, fallback=""){
  const el=$(id);
  return el ? el.value : fallback;
}
function setText(id, text){
  const el=$(id);
  if(el) el.textContent=text;
}
function setHtml(id, html){
  const el=$(id);
  if(el) el.innerHTML=html;
}
function toast(t){ const el=$("toast"); el.textContent=t; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),1500); }
function cacheBustMainSheetUrl(url){
  const clean = String(url || "").trim().replace(/&amp;/g, "&") || DEFAULT_SHEET_URL;
  return clean + (clean.includes("?") ? "&" : "?") + "_opsSync=" + Date.now();
}
function fetchWithTimeout(url, options={}, timeoutMs=30000){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {...options, signal:controller.signal}).finally(() => clearTimeout(timer));
}
const OPS_READY_CALLBACKS = [];
let OPS_READY_FIRED = false;
function onOpsReady(callback){
  if(OPS_READY_FIRED || document.readyState !== "loading"){
    try{ callback(); }catch(error){ console.error(error); }
    return;
  }
  OPS_READY_CALLBACKS.push(callback);
}
document.addEventListener('DOMContentLoaded', ()=>{
  OPS_READY_FIRED = true;
  OPS_READY_CALLBACKS.splice(0).forEach(callback=>{
    try{ callback(); }catch(error){ console.error(error); }
  });
}, { once: true });
function moneyCents(n){ return n==null || isNaN(n) ? "—" : Number(n).toLocaleString("fr-CA",{style:"currency",currency:"CAD",minimumFractionDigits:2,maximumFractionDigits:2}); }
function money(n){ return n==null || isNaN(n) ? "—" : "$"+Math.round(n).toLocaleString("fr-CA"); }
function pct(n){ return n==null || isNaN(n) ? "—" : Number(n).toFixed(1)+"%"; }
function csiClass(v){ v=Number(v||0); if(v>88)return"green"; if(v>=85)return"yellow"; if(v>=84)return"orange"; return"redbar"; }

function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $("page-"+page).classList.add("active");
  document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  if(page === "tools" && typeof window.renderToolsHub === "function"){
    try{ window.renderToolsHub(); }catch(e){ console.error(e); }
  }
  if(page === "inventory" && typeof window.renderInventoryCommand === "function"){
    try{ window.renderInventoryCommand(); }catch(e){ console.error(e); }
  }
  if(page === "admin" && typeof window.renderOpsAdminCenterV513 === "function"){
    try{ window.renderOpsAdminCenterV513(); }catch(e){ console.error(e); }
  }
  if(page === "messages" && typeof window.repairMessageRestaurantSelection === "function"){
    try{ setTimeout(window.repairMessageRestaurantSelection, 60); }catch(e){ console.error(e); }
  }
  setTimeout(()=>{ try{ animateVisibleValues($("page-"+page)); }catch(e){} }, 80);
}
function showConfig(tab){
  document.querySelectorAll(".configPage").forEach(p=>p.classList.remove("active"));
  $("config-"+tab).classList.add("active");
  document.querySelectorAll(".configTab").forEach(b=>b.classList.toggle("active",b.dataset.config===tab));
}
function fillSelect(id, list, network=false){
  const el=$(id); if(!el) return;
  const cur=el.value;
  el.innerHTML=(network?'<option>Réseau complet</option>':'')+list.map(r=>`<option>${r}</option>`).join("");
  if([...el.options].some(o=>o.value===cur)) el.value=cur;
}
function fillWeeks(){
  const weeks=[...new Set(DATA.map(x=>x.week).filter(Boolean))];
  const html='<option value="latest">Dernière semaine</option>'+weeks.map(w=>`<option>${w}</option>`).join("");
  ["dashWeek","profileWeek","restaurantWeek","dashboardWeek","msgWeek"].forEach(id=>{ if($(id)) $(id).innerHTML=html; });
}
function refreshSelects(){
  fillSelect("dashRestaurant", allowedRestaurants, true);
  ["profileRestaurant","auditRestaurant","msgRestaurant"].forEach(id=>fillSelect(id, allowedRestaurants));
  fillWeeks();
  renderRestaurantAccess();
}
function selectedRows(resto, week){
  let rows=DATA.filter(x=>allowedRestaurants.includes(x.restaurant));
  if(resto && resto!=="Réseau complet") rows=rows.filter(x=>x.restaurant===resto);
  if(week && week!=="latest") return rows.filter(x=>x.week===week);
  const last=rows.length ? rows[rows.length-1].week : null;
  return rows.filter(x=>x.week===last);
}
function avg(rows,key){
  const vals=rows.map(r=>Number(r[key])).filter(v=>!isNaN(v));
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}

function updateDashboard(){
  const selectedRestaurant=val("dashboardRestaurant", val("dashRestaurant","Réseau complet"));
  const selectedWeek=val("dashboardWeek", val("dashWeek","latest"));
  const rows=selectedRows(selectedRestaurant,selectedWeek);

  setText("dashSales", money(rows.reduce((s,r)=>s+(Number(r.sales)||0),0)));
  setText("dashGrowth", pct(avg(rows,"growth")));
  setText("dashCsi", pct(avg(rows,"csi")));
  const d=avg(rows,"delay");
  setText("dashDelay", d?d.toFixed(1)+" min":"—");

  const comparisonRows=selectedRows("Réseau complet",selectedWeek)
    .filter(r=>allowedRestaurants.includes(r.restaurant))
    .sort((a,b)=>(b.csi||0)-(a.csi||0));

  setHtml("csiBars", comparisonRows.length
    ? comparisonRows.map(r=>`<div class="barRow"><strong>${r.restaurant}</strong><div class="track"><div class="fill ${csiClass(r.csi)}" style="width:${Math.max(0,Math.min(100,r.csi||0))}%"></div></div><span>${pct(r.csi)}</span></div>`).join("")
    : "<div class='alert'>Aucune donnée. Synchronise Google Sheet dans Configuration.</div>");
}

function buildLineChart(restaurant){
  const rows=DATA.filter(x=>x.restaurant===restaurant && x.csi!=null).slice(-12);
  if(!rows.length) return "<div class='alert'>Aucune donnée CSI disponible.</div>";

  const w=900,h=320,p=45;
  const values=rows.map(r=>Number(r.csi)||0);
  const min=Math.min(75,Math.floor(Math.min(...values)-2));
  const max=Math.max(100,Math.ceil(Math.max(...values)+2));

  const x=i=>p+(i*(w-p*2))/Math.max(1,rows.length-1);
  const y=v=>h-p-((v-min)/(max-min))*(h-p*2);

  const points=rows.map((r,i)=>`${x(i)},${y(Number(r.csi)||0)}`).join(" ");
  const targetY=y(88);

  const grid=[80,84,85,88,92,96,100]
    .filter(v=>v>=min&&v<=max)
    .map(v=>`<line class="grid" x1="${p}" x2="${w-p}" y1="${y(v)}" y2="${y(v)}"></line><text class="label" x="10" y="${y(v)+4}">${v}%</text>`)
    .join("");

  const labels=rows.map((r,i)=>`<text class="label" x="${x(i)}" y="${h-12}" text-anchor="middle">${String(r.week).slice(5,10)}</text>`).join("");
  const circles=rows.map((r,i)=>`<circle class="point" cx="${x(i)}" cy="${y(Number(r.csi)||0)}" r="5"><title>${r.week}: ${pct(r.csi)}</title></circle>`).join("");

  return `<div class="lineChartWrap"><svg class="lineChart" viewBox="0 0 ${w} ${h}">
    ${grid}
    <line class="target" x1="${p}" x2="${w-p}" y1="${targetY}" y2="${targetY}"></line>
    <text class="label" x="${w-p}" y="${targetY-6}" text-anchor="end">Objectif 88%</text>
    <polyline class="line" points="${points}"></polyline>
    ${circles}
    ${labels}
  </svg></div>`;
}

function restaurantComplaintSummary(rest, week){
  const rows = Array.isArray(window.COMPLAINTS) ? window.COMPLAINTS : [];
  if(!rest || !rows.length) return {loaded:false,count:null,total:null};
  const key = restaurantComplaintKey(rest);
  const range = restaurantComplaintWeekRange(week);
  const matches = rows.filter(row => {
    if(restaurantComplaintKey(row.restaurant) !== key) return false;
    if(range && row.date instanceof Date) return row.date >= range.start && row.date <= range.end;
    return true;
  });
  return {
    loaded:true,
    count:matches.length,
    total:matches.reduce((sum,row)=>sum+(Number(row.amount)||0),0)
  };
}
function restaurantComplaintKey(value){
  return norm(value)
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\bst\b/g,"saint")
    .trim();
}
function restaurantComplaintWeekRange(label){
  const text = String(label || "");
  if(!text || text === "latest") return null;
  const match = text.match(/(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/);
  if(!match) return null;
  return {
    start:new Date(match[1] + "T00:00:00"),
    end:new Date(match[2] + "T23:59:59")
  };
}
function restaurantComplaintCount(summary){
  return summary && summary.loaded ? String(summary.count) : "—";
}
function restaurantComplaintAmount(summary){
  return summary && summary.loaded ? moneyCents(summary.total || 0) : "—";
}

function updateRestaurant(){
  const rest=val("restaurantSelect", val("profileRestaurant",""));
  const week=val("restaurantWeek", val("profileWeek","latest"));
  const rows=selectedRows(rest,week);
  const r=rows[rows.length-1];
  if(!r){
    const complaintSummary = restaurantComplaintSummary(rest, week);
    const emptyHtml=`<div class="cards">
      <div class="card"><label>Ventes</label><div class="value">—</div><div class="note">Aucune donnée</div></div>
      <div class="card"><label>Augmentation ventes</label><div class="value">—</div><div class="note">Variation</div></div>
      <div class="card"><label>CSI global</label><div class="value">—</div><div class="note">Objectif 88%</div></div>
      <div class="card"><label>Délai</label><div class="value">—</div><div class="note">Livraison</div></div>
      <div class="card"><label>Sondages</label><div class="value">—</div><div class="note">Nombre</div></div>
      <div class="card"><label>Transactions</label><div class="value">—</div><div class="note">Nombre</div></div>
      <div class="card"><label>Moyenne facture</label><div class="value">—</div><div class="note">Panier moyen</div></div>
      <div class="card"><label>Food / Labor</label><div class="value">— / —</div><div class="note">Mensuel</div></div>
      <div class="card"><label>Plaintes</label><div class="value">${restaurantComplaintCount(complaintSummary)}</div><div class="note">Restaurant sélectionné</div></div>
      <div class="card"><label>Montant plaintes</label><div class="value">${restaurantComplaintAmount(complaintSummary)}</div><div class="note">Compensation totale</div></div>
    </div>
    <div class='alert'>Aucune donnée pour ce restaurant.</div>`;
    setHtml("restaurantProfile", emptyHtml);
    setHtml("profile", emptyHtml);
    setTimeout(()=>animateVisibleValues($("page-restaurant")), 40);
    return;
  }

  const complaintSummary = restaurantComplaintSummary(rest, r.week);
  const html=`<div class="cards">
    <div class="card"><label>Ventes</label><div class="value">${money(r.sales)}</div><div class="note">${r.week}</div></div>
    <div class="card"><label>Augmentation ventes</label><div class="value">${pct(r.growth)}</div><div class="note">Variation</div></div>
    <div class="card"><label>CSI global</label><div class="value">${pct(r.csi)}</div><div class="note">Objectif 88%</div></div>
    <div class="card"><label>Délai</label><div class="value">${r.delay?Number(r.delay).toFixed(1)+" min":"—"}</div><div class="note">Livraison</div></div>
    <div class="card"><label>Sondages</label><div class="value">${r.surveys??"—"}</div><div class="note">Nombre</div></div>
    <div class="card"><label>Transactions</label><div class="value">${r.transactions??"—"}</div><div class="note">Nombre</div></div>
    <div class="card"><label>Moyenne facture</label><div class="value">${moneyCents(r.avgBill)}</div><div class="note">Panier moyen</div></div>
    <div class="card"><label>Food / Labor</label><div class="value">${pct(r.foodCost)} / ${pct(r.laborCost)}</div><div class="note">Mensuel</div></div>
    <div class="card"><label>Plaintes</label><div class="value">${restaurantComplaintCount(complaintSummary)}</div><div class="note">Restaurant sélectionné</div></div>
    <div class="card"><label>Montant plaintes</label><div class="value">${restaurantComplaintAmount(complaintSummary)}</div><div class="note">Compensation totale</div></div>
  </div><div class="panel"><h3>Évolution CSI</h3>${buildLineChart(r.restaurant)}</div>`;

  setHtml("restaurantProfile", html);
  setHtml("profile", html);
  setTimeout(()=>animateVisibleValues($("page-restaurant")), 40);
}

function animateVisibleValues(scope){
  if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = scope || document.querySelector(".page.active") || document;
  root.querySelectorAll(".value").forEach(el=>{
    const text = String(el.textContent || "").trim();
    if(!text || text === "—" || el.dataset.valueAnimated === text) return;
    const numeric = Number(text.replace(/\s/g,"").replace(",",".").replace(/[^0-9.-]/g,""));
    if(!Number.isFinite(numeric)) return;
    const suffix = text.replace(/[0-9\s.,-]/g,"").trim();
    const hasDollar = text.includes("$");
    const hasPercent = text.includes("%");
    const hasMinutes = /\bmin\b/i.test(text);
    const decimals = text.includes(",") || text.includes(".") ? 1 : 0;
    el.dataset.valueAnimated = text;
    const start = performance && performance.now ? performance.now() : Date.now();
    const duration = 520;
    const format = value => {
      if(hasDollar) return Math.round(value).toLocaleString("fr-CA") + " $";
      if(hasPercent) return value.toFixed(decimals).replace(".", ",") + " %";
      if(hasMinutes) return Math.round(value) + " min";
      if(suffix) return Math.round(value).toLocaleString("fr-CA") + " " + suffix;
      return Math.round(value).toLocaleString("fr-CA");
    };
    const tick = now => {
      const t = Math.min(1, ((now || Date.now()) - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(numeric * eased);
      if(t < 1 && window.requestAnimationFrame) window.requestAnimationFrame(tick);
      else el.textContent = text;
    };
    if(window.requestAnimationFrame) window.requestAnimationFrame(tick);
  });
}
window.animateVisibleValues = animateVisibleValues;

function parseCsvLine(line){
  const out=[]; let cur="", q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i], n=line[i+1];
    if(c=='"' && q && n=='"'){ cur+='"'; i++; continue; }
    if(c=='"'){ q=!q; continue; }
    if(c==="," && !q){ out.push(cur.trim()); cur=""; continue; }
    cur+=c;
  }
  out.push(cur.trim());
  return out;
}
function num(v){
  if(v==null) return null;
  let s=String(v).replace(/\u00a0/g,"").replace(/\u202f/g,"").replace(/\s/g,"").replace("$","").replace("%","").replace(",",".");
  s=s.replace(/[^0-9.\-]/g,"");
  const n=parseFloat(s);
  return isNaN(n)?null:n;
}
function weekRange(label){
  const p=String(label).split("/");
  if(p.length!==3) return label;
  const end=new Date(+p[2],+p[1]-1,+p[0]);
  const start=new Date(end); start.setDate(end.getDate()-6);
  return start.toISOString().slice(0,10)+" au "+end.toISOString().slice(0,10);
}
function norm(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim(); }
function kpiKey(s){
  s=norm(s);
  if(s==="ventes") return "sales";
  if(s.includes("augmentation des ventes")) return "growth";
  if(s.includes("nombre de transactions")) return "transactions";
  if(s.includes("montant moyen des factures")) return "avgBill";
  if(s==="csi") return "csi";
  if(s.includes("nombre de sondages")) return "surveys";
  if(s.includes("delai de livraison")) return "delay";
  if(s.includes("cout de nourriture")) return "foodCost";
  if(s.includes("cout des salaires")) return "laborCost";
  return null;
}
function normalizeRestaurant(s){
  s=String(s||"").replace(/^\d+\s*-\s*/,"").trim();
  const map={"LÉVIS":"Lévis","BEAUPORT":"Beauport","JONQUIÈRE":"Jonquière","CHICOUTIMI-NORD":"Chicoutimi Nord","ST-NICOLAS":"St-Nicolas","DOLBEAU":"Dolbeau","ALMA":"Alma","ST-AUGUSTIN-DE-DESMAURES":"St-Augustin","MONTMAGNY":"Montmagny","DONNACONA":"Donnacona","PONT-ROUGE":"Pont-Rouge","CHICOUTIMI":"Chicoutimi Sud","SAINT-RAYMOND":"Saint-Raymond","ST-RAYMOND":"Saint-Raymond","BEAUPORT NORD":"Beauport Nord","ROBERVAL":"Roberval","SAINT-LAMBERT-DE-LAUZON":"St-Lambert","LA POCATIÈRE":"La Pocatière"};
  return map[s.toUpperCase().trim()] || s;
}
function parseKpiCsv(text){
  const rows=text.split(/\r?\n/).filter(x=>x.trim()).map(parseCsvLine);
  let dateRow=0, maxDates=0;
  rows.forEach((r,i)=>{ const c=r.filter(x=>/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(x.trim())).length; if(c>maxDates){maxDates=c; dateRow=i;} });
  const weeks=rows[dateRow].map((c,i)=>/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(c).trim())?{label:c,col:i}:null).filter(Boolean);
  const starts=[];
  rows.forEach((r,i)=>{ if(r[0] && kpiKey(r[1])==="sales") starts.push(i); });
  const data=[];
  starts.forEach((start,bi)=>{
    const end=starts[bi+1]||rows.length;
    const restaurant=normalizeRestaurant(rows[start][0]);
    const kpiRows={};
    for(let i=start;i<end;i++){ const k=kpiKey(rows[i][1]); if(k) kpiRows[k]=i; }
    weeks.forEach(w=>{
      const item={restaurant, week:weekRange(w.label)};
      Object.entries(kpiRows).forEach(([k,ri])=>item[k]=num(rows[ri][w.col]));
      data.push(item);
    });
  });
  return data;
}
async function syncSheet(){
  if(sheetSyncPromise) return sheetSyncPromise;
  sheetSyncPromise = (async () => {
  try{
    if(window.OPS_AUTH_REQUIRED && !window.OPS_AUTH_READY){
      if($("sheetStatus")) $("sheetStatus").textContent="Connexion requise avant synchronisation Google Sheet.";
      return [];
    }
    const rawUrl=String($("sheetUrl")?.value || "").trim();
    const canUseDefault=!(window.OPS_AUTH_REQUIRED && window.OPS_AUTH_READY);
    const url=(rawUrl || (canUseDefault ? DEFAULT_SHEET_URL : "")).trim();
    if(!url){
      if($("sheetStatus")) $("sheetStatus").textContent="Aucun lien CSV KPI attribué à cet utilisateur.";
      return [];
    }
    if($("sheetStatus")) $("sheetStatus").textContent="Synchronisation Google Sheet en cours...";
    const res=await fetchWithTimeout(cacheBustMainSheetUrl(url), {cache:"no-store"}, 30000);
    if(!res.ok) throw new Error("CSV inaccessible");
    DATA=parseKpiCsv(await res.text());
    fillWeeks();
    updateDashboard();
    updateRestaurant();
    $("sheetStatus").textContent=`Synchronisé: ${DATA.length} lignes, ${[...new Set(DATA.map(x=>x.restaurant))].length} restaurants.`;
    toast("Google Sheet synchronisé");
    return DATA;
  }catch(e){
    console.error(e);
    toast("Erreur Google Sheet");
    if($("sheetStatus")) $("sheetStatus").textContent=e.name === "AbortError" ? "Google Sheet trop long à répondre. Réessaie dans quelques secondes." : e.message;
    return [];
  }finally{
    sheetSyncPromise = null;
  }
  })();
  return sheetSyncPromise;
}

function renderChecklist(){
  $("checklist").innerHTML=QUESTIONS.map((q,i)=>`<div class="checkItem"><h3>${i+1}. ${q}</h3><div class="answerRow"><button data-answer="${i}|Conforme">Conforme</button><button data-answer="${i}|Non conforme">Non conforme</button><button data-answer="${i}|S.O.">S.O.</button></div><div class="subtools"><button data-toggle="c${i}">Commentaire</button><button data-toggle="p${i}">Photo</button><button data-toggle="a${i}">Action</button></div><div id="c${i}" class="drawer"><textarea></textarea></div><div id="p${i}" class="drawer"><input type="file" accept="image/*"><div></div></div><div id="a${i}" class="drawer"><textarea></textarea></div></div>`).join("");
  updateAuditStats();
}
function updateAuditStats(){
  const vals=Object.values(answers);
  const ok=vals.filter(x=>x==="Conforme").length, bad=vals.filter(x=>x==="Non conforme").length;
  $("auditAnswered").textContent=vals.length; $("auditOk").textContent=ok; $("auditBad").textContent=bad;
  $("auditScore").textContent=vals.length?Math.round(ok/QUESTIONS.length*100)+"%":"—";
}
function saveAudit(){
  const list=JSON.parse(localStorage.getItem("audits")||"[]");
  list.unshift({date:$("auditDate").value,restaurant:$("auditRestaurant").value,csi:$("auditCsi").value,score:$("auditScore").textContent,bad:$("auditBad").textContent,source:currentUser?"supabase":"local"});
  localStorage.setItem("audits",JSON.stringify(list));
  loadReports();
  toast("Audit sauvegardé");
}
function loadReports(){
  const list=JSON.parse(localStorage.getItem("audits")||"[]");
  $("reportsTable").innerHTML=list.length?list.map(a=>`<tr><td>${a.date||""}</td><td>${a.restaurant||""}</td><td>${a.csi||""}</td><td>${a.score||""}</td><td>${a.bad||0}</td><td>${a.source||"local"}</td></tr>`).join(""):'<tr><td colspan="6">Aucun rapport.</td></tr>';
}
function printPdf(){
  preparePdfHeader();
  setTimeout(()=>window.print(),150);
}
function generateMessage(){
  $("messageBox").textContent=`Bonjour,\n\nPetit suivi ${$("msgSubject").value} pour ${$("msgRestaurant").value}.\n\n${$("msgContext").value || "Merci de valider les actions terrain à prioriser."}\n\nOn reste alignés pour protéger l’expérience client et les résultats.`;
}
function renderRestaurantAccess(){
  const list = (window.OPS_AUTH_REQUIRED && window.OPS_AUTH_READY && Array.isArray(window.OPS_AUTH_ALLOWED_RESTAURANTS))
    ? window.OPS_AUTH_ALLOWED_RESTAURANTS
    : RESTAURANTS;
  $("restaurantAccess").innerHTML=list.map(r=>`<label><input type="checkbox" value="${r}" ${allowedRestaurants.includes(r)?"checked":""}> ${r}</label>`).join("");
}
function saveRestaurants(){
  if(window.OPS_AUTH_REQUIRED && window.OPS_AUTH_ROLE !== "super_admin"){
    toast("Les accès restaurants sont gérés par l'administrateur.");
    renderRestaurantAccess();
    return;
  }
  allowedRestaurants=[...document.querySelectorAll("#restaurantAccess input:checked")].map(x=>x.value);
  if(!allowedRestaurants.length) allowedRestaurants=[...RESTAURANTS];
  localStorage.setItem("allowedRestaurants",JSON.stringify(allowedRestaurants));
  refreshSelects(); try{refreshMessageWeeks();}catch(e){console.error(e);} try{updateDashboard();updateRestaurant();}catch(e){console.error(e);} toast("Restaurants sauvegardés");
}
function initSupabase(){
  const url=localStorage.getItem("supabaseUrl"), key=localStorage.getItem("supabaseKey");
  $("supabaseUrl").value=url||""; $("supabaseKey").value=key||"";
  if(url&&key&&window.supabase){ sb=window.supabase.createClient(url,key); $("statusDot").classList.add("on"); $("statusText").textContent="Supabase configuré"; }
}

function applyOpsAccessContext(ctx){
  ctx = ctx || {};
  currentUser = ctx.user || null;
  const restaurants = Array.isArray(ctx.restaurants) ? ctx.restaurants.map(normalizeRestaurant).filter(Boolean) : [];
  allowedRestaurants = restaurants.length ? restaurants : [];
  try{ localStorage.setItem("allowedRestaurants", JSON.stringify(allowedRestaurants)); }catch(e){}

  const kpiUrl = String(ctx.kpiCsvUrl || "").trim();
  const complaintsUrl = String(ctx.complaintsCsvUrl || "").trim();
  const sheetUrl = $("sheetUrl");
  const sheetAuto = $("sheetAuto");
  const complaintsField = $("complaintsCsvUrl");
  const complaintsAuto = $("complaintsAuto");

  if(sheetUrl) sheetUrl.value = kpiUrl;
  if(sheetAuto) sheetAuto.checked = Boolean(kpiUrl);
  try{
    if(kpiUrl) localStorage.setItem("sheetUrl", kpiUrl);
    else localStorage.removeItem("sheetUrl");
    localStorage.setItem("sheetAuto", kpiUrl ? "1" : "0");
  }catch(e){}

  if(complaintsField) complaintsField.value = complaintsUrl;
  if(complaintsAuto) complaintsAuto.checked = Boolean(complaintsUrl);
  try{
    if(complaintsUrl) localStorage.setItem("dashboard_ops_complaints_csv_url", complaintsUrl);
    else localStorage.removeItem("dashboard_ops_complaints_csv_url");
  }catch(e){}

  if($("userStatus")){
    const role = ctx.role ? ` (${ctx.role})` : "";
    $("userStatus").textContent = currentUser ? `Connecté: ${currentUser.email || ""}${role}` : "Non connecté.";
  }
  if($("restaurantStatus")){
    $("restaurantStatus").textContent = restaurants.length
      ? `${restaurants.length} restaurant(s) autorisé(s) pour ce compte.`
      : "Aucun restaurant attribué à ce compte.";
  }
  if($("sheetStatus") && !kpiUrl) $("sheetStatus").textContent = "Aucun lien CSV KPI attribué à cet utilisateur.";
  if(!complaintsUrl){
    if($("complaintsStatus")) $("complaintsStatus").textContent = "Aucun lien CSV plaintes attribué à cet utilisateur.";
    if($("cfComplaintsStatus")) $("cfComplaintsStatus").textContent = "Aucun lien CSV plaintes attribué à cet utilisateur.";
    if($("cfComplaintCsvSource")) $("cfComplaintCsvSource").textContent = "Source CSV plaintes : non attribuée.";
  }

  refreshSelects();
  try{ refreshMessageWeeks(); }catch(e){ console.error(e); }
  try{ updateDashboard(); updateRestaurant(); }catch(e){ console.error(e); }
  try{ if(typeof window.applyOpsRestaurantFilterAllTabs === "function") window.applyOpsRestaurantFilterAllTabs(); }catch(e){ console.error(e); }
}
window.applyOpsAccessContext = applyOpsAccessContext;

onOpsReady(()=>{
  allowedRestaurants=window.OPS_AUTH_REQUIRED ? [] : (JSON.parse(localStorage.getItem("allowedRestaurants")||"null") || [...RESTAURANTS]);
  $("auditDate").valueAsDate=new Date();
  refreshSelects(); try{refreshMessageWeeks();}catch(e){console.error(e);} renderChecklist(); loadReports(); initSupabase();
  $("sheetUrl").value=window.OPS_AUTH_REQUIRED ? "" : (localStorage.getItem("sheetUrl")||DEFAULT_SHEET_URL);
  $("sheetAuto").checked=!window.OPS_AUTH_REQUIRED;
  if(!window.OPS_AUTH_REQUIRED) localStorage.setItem("sheetAuto","1");
  if(!window.OPS_AUTH_REQUIRED && $("sheetUrl").value && $("sheetAuto").checked) setTimeout(()=>syncSheet(), 250);

  document.querySelectorAll(".nav").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
  document.querySelectorAll(".configTab").forEach(b=>b.addEventListener("click",()=>showConfig(b.dataset.config)));
  $("btnDashRefresh").onclick=updateDashboard; $("btnProfileRefresh").onclick=updateRestaurant; $("btnProfilePdf").onclick=printPdf;
  $("btnSaveAudit").onclick=saveAudit; $("btnAuditPdf").onclick=printPdf; $("btnResetAudit").onclick=()=>{answers={};renderChecklist();};
  $("btnReportsRefresh").onclick=loadReports; $("btnReportsCsv").onclick=()=>toast("Export CSV à ajouter");
  $("btnGenerateMsg").onclick=generateMessage; $("btnCopyMsg").onclick=()=>navigator.clipboard.writeText($("messageBox").textContent);
  $("btnSyncSheet").onclick=syncSheet; $("btnSaveSheet").onclick=()=>{localStorage.setItem("sheetUrl",$("sheetUrl").value);localStorage.setItem("sheetAuto",$("sheetAuto").checked?"1":"0");toast("Lien sauvegardé");};
  $("btnSaveRestaurants").onclick=saveRestaurants; $("btnSelectAllRestaurants").onclick=()=>document.querySelectorAll("#restaurantAccess input").forEach(x=>x.checked=true);
  $("btnSaveSupabase").onclick=()=>{localStorage.setItem("supabaseUrl",$("supabaseUrl").value);localStorage.setItem("supabaseKey",$("supabaseKey").value);initSupabase();toast("Supabase sauvegardé");};
  $("btnTestSupabase").onclick=()=>toast(sb?"Supabase OK":"Non configuré");
  $("btnSignIn").onclick=async()=>{if(!sb)return toast("Configure Supabase");const {data,error}=await sb.auth.signInWithPassword({email:$("loginEmail").value,password:$("loginPassword").value});if(error)return toast(error.message);currentUser=data.user;$("userStatus").textContent="Connecté: "+currentUser.email;toast("Connecté");};
  $("btnSignUp").onclick=async()=>{if(!sb)return toast("Configure Supabase");const {error}=await sb.auth.signUp({email:$("loginEmail").value,password:$("loginPassword").value});toast(error?error.message:"Compte créé");};
  $("btnSignOut").onclick=async()=>{if(sb)await sb.auth.signOut();currentUser=null;$("userStatus").textContent="Non connecté.";toast("Déconnecté");};

  document.addEventListener("click",e=>{
    if(e.target.dataset.answer){const [i,a]=e.target.dataset.answer.split("|");answers[i]=a;e.target.parentElement.querySelectorAll("button").forEach(b=>b.className="");e.target.className=a==="Conforme"?"ok":a==="Non conforme"?"bad":"na";updateAuditStats();}
    if(e.target.dataset.toggle) $(e.target.dataset.toggle).classList.toggle("open");
  });
  document.addEventListener("change",e=>{
    if(e.target && e.target.id === "pc409PdfUpload") return;
    if(e.target.type==="file" && e.target.files[0]){const reader=new FileReader();reader.onload=ev=>{e.target.nextElementSibling.innerHTML=`<img class="photo" src="${ev.target.result}">`;};reader.readAsDataURL(e.target.files[0]);}
  });
  try{updateDashboard();updateRestaurant();}catch(e){console.error(e);}
});

window.addEventListener("error", function(e){
  console.error("Ops safe error:", e.message, e.error);
});

window.addEventListener("unhandledrejection", function(e){
  console.error("Ops promise error:", e.reason);
});


window.addEventListener("beforeprint", ()=>{
  try{
    const rest = (typeof val==="function" ? (val("profileRestaurant","") || val("restaurantSelect","")) : "") || "Restaurant";
    document.title = "Rapport - " + rest;
  }catch(e){}
});

function preparePdfHeader(){
  const current=document.querySelector(".page.active");
  if(!current) return;

  const old=document.querySelector(".pdfHeader");
  if(old) old.remove();

  const restaurant=(typeof val==="function"
    ? (val("profileRestaurant","") || val("restaurantSelect","") || val("auditRestaurant","") || "Restaurant")
    : "Restaurant");

  const now=new Date().toLocaleString("fr-CA");

  const header=document.createElement("div");
  header.className="pdfHeader";
  header.innerHTML=`
    <h1>Dashboard OPS</h1>
    <p>Rapport Restaurant — ${restaurant}</p>
    <p>Généré le ${now}</p>
  `;

  current.prepend(header);
}


// ===== Smart Messages V2.13 =====
function getMessageRow(){
  const restaurant = (typeof val==="function" ? val("msgRestaurant","") : ($("msgRestaurant")?.value || ""));
  const week = (typeof val==="function" ? val("msgWeek","latest") : ($("msgWeek")?.value || "latest"));
  const rows = selectedRows(restaurant, week);
  return rows[rows.length-1] || null;
}

function perf(value, target, direction){
  if(value==null || isNaN(value)) return "neutre";
  if(direction==="lower"){
    if(value<=target) return "bon";
    if(value<=target+3) return "attention";
    return "urgent";
  }
  if(value>=target) return "bon";
  if(value>=target-3) return "attention";
  return "urgent";
}

function autofillMessageFields(){
  const row = getMessageRow();
  if(!row) return;
  if($("msgSales")) $("msgSales").value = row.sales ?? "";
  if($("msgCsi")) $("msgCsi").value = row.csi ?? "";
  if($("msgDelay")) $("msgDelay").value = row.delay ?? "";
  if($("msgGrowth")) $("msgGrowth").value = row.growth ?? "";
}

function smartGenerateMessage(){
  const subject = $("msgSubject")?.value || "CSI";
  const restaurant = $("msgRestaurant")?.value || "Restaurant";
  const context = $("msgContext")?.value || "";
  const row = getMessageRow();

  const sales = num($("msgSales")?.value) ?? row?.sales ?? null;
  const csi = num($("msgCsi")?.value) ?? row?.csi ?? null;
  const delay = num($("msgDelay")?.value) ?? row?.delay ?? null;
  const growth = num($("msgGrowth")?.value) ?? row?.growth ?? null;
  const avgBill = row?.avgBill ?? null;
  const surveys = row?.surveys ?? null;
  const transactions = row?.transactions ?? null;
  const food = row?.foodCost ?? null;
  const labor = row?.laborCost ?? null;
  const week = row?.week || ($("msgWeek")?.value || "");

  const csiStatus = perf(csi,88,"higher");
  const delayStatus = perf(delay,33.23,"lower");
  const growthStatus = perf(growth,5,"higher");

  let msg = `Bonjour,\n\nPetit suivi pour ${restaurant}${week ? " — " + week : ""}.\n\n`;

  if(subject==="CSI"){
    if(csi==null){
      msg += "Je n’ai pas de donnée CSI claire pour cette période. Il faudrait valider le KPI avant de tirer une conclusion.";
    } else if(csiStatus==="bon"){
      msg += `Très bon résultat au niveau du CSI avec ${pct(csi)}, donc au-dessus de l’objectif réseau de 88%.\n\n`;
      msg += "L’objectif maintenant est de protéger cette constance en continuant de maintenir les standards d’exécution durant les périodes de pointe.";
    } else if(csiStatus==="attention"){
      msg += `Le CSI est à ${pct(csi)}, donc légèrement sous l’objectif réseau de 88%.\n\n`;
      msg += "Ce n’est pas une situation critique, mais c’est un signal à surveiller. Je recommande de cibler les irritants clients les plus fréquents et de faire un court suivi avec l’équipe de gestion.";
    } else {
      msg += `Le CSI est à ${pct(csi)}, donc sous l’objectif réseau de 88%.\n\n`;
      msg += "Un suivi terrain est recommandé rapidement afin d’identifier ce qui affecte l’expérience client. ";
      if(delay!=null && delay>40) msg += `Le délai de livraison à ${delay.toFixed(1)} minutes semble probablement contribuer à la perception client. `;
      msg += "Je recommande de revoir les périodes de pointe, la qualité d’exécution et les plaintes récurrentes.";
    }
  }

  if(subject==="Délais de livraison"){
    if(delay==null){
      msg += "Je n’ai pas de délai de livraison disponible pour cette période.";
    } else if(delayStatus==="bon"){
      msg += `Le délai de livraison est bien contrôlé à ${delay.toFixed(1)} minutes, ce qui respecte l’objectif de 33,23 minutes.\n\n`;
      msg += "C’est un bon indicateur d’organisation terrain. Il faut maintenir cette couverture aux heures de pointe.";
    } else if(delayStatus==="attention"){
      msg += `Le délai de livraison est à ${delay.toFixed(1)} minutes, légèrement au-dessus de l’objectif de 33,23 minutes.\n\n`;
      msg += "Je recommande de valider la couverture livreurs entre 17h30 et 20h00 pour éviter que la situation affecte le CSI.";
    } else {
      msg += `Le délai de livraison est élevé à ${delay.toFixed(1)} minutes, ce qui dépasse clairement l’objectif de 33,23 minutes.\n\n`;
      msg += "Il faut prioriser un ajustement terrain : couverture livreurs, dispatch, préparation des commandes et gestion des périodes de pointe. ";
      if(csi!=null && csi<88) msg += `Le CSI à ${pct(csi)} confirme que l’expérience client semble affectée.`;
    }
  }

  if(subject==="Augmentation de vente" || subject==="Vente"){
    if(sales!=null) msg += `Les ventes de la période sont de ${money(sales)}. `;
    if(growth!=null){
      if(growthStatus==="bon"){
        msg += `L’augmentation des ventes est positive à ${pct(growth)}, donc au-dessus de l’objectif de 5%.\n\n`;
        msg += "C’est une bonne performance commerciale. Le point important est de s’assurer que l’exécution opérationnelle suit le volume.";
      } else if(growthStatus==="attention"){
        msg += `L’augmentation des ventes est à ${pct(growth)}, près de l’objectif de 5%.\n\n`;
        msg += "On est proche de la cible. Un suivi sur les périodes fortes, le panier moyen et les opportunités locales pourrait aider à passer au-dessus de l’objectif.";
      } else {
        msg += `L’augmentation des ventes est à ${pct(growth)}, donc sous l’objectif de 5%.\n\n`;
        msg += "Je recommande d’analyser les journées plus faibles, le nombre de transactions, le panier moyen et les leviers locaux possibles.";
      }
    }
    if(csi!=null && csi<88) msg += `\n\nAttention toutefois : le CSI est à ${pct(csi)}. Il faut éviter que la recherche de volume se fasse au détriment de l’expérience client.`;
  }

  if(subject==="Moyenne de facturation"){
    if(avgBill==null){
      msg += "Je n’ai pas de moyenne de facturation disponible pour cette période.";
    } else {
      msg += `La moyenne de facturation est de ${moneyCents(avgBill)}.\n\n`;
      msg += "C’est un indicateur important pour comprendre le comportement client et l’efficacité des ventes additionnelles. ";
      if(transactions!=null) msg += `Le nombre de transactions est de ${transactions}, ce qui permet de mettre le panier moyen en contexte. `;
      msg += "Je recommande de suivre les opportunités de combos, extras, boissons et desserts sans nuire à la rapidité de service.";
    }
  }

  if(subject==="Audit"){
    msg += "Suite à l’audit/checklist, l’objectif est de transformer les constats en actions concrètes.\n\n";
    if(csi!=null) msg += `Le CSI actuel est à ${pct(csi)}. `;
    if(delay!=null) msg += `Le délai de livraison est à ${delay.toFixed(1)} minutes. `;
    msg += "\n\nJe recommande de prioriser les non-conformités qui ont un impact direct sur le client : propreté visible, qualité produit, exactitude des commandes, service et rapidité.";
  }

  const details = [];
  if(surveys!=null) details.push(`sondages: ${surveys}`);
  if(avgBill!=null) details.push(`moyenne facture: ${moneyCents(avgBill)}`);
  if(food!=null) details.push(`food cost: ${pct(food)}`);
  if(labor!=null) details.push(`labor cost: ${pct(labor)}`);

  if(details.length) msg += `\n\nDonnées complémentaires : ${details.join(", ")}.`;
  if(context.trim()) msg += `\n\nContexte ajouté : ${context.trim()}`;

  msg += "\n\nMerci de faire le suivi avec l’équipe et de me revenir avec les actions mises en place.";

  if($("messageBox")) $("messageBox").textContent = msg;
}

generateMessage = smartGenerateMessage;

onOpsReady(()=>{
  if($("msgRestaurant")) $("msgRestaurant").addEventListener("change",autofillMessageFields);
  if($("msgWeek")) $("msgWeek").addEventListener("change",autofillMessageFields);
});


// ===== Messages intelligents V2.14 =====
function renderMessageKpiPreview(){
  const row = getMessageRow ? getMessageRow() : null;
  const box = $("msgKpiPreview");
  if(!box) return;

  if(!row){
    box.innerHTML = `<div class="card"><label>Statut</label><div class="value">—</div><div class="note">Synchronise Google Sheet et choisis une semaine.</div></div>`;
    return;
  }

  box.innerHTML = `
    <div class="card"><label>Ventes</label><div class="value">${money(row.sales)}</div><div class="note">${row.week}</div></div>
    <div class="card"><label>Augmentation ventes</label><div class="value">${pct(row.growth)}</div><div class="note">Objectif 5%</div></div>
    <div class="card"><label>CSI global</label><div class="value">${pct(row.csi)}</div><div class="note">Objectif 88%</div></div>
    <div class="card"><label>Délai livraison</label><div class="value">${row.delay!=null ? Number(row.delay).toFixed(1)+" min" : "—"}</div><div class="note">Objectif 33,23 min</div></div>
    <div class="card"><label>Moyenne facture</label><div class="value">${moneyCents(row.avgBill)}</div><div class="note">Panier moyen</div></div>
    <div class="card"><label>Sondages</label><div class="value">${row.surveys ?? "—"}</div><div class="note">Volume réponses</div></div>
  `;
}

function autofillMessageFields(){
  const row = getMessageRow();
  if(!row){
    renderMessageKpiPreview();
    return;
  }

  if($("msgSales")) $("msgSales").value = row.sales ?? "";
  if($("msgCsi")) $("msgCsi").value = row.csi ?? "";
  if($("msgDelay")) $("msgDelay").value = row.delay ?? "";
  if($("msgGrowth")) $("msgGrowth").value = row.growth ?? "";

  renderMessageKpiPreview();
}

function positiveOrAction(value, target, direction, positiveText, attentionText, urgentText){
  if(value==null || isNaN(value)) return "";
  const status = perf(value, target, direction);
  if(status==="bon") return positiveText;
  if(status==="attention") return attentionText;
  return urgentText;
}

function smartGenerateMessage(){
  const subject = $("msgSubject")?.value || "Global";
  const restaurant = $("msgRestaurant")?.value || "Restaurant";
  const context = $("msgContext")?.value || "";
  const row = getMessageRow();

  const sales = num($("msgSales")?.value) ?? row?.sales ?? null;
  const csi = num($("msgCsi")?.value) ?? row?.csi ?? null;
  const delay = num($("msgDelay")?.value) ?? row?.delay ?? null;
  const growth = num($("msgGrowth")?.value) ?? row?.growth ?? null;
  const avgBill = row?.avgBill ?? null;
  const surveys = row?.surveys ?? null;
  const transactions = row?.transactions ?? null;
  const food = row?.foodCost ?? null;
  const labor = row?.laborCost ?? null;
  const week = row?.week || ($("msgWeek")?.value || "");

  const csiStatus = perf(csi,88,"higher");
  const delayStatus = perf(delay,33.23,"lower");
  const growthStatus = perf(growth,5,"higher");

  let msg = `Bonjour,\n\nPetit suivi pour ${restaurant}${week ? " — " + week : ""}.\n\n`;

  if(subject==="Global"){
    msg += "Voici la lecture globale des résultats de la période.\n\n";

    if(sales!=null) msg += `Les ventes sont de ${money(sales)}. `;
    if(growth!=null){
      if(growthStatus==="bon") msg += `Très bon point : l’augmentation des ventes est à ${pct(growth)}, donc au-dessus de l’objectif de 5%. Cela démontre une belle progression commerciale. `;
      else if(growthStatus==="attention") msg += `L’augmentation des ventes est à ${pct(growth)}, donc près de l’objectif de 5%. On est proche de la cible et il y a une opportunité de pousser légèrement davantage. `;
      else msg += `L’augmentation des ventes est à ${pct(growth)}, donc sous l’objectif de 5%. Il faudrait analyser les journées plus faibles et les leviers locaux possibles. `;
    }

    if(csi!=null){
      if(csiStatus==="bon") msg += `Le CSI est également positif à ${pct(csi)}, au-dessus de l’objectif de 88%. C’est un bon signe que le volume est bien soutenu par l’expérience client. `;
      else if(csiStatus==="attention") msg += `Le CSI est à ${pct(csi)}, légèrement sous l’objectif de 88%. Ce n’est pas critique, mais il faut surveiller les irritants clients. `;
      else msg += `Le CSI est à ${pct(csi)}, sous l’objectif de 88%. Un suivi terrain est recommandé pour corriger rapidement les irritants. `;
    }

    if(delay!=null){
      if(delayStatus==="bon") msg += `Les délais de livraison sont bien contrôlés à ${delay.toFixed(1)} minutes, ce qui aide à protéger le CSI. `;
      else if(delayStatus==="attention") msg += `Le délai de livraison est à ${delay.toFixed(1)} minutes, légèrement au-dessus de l’objectif. Il faut surveiller les heures de pointe. `;
      else msg += `Le délai de livraison est élevé à ${delay.toFixed(1)} minutes. Ce point devrait être priorisé, surtout s’il affecte le CSI. `;
    }

    msg += "\n\nEn résumé, ";
    if(csiStatus==="bon" && (growthStatus==="bon" || growth==null) && (delayStatus==="bon" || delay==null)){
      msg += "la période est très positive. L’objectif est maintenant de maintenir la constance et de protéger les standards.";
    } else {
      msg += "il y a de bons éléments, mais aussi des points à suivre. Je recommande de prioriser les actions qui ont le plus d’impact sur l’expérience client et la constance opérationnelle.";
    }
  }

  else if(subject==="CSI"){
    if(csi==null){
      msg += "Je n’ai pas de donnée CSI claire pour cette période. Il faudrait valider le KPI avant de tirer une conclusion.";
    } else if(csiStatus==="bon"){
      msg += `Très bon résultat au niveau du CSI avec ${pct(csi)}, donc au-dessus de l’objectif réseau de 88%.\n\n`;
      msg += "C’est un excellent signal pour l’expérience client. L’objectif maintenant est de protéger cette constance en maintenant les standards d’exécution durant les périodes de pointe.";
    } else if(csiStatus==="attention"){
      msg += `Le CSI est à ${pct(csi)}, donc légèrement sous l’objectif réseau de 88%.\n\n`;
      msg += "Ce n’est pas une situation critique, mais c’est un signal à surveiller. Je recommande de cibler les irritants clients les plus fréquents et de faire un court suivi avec l’équipe de gestion.";
    } else {
      msg += `Le CSI est à ${pct(csi)}, donc sous l’objectif réseau de 88%.\n\n`;
      msg += "Un suivi terrain est recommandé rapidement afin d’identifier ce qui affecte l’expérience client. ";
      if(delay!=null && delay>40) msg += `Le délai de livraison à ${delay.toFixed(1)} minutes semble probablement contribuer à la perception client. `;
      msg += "Je recommande de revoir les périodes de pointe, la qualité d’exécution et les plaintes récurrentes.";
    }
  }

  else if(subject==="Délais de livraison"){
    if(delay==null){
      msg += "Je n’ai pas de délai de livraison disponible pour cette période.";
    } else if(delayStatus==="bon"){
      msg += `Très bon contrôle des délais de livraison à ${delay.toFixed(1)} minutes, ce qui respecte l’objectif de 33,23 minutes.\n\n`;
      msg += "C’est un bon indicateur d’organisation terrain et ça contribue directement à protéger l’expérience client.";
    } else if(delayStatus==="attention"){
      msg += `Le délai de livraison est à ${delay.toFixed(1)} minutes, légèrement au-dessus de l’objectif de 33,23 minutes.\n\n`;
      msg += "Je recommande de valider la couverture livreurs entre 17h30 et 20h00 pour éviter que la situation affecte le CSI.";
    } else {
      msg += `Le délai de livraison est élevé à ${delay.toFixed(1)} minutes, ce qui dépasse clairement l’objectif de 33,23 minutes.\n\n`;
      msg += "Il faut prioriser un ajustement terrain : couverture livreurs, dispatch, préparation des commandes et gestion des périodes de pointe. ";
      if(csi!=null && csi<88) msg += `Le CSI à ${pct(csi)} confirme que l’expérience client semble affectée.`;
    }
  }

  else if(subject==="Augmentation de vente" || subject==="Vente"){
    if(sales!=null) msg += `Les ventes de la période sont de ${money(sales)}. `;
    if(growth!=null){
      if(growthStatus==="bon"){
        msg += `Très bonne performance : l’augmentation des ventes est à ${pct(growth)}, donc au-dessus de l’objectif de 5%.\n\n`;
        msg += "C’est un excellent résultat commercial. Le point important est de s’assurer que l’exécution opérationnelle suit bien le volume.";
      } else if(growthStatus==="attention"){
        msg += `L’augmentation des ventes est à ${pct(growth)}, près de l’objectif de 5%.\n\n`;
        msg += "On est proche de la cible. Un suivi sur les périodes fortes, le panier moyen et les opportunités locales pourrait aider à passer au-dessus de l’objectif.";
      } else {
        msg += `L’augmentation des ventes est à ${pct(growth)}, donc sous l’objectif de 5%.\n\n`;
        msg += "Je recommande d’analyser les journées plus faibles, le nombre de transactions, le panier moyen et les leviers locaux possibles.";
      }
    }
    if(csi!=null && csi>=88) msg += `\n\nPoint positif : le CSI est à ${pct(csi)}, donc l’expérience client demeure au-dessus de l’objectif.`;
    else if(csi!=null) msg += `\n\nAttention toutefois : le CSI est à ${pct(csi)}. Il faut éviter que la recherche de volume se fasse au détriment de l’expérience client.`;
  }

  else if(subject==="Moyenne de facturation"){
    if(avgBill==null){
      msg += "Je n’ai pas de moyenne de facturation disponible pour cette période.";
    } else {
      msg += `La moyenne de facturation est de ${moneyCents(avgBill)}.\n\n`;
      msg += "C’est un indicateur important pour comprendre le comportement client et l’efficacité des ventes additionnelles. ";
      if(transactions!=null) msg += `Le nombre de transactions est de ${transactions}, ce qui permet de mettre le panier moyen en contexte. `;
      msg += "Je recommande de suivre les opportunités de combos, extras, boissons et desserts sans nuire à la rapidité de service.";
    }
  }

  else if(subject==="Audit"){
    msg += "Suite à l’audit/checklist, l’objectif est de transformer les constats en actions concrètes.\n\n";
    if(csi!=null) msg += `Le CSI actuel est à ${pct(csi)}. `;
    if(delay!=null) msg += `Le délai de livraison est à ${delay.toFixed(1)} minutes. `;
    msg += "\n\nJe recommande de prioriser les non-conformités qui ont un impact direct sur le client : propreté visible, qualité produit, exactitude des commandes, service et rapidité.";
  }

  const details = [];
  if(surveys!=null) details.push(`sondages: ${surveys}`);
  if(avgBill!=null) details.push(`moyenne facture: ${moneyCents(avgBill)}`);
  if(food!=null) details.push(`food cost: ${pct(food)}`);
  if(labor!=null) details.push(`labor cost: ${pct(labor)}`);

  if(details.length) msg += `\n\nDonnées complémentaires : ${details.join(", ")}.`;
  if(context.trim()) msg += `\n\nContexte ajouté : ${context.trim()}`;

  msg += "\n\nMerci de faire le suivi avec l’équipe et de me revenir avec les actions mises en place.";

  if($("messageBox")) $("messageBox").textContent = msg;
}

generateMessage = smartGenerateMessage;

onOpsReady(()=>{
  if($("msgRestaurant")) $("msgRestaurant").addEventListener("change",autofillMessageFields);
  if($("msgWeek")) $("msgWeek").addEventListener("change",autofillMessageFields);
  if($("msgSubject")) $("msgSubject").addEventListener("change",renderMessageKpiPreview);
  setTimeout(renderMessageKpiPreview,500);
});


function refreshMessageWeeks(){
  const el = $("msgWeek");
  if(!el) return;

  const weeks = [...new Set(DATA.map(x=>x.week).filter(Boolean))];
  el.innerHTML = '<option value="latest">Dernière semaine</option>' +
    weeks.map(w=>`<option value="${w}">${w}</option>`).join("");
}

onOpsReady(()=>{
  setTimeout(refreshMessageWeeks,800);
});


// ===== V2.20 Audit History =====
function getAuditHistory(){
  try{
    return JSON.parse(localStorage.getItem("dashboard_ops_audits") || "[]");
  }catch(e){
    return [];
  }
}

function saveAuditHistory(items){
  localStorage.setItem("dashboard_ops_audits", JSON.stringify(items));
}

function auditBadge(score){
  score = Number(score)||0;
  if(score>=88) return "good";
  if(score>=84) return "warn";
  return "bad";
}

function renderAuditHistory(){
  const box = $("auditHistory");
  if(!box) return;

  const audits = getAuditHistory();

  if(!audits.length){
    box.innerHTML = "<div class='alert'>Aucun audit sauvegardé pour le moment.</div>";
    return;
  }

  box.innerHTML = `<div class="auditHistoryList">${
    audits.map((a,i)=>`
      <div class="auditItem">
        <div class="auditMeta">
          <h4>${a.restaurant}</h4>
          <p>${a.date}</p>
          <p>Score: <span class="auditBadge ${auditBadge(a.score)}">${a.score}%</span></p>
        </div>

        <div class="auditActions">
          <button class="btn blue" onclick="openAudit(${i})">Réouvrir</button>
          <button class="btn red" onclick="printSavedAudit(${i})">PDF</button>
        </div>
      </div>
    `).join("")
  }</div>`;
}

function saveCurrentAudit(){
  const restaurant = val("auditRestaurant","Restaurant");
  const score = Number($("auditScore")?.textContent?.replace("%","")) || 0;

  const report = $("reportBox")?.innerHTML || "";
  const checklist = {};

  document.querySelectorAll(".checkItem input, .checkItem textarea, .checkItem select").forEach(el=>{
    checklist[el.id || Math.random().toString(36)] = {
      value: el.type==="checkbox" ? el.checked : el.value,
      type: el.type || el.tagName
    };
  });

  const item = {
    restaurant,
    score,
    report,
    checklist,
    date: new Date().toLocaleString("fr-CA")
  };

  const audits = getAuditHistory();
  audits.unshift(item);

  saveAuditHistory(audits);
  renderAuditHistory();
}

function openAudit(index){
  const audits = getAuditHistory();
  const audit = audits[index];
  if(!audit) return;

  document.querySelectorAll(".checkItem input, .checkItem textarea, .checkItem select").forEach(el=>{
    const data = audit.checklist[el.id];
    if(!data) return;

    if(el.type==="checkbox") el.checked = data.value;
    else el.value = data.value;
  });

  if($("reportBox")) $("reportBox").innerHTML = audit.report;

  showPage("audit");
  window.scrollTo({top:0,behavior:"smooth"});
}

function printSavedAudit(index){
  const audits = getAuditHistory();
  const audit = audits[index];
  if(!audit) return;

  const old = $("reportBox")?.innerHTML || "";
  if($("reportBox")) $("reportBox").innerHTML = audit.report;

  preparePdfHeader?.();

  setTimeout(()=>{
    window.print();
    setTimeout(()=>{
      if($("reportBox")) $("reportBox").innerHTML = old;
    },300);
  },150);
}

onOpsReady(()=>{
  setTimeout(renderAuditHistory,700);
});

// Hook save audit after report generation
const __oldGenerateAuditReport = typeof generateAuditReport !== "undefined" ? generateAuditReport : null;

if(__oldGenerateAuditReport){
  generateAuditReport = function(){
    __oldGenerateAuditReport();
    setTimeout(saveCurrentAudit,250);
  }
}


// ===== V2.21 Reports with View/Reopen/PDF Actions =====
function getAllSavedAudits(){
  let main=[];
  let old=[];
  try{ main = JSON.parse(localStorage.getItem("dashboard_ops_audits") || "[]"); }catch(e){}
  try{ old = JSON.parse(localStorage.getItem("audits") || "[]"); }catch(e){}

  // Merge old simple audits if not already in main
  old.forEach(a=>{
    const exists = main.some(m => String(m.date)===String(a.date) && String(m.restaurant)===String(a.restaurant));
    if(!exists) main.push(a);
  });

  return main;
}

function normalizeAudit(a){
  const scoreText = String(a.score ?? "").replace("%","");
  return {
    restaurant: a.restaurant || "Restaurant",
    date: a.date || "",
    csi: a.csi ?? "",
    score: scoreText || "—",
    bad: a.bad ?? a.nonConformes ?? 0,
    source: a.source || "local",
    report: a.report || "",
    notes: a.notes || "",
    checklist: a.checklist || {},
    answers: a.answers || {}
  };
}

function loadReports(){
  const audits = getAllSavedAudits().map(normalizeAudit);

  if(!$("reportsTable")) return;

  if(!audits.length){
    $("reportsTable").innerHTML = '<tr><td colspan="6">Aucun rapport.</td></tr>';
    return;
  }

  $("reportsTable").innerHTML = audits.map((a,i)=>`
    <tr>
      <td>${a.date}</td>
      <td>${a.restaurant}</td>
      <td>${a.csi}</td>
      <td>${a.score}${String(a.score).includes("%") ? "" : "%"}</td>
      <td>${a.bad}</td>
      <td>
        <div class="reportActionBtns">
          <button class="btn blue" onclick="viewSavedAudit(${i})">Voir / Réouvrir</button>
          <button class="btn red" onclick="printSavedAudit(${i})">PDF</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function buildAuditSnapshot(a){
  const answerLines = Object.entries(a.answers || {}).map(([k,v])=>`
    <div class="snapshotLine"><strong>Question ${Number(k)+1} :</strong> ${v}</div>
  `).join("");

  return `
    <div class="auditSnapshot">
      <div class="cards">
        <div class="card"><label>Restaurant</label><div class="value">${a.restaurant}</div><div class="note">${a.date}</div></div>
        <div class="card"><label>CSI</label><div class="value">${a.csi || "—"}</div><div class="note">Score client</div></div>
        <div class="card"><label>Score audit</label><div class="value">${a.score}${String(a.score).includes("%") ? "" : "%"}</div><div class="note">Conformité</div></div>
        <div class="card"><label>Non conformes</label><div class="value">${a.bad}</div><div class="note">Points à corriger</div></div>
      </div>

      ${a.notes ? `<div class="panel"><h3>Notes</h3><p>${a.notes}</p></div>` : ""}

      ${answerLines ? `<div class="panel"><h3>Réponses sauvegardées</h3>${answerLines}</div>` : ""}

      ${a.report ? `<div class="panel"><h3>Rapport sauvegardé</h3>${a.report}</div>` : ""}
    </div>
  `;
}

function viewSavedAudit(index){
  const audit = normalizeAudit(getAllSavedAudits()[index] || {});
  const viewer = $("auditViewer");
  const content = $("auditViewerContent");
  if(!viewer || !content) return;

  content.innerHTML = buildAuditSnapshot(audit);
  viewer.classList.remove("hidden");
}

function closeAuditViewer(){
  const viewer = $("auditViewer");
  if(viewer) viewer.classList.add("hidden");
}

function printSavedAudit(index){
  const audit = normalizeAudit(getAllSavedAudits()[index] || {});
  const viewer = $("auditViewer");
  const content = $("auditViewerContent");
  if(!viewer || !content) return;

  content.innerHTML = buildAuditSnapshot(audit);
  viewer.classList.remove("hidden");

  setTimeout(()=>{
    window.print();
  },250);
}

function saveAudit(){
  const vals = typeof answers !== "undefined" ? Object.values(answers) : [];
  const ok = vals.filter(x=>x==="Conforme").length;
  const bad = vals.filter(x=>x==="Non conforme").length;
  const score = vals.length ? Math.round(ok / Math.max(1, QUESTIONS.length) * 100) : Number(($("auditScore")?.textContent || "").replace("%","")) || 0;

  const audit = {
    date: $("auditDate")?.value || new Date().toISOString().slice(0,10),
    restaurant: $("auditRestaurant")?.value || "Restaurant",
    csi: $("auditCsi")?.value || "",
    co: $("auditCo")?.value || "",
    notes: $("auditNotes")?.value || "",
    score,
    bad,
    source: currentUser ? "supabase" : "local",
    answers: typeof answers !== "undefined" ? {...answers} : {},
    report: $("reportBox")?.innerHTML || ""
  };

  const audits = getAllSavedAudits();
  audits.unshift(audit);
  localStorage.setItem("dashboard_ops_audits", JSON.stringify(audits));

  loadReports();
  renderAuditHistory?.();
  toast("Audit sauvegardé dans Rapports");
}

onOpsReady(()=>{
  setTimeout(loadReports,600);
});


// ===== V2.22 Full audit details, comments, actions, photos =====
function statusClass(answer){
  if(answer==="Conforme") return "ok";
  if(answer==="Non conforme") return "bad";
  return "na";
}

function collectFullAuditDetails(){
  const items = [];
  document.querySelectorAll(".checkItem").forEach((card, index)=>{
    const title = card.querySelector("h3")?.textContent?.trim() || `Question ${index+1}`;
    let answer = "";
    if(typeof answers !== "undefined" && answers[index] !== undefined) answer = answers[index];

    // Fallback: detect selected answer button by class
    if(!answer){
      const selected = card.querySelector(".answerRow button.ok,.answerRow button.bad,.answerRow button.na");
      if(selected) answer = selected.textContent.trim();
    }

    const drawers = card.querySelectorAll(".drawer");
    const comment = drawers[0]?.querySelector("textarea")?.value || "";
    const photoImgs = Array.from(drawers[1]?.querySelectorAll("img") || []).map(img=>img.src);
    const action = drawers[2]?.querySelector("textarea")?.value || "";

    items.push({
      index,
      title,
      answer: answer || "Non répondu",
      comment,
      action,
      photos: photoImgs
    });
  });
  return items;
}

function fullAuditBadCount(details){
  return details.filter(x=>x.answer==="Non conforme").length;
}

function fullAuditAnsweredCount(details){
  return details.filter(x=>x.answer && x.answer!=="Non répondu").length;
}

function fullAuditScore(details){
  const conformes = details.filter(x=>x.answer==="Conforme").length;
  const total = details.length || 1;
  return Math.round((conformes / total) * 100);
}

function renderFullAuditDetails(details){
  if(!details || !details.length){
    return "<div class='alert'>Aucun détail d’audit sauvegardé.</div>";
  }

  return details.map(item=>{
    const photos = item.photos && item.photos.length
      ? `<div class="auditPhotoGrid">${item.photos.map(src=>`<img src="${src}" alt="Photo audit">`).join("")}</div>`
      : "";

    const hasDetails = item.comment || item.action || photos;

    return `
      <div class="auditQuestionCard">
        <div class="auditQuestionTop">
          <div class="auditQuestionText">${item.title}</div>
          <span class="statusPill ${statusClass(item.answer)}">${item.answer}</span>
        </div>

        ${hasDetails ? `
          <div class="auditDetailGrid">
            <div class="auditDetailBox">
              <strong>Commentaire</strong>
              ${item.comment || "—"}
            </div>
            <div class="auditDetailBox">
              <strong>Action à faire</strong>
              ${item.action || "—"}
            </div>
          </div>
          ${photos}
        ` : ""}
      </div>
    `;
  }).join("");
}

function saveAudit(){
  const details = collectFullAuditDetails();
  const score = fullAuditScore(details);
  const bad = fullAuditBadCount(details);

  const audit = {
    id: Date.now(),
    date: $("auditDate")?.value || new Date().toISOString().slice(0,10),
    savedAt: new Date().toLocaleString("fr-CA"),
    restaurant: $("auditRestaurant")?.value || "Restaurant",
    csi: $("auditCsi")?.value || "",
    co: $("auditCo")?.value || "",
    notes: $("auditNotes")?.value || "",
    score,
    bad,
    answered: fullAuditAnsweredCount(details),
    source: currentUser ? "supabase" : "local",
    details,
    answers: typeof answers !== "undefined" ? {...answers} : {},
    report: $("reportBox")?.innerHTML || ""
  };

  const audits = getAllSavedAudits();
  audits.unshift(audit);
  localStorage.setItem("dashboard_ops_audits", JSON.stringify(audits));

  loadReports();
  renderAuditHistory?.();
  toast("Audit complet sauvegardé dans Rapports");
}

function normalizeAudit(a){
  const scoreText = String(a.score ?? "").replace("%","");
  return {
    id:a.id,
    restaurant: a.restaurant || "Restaurant",
    date: a.date || a.savedAt || "",
    savedAt: a.savedAt || a.date || "",
    csi: a.csi ?? "",
    score: scoreText || "—",
    bad: a.bad ?? a.nonConformes ?? 0,
    answered: a.answered ?? "",
    source: a.source || "local",
    report: a.report || "",
    notes: a.notes || "",
    checklist: a.checklist || {},
    answers: a.answers || {},
    details: a.details || []
  };
}

function buildAuditSnapshot(a){
  const detailsHtml = a.details && a.details.length
    ? renderFullAuditDetails(a.details)
    : "";

  const legacyAnswerLines = (!detailsHtml && a.answers)
    ? Object.entries(a.answers || {}).map(([k,v])=>`
      <div class="snapshotLine"><strong>Question ${Number(k)+1} :</strong> ${v}</div>
    `).join("")
    : "";

  return `
    <div class="auditSnapshot">
      <div class="cards">
        <div class="card"><label>Restaurant</label><div class="value">${a.restaurant}</div><div class="note">${a.date}</div></div>
        <div class="card"><label>CSI</label><div class="value">${a.csi || "—"}</div><div class="note">Score client</div></div>
        <div class="card"><label>Score audit</label><div class="value">${a.score}${String(a.score).includes("%") ? "" : "%"}</div><div class="note">${a.answered || "—"} réponses</div></div>
        <div class="card"><label>Non conformes</label><div class="value">${a.bad}</div><div class="note">Points à corriger</div></div>
      </div>

      ${a.notes ? `<div class="panel"><h3>Notes générales</h3><p>${a.notes}</p></div>` : ""}

      <div class="panel">
        <h3>Détail de l’audit</h3>
        ${detailsHtml || legacyAnswerLines || "<div class='alert'>Aucun détail sauvegardé pour cet ancien audit.</div>"}
      </div>

      ${a.report ? `<div class="panel"><h3>Rapport généré</h3>${a.report}</div>` : ""}
    </div>
  `;
}

function loadReports(){
  const audits = getAllSavedAudits().map(normalizeAudit);

  if(!$("reportsTable")) return;

  if(!audits.length){
    $("reportsTable").innerHTML = '<tr><td colspan="6">Aucun rapport.</td></tr>';
    return;
  }

  $("reportsTable").innerHTML = audits.map((a,i)=>`
    <tr>
      <td>${a.date}</td>
      <td>${a.restaurant}</td>
      <td>${a.csi}</td>
      <td>${a.score}${String(a.score).includes("%") ? "" : "%"}</td>
      <td>${a.bad}</td>
      <td>
        <div class="reportActionBtns">
          <button class="btn blue" onclick="viewSavedAudit(${i})">👁 Voir / Réouvrir</button>
          <button class="btn red" onclick="printSavedAudit(${i})">📄 PDF</button>
        </div>
      </td>
    </tr>
  `).join("");
}


onOpsReady(()=>{
  setTimeout(renderSalesGrowthComparison,700);
});

if(typeof syncSheet !== "undefined"){
  const __oldSyncGrowth = syncSheet;

  syncSheet = async function(...args){
    const res = await __oldSyncGrowth.apply(this,args);
    setTimeout(renderSalesGrowthComparison,300);
    return res;
  }
}


onOpsReady(()=>{
  setTimeout(()=>{
    try{renderSalesGrowthComparison();}catch(e){console.error(e);}
  },1000);
});


// ===== V2.25 Week-aware sales growth chart =====
function renderSalesGrowthComparison(){
  const box = $("salesGrowthComparison");
  if(!box || !Array.isArray(DATA)) return;

  const selectedWeek =
    (typeof val === "function"
      ? (val("dashWeek","latest") || val("dashboardWeek","latest"))
      : "latest");

  const restaurantMap = {};

  DATA.forEach(r=>{
    if(!r.restaurant) return;

    if(selectedWeek && selectedWeek !== "latest"){
      if(String(r.week) !== String(selectedWeek)) return;
    }

    restaurantMap[r.restaurant] = r;
  });

  let rows = Object.values(restaurantMap);

  // Latest fallback
  if(selectedWeek === "latest"){
    rows = Object.values(
      DATA.reduce((acc,row)=>{
        if(!row.restaurant) return acc;
        acc[row.restaurant] = row;
        return acc;
      },{})
    );
  }

  rows = rows.sort((a,b)=>(Number(b.growth)||0)-(Number(a.growth)||0));

  if(!rows.length){
    box.innerHTML = "<div class='alert'>Aucune donnée disponible pour cette semaine.</div>";
    return;
  }

  box.innerHTML = rows.map(r=>{
    const g = Number(r.growth)||0;

    let cls = "red";
    if(g > 0 && g < 5) cls = "yellow";
    if(g >= 5) cls = "green";

    const normalized = Math.min(Math.max(g, -10), 20);
    const width = ((normalized + 10) / 30) * 100;

    return `
      <div class="growthRow">
        <div class="growthName">${r.restaurant}</div>

        <div class="growthTrack">
          <div class="growthFill ${cls}" style="width:${width}%"></div>
        </div>

        <div class="growthValue">${g.toFixed(2)}%</div>
      </div>
    `;
  }).join("");
}


onOpsReady(()=>{
  setTimeout(()=>{
    try{renderSalesGrowthComparison();}catch(e){console.error(e);}
  },800);

  ["dashWeek","dashboardWeek"].forEach(id=>{
    const el = $(id);
    if(el){
      el.addEventListener("change",()=>{
        setTimeout(renderSalesGrowthComparison,100);
      });
    }
  });
});


// ===== V2.27 OPS Coach Messages =====

function opsCoachLevel(data){
  const csi = Number(data.csi)||0;
  const growth = Number(data.growth)||0;
  const delay = Number(data.delay)||0;
  const complaints = Number(data.complaints)||0;

  if(csi < 84 || delay > 45 || complaints >= 6) return "bad";
  if(csi < 88 || growth < 2 || delay > 35) return "warn";
  return "good";
}

function opsCoachLabel(level){
  if(level==="good") return "🟢 STABLE";
  if(level==="warn") return "🟡 SOUS SURVEILLANCE";
  return "🔴 INTERVENTION REQUISE";
}

function opsCoachIntro(level, r){
  const csi = Number(r.csi)||0;
  const growth = Number(r.growth)||0;
  const delay = Number(r.delay)||0;

  if(level==="good"){
    return `Très belle stabilité opérationnelle observée cette semaine chez ${r.restaurant}. Les principaux indicateurs demeurent sous contrôle et l’équipe semble bien gérer le volume actuel.\n\nLe CSI se maintient à ${csi.toFixed(1)}% avec une variation des ventes de ${growth.toFixed(1)}%, ce qui démontre une bonne constance au niveau de l’exécution et de l’expérience client.`;
  }

  if(level==="warn"){
    return `Je remarque certains signes d’instabilité opérationnelle cette semaine chez ${r.restaurant}. Bien que plusieurs indicateurs demeurent acceptables, certains éléments commencent à exercer une pression sur l’expérience client.\n\nLe CSI actuel de ${csi.toFixed(1)}% ainsi que les délais moyens de ${delay.toFixed(1)} minutes indiquent qu’un ajustement terrain pourrait être nécessaire afin d’éviter une détérioration supplémentaire des résultats.`;
  }

  return `La situation actuelle chez ${r.restaurant} nécessite une intervention opérationnelle rapide. Plusieurs indicateurs importants se détériorent simultanément et l’expérience client semble actuellement affectée.\n\nLe CSI à ${csi.toFixed(1)}%, combiné aux délais de livraison ainsi qu’aux problématiques observées dans les opérations, démontre que le restaurant perd momentanément le contrôle sur certaines périodes critiques.`;
}

function opsCoachOperationalRead(r){
  const growth = Number(r.growth)||0;
  const csi = Number(r.csi)||0;
  const delay = Number(r.delay)||0;

  let txt = [];

  if(growth > 5 && csi < 88){
    txt.push("L’augmentation de l’achalandage semble actuellement dépasser la capacité opérationnelle sur certaines plages horaires.");
  }

  if(delay > 40){
    txt.push("Les délais élevés observés durant les périodes de pointe semblent avoir un impact direct sur la satisfaction client.");
  }

  if(csi >= 88 && delay < 35){
    txt.push("Le restaurant démontre une bonne maîtrise opérationnelle malgré le volume actuel.");
  }

  if(growth < 0){
    txt.push("La baisse des ventes pourrait être liée à une perte de constance au niveau de l’expérience client ou de l’exécution terrain.");
  }

  if(!txt.length){
    txt.push("Les résultats actuels démontrent un restaurant relativement stable, mais certains ajustements ciblés permettraient d’améliorer davantage la constance globale.");
  }

  return txt;
}

function opsCoachStrengths(r){
  const arr = [];
  const csi = Number(r.csi)||0;
  const growth = Number(r.growth)||0;
  const delay = Number(r.delay)||0;

  if(csi >= 88) arr.push("Bonne stabilité du service et de l’expérience client.");
  if(growth >= 5) arr.push("Très belle croissance des ventes observée.");
  if(delay <= 35) arr.push("Délais bien contrôlés malgré l’achalandage.");
  if((Number(r.complaints)||0) <= 2) arr.push("Faible niveau de plaintes cette semaine.");

  if(!arr.length){
    arr.push("Le restaurant conserve certains éléments positifs sur lesquels il sera possible de rebâtir rapidement.");
  }

  return arr;
}

function opsCoachPriorities(r){
  const arr = [];
  const csi = Number(r.csi)||0;
  const delay = Number(r.delay)||0;

  if(delay > 40){
    arr.push("Réduire les délais entre 17h30 et 19h30.");
    arr.push("Réviser la structure livreurs durant les périodes fortes.");
  }

  if(csi < 88){
    arr.push("Stabiliser l’expérience client et l’exécution cuisine.");
  }

  if((Number(r.complaints)||0) >= 4){
    arr.push("Réduire les oublis et les erreurs de commande.");
  }

  if((Number(r.food)||0) > 31.5){
    arr.push("Améliorer le contrôle des portions et des pertes.");
  }

  if((Number(r.labor)||0) > 27){
    arr.push("Réviser la structure d’horaires afin d’améliorer l’efficacité.");
  }

  if(!arr.length){
    arr.push("Maintenir les standards opérationnels actuellement en place.");
  }

  return arr.slice(0,5);
}

function buildOpsCoachMessage(r){
  const level = opsCoachLevel(r);
  const operational = opsCoachOperationalRead(r);
  const strengths = opsCoachStrengths(r);
  const priorities = opsCoachPriorities(r);

  return `
    <div class="aiCoachBox">
      <div class="aiCoachHeader">
        <h3>Analyse OPS intelligente</h3>
        <div class="aiCoachLevel ${level}">
          ${opsCoachLabel(level)}
        </div>
      </div>

      <div class="aiCoachMain">
${opsCoachIntro(level,r)}
      </div>

      <div class="aiCoachSection">
        <h4>Lecture opérationnelle</h4>
        <ul>
          ${operational.map(x=>`<li>${x}</li>`).join("")}
        </ul>
      </div>

      <div class="aiCoachSection">
        <h4>Forces observées</h4>
        <ul>
          ${strengths.map(x=>`<li>${x}</li>`).join("")}
        </ul>
      </div>

      <div class="aiCoachSection">
        <h4>Priorités recommandées</h4>
        <ul>
          ${priorities.map(x=>`<li>${x}</li>`).join("")}
        </ul>
      </div>
    </div>
  `;
}

// inject in message generation
if(typeof generateMessage !== "undefined"){
  const __oldGenerateMessage = generateMessage;

  generateMessage = function(...args){
    const res = __oldGenerateMessage.apply(this,args);

    try{
      const week = typeof val === "function" ? val("msgWeek","latest") : "latest";
      const resto = typeof val === "function" ? val("msgRestaurant","") : "";

      let row = null;

      if(Array.isArray(DATA)){
        row = DATA.find(r=>{
          const weekOk = week==="latest" || String(r.week)===String(week);
          const restOk = !resto || String(r.restaurant)===String(resto);
          return weekOk && restOk;
        });
      }

      const target = $("messageOutput") || $("messageBox") || $("generatedMessage");

      if(row && target){
        target.innerHTML += buildOpsCoachMessage(row);
      }
    }catch(e){
      console.error(e);
    }

    return res;
  }
}


// ===== V2.29 Growth chart visibility fix =====
function growthVisibleWidth(v){
  v = Number(v);
  if(isNaN(v)) v = 0;
  const normalized = Math.min(Math.max(v, -10), 20);
  const width = ((normalized + 10) / 30) * 100;
  return Math.max(7, width);
}

function growthColorClass(v){
  v = Number(v);
  if(isNaN(v)) v = 0;
  if(v <= 0) return "red";
  if(v < 5) return "yellow";
  return "green";
}

if(typeof renderSalesGrowthComparison !== "undefined"){
  renderSalesGrowthComparison = function(){
    const box = $("salesGrowthComparison");
    if(!box || !Array.isArray(DATA)) return;

    const selectedWeek =
      (typeof val === "function"
        ? (val("dashWeek","latest") || val("dashboardWeek","latest"))
        : "latest");

    let rows = [];

    if(selectedWeek && selectedWeek !== "latest"){
      rows = DATA.filter(r => String(r.week) === String(selectedWeek));
    } else {
      const latestByRestaurant = {};
      DATA.forEach(r=>{
        if(r.restaurant) latestByRestaurant[r.restaurant] = r;
      });
      rows = Object.values(latestByRestaurant);
    }

    rows = rows
      .filter(r=>r.restaurant)
      .sort((a,b)=>(Number(b.growth)||0)-(Number(a.growth)||0));

    if(!rows.length){
      box.innerHTML = "<div class='alert'>Aucune donnée disponible pour cette semaine.</div>";
      return;
    }

    box.innerHTML = rows.map(r=>{
      const g = Number(r.growth);
      const value = isNaN(g) ? 0 : g;
      const cls = growthColorClass(value);

      return `
        <div class="growthRow">
          <div class="growthName">${r.restaurant}</div>
          <div class="growthTrack">
            <div class="growthFill ${cls}" style="width:${growthVisibleWidth(value)}%"></div>
          </div>
          <div class="growthValue">${value.toFixed(2)}%</div>
        </div>
      `;
    }).join("");
  };
}


// V41 cleanup: first legacy complaints block removed.
// ======================================================
// V2.56 Global Saint-Lambert-de-Lauzon support
// Dashboard + Restaurant + Audit + Plaintes
// ======================================================

(function(){
  function slNormalizeKey(v){
    return String(v || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/^sal-\d+-/i,"")
      .replace(/\(qc\)/gi,"")
      .replace(/-/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  const slAliases = new Set([
    "saint lambert de lauzon",
    "st lambert de lauzon",
    "saint lambert",
    "st lambert",
    "sal saint lambert de lauzon",
    "sal st lambert de lauzon"
  ]);

  function slCanonical(v){
    const k = slNormalizeKey(v);
    if(slAliases.has(k)) return "Saint-Lambert-de-Lauzon";
    return v;
  }

  // Universal restaurant normalization
  const oldNormalizeRestaurantName = typeof normalizeRestaurantName !== "undefined" ? normalizeRestaurantName : null;
  if(oldNormalizeRestaurantName){
    normalizeRestaurantName = function(v){
      const k = slNormalizeKey(v);
      if(slAliases.has(k)) return "Saint-Lambert-de-Lauzon";
      return oldNormalizeRestaurantName(v);
    };
  }

  // Complaint normalization
  const oldNormalizeComplaintRestaurant2 = typeof normalizeComplaintRestaurant !== "undefined" ? normalizeComplaintRestaurant : null;
  if(oldNormalizeComplaintRestaurant2){
    normalizeComplaintRestaurant = function(v){
      const k = slNormalizeKey(v);
      if(slAliases.has(k)) return "Saint-Lambert-de-Lauzon";
      return oldNormalizeComplaintRestaurant2(v);
    };
  }

  // Matching helper
  const oldSameRestaurant = typeof sameRestaurant !== "undefined" ? sameRestaurant : null;
  if(oldSameRestaurant){
    sameRestaurant = function(a,b){
      const ka = slNormalizeKey(a);
      const kb = slNormalizeKey(b);

      if(slAliases.has(ka) && slAliases.has(kb)) return true;
      if((slAliases.has(ka) && kb === "saint lambert de lauzon") ||
         (slAliases.has(kb) && ka === "saint lambert de lauzon")) return true;

      return oldSameRestaurant(a,b);
    };
  }

  // Add restaurant in every selector automatically
  function injectSaintLambertOption(selectId){
    const el = document.getElementById(selectId);
    if(!el) return;

    const exists = [...el.options].some(o =>
      slNormalizeKey(o.value) === "saint lambert de lauzon"
    );

    if(!exists){
      const opt = document.createElement("option");
      opt.value = "Saint-Lambert-de-Lauzon";
      opt.textContent = "Saint-Lambert-de-Lauzon";
      el.appendChild(opt);
    }
  }

  // Normalize loaded arrays globally
  function normalizeAllRestaurantArrays(){
    const arrays = [
      window.RESTAURANTS,
      window.AUDITS,
      window.COMPLAINTS,
      window.DASHBOARD_DATA,
      window.REPORTS
    ];

    arrays.forEach(arr=>{
      if(!Array.isArray(arr)) return;

      arr.forEach(item=>{
        if(item.restaurant){
          item.restaurant = slCanonical(item.restaurant);
        }
        if(item.restaurantName){
          item.restaurantName = slCanonical(item.restaurantName);
        }
        if(item.store){
          item.store = slCanonical(item.store);
        }
        if(item.location){
          item.location = slCanonical(item.location);
        }
      });
    });
  }

  function refreshEverythingSaintLambert(){
    try{
      normalizeAllRestaurantArrays();

      [
        "restaurantSelect",
        "dashboardRestaurant",
        "auditRestaurant",
        "complaintRestaurant",
        "reportRestaurant"
      ].forEach(injectSaintLambertOption);

      if(typeof refreshRestaurantFilters === "function") refreshRestaurantFilters();
      if(typeof refreshComplaintFilters === "function") refreshComplaintFilters();

      if(typeof renderDashboard === "function") renderDashboard();
      if(typeof renderComplaints === "function") renderComplaints();
      if(typeof renderRestaurant === "function") renderRestaurant();
      if(typeof renderAudit === "function") renderAudit();

      if(typeof updateRestaurant === "function") updateRestaurant();
    }catch(e){
      console.error("Saint-Lambert refresh error", e);
    }
  }

  onOpsReady(()=>{
    setTimeout(refreshEverythingSaintLambert, 2200);
  });

  // Re-run after syncs
  const hooks = [
    "syncComplaints",
    "syncAudits",
    "syncDashboard",
    "syncRestaurants"
  ];

  hooks.forEach(name=>{
    if(typeof window[name] === "function"){
      const old = window[name];
      window[name] = async function(...args){
        const r = await old.apply(this,args);
        setTimeout(refreshEverythingSaintLambert, 350);
        return r;
      };
    }
  });
})();


// ======================================================
// V2.58 Fix OPS Complaint Messages visibility
// ======================================================

(function(){

  function ensureOpsComplaintPanel(){
    const possiblePages = [
      document.getElementById("page-messages"),
      document.getElementById("messagesPage"),
      document.querySelector('[data-page="messages"]'),
      document.querySelector(".messages-page"),
      document.querySelector("#messages")
    ].filter(Boolean);

    const page = possiblePages[0];
    if(!page) return false;

    if(document.getElementById("opsComplaintAiPanel")) return true;

    const panel = document.createElement("div");
    panel.id = "opsComplaintAiPanel";
    panel.className = "panel";

    panel.innerHTML = `
      <div class="panelHeader">
        <div>
          <h2>OPS Intelligent Messages — Plaintes</h2>
          <p>Messages dynamiques générés automatiquement selon les résultats réels des plaintes.</p>
        </div>
      </div>

      <div class="opsAiActions" style="margin-bottom:16px;">
        <button class="btn primary" id="generateComplaintAiMessageBtn">
          Générer analyse OPS
        </button>

        <button class="btn" id="copyOpsComplaintMessageBtn">
          Copier le message
        </button>
      </div>

      <textarea
        id="opsComplaintAiMessage"
        class="opsAiMessageTextarea"
        placeholder="Le message OPS intelligent apparaîtra ici..."
      ></textarea>
    `;

    page.prepend(panel);

    const textarea = panel.querySelector("#opsComplaintAiMessage");

    panel.querySelector("#generateComplaintAiMessageBtn").onclick = ()=>{
      try{
        if(typeof buildOpsComplaintMessage === "function"){
          textarea.value = buildOpsComplaintMessage();
        }else{
          textarea.value = "Erreur : moteur OPS intelligent non détecté.";
        }
      }catch(e){
        textarea.value = "Erreur génération message : " + e.message;
      }
    };

    panel.querySelector("#copyOpsComplaintMessageBtn").onclick = async ()=>{
      try{
        await navigator.clipboard.writeText(textarea.value || "");
        if(typeof toast === "function"){
          toast("Message copié");
        }
      }catch(e){}
    };

    return true;
  }

  // Try repeatedly because some pages are SPA rendered later.
  let tries = 0;
  const interval = setInterval(()=>{
    tries++;

    if(ensureOpsComplaintPanel() || tries > 25){
      clearInterval(interval);
    }
  }, 800);

  onOpsReady(()=>{
    setTimeout(ensureOpsComplaintPanel, 1200);
    setTimeout(ensureOpsComplaintPanel, 2500);
    setTimeout(ensureOpsComplaintPanel, 4500);
  });

})();


// ======================================================
// V2.60 Messages — restore original style + add Plaintes option
// ======================================================

(function(){

  function removeOpsComplaintPanel(){
    const p = document.getElementById("opsComplaintAiPanel");
    if(p) p.remove();
  }

  function ensurePlaintesSubjectOption(){
    const possibleSelects = [
      document.getElementById("msgSubject"),
      document.getElementById("messageSubject"),
      document.getElementById("subjectSelect"),
      document.querySelector("#page-messages select"),
      document.querySelector("#messages select")
    ].filter(Boolean);

    possibleSelects.forEach(sel=>{
      const exists = [...sel.options].some(o =>
        String(o.value).toLowerCase().includes("plainte") ||
        String(o.textContent).toLowerCase().includes("plainte")
      );

      if(!exists){
        const opt = document.createElement("option");
        opt.value = "Plaintes";
        opt.textContent = "Plaintes";
        sel.appendChild(opt);
      }
    });
  }

  function getSelectedMessageSubject(){
    const possible = [
      document.getElementById("msgSubject"),
      document.getElementById("messageSubject"),
      document.getElementById("subjectSelect")
    ].filter(Boolean);

    return possible[0]?.value || "";
  }

  function complaintMessageFromSyncedTab(){
    const rows = typeof filteredComplaints === "function"
      ? filteredComplaints()
      : (window.COMPLAINTS || []);

    const total = rows.length;
    const amount = rows.reduce((s,c)=>s+(Number(c.amount)||0),0);

    const byType = {};
    const byRestaurant = {};

    rows.forEach(r=>{
      const type = r.type || "Non catégorisé";
      const rest = r.restaurant || "Non précisé";
      byType[type] = (byType[type] || 0) + 1;
      byRestaurant[rest] = (byRestaurant[rest] || 0) + 1;
    });

    const topType = Object.entries(byType).sort((a,b)=>b[1]-a[1])[0] || ["—",0];
    const topRest = Object.entries(byRestaurant).sort((a,b)=>b[1]-a[1])[0] || ["—",0];

    let focus = "";
    const t = String(topType[0]).toLowerCase();

    if(t.includes("service")){
      focus = "Le point principal à travailler semble être l’expérience de service : délais, communication client, gestion du rush et fluidité entre cuisine, comptoir et livraison.";
    }else if(t.includes("produit")){
      focus = "Le point principal à travailler semble être la constance produit : cuisson, montage, qualité des ingrédients, présentation et contrôle avant remise au client.";
    }else if(t.includes("oublié") || t.includes("item")){
      focus = "Le point principal à travailler semble être la validation finale des commandes : sauces, breuvages, accompagnements et exactitude des sacs avant départ.";
    }else if(t.includes("propreté")){
      focus = "Le point principal à travailler semble être la rigueur propreté et perception client : lobby, comptoir, toilette, espace client et standards visuels.";
    }else{
      focus = "Les plaintes sont réparties sur plusieurs causes. Il faut identifier les récurrences, les périodes problématiques et renforcer le contrôle qualité global.";
    }

    const period = document.getElementById("complaintQuickWeek")?.value || "la période sélectionnée";

    if(total === 0){
      return `Bonjour,

Pour ${period}, aucune plainte n’est actuellement affichée selon les filtres sélectionnés dans l’onglet Plaintes.

Merci de valider le restaurant, la semaine et le type de plainte avant l’envoi du message.`;
    }

    return `Bonjour,

Voici l’analyse des plaintes pour ${period}.

Résumé de la période :
- Nombre total de plaintes : ${total}
- Montant total remis en compensation : ${amount.toFixed(2)} $
- Restaurant le plus touché : ${topRest[0]} (${topRest[1]} plainte(s))
- Type de plainte dominant : ${topType[0]} (${topType[1]} cas)

Lecture opérationnelle :
${focus}

À la lecture des résultats, l’objectif doit être de réduire rapidement les irritants récurrents qui génèrent des compensations et affectent l’expérience client. Le montant accordé en compensation doit être considéré comme un indicateur de perte opérationnelle, mais aussi comme un signal direct de perception client.

Actions recommandées :
- Revoir les plaintes une par une avec l’équipe de gestion
- Identifier les moments de la journée où les plaintes se répètent
- Faire un rappel ciblé selon la catégorie dominante
- Mettre un responsable de vérification durant les périodes de pointe
- Suivre l’évolution des plaintes quotidiennement cette semaine
- Valider si les mêmes enjeux ressortent dans le CSI ou dans les audits

Je recommande de faire un suivi rapproché afin de confirmer que les correctifs sont appliqués rapidement et que les résultats s’améliorent sur la prochaine période.`;
  }

  // Hook original generateMessage without changing its interface.
  const oldGenerateMessage = typeof generateMessage !== "undefined" ? generateMessage : null;

  if(oldGenerateMessage){
    generateMessage = function(...args){
      const subject = getSelectedMessageSubject();

      if(String(subject).toLowerCase().includes("plainte")){
        const msg = complaintMessageFromSyncedTab();

        const targets = [
          document.getElementById("messageOutput"),
          document.getElementById("messageBox"),
          document.getElementById("generatedMessage"),
          document.querySelector("#page-messages textarea"),
          document.querySelector("#messages textarea")
        ].filter(Boolean);

        const target = targets[0];

        if(target){
          if("value" in target) target.value = msg;
          else target.innerHTML = msg.replace(/\n/g,"<br>");
        }

        if(typeof toast === "function") toast("Message plaintes généré");
        return msg;
      }

      return oldGenerateMessage.apply(this,args);
    };
  }

  onOpsReady(()=>{
    setTimeout(()=>{
      removeOpsComplaintPanel();
      ensurePlaintesSubjectOption();
    },600);

    setTimeout(()=>{
      removeOpsComplaintPanel();
      ensurePlaintesSubjectOption();
    },1800);

    setTimeout(()=>{
      removeOpsComplaintPanel();
      ensurePlaintesSubjectOption();
    },3500);
  });

})();


// ======================================================
// V2.61 Messages — Multi-restaurant complaints messages
// ======================================================
(function(){
  function normRestaurant(v){
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
      .replace(/^sal-\d+-/i,"").replace(/\(qc\)/gi,"").replace(/-/g," ").replace(/\s+/g," ").trim();
  }

  function complaintRowsBase(){
    return typeof filteredComplaints === "function" ? filteredComplaints() : (window.COMPLAINTS || []);
  }

  function allComplaintRestaurants(){
    return [...new Set((window.COMPLAINTS || []).map(r=>r.restaurant).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,"fr"));
  }

  function ensureMultiRestaurantSelector(){
    const page = document.getElementById("page-messages") || document.getElementById("messages") || document.querySelector(".messages-page");
    if(!page || document.getElementById("multiRestaurantMessagePanel")) return;

    const panel = document.createElement("div");
    panel.id = "multiRestaurantMessagePanel";
    panel.className = "panel multiRestaurantMessagePanel";
    panel.innerHTML = `
      <h3>Restaurants à inclure dans le message</h3>
      <p class="multiRestaurantHint">Sélection multiple pour les franchisés multiunités. Utilisé avec le sujet « Plaintes ».</p>
      <div class="multiRestaurantActions">
        <button class="btn" id="selectAllMsgRestaurants">Tout sélectionner</button>
        <button class="btn" id="clearMsgRestaurants">Effacer</button>
      </div>
      <div id="multiRestaurantChecklist" class="multiRestaurantChecklist"></div>
    `;

    const anchor = page.querySelector(".controls") || page.querySelector(".panel") || page.firstElementChild;
    if(anchor) anchor.insertAdjacentElement("afterend", panel);
    else page.prepend(panel);

    document.getElementById("selectAllMsgRestaurants").onclick = ()=> {
      document.querySelectorAll(".msgRestaurantCheck").forEach(c=>c.checked = true);
    };
    document.getElementById("clearMsgRestaurants").onclick = ()=> {
      document.querySelectorAll(".msgRestaurantCheck").forEach(c=>c.checked = false);
    };

    refreshMultiRestaurantSelector();
  }

  function refreshMultiRestaurantSelector(){
    const box = document.getElementById("multiRestaurantChecklist");
    if(!box) return;

    const checked = new Set([...box.querySelectorAll(".msgRestaurantCheck:checked")].map(x=>x.value));
    const restaurants = allComplaintRestaurants();

    box.innerHTML = restaurants.map(r=>`
      <label class="multiRestaurantItem">
        <input type="checkbox" class="msgRestaurantCheck" value="${r}" ${checked.has(r) ? "checked" : ""}>
        <span>${r}</span>
      </label>
    `).join("");
  }

  function selectedRestaurants(){
    return [...document.querySelectorAll(".msgRestaurantCheck:checked")].map(x=>x.value);
  }

  function rowsForRestaurant(rest){
    return complaintRowsBase().filter(r=>normRestaurant(r.restaurant) === normRestaurant(rest));
  }

  function topEntry(rows, field){
    const map = {};
    rows.forEach(r=>{
      const k = r[field] || "Non précisé";
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1])[0] || ["—",0];
  }

  function sectionForRestaurant(rest){
    const rows = rowsForRestaurant(rest);
    const total = rows.length;
    const amount = rows.reduce((s,c)=>s+(Number(c.amount)||0),0);
    const topType = topEntry(rows,"type");

    if(total === 0){
      return `${rest} :
Aucune plainte n’est affichée pour ce restaurant selon les filtres actuels de l’onglet Plaintes. Rien de majeur à signaler pour la période sélectionnée.`;
    }

    const t = String(topType[0]).toLowerCase();
    let lecture = "Les plaintes sont réparties sur plusieurs causes. Il faut identifier les récurrences et valider si les mêmes enjeux ressortent dans le CSI ou les audits.";

    if(t.includes("service")) lecture = "Le principal enjeu est lié au service : délais, communication client, gestion du rush, dispatch ou fluidité entre cuisine et livraison.";
    if(t.includes("produit")) lecture = "Le principal enjeu est lié au produit : cuisson, montage, présentation, garnitures et contrôle qualité avant remise au client.";
    if(t.includes("oublié") || t.includes("item")) lecture = "Le principal enjeu est lié aux items oubliés : validation finale des sacs, sauces, breuvages et accompagnements.";
    if(t.includes("propreté")) lecture = "Le principal enjeu est lié à la propreté et à la perception client : lobby, comptoir, portes, vitrines et toilettes.";

    let status = "sous contrôle";
    if(total >= 8 || amount >= 80) status = "à surveiller de près";
    if(total >= 12 || amount >= 150) status = "en intervention prioritaire";

    return `${rest} :
- Plaintes : ${total}
- Compensation totale : ${amount.toFixed(2)} $
- Type dominant : ${topType[0]} (${topType[1]} cas)
- Lecture : ${lecture}
- Statut recommandé : ${status}.`;
  }

  function buildMultiRestaurantComplaintMessage(){
    const selected = selectedRestaurants();
    const restaurants = selected.length ? selected : allComplaintRestaurants();
    const period = document.getElementById("complaintQuickWeek")?.value || "la période sélectionnée";

    const allRows = restaurants.flatMap(r=>rowsForRestaurant(r));
    const total = allRows.length;
    const amount = allRows.reduce((s,c)=>s+(Number(c.amount)||0),0);
    const topType = topEntry(allRows,"type");

    const intro = total >= 25
      ? "Globalement, le volume de plaintes est élevé pour la période analysée. Il faut prioriser les restaurants qui accumulent les plaintes et les compensations."
      : total >= 10
        ? "Globalement, le niveau de plaintes mérite un suivi serré. Certains restaurants demandent un accompagnement plus ciblé."
        : "Globalement, le niveau de plaintes demeure relativement contrôlé. L’objectif est de maintenir la constance et d’agir rapidement sur les irritants récurrents.";

    return `Bonjour,

Voici l’analyse des plaintes pour ${period}.

Résumé multi-restaurants :
- Restaurants analysés : ${restaurants.length}
- Plaintes totales : ${total}
- Compensation totale : ${amount.toFixed(2)} $
- Type dominant global : ${topType[0]} (${topType[1]} cas)

${intro}

Détail par restaurant :

${restaurants.map(sectionForRestaurant).join("\n\n")}

Priorités recommandées :
- Traiter en priorité les restaurants avec le plus haut volume de plaintes
- Réduire les compensations en corrigeant les causes récurrentes
- Revoir les plaintes par type dominant : service, produit, item oublié ou propreté
- Comparer les plaintes avec le CSI et les audits
- Faire un suivi ciblé avec les équipes de gestion concernées
- Revalider les résultats à la prochaine période

L’objectif est de réduire la récurrence, protéger l’expérience client et améliorer la constance opérationnelle de chaque restaurant.`;
  }

  const oldGenerateMessage = typeof generateMessage !== "undefined" ? generateMessage : null;
  if(oldGenerateMessage){
    generateMessage = function(...args){
      const subject =
        document.getElementById("msgSubject")?.value ||
        document.getElementById("messageSubject")?.value ||
        document.getElementById("subjectSelect")?.value || "";

      if(String(subject).toLowerCase().includes("plainte")){
        const msg = buildMultiRestaurantComplaintMessage();
        const targets = [
          document.getElementById("messageOutput"),
          document.getElementById("messageBox"),
          document.getElementById("generatedMessage"),
          document.querySelector("#page-messages textarea"),
          document.querySelector("#messages textarea")
        ].filter(Boolean);
        const target = targets[0];
        if(target){
          if("value" in target) target.value = msg;
          else target.innerHTML = msg.replace(/\n/g,"<br>");
        }
        if(typeof toast === "function") toast("Message plaintes multi-restaurants généré");
        return msg;
      }
      return oldGenerateMessage.apply(this,args);
    };
  }

  onOpsReady(()=>{
    setTimeout(()=>{ ensureMultiRestaurantSelector(); refreshMultiRestaurantSelector(); },1200);
    setTimeout(()=>{ ensureMultiRestaurantSelector(); refreshMultiRestaurantSelector(); },3000);

    const oldSync = typeof syncComplaints !== "undefined" ? syncComplaints : null;
    if(oldSync){
      syncComplaints = async function(...args){
        const res = await oldSync.apply(this,args);
        setTimeout(()=>{ ensureMultiRestaurantSelector(); refreshMultiRestaurantSelector(); },500);
        return res;
      };
    }
  });
})();


// ======================================================
// V2.62 Elite Multi-Restaurant OPS Messages
// Complaints + CSI + Sales + Delay + Trends + Risk Score
// ======================================================

(function(){

  function opsNorm(v){
    return String(v || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/^sal-\d+-/i,"")
      .replace(/\(qc\)/gi,"")
      .replace(/-/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function parseWeekStart(label){
    const m = String(label || "").match(/(\d{4}-\d{2}-\d{2})/);
    return m ? new Date(m[1] + "T00:00:00") : null;
  }

  function selectedComplaintWeekLabel(){
    return document.getElementById("complaintQuickWeek")?.value || "latest";
  }

  function previousWeekLabel(currentLabel){
    const d = parseWeekStart(currentLabel);
    if(!d) return null;

    d.setDate(d.getDate() - 7);
    const start = new Date(d);
    const end = new Date(d);
    end.setDate(end.getDate() + 6);

    const iso = x => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
    return `${iso(start)} au ${iso(end)}`;
  }

  function currentRowsForRestaurant(rest){
    const rows = typeof filteredComplaints === "function"
      ? filteredComplaints()
      : (window.COMPLAINTS || []);
    return rows.filter(r => opsNorm(r.restaurant) === opsNorm(rest));
  }

  function rowsForRestaurantAndWeek(rest, weekLabel){
    const all = window.COMPLAINTS || [];
    const m = String(weekLabel || "").match(/(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/);
    if(!m) return [];

    const start = new Date(m[1] + "T00:00:00");
    const end = new Date(m[2] + "T23:59:59");

    return all.filter(r=>{
      const d = r.date ? new Date(r.date) : null;
      return d && !isNaN(d) &&
        d >= start &&
        d <= end &&
        opsNorm(r.restaurant) === opsNorm(rest);
    });
  }

  function topEntry(rows, field){
    const map = {};
    rows.forEach(r=>{
      const k = r[field] || "Non précisé";
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1])[0] || ["—",0];
  }

  function allMessageRestaurants(){
    return [...new Set((window.COMPLAINTS || []).map(r=>r.restaurant).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,"fr"));
  }

  function selectedMessageRestaurantsV262(){
    const selected = [...document.querySelectorAll(".msgRestaurantCheck:checked")].map(x=>x.value);
    return selected.length ? selected : allMessageRestaurants();
  }

  function getKpiRowForRestaurant(rest){
    if(!Array.isArray(window.DATA) && typeof DATA === "undefined") return null;
    const data = Array.isArray(window.DATA) ? window.DATA : DATA;

    const week = selectedComplaintWeekLabel();
    const candidates = data.filter(r => opsNorm(r.restaurant) === opsNorm(rest));

    if(!candidates.length) return null;

    if(week && week !== "latest"){
      const exact = candidates.find(r => String(r.week) === String(week));
      if(exact) return exact;
    }

    return candidates[candidates.length - 1];
  }

  function numberOrNull(v){
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  function riskScore({complaints, amount, csi, delay, growth, trend}){
    let score = 0;

    if(complaints >= 12) score += 35;
    else if(complaints >= 8) score += 25;
    else if(complaints >= 4) score += 12;

    if(amount >= 150) score += 25;
    else if(amount >= 80) score += 15;
    else if(amount >= 40) score += 8;

    if(csi !== null && csi < 84) score += 25;
    else if(csi !== null && csi < 88) score += 12;

    if(delay !== null && delay > 45) score += 20;
    else if(delay !== null && delay > 35) score += 10;

    if(growth !== null && growth < 0) score += 8;
    if(trend > 0) score += Math.min(12, trend * 2);

    return Math.min(100, score);
  }

  function riskLabel(score){
    if(score >= 70) return "Intervention prioritaire";
    if(score >= 45) return "Sous surveillance élevée";
    if(score >= 25) return "À surveiller";
    return "Sous contrôle";
  }

  function prioritiesForRestaurant(topType, risk, complaints, amount, csi, delay){
    const t = String(topType || "").toLowerCase();
    const p = [];

    if(t.includes("service")){
      p.push("Revoir la structure de rush et la couverture des postes critiques");
      p.push("Valider les délais réels et le dispatch durant les pointes");
      p.push("Renforcer la communication client lorsqu’un délai est anticipé");
    }else if(t.includes("produit")){
      p.push("Refaire un rappel sur les standards produit et le contrôle qualité");
      p.push("Valider la cuisson, le montage, les garnitures et la présentation");
      p.push("Mettre un contrôle avant remise au client lors des périodes fortes");
    }else if(t.includes("oublié") || t.includes("item")){
      p.push("Mettre une vérification finale obligatoire des sacs");
      p.push("Identifier un responsable expo/QA durant le rush");
      p.push("Réorganiser sauces, breuvages et accompagnements pour limiter les oublis");
    }else if(t.includes("propreté")){
      p.push("Faire une validation visuelle du lobby, comptoir et toilettes avant rush");
      p.push("Ajouter une ronde de propreté pendant les heures fortes");
      p.push("Responsabiliser un membre de l’équipe sur l’image client");
    }else{
      p.push("Revoir les plaintes une par une avec l’équipe de gestion");
      p.push("Identifier les répétitions par période, produit ou poste");
      p.push("Mettre un suivi quotidien jusqu’à stabilisation");
    }

    if(csi !== null && csi < 88) p.push("Faire le lien avec le CSI pour confirmer l’impact sur l’expérience client");
    if(delay !== null && delay > 35) p.push("Vérifier si les délais contribuent aux plaintes observées");
    if(amount >= 80) p.push("Réduire les compensations en traitant la cause opérationnelle à la source");
    if(risk >= 70) p.push("Prévoir un suivi rapproché avec échéance claire et validation terrain");

    return [...new Set(p)].slice(0,6);
  }

  function eliteSectionForRestaurant(rest){
    const rows = currentRowsForRestaurant(rest);
    const total = rows.length;
    const amount = rows.reduce((s,c)=>s+(Number(c.amount)||0),0);
    const avg = total ? amount / total : 0;
    const topType = topEntry(rows,"type");

    const week = selectedComplaintWeekLabel();
    const prevWeek = previousWeekLabel(week);
    const previousRows = prevWeek ? rowsForRestaurantAndWeek(rest, prevWeek) : [];
    const trend = total - previousRows.length;

    const kpi = getKpiRowForRestaurant(rest);
    const csi = numberOrNull(kpi?.csi);
    const delay = numberOrNull(kpi?.delay);
    const growth = numberOrNull(kpi?.growth);

    const score = riskScore({complaints:total, amount, csi, delay, growth, trend});
    const label = riskLabel(score);
    const priorities = prioritiesForRestaurant(topType[0], score, total, amount, csi, delay);

    let reading = "";

    if(total === 0){
      reading = "Aucune plainte n’est affichée pour ce restaurant selon les filtres actuels. Le restaurant semble stable sur cet axe pour la période sélectionnée, mais il faut maintenir la rigueur opérationnelle.";
    }else if(score >= 70){
      reading = "Le restaurant présente un niveau de risque opérationnel élevé. Les plaintes, les compensations ou les indicateurs liés à l’expérience client justifient une intervention rapide et structurée.";
    }else if(score >= 45){
      reading = "Le restaurant montre des signaux qui doivent être suivis de près. La situation n’est pas nécessairement hors contrôle, mais les irritants observés peuvent rapidement affecter le CSI et la perception client.";
    }else if(score >= 25){
      reading = "Le restaurant demeure globalement contrôlé, mais certains éléments méritent un suivi afin d’éviter une récurrence des plaintes sur les prochaines semaines.";
    }else{
      reading = "Les résultats sont actuellement sous contrôle. L’objectif est de maintenir les standards et d’éviter que les plaintes isolées deviennent des tendances.";
    }

    const trendText =
      trend > 0 ? `hausse de ${trend} plainte(s) vs la semaine précédente`
      : trend < 0 ? `baisse de ${Math.abs(trend)} plainte(s) vs la semaine précédente`
      : previousRows.length ? "stable vs la semaine précédente"
      : "aucune comparaison disponible avec la semaine précédente";

    return `${rest}
- Plaintes : ${total}
- Compensation totale : ${amount.toFixed(2)} $
- Moyenne par plainte : ${avg.toFixed(2)} $
- Type dominant : ${topType[0]} (${topType[1]} cas)
- Tendance : ${trendText}
- CSI : ${csi === null ? "N/D" : csi.toFixed(1) + "%"}
- Délai livraison : ${delay === null ? "N/D" : delay.toFixed(1) + " min"}
- Croissance ventes : ${growth === null ? "N/D" : growth.toFixed(1) + "%"}

Lecture OPS :
${reading}

Priorités ciblées :
${priorities.map(x=>`• ${x}`).join("\n")}`;
  }

  function buildEliteMultiRestaurantMessage(){
    const restaurants = selectedMessageRestaurantsV262();
    const week = selectedComplaintWeekLabel() || "la période sélectionnée";
    const allRows = restaurants.flatMap(r=>currentRowsForRestaurant(r));
    const total = allRows.length;
    const amount = allRows.reduce((s,c)=>s+(Number(c.amount)||0),0);
    const topType = topEntry(allRows,"type");

    const ranked = restaurants.map(r=>{
      const rows = currentRowsForRestaurant(r);
      const amountR = rows.reduce((s,c)=>s+(Number(c.amount)||0),0);
      const top = topEntry(rows,"type");
      const kpi = getKpiRowForRestaurant(r);
      const score = riskScore({
        complaints: rows.length,
        amount: amountR,
        csi: numberOrNull(kpi?.csi),
        delay: numberOrNull(kpi?.delay),
        growth: numberOrNull(kpi?.growth),
        trend: 0
      });
      return {restaurant:r, score, complaints:rows.length, amount:amountR, topType:top[0]};
    }).sort((a,b)=>b.score-a.score);

    const globalReading =
      total >= 25 || ranked[0]?.score >= 70
      ? "Le portrait global démontre qu’un suivi structuré est nécessaire. Certains restaurants présentent un risque opérationnel plus élevé et doivent être priorisés afin de réduire les irritants clients, les compensations et l’impact potentiel sur le CSI."
      : total >= 10
        ? "Le portrait global demeure gérable, mais certains restaurants demandent un suivi plus ciblé. L’enjeu principal est d’éviter que les irritants observés deviennent récurrents."
        : "Le portrait global est relativement stable. Les plaintes demeurent limitées, mais le suivi doit rester rigoureux pour maintenir la constance opérationnelle.";

    return `Bonjour,

Voici l’analyse OPS multi-restaurants pour ${week}.

Résumé global :
- Restaurants analysés : ${restaurants.length}
- Plaintes totales : ${total}
- Compensation totale : ${amount.toFixed(2)} $
- Type dominant global : ${topType[0]} (${topType[1]} cas)
- Restaurant à prioriser : ${ranked[0]?.restaurant || "—"} (${ranked[0]?.complaints || 0} plainte(s), ${ranked[0]?.amount.toFixed(2) || "0.00"} $)

Lecture globale :
${globalReading}

Classement de priorité :
${ranked.map((r,i)=>`${i+1}. ${r.restaurant} — ${r.complaints} plainte(s), ${r.amount.toFixed(2)} $`).join("\n")}

Analyse par restaurant :

${restaurants.map(eliteSectionForRestaurant).join("\n\n")}

Plan d’action recommandé :
• Traiter les causes dominantes par restaurant plutôt qu’un rappel général
• Réduire les compensations en corrigeant la cause terrain à la source
• Croiser les plaintes avec le CSI, les délais et les audits
• Faire un suivi ciblé avec les équipes de gestion concernées
• Revalider les résultats à la prochaine période pour confirmer l’amélioration

L’objectif est de réduire la récurrence, protéger l’expérience client et augmenter la constance opérationnelle de chaque restaurant.`;
  }

  const previousGenerate = typeof generateMessage !== "undefined" ? generateMessage : null;

  if(previousGenerate){
    generateMessage = function(...args){
      const subject =
        document.getElementById("msgSubject")?.value ||
        document.getElementById("messageSubject")?.value ||
        document.getElementById("subjectSelect")?.value || "";

      if(String(subject).toLowerCase().includes("plainte")){
        const msg = buildEliteMultiRestaurantMessage();

        const targets = [
          document.getElementById("messageOutput"),
          document.getElementById("messageBox"),
          document.getElementById("generatedMessage"),
          document.querySelector("#page-messages textarea"),
          document.querySelector("#messages textarea")
        ].filter(Boolean);

        const target = targets[0];
        if(target){
          if("value" in target) target.value = msg;
          else target.innerHTML = msg.replace(/\n/g,"<br>");
        }

        if(typeof toast === "function") toast("Message OPS élite généré");
        return msg;
      }

      return previousGenerate.apply(this,args);
    };
  }

})();


// ======================================================
// V2.64 FIX — Messages Plaintes uses checked restaurants only
// ======================================================
(function(){

  function normResto(v){
    return String(v || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/^sal-\d+-/i,"")
      .replace(/\(qc\)/gi,"")
      .replace(/-/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function selectedMsgRestaurantsFinal(){
    return [...document.querySelectorAll(".msgRestaurantCheck:checked")]
      .map(x => x.value)
      .filter(Boolean);
  }

  function allComplaintRestaurantsFinal(){
    return [...new Set((window.COMPLAINTS || []).map(r => r.restaurant).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,"fr"));
  }

  function getComplaintWeekRangeForMessages(){
    const week = document.getElementById("complaintQuickWeek")?.value || "latest";

    if(week && week !== "latest"){
      const m = String(week).match(/(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/);
      if(m){
        return [new Date(m[1] + "T00:00:00"), new Date(m[2] + "T23:59:59")];
      }
    }

    // Fallback to current filtered complaints if latest
    if(typeof filteredComplaints === "function"){
      const rows = filteredComplaints();
      if(rows.length){
        const dates = rows.map(r=>new Date(r.date)).filter(d=>!isNaN(d));
        if(dates.length){
          const min = new Date(Math.min(...dates));
          const max = new Date(Math.max(...dates));
          min.setHours(0,0,0,0);
          max.setHours(23,59,59,999);
          return [min,max];
        }
      }
    }

    return [new Date("2000-01-01T00:00:00"), new Date("2999-12-31T23:59:59")];
  }

  function getSelectedTypeForMessages(){
    const val = document.getElementById("complaintType")?.value || "Tous";
    return val;
  }

  function complaintRowsForMessageRestaurant(rest){
    const [start,end] = getComplaintWeekRangeForMessages();
    const selectedType = getSelectedTypeForMessages();

    return (window.COMPLAINTS || []).filter(r=>{
      const d = r.date ? new Date(r.date) : null;
      if(!d || isNaN(d)) return false;
      if(d < start || d > end) return false;
      if(normResto(r.restaurant) !== normResto(rest)) return false;
      if(selectedType !== "Tous" && r.type !== selectedType) return false;
      return true;
    });
  }

  function topEntryMsg(rows, field){
    const map = {};
    rows.forEach(r=>{
      const k = r[field] || "Non précisé";
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1])[0] || ["—",0];
  }

  function kpiForMessageRestaurant(rest){
    const data = Array.isArray(window.DATA) ? window.DATA : (typeof DATA !== "undefined" && Array.isArray(DATA) ? DATA : []);
    const week = document.getElementById("complaintQuickWeek")?.value || "latest";
    const rows = data.filter(r=>normResto(r.restaurant) === normResto(rest));
    if(!rows.length) return null;

    if(week !== "latest"){
      const exact = rows.find(r=>String(r.week) === String(week));
      if(exact) return exact;
    }

    return rows[rows.length - 1];
  }

  function n(v){
    const x = Number(v);
    return isNaN(x) ? null : x;
  }

  function sectionForMsgRestaurant(rest){
    const rows = complaintRowsForMessageRestaurant(rest);
    const total = rows.length;
    const amount = rows.reduce((s,c)=>s+(Number(c.amount)||0),0);
    const avg = total ? amount / total : 0;
    const topType = topEntryMsg(rows,"type");
    const kpi = kpiForMessageRestaurant(rest);

    const csi = n(kpi?.csi);
    const delay = n(kpi?.delay);
    const growth = n(kpi?.growth);

    let lecture = "";

    if(total === 0){
      lecture = "Aucune plainte n’est affichée pour ce restaurant selon la semaine et le type sélectionnés. Le restaurant semble stable sur cet axe pour la période analysée.";
    }else{
      const t = String(topType[0]).toLowerCase();

      if(t.includes("service")){
        lecture = "L’enjeu principal semble lié au service : délais, communication client, gestion du rush, dispatch ou coordination entre cuisine et livraison.";
      }else if(t.includes("produit")){
        lecture = "L’enjeu principal semble lié au produit : cuisson, montage, présentation, garnitures ou contrôle qualité avant remise au client.";
      }else if(t.includes("oublié") || t.includes("item")){
        lecture = "L’enjeu principal semble lié aux items oubliés : validation finale des sacs, sauces, breuvages et accompagnements.";
      }else if(t.includes("propreté")){
        lecture = "L’enjeu principal semble lié à la propreté et à la perception client : lobby, comptoir, vitrines, portes ou toilettes.";
      }else{
        lecture = "Les plaintes sont réparties sur plusieurs causes. Il faut identifier les dossiers récurrents et valider si les mêmes enjeux ressortent dans le CSI ou les audits.";
      }
    }

    const priorities = [];
    const t = String(topType[0]).toLowerCase();

    if(t.includes("service")){
      priorities.push("Revoir la structure de rush et la couverture des postes critiques");
      priorities.push("Valider les délais réels et le dispatch durant les pointes");
      priorities.push("Renforcer la communication client lorsqu’un délai est anticipé");
    }else if(t.includes("produit")){
      priorities.push("Refaire un rappel sur les standards produit et le contrôle qualité");
      priorities.push("Valider la cuisson, le montage, les garnitures et la présentation");
      priorities.push("Mettre un contrôle avant remise au client lors des périodes fortes");
    }else if(t.includes("oublié") || t.includes("item")){
      priorities.push("Mettre une vérification finale obligatoire des sacs");
      priorities.push("Identifier un responsable expo/QA durant le rush");
      priorities.push("Réorganiser sauces, breuvages et accompagnements pour limiter les oublis");
    }else{
      priorities.push("Revoir les plaintes une par une avec l’équipe de gestion");
      priorities.push("Identifier les répétitions par période, produit ou poste");
      priorities.push("Mettre un suivi quotidien jusqu’à stabilisation");
    }

    if(csi !== null && csi < 88) priorities.push("Faire le lien avec le CSI pour confirmer l’impact sur l’expérience client");
    if(delay !== null && delay > 35) priorities.push("Vérifier si les délais contribuent aux plaintes observées");
    if(amount >= 80) priorities.push("Réduire les compensations en corrigeant la cause opérationnelle à la source");

    return `${rest}
- Plaintes : ${total}
- Compensation totale : ${amount.toFixed(2)} $
- Moyenne par plainte : ${avg.toFixed(2)} $
- Type dominant : ${topType[0]} (${topType[1]} cas)
- CSI : ${csi === null ? "N/D" : csi.toFixed(1) + "%"}
- Délai livraison : ${delay === null ? "N/D" : delay.toFixed(1) + " min"}
- Croissance ventes : ${growth === null ? "N/D" : growth.toFixed(1) + "%"}

Lecture OPS :
${lecture}

Priorités ciblées :
${[...new Set(priorities)].slice(0,6).map(x=>"• "+x).join("\n")}`;
  }

  function buildFinalMultiRestaurantMessage(){
    const selected = selectedMsgRestaurantsFinal();
    const restaurants = selected.length ? selected : allComplaintRestaurantsFinal();

    const week = document.getElementById("complaintQuickWeek")?.value || "la période sélectionnée";
    const selectedType = document.getElementById("complaintType")?.value || "Tous";

    const allRows = restaurants.flatMap(r=>complaintRowsForMessageRestaurant(r));
    const total = allRows.length;
    const amount = allRows.reduce((s,c)=>s+(Number(c.amount)||0),0);
    const topType = topEntryMsg(allRows,"type");

    const ranked = restaurants.map(r=>{
      const rows = complaintRowsForMessageRestaurant(r);
      const amountR = rows.reduce((s,c)=>s+(Number(c.amount)||0),0);
      return {restaurant:r, complaints:rows.length, amount:amountR};
    }).sort((a,b)=>b.complaints-a.complaints || b.amount-a.amount);

    const intro = total >= 25
      ? "Le portrait global démontre qu’un suivi structuré est nécessaire. Certains restaurants présentent un volume de plaintes plus élevé et doivent être priorisés afin de réduire les irritants clients et les compensations."
      : total >= 10
        ? "Le portrait global demeure gérable, mais certains restaurants demandent un suivi plus ciblé afin d’éviter que les irritants deviennent récurrents."
        : "Le portrait global est relativement stable. L’objectif est de maintenir la constance et d’agir rapidement sur les irritants isolés.";

    return `Bonjour,

Voici l’analyse OPS multi-restaurants pour ${week}.

Filtres utilisés :
- Restaurants sélectionnés : ${restaurants.join(", ")}
- Type de plainte : ${selectedType}

Résumé global :
- Restaurants analysés : ${restaurants.length}
- Plaintes totales : ${total}
- Compensation totale : ${amount.toFixed(2)} $
- Type dominant global : ${topType[0]} (${topType[1]} cas)

Lecture globale :
${intro}

Classement de priorité :
${ranked.map((r,i)=>`${i+1}. ${r.restaurant} — ${r.complaints} plainte(s), ${r.amount.toFixed(2)} $`).join("\n")}

Analyse par restaurant :

${restaurants.map(sectionForMsgRestaurant).join("\n\n")}

Plan d’action recommandé :
• Traiter en priorité les restaurants avec le plus haut volume de plaintes
• Corriger les causes dominantes par restaurant, plutôt qu’envoyer un rappel général
• Croiser les plaintes avec le CSI, les délais et les audits
• Réduire les compensations en corrigeant la cause terrain à la source
• Faire un suivi ciblé avec les équipes de gestion concernées
• Revalider les résultats à la prochaine période pour confirmer l’amélioration

L’objectif est de réduire la récurrence, protéger l’expérience client et augmenter la constance opérationnelle de chaque restaurant.`;
  }

  function selectedSubjectFinal(){
    return document.getElementById("msgSubject")?.value ||
      document.getElementById("messageSubject")?.value ||
      document.getElementById("subjectSelect")?.value ||
      "";
  }

  function writeMessageFinal(msg){
    const targets = [
      document.getElementById("messageOutput"),
      document.getElementById("messageBox"),
      document.getElementById("generatedMessage"),
      document.querySelector("#page-messages textarea"),
      document.querySelector("#messages textarea")
    ].filter(Boolean);

    const target = targets[0];
    if(target){
      if("value" in target) target.value = msg;
      else target.innerHTML = msg.replace(/\n/g,"<br>");
    }
  }

  const previousGenerateV264 = typeof generateMessage !== "undefined" ? generateMessage : null;

  generateMessage = function(...args){
    const subject = selectedSubjectFinal();

    if(String(subject).toLowerCase().includes("plainte")){
      const msg = buildFinalMultiRestaurantMessage();
      writeMessageFinal(msg);
      if(typeof toast === "function") toast("Message plaintes multi-restaurants généré");
      return msg;
    }

    if(previousGenerateV264){
      return previousGenerateV264.apply(this,args);
    }
  };

})();


// ======================================================
// V2.65 Multi-restaurant messages for ALL subjects
// ======================================================
(function(){

  function normMultiAll(v){
    return String(v || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/^sal-\d+-/i,"")
      .replace(/\(qc\)/gi,"")
      .replace(/-/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function selectedRestaurantsAllSubjects(){
    const selected = [...document.querySelectorAll(".msgRestaurantCheck:checked")]
      .map(x=>x.value)
      .filter(Boolean);

    if(selected.length) return selected;

    const main =
      document.getElementById("msgRestaurant")?.value ||
      document.getElementById("messageRestaurant")?.value ||
      document.getElementById("restaurantSelect")?.value ||
      "";

    return main && main !== "Tous" ? [main] : [];
  }

  function selectedSubjectAll(){
    return document.getElementById("msgSubject")?.value ||
      document.getElementById("messageSubject")?.value ||
      document.getElementById("subjectSelect")?.value ||
      "";
  }

  function selectedWeekAll(){
    return document.getElementById("msgWeek")?.value ||
      document.getElementById("messageWeek")?.value ||
      document.getElementById("complaintQuickWeek")?.value ||
      "latest";
  }

  function kpiForRestaurantAll(rest){
    const data = Array.isArray(window.DATA) ? window.DATA : (typeof DATA !== "undefined" && Array.isArray(DATA) ? DATA : []);
    const week = selectedWeekAll();

    const rows = data.filter(r=>normMultiAll(r.restaurant) === normMultiAll(rest));
    if(!rows.length) return null;

    if(week && week !== "latest"){
      const exact = rows.find(r=>String(r.week) === String(week));
      if(exact) return exact;
    }

    return rows[rows.length - 1];
  }

  function complaintRowsAll(rest){
    const all = window.COMPLAINTS || [];
    const week = document.getElementById("complaintQuickWeek")?.value || selectedWeekAll();
    let start = null, end = null;

    const m = String(week).match(/(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/);
    if(m){
      start = new Date(m[1]+"T00:00:00");
      end = new Date(m[2]+"T23:59:59");
    }

    return all.filter(c=>{
      if(normMultiAll(c.restaurant) !== normMultiAll(rest)) return false;
      if(start && end){
        const d = c.date ? new Date(c.date) : null;
        if(!d || isNaN(d) || d < start || d > end) return false;
      }
      return true;
    });
  }

  function topComplaintTypeAll(rows){
    const map = {};
    rows.forEach(r=>{
      const k = r.type || "Non précisé";
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1])[0] || ["—",0];
  }

  function numberFmt(v, suffix=""){
    const n = Number(v);
    return isNaN(n) ? "N/D" : `${n.toFixed(1)}${suffix}`;
  }

  function sectionBySubject(rest, subject){
    const kpi = kpiForRestaurantAll(rest) || {};
    const complaints = complaintRowsAll(rest);
    const amount = complaints.reduce((s,c)=>s+(Number(c.amount)||0),0);
    const topType = topComplaintTypeAll(complaints);

    const csi = Number(kpi.csi);
    const delay = Number(kpi.delay);
    const growth = Number(kpi.growth);
    const sales = Number(kpi.sales);
    const food = Number(kpi.food);
    const labor = Number(kpi.labor);

    const s = String(subject || "").toLowerCase();

    let lecture = "";
    let priorities = [];

    if(s.includes("csi")){
      lecture = isNaN(csi)
        ? "Aucune donnée CSI claire n’est disponible pour ce restaurant sur la période sélectionnée."
        : csi >= 88
          ? "Le CSI est au-dessus ou près de l’objectif. L’objectif est de maintenir la constance et d’éviter que les irritants opérationnels viennent affecter l’expérience client."
          : "Le CSI est sous l’objectif. Il faut identifier rapidement les irritants client : service, produit, délais, exactitude des commandes ou propreté.";
      priorities = ["Analyser les commentaires CSI négatifs", "Faire un coaching ciblé sur les irritants récurrents", "Croiser CSI avec plaintes et audits", "Suivre l’évolution quotidiennement"];
    }else if(s.includes("vente") || s.includes("sales") || s.includes("augmentation")){
      lecture = isNaN(growth)
        ? "La donnée de croissance n’est pas disponible pour ce restaurant."
        : growth >= 5
          ? "La croissance des ventes est positive. Il faut s’assurer que la structure opérationnelle suit le volume afin de protéger l’expérience client."
          : growth >= 0
            ? "Les ventes sont légèrement positives ou stables. Il faut chercher des opportunités locales pour accélérer la progression."
            : "La croissance est négative. Il faut valider si la baisse est liée au marché, aux opérations, au service ou à l’expérience client.";
      priorities = ["Analyser les journées faibles", "Comparer ventes vs plaintes/CSI", "Valider staffing lors des périodes fortes", "Identifier actions locales de relance"];
    }else if(s.includes("délai") || s.includes("delai") || s.includes("livraison")){
      lecture = isNaN(delay)
        ? "La donnée de délai n’est pas disponible pour ce restaurant."
        : delay <= 35
          ? "Les délais semblent bien contrôlés. Il faut maintenir la structure actuelle durant les périodes fortes."
          : "Les délais dépassent le niveau souhaité. Cela peut directement affecter le CSI, les plaintes service et la perception client.";
      priorities = ["Revoir la couverture livreurs", "Analyser 17h30-19h30", "Valider dispatch et préparation", "Éviter les coupures trop rapides"];
    }else if(s.includes("plainte")){
      lecture = complaints.length
        ? `Le restaurant compte ${complaints.length} plainte(s), pour ${amount.toFixed(2)} $ en compensation. Le type dominant est ${topType[0]}.`
        : "Aucune plainte n’est affichée selon les filtres sélectionnés.";
      priorities = ["Traiter les causes dominantes", "Réduire les compensations", "Faire un suivi des dossiers récurrents", "Croiser avec CSI/audit"];
    }else if(s.includes("audit") || s.includes("propreté") || s.includes("proprete")){
      lecture = "Le suivi doit se concentrer sur la rigueur d’exécution terrain, les standards visuels, la préparation au rush et les points de contrôle quotidiens.";
      priorities = ["Valider les standards avant rush", "Faire suivi des points non conformes", "Assigner responsables par correction", "Revalider à la prochaine visite"];
    }else if(s.includes("global") || s.includes("tout")){
      lecture = "Lecture globale du restaurant basée sur les KPI disponibles, plaintes et indicateurs opérationnels. L’objectif est d’identifier si le restaurant est stable, en progression ou à risque.";
      priorities = ["Prioriser les irritants les plus visibles", "Croiser CSI, plaintes, délais et ventes", "Faire un suivi ciblé avec l’équipe de gestion", "Mesurer l’amélioration à la prochaine période"];
    }else{
      lecture = "Analyse opérationnelle générale selon les données disponibles pour la période sélectionnée.";
      priorities = ["Identifier les écarts principaux", "Faire un coaching ciblé", "Suivre les résultats à la prochaine période"];
    }

    return `${rest}
- Ventes : ${isNaN(sales) ? "N/D" : sales.toLocaleString("fr-CA",{style:"currency",currency:"CAD"})}
- Croissance ventes : ${numberFmt(growth,"%")}
- CSI : ${numberFmt(csi,"%")}
- Délai livraison : ${numberFmt(delay," min")}
- Plaintes : ${complaints.length}
- Compensation plaintes : ${amount.toFixed(2)} $
- Food : ${numberFmt(food,"%")}
- Main-d’œuvre : ${numberFmt(labor,"%")}

Lecture OPS :
${lecture}

Priorités :
${priorities.map(p=>"• "+p).join("\n")}`;
  }

  function buildMultiAllSubjectsMessage(){
    const subject = selectedSubjectAll();
    const restaurants = selectedRestaurantsAllSubjects();
    const week = selectedWeekAll();

    if(!restaurants.length){
      return "Aucun restaurant sélectionné. Sélectionne au moins un restaurant dans “Restaurants à inclure dans le message”.";
    }

    const sections = restaurants.map(r=>sectionBySubject(r, subject)).join("\n\n");

    return `Bonjour,

Voici l’analyse OPS pour ${week}.

Sujet : ${subject}
Restaurants analysés : ${restaurants.join(", ")}

Résumé global :
L’analyse ci-dessous présente les résultats par restaurant afin de faciliter un suivi multiunités plus précis. L’objectif est d’éviter un message général et de cibler les priorités propres à chaque succursale.

${sections}

Synthèse recommandée :
• Prioriser les restaurants avec les écarts les plus importants
• Adapter les suivis selon la réalité de chaque restaurant
• Éviter les rappels génériques lorsque les enjeux sont différents
• Croiser les données entre ventes, CSI, délais, plaintes et audits
• Revalider les correctifs à la prochaine période

L’objectif est d’améliorer la constance opérationnelle de chacun des restaurants tout en gardant une vision globale du groupe multiunités.`;
  }

  const previousGenerateAllSubjects = typeof generateMessage !== "undefined" ? generateMessage : null;

  generateMessage = function(...args){
    const restaurants = selectedRestaurantsAllSubjects();

    if(restaurants.length > 1){
      const msg = buildMultiAllSubjectsMessage();

      const targets = [
        document.getElementById("messageOutput"),
        document.getElementById("messageBox"),
        document.getElementById("generatedMessage"),
        document.querySelector("#page-messages textarea"),
        document.querySelector("#messages textarea")
      ].filter(Boolean);

      const target = targets[0];
      if(target){
        if("value" in target) target.value = msg;
        else target.innerHTML = msg.replace(/\n/g,"<br>");
      }

      if(typeof toast === "function") toast("Message multi-restaurants généré");
      return msg;
    }

    if(previousGenerateAllSubjects){
      return previousGenerateAllSubjects.apply(this,args);
    }
  };

})();


// ======================================================
// V2.66 Messages — Simplified restaurant selection
// Only use checklist restaurants, hide old dropdown
// ======================================================
(function(){

  function hideMessageRestaurantDropdown(){
    const ids = [
      "msgRestaurant",
      "messageRestaurant",
      "restaurantMessage",
      "messageRestaurantSelect"
    ];

    ids.forEach(id=>{
      const el = document.getElementById(id);
      if(!el) return;

      const wrapper = el.closest(".field") ||
        el.closest(".control") ||
        el.closest("label") ||
        el.parentElement;

      if(wrapper){
        wrapper.classList.add("hideMessageRestaurantDropdown");
      }else{
        el.style.display = "none";
      }
    });

    // Hide any label that clearly belongs to the old restaurant dropdown inside Messages only
    const page = document.getElementById("page-messages") ||
      document.getElementById("messages") ||
      document.querySelector(".messages-page");

    if(page){
      [...page.querySelectorAll("label")].forEach(label=>{
        const txt = String(label.textContent || "").trim().toLowerCase();
        if(txt === "restaurant" || txt === "restaurants"){
          const input = label.querySelector("select") || label.nextElementSibling;
          if(input && input.tagName === "SELECT"){
            label.classList.add("hideMessageRestaurantDropdown");
            input.classList.add("hideMessageRestaurantDropdown");
          }
        }
      });
    }
  }

  function getCheckedMessageRestaurantsV266(){
    return [...document.querySelectorAll(".msgRestaurantCheck:checked")]
      .map(x=>x.value)
      .filter(Boolean);
  }

  function setChecklistRequiredHint(){
    const panel = document.getElementById("multiRestaurantMessagePanel");
    if(!panel) return;

    const hint = panel.querySelector(".multiRestaurantHint");
    if(hint){
      hint.textContent = "Sélectionne ici le ou les restaurants à inclure dans le message. Ce choix remplace le menu déroulant restaurant principal.";
    }
  }

  function selectedSubjectV266(){
    return document.getElementById("msgSubject")?.value ||
      document.getElementById("messageSubject")?.value ||
      document.getElementById("subjectSelect")?.value ||
      "";
  }

  function selectedWeekV266(){
    return document.getElementById("msgWeek")?.value ||
      document.getElementById("messageWeek")?.value ||
      document.getElementById("complaintQuickWeek")?.value ||
      "latest";
  }

  function writeMessageV266(msg){
    const targets = [
      document.getElementById("messageOutput"),
      document.getElementById("messageBox"),
      document.getElementById("generatedMessage"),
      document.querySelector("#page-messages textarea"),
      document.querySelector("#messages textarea")
    ].filter(Boolean);

    const target = targets[0];

    if(target){
      if("value" in target) target.value = msg;
      else target.innerHTML = msg.replace(/\n/g,"<br>");
    }
  }

  // Ensure the message always uses the checklist, even with only 1 restaurant.
  const previousGenerateV266 = typeof generateMessage !== "undefined" ? generateMessage : null;

  generateMessage = function(...args){
    const selected = getCheckedMessageRestaurantsV266();

    if(!selected.length){
      const msg = "Sélectionne au moins un restaurant dans « Restaurants à inclure dans le message » avant de générer le message.";
      writeMessageV266(msg);
      if(typeof toast === "function") toast("Aucun restaurant sélectionné");
      return msg;
    }

    // If V2.65 multi-subject builder exists indirectly through previousGenerate, force multi path by having >1 no longer required.
    if(typeof buildMultiAllSubjectsMessage === "function"){
      const msg = buildMultiAllSubjectsMessage();
      writeMessageV266(msg);
      if(typeof toast === "function") toast("Message généré");
      return msg;
    }

    // Local fallback when builder is not globally exposed.
    const subject = selectedSubjectV266();
    const week = selectedWeekV266();
    const msg = `Bonjour,

Voici l’analyse OPS pour ${week}.

Sujet : ${subject}
Restaurants analysés : ${selected.join(", ")}

Le message utilise maintenant uniquement les restaurants cochés dans « Restaurants à inclure dans le message ».`;
    writeMessageV266(msg);
    return msg;
  };

  onOpsReady(()=>{
    setTimeout(()=>{
      hideMessageRestaurantDropdown();
      setChecklistRequiredHint();
    },600);

    setTimeout(()=>{
      hideMessageRestaurantDropdown();
      setChecklistRequiredHint();
    },1800);

    setTimeout(()=>{
      hideMessageRestaurantDropdown();
      setChecklistRequiredHint();
    },3500);
  });

})();









// ======================================================
// V2.72 Messages — Restore subjects, hide metric/context fields
// ======================================================
(function(){

  const subjectsToRestore = [
    {value:"Ventes", text:"Ventes"},
    {value:"CSI Global", text:"CSI Global"},
    {value:"Délais", text:"Délais"},
    {value:"Augmentation ventes", text:"Augmentation ventes"}
  ];

  function subjectSelects(){
    return [
      document.getElementById("msgSubject"),
      document.getElementById("messageSubject"),
      document.getElementById("subjectSelect")
    ].filter(Boolean);
  }

  function restoreSubjectsInDropdown(){
    subjectSelects().forEach(sel=>{
      subjectsToRestore.forEach(s=>{
        const exists = [...sel.options].some(o =>
          String(o.value).toLowerCase() === s.value.toLowerCase() ||
          String(o.textContent).toLowerCase() === s.text.toLowerCase()
        );

        if(!exists){
          const opt = document.createElement("option");
          opt.value = s.value;
          opt.textContent = s.text;
          sel.appendChild(opt);
        }
      });
    });
  }

  function hideFieldByLabelText(page, labelText){
    const wanted = String(labelText || "").toLowerCase();

    [...page.querySelectorAll("label")].forEach(label=>{
      const txt = String(label.textContent || "").trim().toLowerCase();

      if(txt === wanted || txt.includes(wanted)){
        const field =
          label.closest(".field") ||
          label.closest(".control") ||
          label.closest(".formGroup") ||
          label.parentElement;

        if(field){
          field.classList.add("messagesHiddenField");
        }

        // Also hide the input/textarea/select directly beside it if layout is label + input
        const next = label.nextElementSibling;
        if(next && ["INPUT","TEXTAREA","SELECT"].includes(next.tagName)){
          next.classList.add("messagesHiddenField");
        }
      }
    });
  }

  function hideOldMessageMetricFields(){
    const page = document.getElementById("page-messages") ||
      document.getElementById("messages") ||
      document.querySelector(".messages-page");

    if(!page) return;

    ["ventes", "csi global", "délai", "délais", "augmentation ventes", "augmentation de vente", "contexte"].forEach(txt=>{
      hideFieldByLabelText(page, txt);
    });

    // Backup: hide inputs/textareas by id/name/placeholder if labels are not structured
    [...page.querySelectorAll("input, textarea")].forEach(el=>{
      const raw = `${el.id || ""} ${el.name || ""} ${el.placeholder || ""}`.toLowerCase();

      if(
        raw.includes("vente") ||
        raw.includes("csi") ||
        raw.includes("delai") ||
        raw.includes("délai") ||
        raw.includes("augmentation") ||
        raw.includes("contexte") ||
        raw.includes("context")
      ){
        const field = el.closest(".field") || el.closest(".control") || el.closest(".formGroup") || el.parentElement;
        if(field) field.classList.add("messagesHiddenField");
        el.classList.add("messagesHiddenField");
      }
    });
  }

  function runMessagesCleanup(){
    restoreSubjectsInDropdown();
    hideOldMessageMetricFields();
  }

  onOpsReady(()=>{
    setTimeout(runMessagesCleanup, 300);
    setTimeout(runMessagesCleanup, 1200);
    setTimeout(runMessagesCleanup, 2500);
  });

  window.addEventListener("load",()=>{
    setTimeout(runMessagesCleanup, 500);
  });

})();


// ======================================================
// V2.73 Final subject dropdown options fix
// ======================================================
(function(){

  const wantedSubjects = [
    "Global",
    "CSI",
    "Audit",
    "Moyenne de facturation",
    "Plaintes",
    "Ventes",
    "CSI Global",
    "Délais",
    "Augmentation ventes"
  ];

  function findSubjectSelect(){
    const byId = [
      document.getElementById("msgSubject"),
      document.getElementById("messageSubject"),
      document.getElementById("subjectSelect")
    ].filter(Boolean);

    if(byId.length) return byId[0];

    const candidates = [...document.querySelectorAll("select")];

    return candidates.find(sel=>{
      const txt = [...sel.options].map(o=>String(o.textContent || o.value || "").toLowerCase()).join("|");
      return txt.includes("global") && (txt.includes("plainte") || txt.includes("audit") || txt.includes("csi"));
    });
  }

  function fixSubjectDropdown(){
    const sel = findSubjectSelect();
    if(!sel) return;

    const current = sel.value;

    sel.innerHTML = wantedSubjects
      .map(s=>`<option value="${s}">${s}</option>`)
      .join("");

    if(wantedSubjects.includes(current)){
      sel.value = current;
    }else{
      sel.value = "Global";
    }
  }

  onOpsReady(()=>{
    setTimeout(fixSubjectDropdown,300);
    setTimeout(fixSubjectDropdown,1200);
    setTimeout(fixSubjectDropdown,2500);
  });

  window.addEventListener("load",()=>{
    setTimeout(fixSubjectDropdown,500);
  });

})();


// ======================================================
// V2.74 Message Generator Fix — real data-driven messages
// ======================================================
(function(){

  function norm(v){
    return String(v || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/^sal-\d+-/i,"")
      .replace(/\(qc\)/gi,"")
      .replace(/-/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function selectedRestaurants(){
    return [...document.querySelectorAll(".msgRestaurantCheck:checked")]
      .map(x=>x.value)
      .filter(Boolean);
  }

  function subject(){
    return document.getElementById("msgSubject")?.value ||
      document.getElementById("messageSubject")?.value ||
      document.getElementById("subjectSelect")?.value ||
      "Global";
  }

  function week(){
    return document.getElementById("msgWeek")?.value ||
      document.getElementById("messageWeek")?.value ||
      document.getElementById("complaintQuickWeek")?.value ||
      "Dernière semaine";
  }

  function getDataArray(){
    if(Array.isArray(window.DATA)) return window.DATA;
    try{ if(Array.isArray(DATA)) return DATA; }catch(e){}
    return [];
  }

  function getComplaintsArray(){
    if(Array.isArray(window.COMPLAINTS)) return window.COMPLAINTS;
    return [];
  }

  function getKpi(rest){
    const data = getDataArray();
    const w = week();

    const rows = data.filter(r=>norm(r.restaurant) === norm(rest));
    if(!rows.length) return {};

    if(w && w !== "latest" && w !== "Dernière semaine"){
      const exact = rows.find(r=>String(r.week) === String(w));
      if(exact) return exact;
    }

    return rows[rows.length - 1] || {};
  }

  function weekRangeFromLabel(w){
    const m = String(w || "").match(/(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/);
    if(!m) return null;
    return [new Date(m[1]+"T00:00:00"), new Date(m[2]+"T23:59:59")];
  }

  function getComplaints(rest){
    const rows = getComplaintsArray();
    const range = weekRangeFromLabel(document.getElementById("complaintQuickWeek")?.value || week());

    return rows.filter(c=>{
      if(norm(c.restaurant) !== norm(rest)) return false;

      if(range){
        const d = c.date ? new Date(c.date) : null;
        if(!d || isNaN(d) || d < range[0] || d > range[1]) return false;
      }

      return true;
    });
  }

  function topType(rows){
    const map = {};
    rows.forEach(r=>{
      const k = r.type || "Non précisé";
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1])[0] || ["—",0];
  }

  function num(v){
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  function money(v){
    const n = Number(v);
    return isNaN(n) ? "N/D" : n.toLocaleString("fr-CA",{style:"currency",currency:"CAD"});
  }

  function pct(v){
    const n = Number(v);
    return isNaN(n) ? "N/D" : n.toFixed(1)+"%";
  }

  function min(v){
    const n = Number(v);
    return isNaN(n) ? "N/D" : n.toFixed(1)+" min";
  }

  function kpiVal(row, keys){
    for(const k of keys){
      if(row && row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    }
    return null;
  }

  function restaurantSection(rest, subj){
    const kpi = getKpi(rest);
    const complaints = getComplaints(rest);
    const amount = complaints.reduce((s,c)=>s+(Number(c.amount)||0),0);
    const type = topType(complaints);

    const sales = kpiVal(kpi, ["sales","ventes","salesValue"]);
    const csi = kpiVal(kpi, ["csi","CSI"]);
    const delay = kpiVal(kpi, ["delay","delai","délais","deliveryDelay"]);
    const growth = kpiVal(kpi, ["growth","augmentation","salesGrowth"]);
    const avgTicket = kpiVal(kpi, ["avgTicket","moyenneFacturation","averageTicket"]);
    const audits = kpiVal(kpi, ["auditScore","score","audit"]);

    const s = String(subj || "").toLowerCase();

    let lecture = "";
    let actions = [];

    if(s.includes("plainte")){
      lecture = complaints.length
        ? `Le restaurant présente ${complaints.length} plainte(s) pour ${amount.toFixed(2)} $ en compensation. Le type dominant est ${type[0]}, ce qui permet d’orienter le suivi terrain sur une cause précise plutôt que de rester dans un rappel général.`
        : "Aucune plainte n’est affichée pour ce restaurant selon la période sélectionnée. Le suivi doit viser à maintenir cette stabilité.";
      actions = ["Revoir les plaintes une par une", "Traiter la catégorie dominante", "Réduire les compensations à la source", "Comparer avec CSI et audits"];
    }else if(s.includes("csi")){
      const n = num(csi);
      lecture = n === null ? "Aucune donnée CSI claire n’est disponible pour cette période." :
        n >= 88 ? `Le CSI est à ${pct(csi)}, donc le restaurant est au niveau attendu. Le focus doit être de maintenir la constance.` :
        `Le CSI est à ${pct(csi)}, donc sous l’objectif. Il faut identifier les irritants clients et agir rapidement sur les causes répétitives.`;
      actions = ["Analyser les commentaires CSI négatifs", "Croiser CSI avec plaintes", "Faire un coaching ciblé", "Suivre l’évolution à court terme"];
    }else if(s.includes("vente") || s.includes("augmentation")){
      const g = num(growth);
      lecture = g === null ? "La donnée de croissance ventes n’est pas disponible pour cette période." :
        g >= 5 ? `La croissance est positive à ${pct(growth)}. Il faut s’assurer que les opérations suivent le volume afin de protéger l’expérience client.` :
        g >= 0 ? `La croissance est stable à ${pct(growth)}. Il faut chercher des opportunités pour accélérer la progression.` :
        `La croissance est négative à ${pct(growth)}. Il faut valider si la baisse vient du marché, de l’exécution ou de l’expérience client.`;
      actions = ["Analyser les journées faibles", "Valider promo/local marketing", "Comparer ventes vs plaintes/CSI", "Ajuster staffing selon volume"];
    }else if(s.includes("délai") || s.includes("delai")){
      const d = num(delay);
      lecture = d === null ? "La donnée de délai n’est pas disponible pour cette période." :
        d <= 35 ? `Le délai est contrôlé à ${min(delay)}. Il faut maintenir la structure actuelle.` :
        `Le délai est élevé à ${min(delay)}. Cela peut affecter directement les plaintes service et le CSI.`;
      actions = ["Revoir couverture livreurs", "Analyser 17h30-19h30", "Valider dispatch", "Éviter coupures trop rapides"];
    }else if(s.includes("audit") || s.includes("propreté") || s.includes("proprete")){
      lecture = `Le suivi doit se concentrer sur les standards terrain, la propreté, la préparation au rush et les points non conformes. Score audit : ${audits ?? "N/D"}.`;
      actions = ["Valider les points non conformes", "Assigner responsables", "Faire suivi terrain", "Revalider à la prochaine visite"];
    }else if(s.includes("moyenne")){
      lecture = `La moyenne de facturation est de ${money(avgTicket)}. Il faut analyser si le panier moyen est cohérent avec les objectifs, les ventes et les habitudes clients.`;
      actions = ["Analyser panier moyen", "Valider upsell", "Comparer aux ventes", "Suivre l’évolution semaine suivante"];
    }else{
      lecture = `Portrait global : ventes ${money(sales)}, croissance ${pct(growth)}, CSI ${pct(csi)}, délai ${min(delay)}, plaintes ${complaints.length}, compensation ${amount.toFixed(2)} $.`;
      actions = ["Prioriser les écarts majeurs", "Croiser plaintes/CSI/délais", "Faire un suivi ciblé", "Mesurer l’amélioration à la prochaine période"];
    }

    return `${rest}
- Ventes : ${money(sales)}
- Croissance ventes : ${pct(growth)}
- CSI : ${pct(csi)}
- Délai livraison : ${min(delay)}
- Plaintes : ${complaints.length}
- Compensation plaintes : ${amount.toFixed(2)} $
- Moyenne de facturation : ${money(avgTicket)}

Lecture OPS :
${lecture}

Actions recommandées :
${actions.map(a=>"• "+a).join("\n")}`;
  }

  function buildMessage(){
    const restaurants = selectedRestaurants();
    const subj = subject();
    const w = week();

    if(!restaurants.length){
      return "Sélectionne au moins un restaurant dans « Restaurants à inclure dans le message » avant de générer le message.";
    }

    const sections = restaurants.map(r=>restaurantSection(r, subj)).join("\n\n");

    return `Bonjour,

Voici l’analyse OPS pour ${w}.

Sujet : ${subj}
Restaurants analysés : ${restaurants.join(", ")}

Résumé global :
L’analyse ci-dessous est séparée par restaurant afin de permettre un suivi multiunités précis. L’objectif est d’éviter un message général et de cibler les priorités propres à chaque succursale.

${sections}

Synthèse recommandée :
• Prioriser les restaurants avec les écarts les plus importants
• Adapter le suivi selon la réalité de chaque restaurant
• Éviter les rappels génériques lorsque les enjeux sont différents
• Croiser les données entre ventes, CSI, délais, plaintes et audits
• Revalider les correctifs à la prochaine période

L’objectif est d’améliorer la constance opérationnelle de chacun des restaurants tout en gardant une vision globale du groupe multiunités.`;
  }

  function write(msg){
    const targets = [
      document.getElementById("messageOutput"),
      document.getElementById("messageBox"),
      document.getElementById("generatedMessage"),
      document.querySelector("#page-messages textarea"),
      document.querySelector("#messages textarea")
    ].filter(Boolean);

    const t = targets[0];
    if(t){
      if("value" in t) t.value = msg;
      else t.innerHTML = msg.replace(/\n/g,"<br>");
    }
  }

  const old = typeof generateMessage !== "undefined" ? generateMessage : null;

  generateMessage = function(...args){
    const restaurants = selectedRestaurants();
    if(restaurants.length){
      const msg = buildMessage();
      write(msg);
      if(typeof toast === "function") toast("Message généré");
      return msg;
    }
    if(old) return old.apply(this,args);
    const msg = buildMessage();
    write(msg);
    return msg;
  };

})();


// ======================================================
// V2.75 Smart Subject Messages — powerful subject-specific generator
// ======================================================
(function(){

  function smNorm(v){
    return String(v || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/^sal-\d+-/i,"")
      .replace(/\(qc\)/gi,"")
      .replace(/-/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function smSubject(){
    const selects = [
      document.getElementById("msgSubject"),
      document.getElementById("messageSubject"),
      document.getElementById("subjectSelect")
    ].filter(Boolean);
    return selects[0]?.value || "Global";
  }

  function smWeek(){
    return document.getElementById("msgWeek")?.value ||
      document.getElementById("messageWeek")?.value ||
      document.getElementById("complaintQuickWeek")?.value ||
      "Dernière semaine";
  }

  function smRestaurants(){
    return [...document.querySelectorAll(".msgRestaurantCheck:checked")]
      .map(x=>x.value)
      .filter(Boolean);
  }

  function smData(){
    if(Array.isArray(window.DATA)) return window.DATA;
    try{ if(Array.isArray(DATA)) return DATA; }catch(e){}
    return [];
  }

  function smComplaints(){
    return Array.isArray(window.COMPLAINTS) ? window.COMPLAINTS : [];
  }

  function smNum(v){
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  function smPick(row, keys){
    for(const k of keys){
      if(row && row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    }
    return null;
  }

  function smMoney(v){
    const n = Number(v);
    return isNaN(n) ? "N/D" : n.toLocaleString("fr-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
  }

  function smMoney2(v){
    const n = Number(v);
    return isNaN(n) ? "N/D" : n.toLocaleString("fr-CA",{style:"currency",currency:"CAD",minimumFractionDigits:2,maximumFractionDigits:2});
  }

  function smPct(v){
    const n = Number(v);
    return isNaN(n) ? "N/D" : n.toFixed(1)+"%";
  }

  function smMin(v){
    const n = Number(v);
    return isNaN(n) ? "N/D" : n.toFixed(1)+" min";
  }

  function smKpi(rest){
    const data = smData();
    const week = smWeek();
    const rows = data.filter(r=>smNorm(r.restaurant) === smNorm(rest));
    if(!rows.length) return {};

    if(week && week !== "latest" && week !== "Dernière semaine"){
      const exact = rows.find(r=>String(r.week) === String(week));
      if(exact) return exact;
    }

    return rows[rows.length - 1] || {};
  }

  function smWeekRange(){
    const label = document.getElementById("complaintQuickWeek")?.value || smWeek();
    const m = String(label || "").match(/(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/);
    if(!m) return null;
    return [new Date(m[1]+"T00:00:00"), new Date(m[2]+"T23:59:59")];
  }

  function smComplaintRows(rest){
    const range = smWeekRange();
    return smComplaints().filter(c=>{
      if(smNorm(c.restaurant) !== smNorm(rest)) return false;
      if(range){
        const d = c.date ? new Date(c.date) : null;
        if(!d || isNaN(d) || d < range[0] || d > range[1]) return false;
      }
      return true;
    });
  }

  function smTop(rows, field){
    const map = {};
    rows.forEach(r=>{
      const k = r[field] || "Non précisé";
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1])[0] || ["—",0];
  }

  function smMetrics(rest){
    const k = smKpi(rest);
    const complaints = smComplaintRows(rest);
    const compAmount = complaints.reduce((s,c)=>s+(Number(c.amount)||0),0);
    const topType = smTop(complaints,"type");

    return {
      rest,
      sales: smNum(smPick(k,["sales","ventes","salesValue","Ventes"])),
      growth: smNum(smPick(k,["growth","augmentation","salesGrowth","Augmentation ventes","augmentationVentes"])),
      csi: smNum(smPick(k,["csi","CSI","csiGlobal"])),
      delay: smNum(smPick(k,["delay","delai","délais","deliveryDelay","Délais"])),
      avgTicket: smNum(smPick(k,["avgTicket","moyenneFacturation","averageTicket","Moyenne de facturation"])),
      food: smNum(smPick(k,["food","foodCost","Food"])),
      labor: smNum(smPick(k,["labor","mainOeuvre","mo","Main-d’œuvre"])),
      audit: smNum(smPick(k,["auditScore","score","audit","Audit"])),
      complaints,
      complaintCount: complaints.length,
      compAmount,
      topComplaintType: topType[0],
      topComplaintCount: topType[1]
    };
  }

  function smSubjectKind(subject){
    const s = String(subject || "").toLowerCase();
    if(s.includes("plainte")) return "plaintes";
    if(s === "csi" || s.includes("csi global")) return "csi";
    if(s.includes("vente") && !s.includes("augmentation")) return "ventes";
    if(s.includes("augmentation")) return "augmentation";
    if(s.includes("délai") || s.includes("delai")) return "delais";
    if(s.includes("audit")) return "audit";
    if(s.includes("propreté") || s.includes("proprete")) return "proprete";
    if(s.includes("produit")) return "produit";
    if(s.includes("service")) return "service";
    if(s.includes("moyenne")) return "moyenne";
    return "global";
  }

  function smIntro(kind, restaurants, metrics){
    const totalComplaints = metrics.reduce((s,m)=>s+m.complaintCount,0);
    const totalComp = metrics.reduce((s,m)=>s+m.compAmount,0);
    const avgCsi = metrics.filter(m=>m.csi!==null).reduce((s,m)=>s+m.csi,0) / Math.max(1, metrics.filter(m=>m.csi!==null).length);

    const headers = {
      csi: `L’analyse ci-dessous se concentre sur l’expérience client et le CSI. L’objectif est d’identifier quels restaurants protègent bien l’expérience client et lesquels nécessitent un coaching plus ciblé.`,
      ventes: `L’analyse ci-dessous se concentre sur la performance des ventes. L’objectif est de comprendre où le volume est solide, où il y a un ralentissement et comment protéger les opérations lorsque les ventes augmentent.`,
      augmentation: `L’analyse ci-dessous se concentre sur l’évolution des ventes. L’objectif est d’identifier les restaurants en croissance, ceux en recul et les actions nécessaires pour ramener du momentum.`,
      delais: `L’analyse ci-dessous se concentre sur les délais de livraison. L’objectif est d’éviter que les délais créent des plaintes service, une baisse CSI ou une mauvaise perception client.`,
      plaintes: `L’analyse ci-dessous se concentre sur les plaintes et les compensations. L’objectif est de réduire les irritants récurrents et de traiter les causes terrain plutôt que seulement les symptômes.`,
      audit: `L’analyse ci-dessous se concentre sur la rigueur opérationnelle et les standards d’audit. L’objectif est de transformer les constats en actions concrètes et suivies.`,
      proprete: `L’analyse ci-dessous se concentre sur la propreté et la perception client. L’objectif est de protéger l’image du restaurant et de réduire les irritants visibles.`,
      produit: `L’analyse ci-dessous se concentre sur la qualité produit. L’objectif est de renforcer la constance, la cuisson, le montage et la validation avant remise au client.`,
      service: `L’analyse ci-dessous se concentre sur le service. L’objectif est d’améliorer la fluidité du rush, la communication, les délais et la prise en charge du client.`,
      moyenne: `L’analyse ci-dessous se concentre sur la moyenne de facturation. L’objectif est de comprendre la qualité du panier moyen et les opportunités de vente additionnelle.`,
      global: `L’analyse ci-dessous présente une lecture globale multi-indicateurs. L’objectif est de prioriser les bons suivis par restaurant plutôt que d’envoyer un message général.`
    };

    return `${headers[kind] || headers.global}

Lecture réseau rapide :
- Restaurants analysés : ${restaurants.length}
- Plaintes totales visibles : ${totalComplaints}
- Compensation totale visible : ${totalComp.toFixed(2)} $
- CSI moyen disponible : ${isNaN(avgCsi) ? "N/D" : avgCsi.toFixed(1)+"%"}`;
  }

  function smSection(m, kind){
    const lines = [];
    let reading = "";
    let actions = [];

    if(kind === "csi"){
      if(m.csi === null){
        reading = "Aucune donnée CSI claire n’est disponible. Le suivi doit donc se faire avec les plaintes, audits et observations terrain.";
        actions = ["Valider la source CSI", "Lire les commentaires clients disponibles", "Croiser avec les plaintes de la semaine"];
      }else if(m.csi >= 90){
        reading = `Excellent contrôle de l’expérience client avec un CSI à ${smPct(m.csi)}. Le restaurant démontre une bonne constance. Le focus doit être de maintenir les standards et d’éviter un relâchement durant les pointes.`;
        actions = ["Maintenir les routines actuelles", "Identifier ce qui fonctionne bien et le répéter", "Surveiller les plaintes isolées avant qu’elles deviennent une tendance"];
      }else if(m.csi >= 88){
        reading = `CSI à ${smPct(m.csi)}, donc au niveau attendu. Le restaurant est dans une zone positive, mais il faut protéger ce résultat avec de la constance opérationnelle.`;
        actions = ["Maintenir la rigueur du rush", "Traiter rapidement les irritants isolés", "Continuer de suivre les commentaires clients"];
      }else if(m.csi >= 84){
        reading = `CSI à ${smPct(m.csi)}, sous l’objectif. Il faut identifier les irritants qui empêchent le restaurant d’atteindre le standard attendu. Les plaintes et délais doivent être analysés ensemble.`;
        actions = ["Identifier les commentaires négatifs récurrents", "Croiser avec plaintes et délais", "Faire un coaching ciblé sur les irritants clients"];
      }else{
        reading = `CSI critique à ${smPct(m.csi)}. Le restaurant nécessite un suivi rapproché. Il faut traiter les causes opérationnelles rapidement, car l’expérience client est probablement affectée de façon visible.`;
        actions = ["Faire une analyse détaillée des commentaires", "Mettre un plan d’action immédiat", "Valider présence gestion durant les périodes fortes", "Revoir produit, service et délais"];
      }
    }

    if(kind === "ventes"){
      if(m.sales === null){
        reading = "Aucune donnée de ventes claire n’est disponible pour la période.";
        actions = ["Valider la synchronisation des ventes", "Comparer avec le tableau Dashboard"];
      }else{
        reading = `Les ventes sont à ${smMoney(m.sales)}. ${m.growth !== null ? `La variation est de ${smPct(m.growth)}.` : ""} La lecture doit porter sur la capacité du restaurant à soutenir ce volume sans dégrader les délais, le CSI ou les plaintes.`;
        actions = ["Comparer les journées fortes et faibles", "Valider que le staffing suit le volume", "Surveiller les plaintes lors des journées de ventes élevées", "Identifier les opportunités de relance locale"];
      }
    }

    if(kind === "augmentation"){
      if(m.growth === null){
        reading = "Aucune donnée d’augmentation des ventes claire n’est disponible.";
        actions = ["Valider le comparatif avec l’année précédente", "Confirmer que la semaine sélectionnée est bien synchronisée"];
      }else if(m.growth >= 8){
        reading = `Très bonne croissance à ${smPct(m.growth)}. Le focus doit être de protéger l’expérience client pendant la hausse de volume afin que la croissance ne crée pas plus de plaintes ou de délais.`;
        actions = ["Maintenir le niveau de préparation", "Ajuster staffing selon volume", "Surveiller les délais en période forte"];
      }else if(m.growth >= 0){
        reading = `Croissance positive ou stable à ${smPct(m.growth)}. Le restaurant avance, mais il reste possible de créer plus de momentum avec une meilleure exécution locale.`;
        actions = ["Identifier les journées à potentiel", "Travailler upsell et panier moyen", "Comparer plaintes vs ventes"];
      }else{
        reading = `Croissance négative à ${smPct(m.growth)}. Il faut comprendre si la baisse est liée au marché, aux opérations, au service, aux délais ou à la perception client.`;
        actions = ["Analyser les journées en recul", "Croiser avec CSI et plaintes", "Valider exécution promo/local", "Mettre un plan de relance ciblé"];
      }
    }

    if(kind === "delais"){
      if(m.delay === null){
        reading = "Aucune donnée de délai claire n’est disponible.";
        actions = ["Valider la source délai", "Croiser avec les plaintes service"];
      }else if(m.delay <= 30){
        reading = `Délai très bien contrôlé à ${smMin(m.delay)}. Le restaurant semble efficace sur la livraison. Il faut maintenir cette structure pendant les pointes.`;
        actions = ["Maintenir la couverture actuelle", "Préserver les bonnes pratiques de dispatch", "Surveiller les pics imprévus"];
      }else if(m.delay <= 35){
        reading = `Délai acceptable à ${smMin(m.delay)}. Le restaurant est près du standard, mais il faut surveiller les périodes de pointe pour éviter une dérive.`;
        actions = ["Analyser 17h30-19h30", "Valider coupures livreurs", "Suivre plaintes service"];
      }else if(m.delay <= 45){
        reading = `Délai à surveiller à ${smMin(m.delay)}. Ce niveau peut commencer à affecter le CSI et générer des plaintes service.`;
        actions = ["Revoir staffing livraison", "Valider dispatch", "Réduire les coupures rapides", "Prévoir renfort sur les soirées fortes"];
      }else{
        reading = `Délai critique à ${smMin(m.delay)}. Cela représente un risque direct sur l’expérience client, les plaintes et la rétention.`;
        actions = ["Plan d’action livraison immédiat", "Ajouter couverture aux heures critiques", "Réviser territoire si nécessaire", "Suivi quotidien des délais"];
      }
    }

    if(kind === "plaintes"){
      if(!m.complaintCount){
        reading = "Aucune plainte visible pour ce restaurant sur la période. C’est positif, mais il faut maintenir les standards et continuer de surveiller le CSI.";
        actions = ["Maintenir les routines actuelles", "Surveiller plaintes isolées", "Continuer le contrôle qualité"];
      }else{
        reading = `${m.complaintCount} plainte(s) pour ${m.compAmount.toFixed(2)} $ en compensation. Le type dominant est ${m.topComplaintType}. Le suivi doit viser la cause dominante pour réduire la récurrence.`;
        actions = ["Revoir chaque plainte avec la gestion", "Traiter la catégorie dominante", "Réduire les compensations à la source", "Comparer avec CSI et audits"];
      }
    }

    if(kind === "audit" || kind === "proprete"){
      reading = kind === "proprete"
        ? "Le suivi doit être centré sur la perception client : lobby, comptoir, portes, vitrines, toilettes et propreté générale. Même avec peu de plaintes, la perception visuelle influence fortement l’expérience."
        : `Le suivi audit doit transformer les constats en actions précises. ${m.audit !== null ? `Score/indicateur audit disponible : ${m.audit}.` : "Aucun score audit clair n’est disponible."}`;
      actions = kind === "proprete"
        ? ["Mettre une ronde propreté avant et pendant le rush", "Assigner un responsable image client", "Valider lobby/toilettes/comptoir", "Revoir les standards avec l’équipe"]
        : ["Lister les non-conformités prioritaires", "Assigner un responsable par correction", "Fixer une échéance courte", "Revalider à la prochaine visite"];
    }

    if(kind === "produit"){
      reading = `Le suivi produit doit porter sur la constance : cuisson, montage, quantité de garnitures, présentation et contrôle final. ${m.complaintCount ? `Il y a ${m.complaintCount} plainte(s) visibles, avec ${m.topComplaintType} comme type dominant.` : ""}`;
      actions = ["Faire un rappel standards produit", "Valider cuisson et montage", "Contrôle qualité avant remise", "Coaching avec exemples concrets"];
    }

    if(kind === "service"){
      reading = `Le suivi service doit porter sur la fluidité du rush, la communication client, les délais et la prise en charge. ${m.delay !== null ? `Délai actuel : ${smMin(m.delay)}.` : ""} ${m.complaintCount ? `Plaintes visibles : ${m.complaintCount}.` : ""}`;
      actions = ["Revoir structure du rush", "Valider dispatch et comptoir", "Coaching communication client", "Surveiller 17h30-19h30"];
    }

    if(kind === "moyenne"){
      if(m.avgTicket === null){
        reading = "Aucune donnée claire de moyenne de facturation n’est disponible.";
        actions = ["Valider la synchronisation", "Comparer avec ventes et nombre de clients"];
      }else{
        reading = `La moyenne de facturation est de ${smMoney2(m.avgTicket)}. Il faut analyser si le panier moyen reflète bien les opportunités d’upsell et la composition des commandes.`;
        actions = ["Travailler upsell", "Analyser mix produit", "Comparer aux ventes totales", "Suivre évolution semaine suivante"];
      }
    }

    if(kind === "global"){
      reading = `Portrait global : ventes ${smMoney(m.sales)}, croissance ${smPct(m.growth)}, CSI ${smPct(m.csi)}, délai ${smMin(m.delay)}, plaintes ${m.complaintCount}, compensation ${m.compAmount.toFixed(2)} $. La priorité est d’identifier l’indicateur qui crée le plus grand risque opérationnel.`;
      actions = ["Prioriser le plus gros écart", "Croiser ventes/CSI/délais/plaintes", "Éviter les suivis trop généraux", "Mesurer l’amélioration à la prochaine période"];
    }

    lines.push(`${m.rest}
- Ventes : ${smMoney(m.sales)}
- Croissance ventes : ${smPct(m.growth)}
- CSI : ${smPct(m.csi)}
- Délai livraison : ${smMin(m.delay)}
- Plaintes : ${m.complaintCount}
- Compensation plaintes : ${m.compAmount.toFixed(2)} $
- Moyenne de facturation : ${smMoney2(m.avgTicket)}

Lecture OPS :
${reading}

Actions ciblées :
${actions.map(a=>"• "+a).join("\n")}`);

    return lines.join("\n");
  }

  function smBuildPowerMessage(){
    const restaurants = smRestaurants();
    const subject = smSubject();
    const kind = smSubjectKind(subject);
    const week = smWeek();

    if(!restaurants.length){
      return "Sélectionne au moins un restaurant dans « Restaurants à inclure dans le message » avant de générer le message.";
    }

    const metrics = restaurants.map(smMetrics);

    let ranked = [...metrics].sort((a,b)=>{
      if(kind === "csi") return (a.csi ?? 999) - (b.csi ?? 999);
      if(kind === "delais") return (b.delay ?? -1) - (a.delay ?? -1);
      if(kind === "plaintes") return b.complaintCount - a.complaintCount || b.compAmount - a.compAmount;
      if(kind === "augmentation") return (a.growth ?? 999) - (b.growth ?? 999);
      if(kind === "ventes") return (b.sales ?? -1) - (a.sales ?? -1);
      return b.complaintCount - a.complaintCount;
    });

    const priorityLine = ranked.slice(0,3).map((m,i)=>{
      if(kind === "csi") return `${i+1}. ${m.rest} — CSI ${smPct(m.csi)}`;
      if(kind === "delais") return `${i+1}. ${m.rest} — délai ${smMin(m.delay)}`;
      if(kind === "plaintes") return `${i+1}. ${m.rest} — ${m.complaintCount} plainte(s), ${m.compAmount.toFixed(2)} $`;
      if(kind === "augmentation") return `${i+1}. ${m.rest} — croissance ${smPct(m.growth)}`;
      if(kind === "ventes") return `${i+1}. ${m.rest} — ventes ${smMoney(m.sales)}`;
      return `${i+1}. ${m.rest} — ${m.complaintCount} plainte(s), CSI ${smPct(m.csi)}, délai ${smMin(m.delay)}`;
    }).join("\n");

    return `Bonjour,

Voici l’analyse OPS pour ${week}.

Sujet : ${subject}
Restaurants analysés : ${restaurants.join(", ")}

${smIntro(kind, restaurants, metrics)}

Priorités de lecture :
${priorityLine || "Aucune priorité claire disponible avec les données actuelles."}

Analyse par restaurant :

${metrics.map(m=>smSection(m, kind)).join("\n\n")}

Synthèse recommandée :
• Prioriser les restaurants qui ressortent dans les écarts du sujet sélectionné
• Adapter le coaching à la cause réelle de chaque restaurant
• Éviter les rappels génériques si les enjeux sont différents
• Croiser les données avec plaintes, CSI, délais, ventes et audits
• Revalider les résultats à la prochaine période

L’objectif est d’avoir un suivi précis, utile et terrain pour chaque restaurant sélectionné.`;
  }

  function smWrite(msg){
    const targets = [
      document.getElementById("messageOutput"),
      document.getElementById("messageBox"),
      document.getElementById("generatedMessage"),
      document.querySelector("#page-messages textarea"),
      document.querySelector("#messages textarea")
    ].filter(Boolean);

    const target = targets[0];
    if(target){
      if("value" in target) target.value = msg;
      else target.innerHTML = msg.replace(/\n/g,"<br>");
    }
  }

  // Final override: this one always wins and is subject-specific.
  generateMessage = function(){
    const msg = smBuildPowerMessage();
    smWrite(msg);
    if(typeof toast === "function") toast("Message intelligent généré");
    return msg;
  };

})();


// ======================================================
// V2.76 Subject Isolation Engine
// Each subject talks ONLY about its own KPI
// ======================================================
(function(){

  function isolateSubjectSection(kind, m){
    const blocks = {
      csi: `
${m.rest}
- CSI : ${smPct(m.csi)}

Analyse CSI :
${
m.csi === null
? "Aucune donnée CSI claire n’est disponible pour cette période."
: m.csi >= 90
? `Le CSI à ${smPct(m.csi)} démontre une excellente stabilité opérationnelle et une expérience client bien contrôlée.`
: m.csi >= 88
? `Le CSI à ${smPct(m.csi)} est dans la cible, mais une légère dérive pourrait rapidement affecter la perception client.`
: m.csi >= 84
? `Le CSI à ${smPct(m.csi)} est sous l’objectif réseau. Certains irritants semblent affecter l’expérience client de façon récurrente.`
: `Le CSI à ${smPct(m.csi)} représente une situation critique nécessitant un suivi rapide avec l’équipe de gestion.`
}

Priorités CSI :
${
m.csi !== null && m.csi < 88
? `• Lire les commentaires négatifs
• Identifier les irritants récurrents
• Faire un coaching ciblé sur l’expérience client
• Revalider l’évolution la prochaine semaine`
: `• Maintenir les standards actuels
• Continuer le suivi des commentaires clients
• Préserver la constance durant les périodes fortes`
}`,

      ventes: `
${m.rest}
- Ventes : ${smMoney(m.sales)}

Analyse ventes :
${
m.sales === null
? "Aucune donnée de ventes n’est disponible."
: `Le restaurant affiche ${smMoney(m.sales)} de ventes sur la période sélectionnée. Le focus doit être mis sur la capacité à soutenir ce volume avec une bonne exécution terrain.`
}

Priorités ventes :
• Comparer les journées fortes et faibles
• Valider la préparation lors des périodes achalandées
• Identifier les opportunités de croissance locale
• S’assurer que les opérations suivent le volume`,

      augmentation: `
${m.rest}
- Augmentation ventes : ${smPct(m.growth)}

Analyse augmentation ventes :
${
m.growth === null
? "Aucune donnée de croissance n’est disponible."
: m.growth >= 10
? `Très forte progression à ${smPct(m.growth)}. Le restaurant semble gagner du momentum et doit protéger l’expérience client pendant cette croissance.`
: m.growth >= 0
? `Croissance positive/stable à ${smPct(m.growth)}. Il y a une base stable, mais encore du potentiel à aller chercher.`
: `Croissance négative à ${smPct(m.growth)}. Une analyse terrain est nécessaire afin de comprendre les causes du recul.`
}

Priorités augmentation ventes :
${
m.growth !== null && m.growth < 0
? `• Identifier les journées en recul
• Vérifier si le ralentissement est opérationnel ou marché
• Comparer avec les restaurants comparables
• Mettre un plan de relance ciblé`
: `• Maintenir la progression actuelle
• S’assurer que le staffing suit la croissance
• Continuer les initiatives locales performantes`
}`,

      delais: `
${m.rest}
- Délai livraison : ${smMin(m.delay)}

Analyse délais :
${
m.delay === null
? "Aucune donnée de délai n’est disponible."
: m.delay <= 30
? `Le délai à ${smMin(m.delay)} est très bien contrôlé.`
: m.delay <= 35
? `Le délai à ${smMin(m.delay)} reste acceptable, mais doit être surveillé durant les pointes.`
: m.delay <= 45
? `Le délai à ${smMin(m.delay)} commence à affecter l’expérience client et peut générer des plaintes service.`
: `Le délai à ${smMin(m.delay)} représente une situation critique nécessitant un ajustement rapide.`
}

Priorités délais :
${
m.delay !== null && m.delay > 35
? `• Revoir la couverture livreurs
• Valider le dispatch
• Analyser 17h30-19h30
• Réduire les coupures rapides`
: `• Maintenir la structure actuelle
• Continuer de surveiller les pointes
• Préserver la fluidité du rush`
}`,

      plaintes: `
${m.rest}
- Plaintes : ${m.complaintCount}
- Compensation : ${m.compAmount.toFixed(2)} $
- Type dominant : ${m.topComplaintType}

Analyse plaintes :
${
m.complaintCount === 0
? "Aucune plainte visible pour la période sélectionnée."
: `Le restaurant affiche ${m.complaintCount} plainte(s) avec ${m.topComplaintType} comme catégorie dominante.`
}

Priorités plaintes :
${
m.complaintCount
? `• Revoir les dossiers récurrents
• Corriger la cause dominante
• Réduire les compensations à la source
• Faire un suivi terrain avec la gestion`
: `• Maintenir les standards actuels
• Continuer le contrôle qualité`
}`,

      global: `
${m.rest}
- Ventes : ${smMoney(m.sales)}
- Croissance ventes : ${smPct(m.growth)}
- CSI : ${smPct(m.csi)}
- Délai livraison : ${smMin(m.delay)}
- Plaintes : ${m.complaintCount}
- Compensation : ${m.compAmount.toFixed(2)} $

Lecture globale :
Le portrait global doit être analysé comme un ensemble. L’objectif est d’identifier quel indicateur représente actuellement le plus grand risque opérationnel pour le restaurant.

Priorités globales :
• Prioriser l’indicateur le plus faible
• Croiser ventes, CSI, délais et plaintes
• Adapter le coaching selon la réalité du restaurant
• Revalider l’évolution à la prochaine période`
    };

    return blocks[kind] || blocks.global;
  }

  // Override previous section builder
  smSection = function(m, kind){
    return isolateSubjectSection(kind, m);
  };

})();


// ======================================================
// V2.77 Franchisee Communication Tone
// ======================================================
(function(){

  function franchiseeIntro(subject, week, restaurants){
    const s = String(subject || "").toLowerCase();

    let opening = "Bonjour,\n\nVoici un retour concernant les résultats de la période sélectionnée.";

    if(s.includes("csi")){
      opening = "Bonjour,\n\nVoici un suivi concernant le CSI et l’expérience client observée sur la période sélectionnée.";
    }else if(s.includes("plainte")){
      opening = "Bonjour,\n\nVoici un suivi concernant les plaintes et les compensations observées sur la période sélectionnée.";
    }else if(s.includes("délai") || s.includes("delai")){
      opening = "Bonjour,\n\nVoici un suivi concernant les délais de livraison observés sur la période sélectionnée.";
    }else if(s.includes("vente") && !s.includes("augmentation")){
      opening = "Bonjour,\n\nVoici un suivi concernant les ventes observées sur la période sélectionnée.";
    }else if(s.includes("augmentation")){
      opening = "Bonjour,\n\nVoici un suivi concernant l’évolution des ventes sur la période sélectionnée.";
    }else if(s.includes("audit")){
      opening = "Bonjour,\n\nVoici un suivi concernant les standards opérationnels et les audits observés sur la période sélectionnée.";
    }

    return `${opening}

Période : ${week}
Restaurants concernés : ${restaurants.join(", ")}

L’objectif du suivi est d’identifier les points à maintenir et les éléments qui méritent une attention particulière afin de continuer d’améliorer la constance opérationnelle et l’expérience client.`;
  }

  // Override final builder tone
  smBuildPowerMessage = function(){
    const restaurants = smRestaurants();
    const subject = smSubject();
    const kind = smSubjectKind(subject);
    const week = smWeek();

    if(!restaurants.length){
      return "Sélectionne au moins un restaurant dans « Restaurants à inclure dans le message » avant de générer le message.";
    }

    const metrics = restaurants.map(smMetrics);

    let ranked = [...metrics].sort((a,b)=>{
      if(kind === "csi") return (a.csi ?? 999) - (b.csi ?? 999);
      if(kind === "delais") return (b.delay ?? -1) - (a.delay ?? -1);
      if(kind === "plaintes") return b.complaintCount - a.complaintCount || b.compAmount - a.compAmount;
      if(kind === "augmentation") return (a.growth ?? 999) - (b.growth ?? 999);
      return b.complaintCount - a.complaintCount;
    });

    const priorities = ranked.slice(0,3).map((m,i)=>{
      if(kind === "csi") return `• ${m.rest} : CSI ${smPct(m.csi)}`;
      if(kind === "delais") return `• ${m.rest} : délai ${smMin(m.delay)}`;
      if(kind === "plaintes") return `• ${m.rest} : ${m.complaintCount} plainte(s) / ${m.compAmount.toFixed(2)} $`;
      if(kind === "augmentation") return `• ${m.rest} : croissance ${smPct(m.growth)}`;
      if(kind === "ventes") return `• ${m.rest} : ventes ${smMoney(m.sales)}`;
      return `• ${m.rest}`;
    }).join("\n");

    return `${franchiseeIntro(subject, week, restaurants)}

Points à surveiller / maintenir :
${priorities || "• Aucun point majeur identifié"}

${metrics.map(m=>smSection(m, kind)).join("\n\n")}

Recommandations :
• Continuer le suivi terrain avec l’équipe de gestion
• Maintenir les bonnes pratiques déjà en place
• Intervenir rapidement sur les irritants récurrents
• Revalider les résultats à la prochaine période afin de confirmer l’évolution

Merci et bonne semaine.`;
  };

})();


// ======================================================
// V2.78 OPS coaching style messages
// ======================================================
(function(){

  function opsCoachingSection(kind, m){

    if(kind === "csi"){
      return `
${m.rest}

Le CSI se situe actuellement à ${smPct(m.csi)}.

${
m.csi !== null && m.csi >= 90
? `Très bon contrôle de l’expérience client actuellement. On voit une bonne constance au niveau de l’exécution et peu d’irritants semblent ressortir dans le parcours client. Le focus doit surtout rester sur le maintien des standards pendant les périodes plus fortes.`
: m.csi !== null && m.csi >= 88
? `Le restaurant demeure dans une zone acceptable au niveau du CSI. Par contre, certains irritants semblent encore empêcher le restaurant d’aller chercher une constance plus élevée.`
: m.csi !== null && m.csi >= 84
? `Le CSI démontre présentement plusieurs irritants au niveau de l’expérience client. Ce n’est pas nécessairement un enjeu majeur isolé, mais plutôt plusieurs petits éléments qui semblent affecter la constance.`
: `Le CSI est actuellement préoccupant et mérite un suivi plus rapproché. Les résultats démontrent que l’expérience client est affectée de façon plus visible et qu’un recentrage opérationnel pourrait être nécessaire.`
}

Je pense que le plus important actuellement est surtout de travailler la constance terrain et l’exécution pendant les périodes de pointe afin d’éviter que les irritants deviennent récurrents.`;
    }

    if(kind === "delais"){
      return `
${m.rest}

Le délai moyen observé est actuellement de ${smMin(m.delay)}.

${
m.delay !== null && m.delay <= 30
? `Les délais semblent très bien contrôlés actuellement. La structure opérationnelle paraît stable et le restaurant réussit bien à absorber le volume.`
: m.delay !== null && m.delay <= 35
? `Les délais demeurent globalement acceptables, mais il pourrait être pertinent de surveiller davantage les périodes plus fortes afin d’éviter une dérive progressive.`
: m.delay !== null && m.delay <= 45
? `Les délais commencent à devenir un irritant potentiel au niveau de l’expérience client. Habituellement, à ce niveau-là, on commence à voir un impact sur les plaintes service et parfois sur le CSI.`
: `Les délais sont actuellement élevés et cela risque d’avoir un impact direct sur la perception client si la situation demeure stable plusieurs semaines.`
}

Je pense qu’il pourrait être pertinent de revoir surtout la fluidité opérationnelle durant le rush et la stabilité de la couverture livraison afin d’éviter les écarts plus importants.`;
    }

    if(kind === "augmentation"){
      return `
${m.rest}

L’évolution des ventes est actuellement de ${smPct(m.growth)}.

${
m.growth !== null && m.growth >= 10
? `Très bonne progression actuellement. Le restaurant semble gagner du momentum et l’important sera surtout de maintenir la qualité d’exécution pendant cette croissance.`
: m.growth !== null && m.growth >= 0
? `Les résultats demeurent relativement stables actuellement. Il y a une bonne base, mais probablement encore certaines opportunités de progression locale à aller chercher.`
: `On observe actuellement un recul au niveau des ventes. Je pense que ça vaut la peine d’analyser davantage si le ralentissement vient surtout du marché, de l’exécution ou de l’expérience client.`
}

Je pense surtout qu’il faut continuer de protéger l’expérience client et la constance opérationnelle, puisque ce sont souvent les éléments qui influencent le plus la stabilité des ventes à moyen terme.`;
    }

    if(kind === "plaintes"){
      return `
${m.rest}

Le restaurant affiche actuellement ${m.complaintCount} plainte(s) pour ${m.compAmount.toFixed(2)} $ en compensation.

${
m.complaintCount === 0
? `Aucun irritant majeur ne semble ressortir actuellement au niveau des plaintes, ce qui est positif.`
: `Le type de plainte qui ressort le plus actuellement est : ${m.topComplaintType}. Ça donne quand même une bonne idée de l’axe qui mérite probablement le plus d’attention sur le terrain.`
}

Je pense que le plus important est surtout d’éviter que les mêmes irritants reviennent de façon répétitive, puisqu’à long terme ce sont généralement les petits enjeux constants qui finissent par affecter le CSI et la perception client.`;
    }

    if(kind === "ventes"){
      return `
${m.rest}

Les ventes se situent actuellement à ${smMoney(m.sales)}.

${
m.sales !== null
? `Le point important selon moi est surtout de s’assurer que les opérations demeurent stables par rapport au volume actuel.`
: `Aucune donnée claire de ventes n’est disponible actuellement pour cette période.`
}

Je pense qu’il faut surtout continuer de protéger l’exécution terrain et la stabilité des opérations afin de garder une bonne constance au niveau du volume.`;
    }

    if(kind === "audit" || kind === "proprete"){
      return `
${m.rest}

${
kind === "proprete"
? `Au niveau de la propreté et de la perception client, je pense que la clé demeure surtout la constance quotidienne et les validations régulières pendant les périodes plus fortes.`
: `Au niveau des standards opérationnels, je pense que l’important est surtout de transformer les constats terrain en habitudes constantes au quotidien.`
}

Souvent, ce ne sont pas les gros écarts isolés qui affectent le plus les résultats, mais plutôt les petits relâchements répétés qui finissent par avoir un impact sur l’expérience client.`;
    }

    return `
${m.rest}

- Ventes : ${smMoney(m.sales)}
- CSI : ${smPct(m.csi)}
- Délai : ${smMin(m.delay)}
- Plaintes : ${m.complaintCount}

Le portrait global démontre surtout l’importance de maintenir une bonne constance opérationnelle sur l’ensemble des indicateurs plutôt que de seulement réagir à un seul KPI isolé.

Je pense qu’il faut surtout continuer de travailler les bases terrain, la stabilité des opérations et l’expérience client afin de garder une progression constante à moyen terme.`;
  }

  smSection = function(m, kind){
    return opsCoachingSection(kind, m);
  };

  smBuildPowerMessage = function(){
    const restaurants = smRestaurants();
    const subject = smSubject();
    const kind = smSubjectKind(subject);
    const week = smWeek();

    if(!restaurants.length){
      return "Sélectionne au moins un restaurant dans « Restaurants à inclure dans le message » avant de générer le message.";
    }

    const metrics = restaurants.map(smMetrics);

    return `Bonjour,

Voici un suivi concernant ${subject.toLowerCase()} pour la période du ${week}.

${metrics.map(m=>smSection(m, kind)).join("\n\n")}

Je pense que l’important est surtout de continuer de travailler la constance et de corriger rapidement les irritants qui reviennent le plus souvent afin de protéger l’expérience client et la stabilité des opérations.

Merci et bonne semaine.`;
  };

})();


// ======================================================
// V2.79 FORCE REPLACE ALL MESSAGE ENGINES
// ======================================================
(function(){

window.generateMessage = function(){

  function val(id){
    return document.getElementById(id)?.value || "";
  }

  const subject =
    val("msgSubject") ||
    val("messageSubject") ||
    val("subjectSelect") ||
    "Global";

  const week =
    val("msgWeek") ||
    val("messageWeek") ||
    "Dernière semaine";

  const restaurants = [...document.querySelectorAll(".msgRestaurantCheck:checked")]
    .map(x=>x.value)
    .filter(Boolean);

  if(!restaurants.length){
    const msg = "Sélectionne au moins un restaurant.";
    const out = document.querySelector("textarea");
    if(out) out.value = msg;
    return msg;
  }

  const subjectLower = subject.toLowerCase();

  let finalMessage = `Bonjour,\n\n`;
  finalMessage += `Voici un suivi concernant ${subjectLower} pour la période du ${week}.\n\n`;

  restaurants.forEach((rest, idx)=>{

    // fetch metrics if available
    let row = null;

    try{
      const data = window.DATA || [];
      row = data.find(r=>{
        const rr = String(r.restaurant || "").toLowerCase().trim();
        return rr === String(rest).toLowerCase().trim();
      });
    }catch(e){}

    const csi = row?.csi || row?.CSI || row?.csiGlobal;
    const growth = row?.growth || row?.augmentation || row?.salesGrowth;
    const sales = row?.sales || row?.ventes;
    const delay = row?.delay || row?.delai || row?.délais;

    finalMessage += `${rest}\n\n`;

    // SUBJECT ISOLATION
    if(subjectLower.includes("csi")){

      finalMessage += `Le CSI se situe actuellement à ${csi ?? "N/D"}%.\n\n`;

      if(csi >= 90){
        finalMessage += `Très bon contrôle de l’expérience client actuellement. On voit une bonne stabilité opérationnelle et peu d’irritants semblent ressortir.\n\n`;
      }else if(csi >= 88){
        finalMessage += `Le restaurant demeure dans une zone acceptable au niveau du CSI, mais certains irritants semblent encore empêcher d’aller chercher une constance plus élevée.\n\n`;
      }else{
        finalMessage += `Le CSI démontre actuellement plusieurs irritants au niveau de l’expérience client. Je pense qu’il pourrait être pertinent de recentrer davantage l’exécution terrain et la constance durant les périodes fortes.\n\n`;
      }

    }else if(subjectLower.includes("augmentation")){

      finalMessage += `L’évolution des ventes est actuellement de ${growth ?? "N/D"}%.\n\n`;

      if(growth >= 5){
        finalMessage += `Très bonne progression actuellement. Le restaurant semble gagner du momentum et l’important sera surtout de maintenir la qualité d’exécution pendant cette croissance.\n\n`;
      }else if(growth >= 0){
        finalMessage += `Les résultats demeurent relativement stables actuellement. Il y a probablement encore certaines opportunités locales à aller chercher.\n\n`;
      }else{
        finalMessage += `On observe actuellement un recul au niveau des ventes. Je pense que ça vaut la peine d’analyser davantage si le ralentissement vient surtout du marché, de l’exécution ou de l’expérience client.\n\n`;
      }

    }else if(subjectLower.includes("vente")){

      finalMessage += `Les ventes se situent actuellement à ${sales ?? "N/D"} $.\n\n`;
      finalMessage += `Le point important selon moi est surtout de s’assurer que les opérations demeurent stables par rapport au volume actuel et que l’expérience client reste constante.\n\n`;

    }else if(subjectLower.includes("délai") || subjectLower.includes("delai")){

      finalMessage += `Le délai moyen observé est actuellement de ${delay ?? "N/D"} min.\n\n`;

      if(delay <= 35){
        finalMessage += `Les délais semblent relativement bien contrôlés actuellement.\n\n`;
      }else{
        finalMessage += `Les délais commencent à devenir un irritant potentiel au niveau de l’expérience client. Je pense qu’il pourrait être pertinent de revoir davantage la fluidité opérationnelle durant le rush.\n\n`;
      }

    }else if(subjectLower.includes("plainte")){

      finalMessage += `Le suivi doit surtout porter sur les irritants récurrents observés au niveau des plaintes et sur la constance de l’expérience client.\n\n`;
      finalMessage += `Je pense qu’il est important d’éviter que les mêmes enjeux reviennent de façon répétitive, puisque ce sont généralement les petits irritants constants qui finissent par affecter la perception client.\n\n`;

    }else{

      finalMessage += `Le portrait global démontre surtout l’importance de maintenir une bonne constance opérationnelle sur l’ensemble des indicateurs.\n\n`;

    }

    if(idx !== restaurants.length - 1){
      finalMessage += `----------------------------------------\n\n`;
    }

  });

  finalMessage += `Merci et bonne semaine.`;

  const targets = [
    document.getElementById("messageOutput"),
    document.getElementById("messageBox"),
    document.getElementById("generatedMessage"),
    document.querySelector("#page-messages textarea"),
    document.querySelector("#messages textarea"),
    document.querySelector("textarea")
  ].filter(Boolean);

  if(targets.length){
    targets[0].value = finalMessage;
  }

  return finalMessage;
};

})();


// ======================================================
// V2.80 Message Generator Button Fix
// Makes the generate button work even if old onclick handlers exist.
// ======================================================
(function(){

  function normText(v){
    return String(v || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .trim();
  }

  function getCheckedRestaurants(){
    const checked = [...document.querySelectorAll(".msgRestaurantCheck:checked")]
      .map(x=>x.value)
      .filter(Boolean);

    if(checked.length) return checked;

    // fallback if only one dropdown still exists somewhere
    const possible = [
      document.getElementById("msgRestaurant"),
      document.getElementById("messageRestaurant"),
      document.getElementById("restaurantSelect")
    ].filter(Boolean);

    const val = possible[0]?.value;
    return val && val !== "Tous" ? [val] : [];
  }

  function getSubject(){
    const possible = [
      document.getElementById("msgSubject"),
      document.getElementById("messageSubject"),
      document.getElementById("subjectSelect")
    ].filter(Boolean);

    return possible[0]?.value || "Global";
  }

  function getWeek(){
    const possible = [
      document.getElementById("msgWeek"),
      document.getElementById("messageWeek"),
      document.getElementById("weekSelect"),
      document.getElementById("complaintQuickWeek")
    ].filter(Boolean);

    return possible[0]?.value || "Dernière semaine";
  }

  function findOutput(){
    const byId = [
      document.getElementById("messageOutput"),
      document.getElementById("messageBox"),
      document.getElementById("generatedMessage"),
      document.getElementById("messageResult"),
      document.getElementById("msgOutput")
    ].filter(Boolean);

    if(byId.length) return byId[0];

    const page = document.getElementById("page-messages") ||
      document.getElementById("messages") ||
      document.querySelector(".messages-page") ||
      document;

    const textarea = page.querySelector("textarea");
    if(textarea) return textarea;

    const div = document.createElement("textarea");
    div.id = "messageOutput";
    div.style.width = "100%";
    div.style.minHeight = "420px";
    div.style.marginTop = "20px";
    div.style.borderRadius = "22px";
    div.style.padding = "20px";

    page.appendChild(div);
    return div;
  }

  function findDataRow(rest){
    const data = Array.isArray(window.DATA) ? window.DATA : [];
    const key = normText(rest);

    return [...data].reverse().find(r => normText(r.restaurant) === key) || {};
  }

  function getVal(row, keys){
    for(const k of keys){
      if(row && row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    }
    return null;
  }

  function fmtMoney(v){
    const n = Number(v);
    return isNaN(n) ? "N/D" : n.toLocaleString("fr-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
  }

  function fmtPct(v){
    const n = Number(v);
    return isNaN(n) ? "N/D" : n.toFixed(1) + "%";
  }

  function fmtMin(v){
    const n = Number(v);
    return isNaN(n) ? "N/D" : n.toFixed(1) + " min";
  }

  function buildOneRestaurant(rest, subject){
    const row = findDataRow(rest);
    const subj = normText(subject);

    const sales = getVal(row, ["sales","ventes","Ventes"]);
    const csi = getVal(row, ["csi","CSI","csiGlobal"]);
    const delay = getVal(row, ["delay","delai","délais","Délais","deliveryDelay"]);
    const growth = getVal(row, ["growth","augmentation","salesGrowth","Augmentation ventes"]);
    const avg = getVal(row, ["avgTicket","moyenneFacturation","averageTicket","Moyenne de facturation"]);

    if(subj.includes("csi")){
      const n = Number(csi);
      let msg = `${rest}\n\nLe CSI se situe actuellement à ${fmtPct(csi)}.\n\n`;
      if(!isNaN(n) && n >= 90) msg += "Très bon contrôle de l’expérience client actuellement. On voit une bonne stabilité dans l’exécution et l’objectif est surtout de maintenir cette constance sur les prochaines semaines.";
      else if(!isNaN(n) && n >= 88) msg += "Le restaurant demeure dans la cible. Il faut continuer de protéger l’expérience client et éviter que de petits irritants deviennent récurrents.";
      else if(!isNaN(n) && n >= 84) msg += "Le CSI est sous l’objectif. Il serait pertinent de regarder les irritants qui reviennent le plus souvent dans l’expérience client et de recentrer l’équipe sur la constance terrain.";
      else msg += "Le CSI est préoccupant ou non disponible. Un suivi plus rapproché serait pertinent afin d’identifier rapidement les éléments qui affectent l’expérience client.";
      return msg;
    }

    if(subj.includes("augmentation")){
      const n = Number(growth);
      let msg = `${rest}\n\nL’évolution des ventes est actuellement de ${fmtPct(growth)}.\n\n`;
      if(!isNaN(n) && n >= 10) msg += "Très belle progression. Le restaurant semble avoir un bon momentum. Le point important sera de protéger l’exécution afin que la croissance ne crée pas de délais ou d’irritants clients.";
      else if(!isNaN(n) && n >= 0) msg += "Les ventes sont stables ou en légère progression. Il y a une base intéressante, mais encore des opportunités à aller chercher localement.";
      else msg += "On observe un recul des ventes. Il serait pertinent d’analyser si la baisse vient du marché, de la constance opérationnelle, de l’expérience client ou d’un ralentissement local.";
      return msg;
    }

    if(subj.includes("vente")){
      return `${rest}\n\nLes ventes se situent actuellement à ${fmtMoney(sales)}.\n\nLe suivi devrait surtout porter sur la capacité du restaurant à soutenir ce volume avec une exécution constante. L’objectif est de protéger l’expérience client tout en continuant de développer le volume.`;
    }

    if(subj.includes("delai") || subj.includes("délai")){
      const n = Number(delay);
      let msg = `${rest}\n\nLe délai moyen observé est actuellement de ${fmtMin(delay)}.\n\n`;
      if(!isNaN(n) && n <= 35) msg += "Les délais semblent bien contrôlés. Il faut maintenir la structure actuelle, surtout durant les périodes fortes.";
      else msg += "Les délais sont à surveiller. À ce niveau, ils peuvent affecter la perception client et générer des irritants au niveau du service.";
      return msg;
    }

    if(subj.includes("moyenne")){
      return `${rest}\n\nLa moyenne de facturation est actuellement de ${fmtMoney(avg)}.\n\nLe suivi devrait porter sur le panier moyen, les opportunités d’upsell et la cohérence entre le volume de ventes et la valeur moyenne des commandes.`;
    }

    if(subj.includes("plainte")){
      const complaints = Array.isArray(window.COMPLAINTS) ? window.COMPLAINTS.filter(c => normText(c.restaurant) === normText(rest)) : [];
      const amount = complaints.reduce((s,c)=>s+(Number(c.amount)||0),0);
      return `${rest}\n\nLe restaurant affiche actuellement ${complaints.length} plainte(s) visibles, pour ${amount.toFixed(2)} $ en compensation.\n\nLe suivi devrait porter sur les irritants qui reviennent le plus souvent afin d’éviter que les mêmes situations se répètent et finissent par affecter l’expérience client.`;
    }

    return `${rest}\n\nPortrait global : ventes ${fmtMoney(sales)}, croissance ${fmtPct(growth)}, CSI ${fmtPct(csi)} et délai ${fmtMin(delay)}.\n\nLe suivi devrait porter sur l’indicateur qui représente actuellement le plus grand écart pour le restaurant, tout en gardant une bonne constance opérationnelle.`;
  }

  function buildMessageV280(){
    const restaurants = getCheckedRestaurants();
    const subject = getSubject();
    const week = getWeek();

    if(!restaurants.length){
      return "Sélectionne au moins un restaurant dans « Restaurants à inclure dans le message » avant de générer le message.";
    }

    return `Bonjour,

Voici un suivi concernant ${subject.toLowerCase()} pour la période ${week}.

${restaurants.map(r => buildOneRestaurant(r, subject)).join("\n\n")}

Merci et bonne semaine.`;
  }

  function writeOutput(msg){
    const out = findOutput();
    if(!out) return;

    if("value" in out) out.value = msg;
    else out.innerHTML = msg.replace(/\n/g,"<br>");
  }

  window.generateMessage = function(){
    const msg = buildMessageV280();
    writeOutput(msg);
    if(typeof toast === "function") toast("Message généré");
    return msg;
  };

  function attachGenerateButtons(){
    const buttons = [...document.querySelectorAll("button")];

    buttons.forEach(btn=>{
      const txt = normText(btn.textContent);
      if(txt.includes("generer") || txt.includes("générer")){
        btn.onclick = function(e){
          e.preventDefault();
          e.stopPropagation();
          window.generateMessage();
          return false;
        };
      }
    });
  }

  onOpsReady(()=>{
    setTimeout(attachGenerateButtons,500);
    setTimeout(attachGenerateButtons,1500);
    setTimeout(attachGenerateButtons,3000);
  });

  window.addEventListener("load",()=>{
    setTimeout(attachGenerateButtons,500);
  });

})();


// ======================================================
// V2.81 Real Message Values Fix
// Reads actual visible message fields + synced data fallback
// ======================================================
(function(){

  function tx(v){
    return String(v || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/\s+/g," ")
      .trim();
  }

  function cleanNum(v){
    if(v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace("$","").replace("%","").replace("min","").replace(",",".").replace(/\s/g,""));
    return isNaN(n) ? null : n;
  }

  function money(v){
    const n = cleanNum(v);
    return n === null ? "N/D" : n.toLocaleString("fr-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
  }

  function money2(v){
    const n = cleanNum(v);
    return n === null ? "N/D" : n.toLocaleString("fr-CA",{style:"currency",currency:"CAD",minimumFractionDigits:2,maximumFractionDigits:2});
  }

  function pct(v){
    const n = cleanNum(v);
    return n === null ? "N/D" : n.toFixed(1)+"%";
  }

  function mins(v){
    const n = cleanNum(v);
    return n === null ? "N/D" : n.toFixed(1)+" min";
  }

  function selectedRestaurants(){
    return [...document.querySelectorAll(".msgRestaurantCheck:checked")]
      .map(x=>x.value)
      .filter(Boolean);
  }

  function subject(){
    return document.getElementById("msgSubject")?.value ||
      document.getElementById("messageSubject")?.value ||
      document.getElementById("subjectSelect")?.value ||
      "Global";
  }

  function week(){
    return document.getElementById("msgWeek")?.value ||
      document.getElementById("messageWeek")?.value ||
      document.getElementById("weekSelect")?.value ||
      document.getElementById("complaintQuickWeek")?.value ||
      "Dernière semaine";
  }

  function visibleFieldByLabel(labelWords){
    const page = document.getElementById("page-messages") || document.getElementById("messages") || document;

    const labels = [...page.querySelectorAll("label")];
    for(const label of labels){
      const t = tx(label.textContent);
      if(labelWords.some(w=>t.includes(tx(w)))){
        const input =
          label.querySelector("input,textarea,select") ||
          label.parentElement?.querySelector("input,textarea,select") ||
          label.nextElementSibling;
        if(input && "value" in input && input.value !== "") return input.value;
      }
    }

    // fallback by id/name/placeholder
    const fields = [...page.querySelectorAll("input,textarea,select")];
    for(const f of fields){
      const raw = tx(`${f.id || ""} ${f.name || ""} ${f.placeholder || ""}`);
      if(labelWords.some(w=>raw.includes(tx(w))) && f.value !== "") return f.value;
    }

    return null;
  }

  function allDataRows(){
    const arrays = [];
    if(Array.isArray(window.DATA)) arrays.push(window.DATA);
    try{ if(Array.isArray(DATA)) arrays.push(DATA); }catch(e){}
    if(Array.isArray(window.DASHBOARD_DATA)) arrays.push(window.DASHBOARD_DATA);
    if(Array.isArray(window.RESTAURANTS)) arrays.push(window.RESTAURANTS);
    return arrays.flat();
  }

  function rowForRestaurant(rest){
    const data = allDataRows();
    const key = tx(rest);

    // Try exact restaurant first
    let rows = data.filter(r => tx(r.restaurant || r.restaurantName || r.store || r.location) === key);
    if(!rows.length){
      rows = data.filter(r => tx(JSON.stringify(r)).includes(key));
    }

    if(!rows.length) return {};

    const selectedWeek = week();
    if(selectedWeek && selectedWeek !== "latest" && selectedWeek !== "Dernière semaine"){
      const exact = rows.find(r => String(r.week || r.semaine || r.period || "").includes(selectedWeek));
      if(exact) return exact;
    }

    return rows[rows.length - 1] || {};
  }

  function val(row, keys, labelWords){
    // 1. Visible fields in message page, if there is one
    const visible = visibleFieldByLabel(labelWords || keys);
    if(visible !== null) return visible;

    // 2. Direct row keys
    for(const k of keys){
      if(row && row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    }

    // 3. Loose key match
    if(row){
      const entries = Object.entries(row);
      for(const [k,v] of entries){
        const nk = tx(k);
        if(keys.concat(labelWords || []).some(target => nk.includes(tx(target))) && v !== "" && v !== null && v !== undefined){
          return v;
        }
      }
    }

    return null;
  }

  function complaintsForRestaurant(rest){
    const rows = Array.isArray(window.COMPLAINTS) ? window.COMPLAINTS : [];
    const key = tx(rest);
    const rangeLabel = document.getElementById("complaintQuickWeek")?.value || week();
    const m = String(rangeLabel || "").match(/(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/);
    let start = null, end = null;
    if(m){
      start = new Date(m[1]+"T00:00:00");
      end = new Date(m[2]+"T23:59:59");
    }

    return rows.filter(c=>{
      if(tx(c.restaurant) !== key) return false;
      if(start && end){
        const d = c.date ? new Date(c.date) : null;
        if(!d || isNaN(d) || d < start || d > end) return false;
      }
      return true;
    });
  }

  function metrics(rest){
    const row = rowForRestaurant(rest);
    const complaints = complaintsForRestaurant(rest);
    const comp = complaints.reduce((s,c)=>s+(cleanNum(c.amount)||0),0);

    const typeMap = {};
    complaints.forEach(c=>{
      const type = c.type || "Non catégorisé";
      typeMap[type] = (typeMap[type] || 0) + 1;
    });
    const topType = Object.entries(typeMap).sort((a,b)=>b[1]-a[1])[0] || ["—",0];

    return {
      restaurant: rest,
      sales: val(row, ["sales","ventes","Ventes","totalSales","revenue"], ["ventes"]),
      csi: val(row, ["csi","CSI","csiGlobal","CSI global"], ["csi"]),
      delay: val(row, ["delay","delai","délais","Délais","deliveryDelay"], ["délai","délais","delai"]),
      growth: val(row, ["growth","augmentation","salesGrowth","Augmentation ventes","augmentationVentes"], ["augmentation"]),
      avgTicket: val(row, ["avgTicket","moyenneFacturation","averageTicket","Moyenne de facturation"], ["moyenne de facturation","moyenne"]),
      complaints,
      complaintCount: complaints.length,
      comp,
      topType: topType[0],
      topTypeCount: topType[1]
    };
  }

  function section(m, subj){
    const s = tx(subj);

    if(s.includes("csi")){
      const c = cleanNum(m.csi);
      let analyse = "";
      if(c === null) analyse = "Je n’ai pas de valeur CSI claire pour ce restaurant dans les données disponibles.";
      else if(c >= 90) analyse = "Très bon résultat. L’expérience client semble bien contrôlée et l’objectif est de maintenir cette constance.";
      else if(c >= 88) analyse = "Le restaurant est dans la cible. Il faut surtout protéger ce niveau et éviter que les petits irritants reviennent.";
      else if(c >= 84) analyse = "Le résultat est sous l’objectif. Il faut regarder ce qui affecte l’expérience client et recentrer l’équipe sur les irritants récurrents.";
      else analyse = "Le résultat est préoccupant. Un suivi rapproché est recommandé afin d’identifier rapidement les éléments qui affectent l’expérience client.";
      return `${m.restaurant}

CSI : ${pct(m.csi)}

${analyse}`;
    }

    if(s.includes("augmentation")){
      const g = cleanNum(m.growth);
      let analyse = "";
      if(g === null) analyse = "Je n’ai pas de valeur d’augmentation des ventes claire pour ce restaurant.";
      else if(g >= 10) analyse = "Très belle progression. Le restaurant a du momentum; l’enjeu est de maintenir la qualité d’exécution pendant cette croissance.";
      else if(g >= 0) analyse = "Les ventes sont stables ou légèrement en progression. Il y a une base intéressante à consolider.";
      else analyse = "La croissance est négative. Il faut comprendre si le recul vient du marché, de l’exécution, du service ou de la perception client.";
      return `${m.restaurant}

Augmentation des ventes : ${pct(m.growth)}

${analyse}`;
    }

    if(s.includes("vente")){
      return `${m.restaurant}

Ventes : ${money(m.sales)}

Le suivi devrait porter sur la capacité du restaurant à soutenir ce volume avec une exécution constante.`;
    }

    if(s.includes("delai") || s.includes("délai")){
      const d = cleanNum(m.delay);
      let analyse = "";
      if(d === null) analyse = "Je n’ai pas de valeur claire pour le délai livraison.";
      else if(d <= 30) analyse = "Les délais sont très bien contrôlés. Il faut maintenir la structure actuelle.";
      else if(d <= 35) analyse = "Les délais sont acceptables, mais doivent rester sous surveillance lors des périodes fortes.";
      else if(d <= 45) analyse = "Les délais commencent à devenir un irritant potentiel pour l’expérience client.";
      else analyse = "Les délais sont élevés et peuvent affecter directement les plaintes et le CSI.";
      return `${m.restaurant}

Délai livraison : ${mins(m.delay)}

${analyse}`;
    }

    if(s.includes("plainte")){
      let analyse = m.complaintCount
        ? `Le restaurant affiche ${m.complaintCount} plainte(s) pour ${m.comp.toFixed(2)} $ en compensation. Le type dominant est ${m.topType}.`
        : "Aucune plainte visible pour ce restaurant sur la période sélectionnée.";
      return `${m.restaurant}

Plaintes : ${m.complaintCount}
Compensation : ${m.comp.toFixed(2)} $
Type dominant : ${m.topType}

${analyse}`;
    }

    if(s.includes("moyenne")){
      return `${m.restaurant}

Moyenne de facturation : ${money2(m.avgTicket)}

Le suivi devrait porter sur le panier moyen et les opportunités d’upsell.`;
    }

    // Global only = all relevant metrics
    return `${m.restaurant}

Ventes : ${money(m.sales)}
Augmentation ventes : ${pct(m.growth)}
CSI : ${pct(m.csi)}
Délai livraison : ${mins(m.delay)}
Plaintes : ${m.complaintCount}
Compensation : ${m.comp.toFixed(2)} $
Moyenne de facturation : ${money2(m.avgTicket)}

Lecture globale :
Le portrait doit être analysé comme un ensemble afin d’identifier quel indicateur mérite le plus d’attention.`;
  }

  function build(){
    const restos = selectedRestaurants();
    const subj = subject();
    const w = week();

    if(!restos.length){
      return "Sélectionne au moins un restaurant dans « Restaurants à inclure dans le message » avant de générer le message.";
    }

    const ms = restos.map(metrics);

    const intro = tx(subj).includes("csi") ? "Voici un suivi concernant le CSI."
      : tx(subj).includes("augmentation") ? "Voici un suivi concernant l’augmentation des ventes."
      : tx(subj).includes("vente") ? "Voici un suivi concernant les ventes."
      : tx(subj).includes("delai") || tx(subj).includes("délai") ? "Voici un suivi concernant les délais."
      : tx(subj).includes("plainte") ? "Voici un suivi concernant les plaintes."
      : "Voici un suivi global des résultats.";

    return `Bonjour,

${intro}

Période : ${w}
Restaurant(s) : ${restos.join(", ")}

${ms.map(m=>section(m, subj)).join("\n\n")}

Merci et bonne semaine.`;
  }

  function write(msg){
    const outputs = [
      document.getElementById("messageOutput"),
      document.getElementById("messageBox"),
      document.getElementById("generatedMessage"),
      document.getElementById("messageResult"),
      document.getElementById("msgOutput"),
      document.querySelector("#page-messages textarea"),
      document.querySelector("#messages textarea"),
      document.querySelector("textarea")
    ].filter(Boolean);

    if(outputs[0]){
      if("value" in outputs[0]) outputs[0].value = msg;
      else outputs[0].innerHTML = msg.replace(/\n/g,"<br>");
    }
  }

  window.generateMessage = function(){
    const msg = build();
    write(msg);
    if(typeof toast === "function") toast("Message généré");
    return msg;
  };

  function attach(){
    [...document.querySelectorAll("button")].forEach(btn=>{
      const t = tx(btn.textContent);
      if(t.includes("generer") || t.includes("générer")){
        btn.onclick = function(e){
          e.preventDefault();
          e.stopPropagation();
          window.generateMessage();
          return false;
        };
      }
    });
  }

  onOpsReady(()=>{
    setTimeout(attach,500);
    setTimeout(attach,1500);
    setTimeout(attach,3000);
  });
  window.addEventListener("load",()=>setTimeout(attach,500));

})();


// ======================================================
// V2.83 Stable Power Messages — button-safe generator
// ======================================================
(function(){

  function norm(v){
    return String(v || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/^sal-\d+-/i,"")
      .replace(/\(qc\)/gi,"")
      .replace(/-/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function num(v){
    if(v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace("$","").replace("%","").replace("min","").replace(",",".").replace(/\s/g,""));
    return isNaN(n) ? null : n;
  }

  function fmtMoney(v){
    const n = num(v);
    return n === null ? "N/D" : n.toLocaleString("fr-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
  }

  function fmtPct(v){
    const n = num(v);
    return n === null ? "N/D" : n.toFixed(1) + "%";
  }

  function fmtMin(v){
    const n = num(v);
    return n === null ? "N/D" : n.toFixed(1) + " min";
  }

  function getSubject(){
    return document.getElementById("msgSubject")?.value ||
      document.getElementById("messageSubject")?.value ||
      document.getElementById("subjectSelect")?.value ||
      "Global";
  }

  function getWeek(){
    return document.getElementById("msgWeek")?.value ||
      document.getElementById("messageWeek")?.value ||
      document.getElementById("weekSelect")?.value ||
      document.getElementById("complaintQuickWeek")?.value ||
      "Dernière semaine";
  }

  function getRestaurants(){
    const checked = [...document.querySelectorAll(".msgRestaurantCheck:checked")]
      .map(x=>x.value)
      .filter(Boolean);

    if(checked.length) return checked;

    const fallback = document.getElementById("msgRestaurant")?.value ||
      document.getElementById("messageRestaurant")?.value ||
      document.getElementById("restaurantSelect")?.value;

    return fallback && fallback !== "Tous" ? [fallback] : [];
  }

  function dataRows(){
    let all = [];
    if(Array.isArray(window.DATA)) all = all.concat(window.DATA);
    try{ if(Array.isArray(DATA)) all = all.concat(DATA); }catch(e){}
    if(Array.isArray(window.DASHBOARD_DATA)) all = all.concat(window.DASHBOARD_DATA);
    if(Array.isArray(window.RESTAURANTS)) all = all.concat(window.RESTAURANTS);
    return all;
  }

  function getRow(rest){
    const rows = dataRows().filter(r => norm(r.restaurant || r.restaurantName || r.store || r.location) === norm(rest));
    if(!rows.length) return {};
    const w = getWeek();
    if(w && w !== "latest" && w !== "Dernière semaine"){
      const exact = rows.find(r => String(r.week || r.semaine || r.period || "").includes(w));
      if(exact) return exact;
    }
    return rows[rows.length - 1] || {};
  }

  function pick(row, keys){
    for(const k of keys){
      if(row && row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    }
    if(row){
      for(const [k,v] of Object.entries(row)){
        const nk = norm(k);
        if(keys.some(x => nk.includes(norm(x))) && v !== "" && v !== null && v !== undefined) return v;
      }
    }
    return null;
  }

  function complaintRows(rest){
    const all = Array.isArray(window.COMPLAINTS) ? window.COMPLAINTS : [];
    const key = norm(rest);
    return all.filter(c => norm(c.restaurant) === key);
  }

  function metrics(rest){
    const row = getRow(rest);
    const complaints = complaintRows(rest);
    const amount = complaints.reduce((s,c)=>s+(num(c.amount)||0),0);

    return {
      rest,
      sales: pick(row, ["sales","ventes","Ventes","revenue"]),
      csi: pick(row, ["csi","CSI","csiGlobal","CSI global"]),
      delay: pick(row, ["delay","delai","délais","Délais","deliveryDelay"]),
      growth: pick(row, ["growth","augmentation","salesGrowth","Augmentation ventes","augmentationVentes"]),
      avgTicket: pick(row, ["avgTicket","moyenneFacturation","averageTicket","Moyenne de facturation"]),
      complaintCount: complaints.length,
      compAmount: amount
    };
  }

  function subjectKind(){
    const s = norm(getSubject());
    if(s.includes("csi")) return "csi";
    if(s.includes("augmentation")) return "augmentation";
    if(s.includes("vente")) return "ventes";
    if(s.includes("delai") || s.includes("délai")) return "delais";
    if(s.includes("plainte")) return "plaintes";
    if(s.includes("moyenne")) return "moyenne";
    return "global";
  }

  function section(m, kind){
    if(kind === "csi"){
      const c = num(m.csi);
      let analyse = "Je ne vois pas de donnée CSI exploitable pour ce restaurant actuellement.";
      if(c !== null && c >= 92) analyse = "Excellent résultat. L’expérience client semble très bien contrôlée et le restaurant démontre une belle constance terrain. Le point important est de maintenir ce niveau pendant les périodes plus fortes.";
      else if(c !== null && c >= 88) analyse = "Le restaurant est dans la cible. L’expérience client demeure saine, mais il faut continuer de protéger les détails terrain afin d’éviter une dérive.";
      else if(c !== null && c >= 84) analyse = "Le CSI est sous l’objectif. Il y a probablement des irritants récurrents qui affectent l’expérience client et qui méritent un suivi plus précis.";
      else if(c !== null) analyse = "Le CSI est préoccupant. Il serait pertinent de recentrer l’équipe sur la constance de l’expérience client et d’identifier rapidement les irritants les plus visibles.";
      return `${m.rest}

CSI : ${fmtPct(m.csi)}

${analyse}`;
    }

    if(kind === "augmentation"){
      const g = num(m.growth);
      let analyse = "Je ne vois pas de donnée claire sur l’augmentation des ventes.";
      if(g !== null && g >= 10) analyse = "Très forte progression. Le restaurant a un bon momentum. Le suivi doit surtout viser à protéger l’exécution pendant cette croissance.";
      else if(g !== null && g >= 3) analyse = "Belle progression. Le restaurant avance dans la bonne direction et il faut maintenir les actions qui semblent fonctionner.";
      else if(g !== null && g >= 0) analyse = "Les ventes sont stables ou légèrement positives. Il y a une base intéressante, mais encore du potentiel à aller chercher.";
      else if(g !== null) analyse = "La croissance est négative. Il faut analyser si le recul vient du marché, de l’expérience client ou de la constance opérationnelle.";
      return `${m.rest}

Augmentation des ventes : ${fmtPct(m.growth)}

${analyse}`;
    }

    if(kind === "ventes"){
      return `${m.rest}

Ventes : ${fmtMoney(m.sales)}

Le restaurant génère ce volume sur la période sélectionnée. Le suivi doit porter sur la capacité à soutenir ce niveau de ventes avec une exécution stable, sans créer de pression inutile sur l’équipe ou sur l’expérience client.`;
    }

    if(kind === "delais"){
      const d = num(m.delay);
      let analyse = "Je ne vois pas de donnée délai exploitable.";
      if(d !== null && d <= 30) analyse = "Les délais sont très bien contrôlés. La structure opérationnelle semble stable.";
      else if(d !== null && d <= 35) analyse = "Les délais demeurent acceptables, mais il faut surveiller les périodes plus fortes.";
      else if(d !== null && d <= 45) analyse = "Les délais commencent à devenir un irritant potentiel. À ce niveau, l’expérience client peut être affectée.";
      else if(d !== null) analyse = "Les délais sont élevés. Il faut probablement revoir la fluidité du rush et la couverture livraison.";
      return `${m.rest}

Délai livraison : ${fmtMin(m.delay)}

${analyse}`;
    }

    if(kind === "plaintes"){
      return `${m.rest}

Plaintes : ${m.complaintCount}
Compensation : ${m.compAmount.toFixed(2)} $

${m.complaintCount ? "Les plaintes doivent être regardées comme un signal terrain. L’important est d’identifier les irritants récurrents afin d’éviter qu’ils affectent l’expérience client sur plusieurs semaines." : "Aucune plainte visible actuellement pour ce restaurant sur la période sélectionnée. C’est positif, mais la constance doit rester surveillée."}`;
    }

    if(kind === "moyenne"){
      return `${m.rest}

Moyenne de facturation : ${fmtMoney(m.avgTicket)}

Le suivi doit porter sur le panier moyen et les opportunités d’upsell, sans nuire à la fluidité du service.`;
    }

    return `${m.rest}

Ventes : ${fmtMoney(m.sales)}
Augmentation ventes : ${fmtPct(m.growth)}
CSI : ${fmtPct(m.csi)}
Délai livraison : ${fmtMin(m.delay)}
Plaintes : ${m.complaintCount}
Compensation : ${m.compAmount.toFixed(2)} $

Lecture globale :
Le portrait doit être lu comme un ensemble. L’objectif est d’identifier l’indicateur qui mérite le plus d’attention et d’ajuster le suivi terrain en conséquence.`;
  }

  function buildPowerMessage(){
    const restaurants = getRestaurants();
    const kind = subjectKind();
    const subject = getSubject();
    const week = getWeek();

    if(!restaurants.length){
      return "Sélectionne au moins un restaurant dans « Restaurants à inclure dans le message » avant de générer le message.";
    }

    const intro = kind === "csi" ? "Voici un suivi concernant le CSI et l’expérience client."
      : kind === "augmentation" ? "Voici un suivi concernant l’évolution des ventes."
      : kind === "ventes" ? "Voici un suivi concernant les ventes."
      : kind === "delais" ? "Voici un suivi concernant les délais de livraison."
      : kind === "plaintes" ? "Voici un suivi concernant les plaintes et les compensations."
      : kind === "moyenne" ? "Voici un suivi concernant la moyenne de facturation."
      : "Voici un suivi global des résultats.";

    const metricsList = restaurants.map(metrics);

    return `Bonjour,

${intro}

Période : ${week}
Restaurant(s) : ${restaurants.join(", ")}

${metricsList.map(m => section(m, kind)).join("\n\n")}

Merci et bonne semaine.`;
  }

  function writeMessage(msg){
    const targets = [
      document.getElementById("messageOutput"),
      document.getElementById("messageBox"),
      document.getElementById("generatedMessage"),
      document.getElementById("messageResult"),
      document.getElementById("msgOutput"),
      document.querySelector("#page-messages textarea"),
      document.querySelector("#messages textarea"),
      document.querySelector("textarea")
    ].filter(Boolean);

    const target = targets[0];
    if(target){
      if("value" in target) target.value = msg;
      else target.innerHTML = msg.replace(/\n/g,"<br>");
    }
  }

  window.generateMessage = function(){
    const msg = buildPowerMessage();
    writeMessage(msg);
    if(typeof toast === "function") toast("Message généré");
    return msg;
  };

  function attach(){
    [...document.querySelectorAll("button")].forEach(btn=>{
      const t = norm(btn.textContent);
      if(t.includes("generer") || t.includes("générer")){
        btn.onclick = function(e){
          e.preventDefault();
          window.generateMessage();
          return false;
        };
      }
    });
  }

  onOpsReady(()=>{
    setTimeout(attach,500);
    setTimeout(attach,1500);
    setTimeout(attach,3000);
  });
  window.addEventListener("load",()=>setTimeout(attach,500));

})();


// ======================================================
// V2.84 Dynamic Global Reading
// Global message now changes based on actual restaurant results
// ======================================================
(function(){

  function nV284(v){
    if(v === null || v === undefined || v === "") return null;
    const x = Number(String(v).replace("$","").replace("%","").replace("min","").replace(",",".").replace(/\s/g,""));
    return isNaN(x) ? null : x;
  }

  function dynamicGlobalReadingV284(m){
    const sales = nV284(m.sales);
    const growth = nV284(m.growth);
    const csi = nV284(m.csi);
    const delay = nV284(m.delay);
    const complaints = Number(m.complaintCount || 0);
    const comp = Number(m.compAmount || 0);

    const strengths = [];
    const concerns = [];
    const focus = [];

    if(growth !== null){
      if(growth >= 10) strengths.push("la croissance des ventes est très forte");
      else if(growth >= 3) strengths.push("les ventes sont en progression");
      else if(growth >= 0) strengths.push("les ventes demeurent relativement stables");
      else if(growth <= -10) concerns.push("le recul des ventes est important");
      else concerns.push("les ventes sont en légère baisse");
    }

    if(csi !== null){
      if(csi >= 90) strengths.push("le CSI démontre une excellente expérience client");
      else if(csi >= 88) strengths.push("le CSI demeure dans une zone acceptable");
      else if(csi < 84) concerns.push("le CSI est préoccupant");
      else concerns.push("le CSI est sous l’objectif");
    }

    if(delay !== null){
      if(delay <= 30) strengths.push("les délais sont très bien contrôlés");
      else if(delay <= 35) strengths.push("les délais restent acceptables");
      else if(delay > 45) concerns.push("les délais sont élevés");
      else concerns.push("les délais commencent à devenir un irritant");
    }

    if(complaints > 0){
      if(complaints >= 20) concerns.push("le volume de plaintes est élevé");
      else if(complaints >= 8) concerns.push("les plaintes méritent un suivi serré");
      else concerns.push("quelques plaintes sont présentes");
    }else{
      strengths.push("aucune plainte visible ne ressort sur la période");
    }

    if(comp >= 300) concerns.push("les compensations représentent un coût à surveiller");
    else if(comp > 0) concerns.push("des compensations sont présentes et doivent être suivies");

    if(csi !== null && csi < 88) focus.push("l’expérience client");
    if(delay !== null && delay > 35) focus.push("la fluidité de livraison");
    if(growth !== null && growth < 0) focus.push("la relance des ventes");
    if(complaints >= 8) focus.push("la réduction des irritants récurrents");
    if(!focus.length && growth !== null && growth >= 3) focus.push("le maintien de la constance pendant la croissance");
    if(!focus.length) focus.push("le maintien des standards actuels");

    let opening = "";

    if(concerns.length >= 3){
      opening = "Le portrait global démontre plusieurs signaux à surveiller. Ce n’est pas seulement un indicateur isolé : plusieurs éléments semblent exercer une pression sur la constance opérationnelle.";
    }else if(concerns.length >= 1 && strengths.length >= 1){
      opening = "Le portrait global est mitigé. Il y a des éléments positifs à maintenir, mais certains indicateurs montrent aussi des points de vigilance qui méritent un suivi ciblé.";
    }else if(concerns.length >= 1){
      opening = "Le portrait global montre un point d’attention clair. Le restaurant n’est pas nécessairement en perte de contrôle, mais un suivi ciblé serait pertinent pour éviter que l’enjeu prenne de l’ampleur.";
    }else{
      opening = "Le portrait global est positif. Les indicateurs disponibles démontrent une bonne stabilité et l’objectif est surtout de maintenir cette constance dans les prochaines semaines.";
    }

    const strengthText = strengths.length ? `Points positifs : ${strengths.join(", ")}.` : "";
    const concernText = concerns.length ? `Points à surveiller : ${concerns.join(", ")}.` : "";
    const focusText = `Priorité recommandée : travailler principalement ${focus.join(" et ")}.`;

    return [opening, strengthText, concernText, focusText]
      .filter(Boolean)
      .join("\n");
  }

  // Override global section only, keep other subjects from stable engine
  const oldSectionV284 = typeof section !== "undefined" ? section : null;

  if(oldSectionV284){
    section = function(m, kind){
      if(kind === "global"){
        return `${m.rest}

Ventes : ${fmtMoney(m.sales)}
Augmentation ventes : ${fmtPct(m.growth)}
CSI : ${fmtPct(m.csi)}
Délai livraison : ${fmtMin(m.delay)}
Plaintes : ${m.complaintCount}
Compensation : ${m.compAmount.toFixed(2)} $

Lecture globale :
${dynamicGlobalReadingV284(m)}`;
      }

      return oldSectionV284(m, kind);
    };
  }

})();


// ======================================================
// V2.85 FORCE Dynamic Global Generator
// Overrides the full generator so global reading cannot repeat.
// ======================================================
(function(){

  function clean(v){
    return String(v || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/^sal-\d+-/i,"")
      .replace(/\(qc\)/gi,"")
      .replace(/-/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function num(v){
    if(v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace("$","").replace("%","").replace("min","").replace(",",".").replace(/\s/g,""));
    return isNaN(n) ? null : n;
  }

  function money(v){
    const n = num(v);
    return n === null ? "N/D" : n.toLocaleString("fr-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
  }

  function pct(v){
    const n = num(v);
    return n === null ? "N/D" : n.toFixed(1) + "%";
  }

  function min(v){
    const n = num(v);
    return n === null ? "N/D" : n.toFixed(1) + " min";
  }

  function subject(){
    return document.getElementById("msgSubject")?.value ||
      document.getElementById("messageSubject")?.value ||
      document.getElementById("subjectSelect")?.value ||
      "Global";
  }

  function week(){
    return document.getElementById("msgWeek")?.value ||
      document.getElementById("messageWeek")?.value ||
      document.getElementById("weekSelect")?.value ||
      document.getElementById("complaintQuickWeek")?.value ||
      "Dernière semaine";
  }

  function restaurants(){
    const checked = [...document.querySelectorAll(".msgRestaurantCheck:checked")]
      .map(x=>x.value)
      .filter(Boolean);

    if(checked.length) return checked;

    const fallback =
      document.getElementById("msgRestaurant")?.value ||
      document.getElementById("messageRestaurant")?.value ||
      document.getElementById("restaurantSelect")?.value;

    return fallback && fallback !== "Tous" ? [fallback] : [];
  }

  function allData(){
    let out = [];
    if(Array.isArray(window.DATA)) out = out.concat(window.DATA);
    try{ if(Array.isArray(DATA)) out = out.concat(DATA); }catch(e){}
    if(Array.isArray(window.DASHBOARD_DATA)) out = out.concat(window.DASHBOARD_DATA);
    if(Array.isArray(window.RESTAURANTS)) out = out.concat(window.RESTAURANTS);
    return out;
  }

  function rowFor(rest){
    const rows = allData().filter(r => clean(r.restaurant || r.restaurantName || r.store || r.location) === clean(rest));
    if(!rows.length) return {};
    const selectedWeek = week();

    if(selectedWeek && selectedWeek !== "latest" && selectedWeek !== "Dernière semaine"){
      const exact = rows.find(r => String(r.week || r.semaine || r.period || "").includes(selectedWeek));
      if(exact) return exact;
    }

    return rows[rows.length - 1] || {};
  }

  function pick(row, keys){
    for(const k of keys){
      if(row && row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    }

    for(const [k,v] of Object.entries(row || {})){
      const ck = clean(k);
      if(keys.some(target => ck.includes(clean(target))) && v !== "" && v !== null && v !== undefined){
        return v;
      }
    }

    return null;
  }

  function complaintsFor(rest){
    const rows = Array.isArray(window.COMPLAINTS) ? window.COMPLAINTS : [];
    return rows.filter(c => clean(c.restaurant) === clean(rest));
  }

  function metrics(rest){
    const row = rowFor(rest);
    const complaints = complaintsFor(rest);
    const compAmount = complaints.reduce((s,c)=>s+(num(c.amount)||0),0);

    return {
      rest,
      sales: pick(row, ["sales","ventes","Ventes","revenue"]),
      growth: pick(row, ["growth","augmentation","salesGrowth","Augmentation ventes","augmentationVentes"]),
      csi: pick(row, ["csi","CSI","csiGlobal","CSI global"]),
      delay: pick(row, ["delay","delai","délais","Délais","deliveryDelay"]),
      avgTicket: pick(row, ["avgTicket","moyenneFacturation","averageTicket","Moyenne de facturation"]),
      complaintCount: complaints.length,
      compAmount
    };
  }

  function globalReading(m){
    const growth = num(m.growth);
    const csi = num(m.csi);
    const delay = num(m.delay);
    const complaints = Number(m.complaintCount || 0);
    const comp = Number(m.compAmount || 0);

    // Critical combinations first
    if(csi !== null && csi < 84 && delay !== null && delay > 45){
      return `Le portrait global est préoccupant. Le CSI est bas et les délais sont élevés, ce qui indique probablement que l’expérience client est affectée à plusieurs moments du parcours. La priorité devrait être de stabiliser l’exécution pendant les périodes fortes et de réduire rapidement les irritants qui touchent directement le client.`;
    }

    if(growth !== null && growth < -10 && complaints >= 20){
      return `Le portrait global démontre une pression importante. La baisse des ventes combinée à un volume élevé de plaintes indique que la perception client pourrait commencer à nuire à la performance. Il faut regarder les irritants récurrents et valider si l’expérience livrée correspond encore aux attentes du marché local.`;
    }

    if(growth !== null && growth >= 10 && csi !== null && csi >= 88){
      return `Le portrait global est très positif. Le restaurant est en croissance et le CSI demeure solide, ce qui indique que le volume supplémentaire est bien absorbé sans trop affecter l’expérience client. Le principal enjeu sera de maintenir cette constance si le volume continue d’augmenter.`;
    }

    if(growth !== null && growth >= 10 && delay !== null && delay > 35){
      return `Le portrait global est encourageant au niveau des ventes, mais il y a un point de vigilance opérationnel. La croissance est bonne, toutefois les délais commencent à montrer que le restaurant pourrait être sous pression pendant les périodes fortes. Il faut protéger l’expérience client pendant cette hausse de volume.`;
    }

    if(csi !== null && csi >= 90 && complaints <= 3){
      return `Le portrait global démontre une très bonne maîtrise de l’expérience client. Le CSI est élevé et les plaintes sont limitées, ce qui indique une exécution stable. Le suivi devrait surtout viser à maintenir les routines actuelles et éviter le relâchement.`;
    }

    if(delay !== null && delay > 45){
      return `Le point qui ressort le plus dans le portrait global est le délai. Même si certains autres indicateurs peuvent être corrects, un délai élevé peut rapidement créer des plaintes service et affecter le CSI. La priorité devrait être la fluidité du rush et la couverture livraison.`;
    }

    if(csi !== null && csi < 88){
      return `Le principal point d’attention est l’expérience client. Le CSI est sous l’objectif, ce qui indique que certains irritants reviennent probablement dans le parcours client. Il faut regarder la constance terrain et identifier les éléments qui empêchent le restaurant d’atteindre une meilleure stabilité.`;
    }

    if(growth !== null && growth < 0){
      return `Le portrait global montre surtout un enjeu de momentum au niveau des ventes. Même si les opérations peuvent être relativement stables, la baisse de croissance mérite une lecture plus précise afin de comprendre si le recul vient du marché, de la fréquence client ou de l’expérience livrée.`;
    }

    if(complaints >= 10 || comp >= 150){
      return `Le volume de plaintes et/ou de compensations mérite un suivi particulier. Même si les autres indicateurs ne sont pas nécessairement critiques, les irritants clients représentent un signal terrain important. Il faut traiter la récurrence avant qu’elle affecte davantage le CSI.`;
    }

    return `Le portrait global est relativement stable. Aucun indicateur ne ressort comme critique à lui seul, mais le suivi doit rester centré sur la constance opérationnelle et la prévention des irritants avant qu’ils deviennent récurrents.`;
  }

  function subjectSection(m, subj){
    const s = clean(subj);

    if(s.includes("csi")){
      const c = num(m.csi);
      let text = c === null ? "Aucune donnée CSI claire n’est disponible."
        : c >= 90 ? "Très bon résultat. L’expérience client semble bien maîtrisée et la priorité est de maintenir cette constance."
        : c >= 88 ? "Le restaurant est dans la cible. Il faut protéger ce niveau et éviter que de petits irritants reviennent."
        : c >= 84 ? "Le CSI est sous l’objectif. Il faut identifier les irritants qui affectent l’expérience client."
        : "Le CSI est préoccupant. Un suivi rapproché est nécessaire afin de recentrer l’expérience client.";
      return `${m.rest}\n\nCSI : ${pct(m.csi)}\n\n${text}`;
    }

    if(s.includes("augmentation")){
      const g = num(m.growth);
      let text = g === null ? "Aucune donnée de croissance claire n’est disponible."
        : g >= 10 ? "Très forte progression. Il faut protéger l’exécution pendant cette croissance."
        : g >= 0 ? "Les ventes sont stables ou en progression. Il y a une base intéressante à consolider."
        : "La croissance est négative. Il faut comprendre si le recul vient du marché, de l’exécution ou de l’expérience client.";
      return `${m.rest}\n\nAugmentation des ventes : ${pct(m.growth)}\n\n${text}`;
    }

    if(s.includes("vente")){
      return `${m.rest}\n\nVentes : ${money(m.sales)}\n\nLe suivi doit porter sur la capacité du restaurant à soutenir ce volume avec une exécution constante.`;
    }

    if(s.includes("delai") || s.includes("délai")){
      const d = num(m.delay);
      let text = d === null ? "Aucune donnée délai claire n’est disponible."
        : d <= 30 ? "Les délais sont très bien contrôlés."
        : d <= 35 ? "Les délais demeurent acceptables, mais doivent rester sous surveillance."
        : d <= 45 ? "Les délais commencent à devenir un irritant potentiel."
        : "Les délais sont élevés et peuvent affecter l’expérience client.";
      return `${m.rest}\n\nDélai livraison : ${min(m.delay)}\n\n${text}`;
    }

    if(s.includes("plainte")){
      return `${m.rest}\n\nPlaintes : ${m.complaintCount}\nCompensation : ${m.compAmount.toFixed(2)} $\n\n${m.complaintCount ? "Les plaintes doivent être regardées comme un signal terrain. Il faut identifier les irritants récurrents et corriger la cause à la source." : "Aucune plainte visible actuellement. C’est positif, mais la constance doit rester surveillée."}`;
    }

    if(s.includes("moyenne")){
      return `${m.rest}\n\nMoyenne de facturation : ${money(m.avgTicket)}\n\nLe suivi doit porter sur le panier moyen et les opportunités d’upsell.`;
    }

    return `${m.rest}

Ventes : ${money(m.sales)}
Augmentation ventes : ${pct(m.growth)}
CSI : ${pct(m.csi)}
Délai livraison : ${min(m.delay)}
Plaintes : ${m.complaintCount}
Compensation : ${m.compAmount.toFixed(2)} $

Lecture globale :
${globalReading(m)}`;
  }

  function build(){
    const rests = restaurants();
    const subj = subject();
    const w = week();

    if(!rests.length){
      return "Sélectionne au moins un restaurant dans « Restaurants à inclure dans le message » avant de générer le message.";
    }

    const intro = clean(subj).includes("csi") ? "Voici un suivi concernant le CSI."
      : clean(subj).includes("augmentation") ? "Voici un suivi concernant l’augmentation des ventes."
      : clean(subj).includes("vente") ? "Voici un suivi concernant les ventes."
      : clean(subj).includes("delai") || clean(subj).includes("délai") ? "Voici un suivi concernant les délais de livraison."
      : clean(subj).includes("plainte") ? "Voici un suivi concernant les plaintes."
      : "Voici un suivi global des résultats.";

    return `Bonjour,

${intro}

Période : ${w}
Restaurant(s) : ${rests.join(", ")}

${rests.map(r => subjectSection(metrics(r), subj)).join("\n\n")}

Merci et bonne semaine.`;
  }

  function write(msg){
    const outputs = [
      document.getElementById("messageOutput"),
      document.getElementById("messageBox"),
      document.getElementById("generatedMessage"),
      document.getElementById("messageResult"),
      document.querySelector("#page-messages textarea"),
      document.querySelector("#messages textarea"),
      document.querySelector("textarea")
    ].filter(Boolean);

    if(outputs[0]){
      if("value" in outputs[0]) outputs[0].value = msg;
      else outputs[0].innerHTML = msg.replace(/\n/g,"<br>");
    }
  }

  window.generateMessage = function(){
    const msg = build();
    write(msg);
    if(typeof toast === "function") toast("Message généré");
    return msg;
  };

  function attach(){
    [...document.querySelectorAll("button")].forEach(btn=>{
      const t = clean(btn.textContent);
      if(t.includes("generer") || t.includes("générer")){
        btn.onclick = function(e){
          e.preventDefault();
          e.stopPropagation();
          window.generateMessage();
          return false;
        };
      }
    });
  }

  onOpsReady(()=>{
    setTimeout(attach,400);
    setTimeout(attach,1500);
    setTimeout(attach,3000);
  });

  window.addEventListener("load",()=>setTimeout(attach,500));

})();


// V41 cleanup: second legacy complaints block removed.
// ======================================================
// V2.99.1 REMOVE COMPLAINTS FROM AUDIT PDF
// ======================================================
(function(){

  const originalPrintPdf = typeof printPdf === "function" ? printPdf : null;

  window.printPdf = function(){

    const complaintsPage =
      document.getElementById("page-complaints") ||
      document.querySelector(".complaints-page") ||
      document.querySelector("#complaints");

    const previousDisplay = complaintsPage ? complaintsPage.style.display : null;

    // Hide complaints temporarily before generating PDF
    if(complaintsPage){
      complaintsPage.style.display = "none";
    }

    try{
      if(originalPrintPdf){
        return originalPrintPdf();
      }
    } finally {

      // Restore complaints page
      if(complaintsPage){
        complaintsPage.style.display = previousDisplay;
      }
    }
  };

})();


// ======================================================
// V2.99.2 — RESTAURANTS OPS ONLY — ALL TABS
// Keeps only the selected restaurants everywhere.
// ======================================================
(function(){

  const OPS_ALLOWED_RESTAURANTS_ALL_TABS = ["Lévis", "Beauport", "Jonquière", "Chicoutimi Nord", "St-Nicolas", "Dolbeau", "Alma", "St-Augustin", "Montmagny", "Donnacona", "Pont-Rouge", "Chicoutimi Sud", "Saint-Raymond", "Beauport Nord", "La Pocatière", "Roberval", "St-Lambert"];

  function currentOpsAllowedRestaurants(){
    if(window.OPS_AUTH_REQUIRED && window.OPS_AUTH_READY && Array.isArray(window.OPS_AUTH_ALLOWED_RESTAURANTS)){
      return window.OPS_AUTH_ALLOWED_RESTAURANTS;
    }
    if(Array.isArray(window.OPS_AUTH_ALLOWED_RESTAURANTS) && window.OPS_AUTH_ALLOWED_RESTAURANTS.length){
      return window.OPS_AUTH_ALLOWED_RESTAURANTS;
    }
    return OPS_ALLOWED_RESTAURANTS_ALL_TABS;
  }

  function normOpsRestaurant(v){
    return String(v || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/^sal-\d+-/i,"")
      .replace(/\(qc\)/gi,"")
      .replace(/saint/g,"st")
      .replace(/-/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function canonicalOpsRestaurant(v){
    const raw = String(v || "").trim();
    const key = normOpsRestaurant(raw);

    const map = {};

    currentOpsAllowedRestaurants().forEach(r => {
      map[normOpsRestaurant(r)] = r;
    });

    map["levis"] = "Lévis";
    map["jonquiere"] = "Jonquière";
    map["la pocatiere"] = "La Pocatière";
    map["st augustin de desmaures"] = "St-Augustin";
    map["st augustin"] = "St-Augustin";
    map["saint augustin"] = "St-Augustin";
    map["st lambert de lauzon"] = "St-Lambert";
    map["saint lambert de lauzon"] = "St-Lambert";
    map["saint raymond"] = "Saint-Raymond";
    map["st raymond"] = "Saint-Raymond";
    map["saint nicolas"] = "St-Nicolas";
    map["st nicolas"] = "St-Nicolas";

    return map[key] || null;
  }

  function isAllowedOpsRestaurant(v){
    return !!canonicalOpsRestaurant(v);
  }

  function forceRestaurantGlobals(){
    const current = currentOpsAllowedRestaurants();
    window.RESTAURANTS = [...current];
    window.restaurants = [...current];
    window.restaurantList = [...current];
    window.OPS_ALLOWED_RESTAURANTS = [...current];

    try { RESTAURANTS = [...current]; } catch(e) {}
    try { restaurants = [...current]; } catch(e) {}
    try { restaurantList = [...current]; } catch(e) {}
  }

  function cleanSelect(sel){
    if(!sel || !sel.options) return;

    const optionTexts = [...sel.options].map(o => String(o.textContent || "").trim());
    const looksLikeRestaurantSelect =
      optionTexts.some(x => isAllowedOpsRestaurant(x)) ||
      optionTexts.some(x => /BÉCANCOUR|BECANCOUR|DRUMMONDVILLE|LAURIER|PLESSIS|SHAWINIGAN|ANSELME|MADELEINE|TROIS|CAP DE/i.test(x));

    if(!looksLikeRestaurantSelect) return;

    const previous = canonicalOpsRestaurant(sel.value) || "Tous";
    const hasTous = optionTexts.some(x => x === "Tous");

    sel.innerHTML =
      (hasTous ? '<option value="Tous">Tous</option>' : '') +
      currentOpsAllowedRestaurants().map(r => `<option value="${r}">${r}</option>`).join("");

    if(previous !== "Tous" && currentOpsAllowedRestaurants().includes(previous)){
      sel.value = previous;
    } else if(hasTous) {
      sel.value = "Tous";
    }
  }

  function cleanAllSelects(){
    document.querySelectorAll("select").forEach(cleanSelect);
  }

  function cleanCheckboxLists(){
    const badRegex = /BÉCANCOUR|BECANCOUR|DRUMMONDVILLE|LAURIER|PLESSIS|SHAWINIGAN|ANSELME|MADELEINE|TROIS|CAP DE/i;

    document.querySelectorAll("label, .restaurant-card, .restaurant-item, .msgRestaurantCard").forEach(el => {
      const input = el.querySelector && el.querySelector('input[type="checkbox"]');
      if(!input) return;

      const txt = String(el.textContent || input.value || "").trim();
      const allowed = canonicalOpsRestaurant(txt);

      if(allowed){
        input.value = allowed;
        const span = el.querySelector("span");
        if(span) span.textContent = allowed;
        else if(el.childNodes.length) {
          // keep checkbox, normalize visible text only if easy
        }
        el.style.display = "";
      } else if(badRegex.test(txt) || txt.length < 80) {
        el.style.display = "none";
      }
    });
  }

  function cleanComplaintData(){
    if(Array.isArray(window.COMPLAINTS)){
      window.COMPLAINTS = window.COMPLAINTS
        .map(c => {
          const can = canonicalOpsRestaurant(c.restaurant || c.rawRestaurant);
          return {...c, restaurant: can || c.restaurant};
        })
        .filter(c => isAllowedOpsRestaurant(c.restaurant));

      try { COMPLAINTS = window.COMPLAINTS; } catch(e) {}
    }
  }

  function applyOpsRestaurantFilterAllTabs(){
    forceRestaurantGlobals();
    cleanComplaintData();
    cleanAllSelects();
    cleanCheckboxLists();
  }

  window.applyOpsRestaurantFilterAllTabs = applyOpsRestaurantFilterAllTabs;
  window.canonicalOpsRestaurant = canonicalOpsRestaurant;

  const functionsToPatch = [
    "renderComplaints",
    "refreshComplaintFilters",
    "refreshComplaintWeekOptions",
    "updateRestaurant",
    "updateDashboard",
    "renderMessages",
    "generateMessage",
    "initMessages",
    "renderAudit",
    "renderChecklist",
    "loadReports"
  ];

  functionsToPatch.forEach(name => {
    const old = window[name];
    if(typeof old === "function"){
      window[name] = function(...args){
        const result = old.apply(this,args);
        setTimeout(applyOpsRestaurantFilterAllTabs, 0);
        return result;
      };
    }
  });

  onOpsReady(() => {
    applyOpsRestaurantFilterAllTabs();
    setTimeout(applyOpsRestaurantFilterAllTabs, 300);
    setTimeout(applyOpsRestaurantFilterAllTabs, 1200);
    setTimeout(applyOpsRestaurantFilterAllTabs, 3000);
    setTimeout(applyOpsRestaurantFilterAllTabs, 6000);
  });

  window.addEventListener("load", () => {
    applyOpsRestaurantFilterAllTabs();
    setTimeout(applyOpsRestaurantFilterAllTabs, 1000);
  });

})();


// ======================================================
// V2.99.3 — iPhone Message Card Runtime Fix
// ======================================================
(function(){

  function applyIphoneMessageSizingV2993(){
    if(window.innerWidth > 760) return;

    const page =
      document.getElementById("page-messages") ||
      document.getElementById("messages") ||
      document.querySelector(".messages-page");

    if(!page) return;

    page.querySelectorAll('label, .restaurant-card, .msgRestaurantCard').forEach(label => {
      const input = label.querySelector && label.querySelector('input[type="checkbox"]');
      if(!input) return;

      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.justifyContent = "flex-start";
      label.style.gap = "12px";
      label.style.width = "100%";
      label.style.maxWidth = "100%";
      label.style.minHeight = "52px";
      label.style.height = "auto";
      label.style.padding = "12px 14px";
      label.style.overflow = "visible";
      label.style.whiteSpace = "normal";
      label.style.boxSizing = "border-box";

      input.style.width = "22px";
      input.style.height = "22px";
      input.style.minWidth = "22px";
      input.style.minHeight = "22px";
      input.style.flex = "0 0 22px";
      input.style.transform = "none";

      let span = label.querySelector("span");
      if(!span){
        span = document.createElement("span");
        span.textContent = input.value || label.textContent.trim();
        [...label.childNodes].forEach(n => {
          if(n.nodeType === Node.TEXT_NODE) n.textContent = "";
        });
        label.appendChild(span);
      }

      span.style.display = "block";
      span.style.flex = "1 1 auto";
      span.style.minWidth = "0";
      span.style.whiteSpace = "normal";
      span.style.overflow = "visible";
      span.style.textOverflow = "clip";
      span.style.overflowWrap = "anywhere";
      span.style.lineHeight = "1.25";
      span.style.fontSize = window.innerWidth <= 430 ? "13.5px" : "14px";
    });

    page.querySelectorAll('.restaurants-grid,.restaurant-grid,.message-restaurants').forEach(grid => {
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "1fr";
      grid.style.gap = "10px";
      grid.style.width = "100%";
      grid.style.maxWidth = "100%";
    });
  }

  window.applyIphoneMessageSizingV2993 = applyIphoneMessageSizingV2993;

  onOpsReady(() => {
    setTimeout(applyIphoneMessageSizingV2993, 500);
    setTimeout(applyIphoneMessageSizingV2993, 1500);
    setTimeout(applyIphoneMessageSizingV2993, 3500);
  });

  window.addEventListener("resize", applyIphoneMessageSizingV2993);
  window.addEventListener("orientationchange", () => setTimeout(applyIphoneMessageSizingV2993, 400));

  document.addEventListener("click", function(e){
    const txt = String(e.target?.textContent || "").toLowerCase();
    if(txt.includes("messages")){
      setTimeout(applyIphoneMessageSizingV2993, 300);
      setTimeout(applyIphoneMessageSizingV2993, 1000);
    }
  }, true);

})();




// ======================================================
(function(){
  if(window.OPS_ARCHITECTURE_V40?.legacyCalendarDisabled) return;

  const STORAGE_KEY_V411 = "pc409_manual_events";

  function getManualEventsV411(){
    try{
      return JSON.parse(localStorage.getItem(STORAGE_KEY_V411) || "[]");
    }catch(e){
      return [];
    }
  }

  function saveManualEventsV411(events){
    localStorage.setItem(STORAGE_KEY_V411, JSON.stringify(events || []));
  }

  function refreshCalendarV411(){
    if(typeof window.renderNativeCalendar === "function"){
      window.renderNativeCalendar();
    }
  }

  function openModalV411(){
    const modal = document.getElementById("pc409Modal");
    if(modal) modal.classList.remove("hidden");
  }

  function closeModalV411(){
    const modal = document.getElementById("pc409Modal");
    if(modal) modal.classList.add("hidden");
  }

  function injectEventsIntoCalendarV411(){
    try{
      const manual = getManualEventsV411();
      if(Array.isArray(window.EVENTS)){
        window.EVENTS.push(...manual);
      }
    }catch(e){}
  }

  onOpsReady(() => {

    injectEventsIntoCalendarV411();

    const addBtn = document.getElementById("pc409AddManual");
    const closeBtn = document.getElementById("pc409CloseModal");
    const cancelBtn = document.getElementById("pc409CancelModal");
    const saveBtn = document.getElementById("pc409SaveEvent");
    const upload = document.getElementById("pc409PdfUpload");

    if(addBtn) addBtn.onclick = openModalV411;
    if(closeBtn) closeBtn.onclick = closeModalV411;
    if(cancelBtn) cancelBtn.onclick = closeModalV411;

    if(saveBtn){
      saveBtn.onclick = () => {

        const title = document.getElementById("pc409EventTitle")?.value?.trim();
        const category = document.getElementById("pc409EventCategory")?.value || "promo";
        const start = document.getElementById("pc409EventStart")?.value;
        const end = document.getElementById("pc409EventEnd")?.value || start;
        const description = document.getElementById("pc409EventDescription")?.value || "";

        if(!title || !start){
          alert("Ajoute un titre et une date.");
          return;
        }

        const manual = getManualEventsV411();

        manual.push({
          title,
          category,
          start,
          end,
          description
        });

        saveManualEventsV411(manual);

        if(Array.isArray(window.EVENTS)){
          window.EVENTS.push({
            title,
            category,
            start,
            end,
            description
          });
        }

        closeModalV411();
        refreshCalendarV411();
      };
    }

    // PDF/image upload placeholder
    if(upload){
      upload.addEventListener("change", (e) => {

        const file = e.target.files?.[0];
        if(!file) return;

        // Future-ready parser placeholder
        const fakeEvent = {
          title: "PDF Importé — " + file.name.replace(/\.[^/.]+$/, ""),
          category: "promo",
          start: new Date().toISOString().slice(0,10),
          end: new Date().toISOString().slice(0,10),
          description: "Événement ajouté via PDF/image. Tu pourras ensuite ajuster les dates."
        };

        const manual = getManualEventsV411();
        manual.push(fakeEvent);
        saveManualEventsV411(manual);

        if(Array.isArray(window.EVENTS)){
          window.EVENTS.push(fakeEvent);
        }

        alert("PDF importé. L’événement temporaire a été ajouté.");
        refreshCalendarV411();
      });
    }

  });

})();



// ======================================================
(function(){
  if(window.OPS_ARCHITECTURE_V40?.legacyCalendarDisabled) return;

  const STORAGE_KEY = "pc409_manual_events";
  let detectedEventsV412 = [];

  function getManual(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch(e){ return []; }
  }

  function saveManual(list){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list || []));
  }

  function normalizeText(txt){
    return String(txt || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isoDate(y,m,d){
    return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }

  function monthNumber(name){
    const m = normalizeText(name).toLowerCase();
    const months = {
      janvier:1, jan:1,
      fevrier:2, fev:2, feb:2,
      mars:3, mar:3,
      avril:4, avr:4, apr:4,
      mai:5, may:5,
      juin:6, jun:6,
      juillet:7, juil:7, jul:7,
      aout:8, août:8, aug:8,
      septembre:9, sept:9, sep:9,
      octobre:10, oct:10,
      novembre:11, nov:11,
      decembre:12, décembre:12, dec:12
    };
    return months[m] || null;
  }

  function parseSmartDates(text){
    const source = String(text || "");
    const clean = normalizeText(source);
    const found = [];

    // YYYY-MM-DD
    [...clean.matchAll(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/g)].forEach(m => {
      found.push(isoDate(Number(m[1]), Number(m[2]), Number(m[3])));
    });

    // DD/MM/YYYY
    [...clean.matchAll(/\b(\d{1,2})[-\/](\d{1,2})[-\/](20\d{2})\b/g)].forEach(m => {
      found.push(isoDate(Number(m[3]), Number(m[2]), Number(m[1])));
    });

    // 12 mai 2026
    [...clean.matchAll(/\b(\d{1,2})\s+(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\s+(20\d{2})\b/gi)].forEach(m => {
      const mm = monthNumber(m[2]);
      if(mm) found.push(isoDate(Number(m[3]), mm, Number(m[1])));
    });

    // du 12 au 18 mai 2026
    [...clean.matchAll(/\bdu\s+(\d{1,2})\s+au\s+(\d{1,2})\s+(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\s+(20\d{2})\b/gi)].forEach(m => {
      const mm = monthNumber(m[3]);
      if(mm){
        found.push(isoDate(Number(m[4]), mm, Number(m[1])));
        found.push(isoDate(Number(m[4]), mm, Number(m[2])));
      }
    });

    return [...new Set(found)].sort();
  }

  function detectPromoName(text, fileName){
    const t = normalizeText((text || "") + " " + (fileName || "")).toLowerCase();

    if(t.includes("black friday")) return "Black Friday";
    if(t.includes("fromage en grains")) return "Extra fromage en grains gratuit";
    if(t.includes("double etoilee") || t.includes("double étoilée")) return "Pizza La Double Étoilée";
    if(t.includes("canadiens") || t.includes("hockey")) return "Promo Canadiens";
    if(t.includes("wow30") || t.includes("30%")) return "30% de rabais Wow30";
    if(t.includes("menu 10") || t.includes("10$")) return "Menu 10$";
    if(t.includes("12$") || t.includes("12 pouces") || t.includes("12''")) return "Pizzas 12'' à 12$";
    if(t.includes("demenagement") || t.includes("déménagement")) return "Campagne déménagement";
    if(t.includes("coupon")) return "Coupons promotionnels";

    return "Promotion importée";
  }

  function detectCategory(text){
    const t = normalizeText(text || "").toLowerCase();
    if(t.includes("sms")) return "sms";
    if(t.includes("ferie") || t.includes("férié")) return "ferie";
    if(t.includes("ops") || t.includes("operation")) return "ops";
    return "promo";
  }

  function buildEventsFromText(text, fileName){
    const dates = parseSmartDates(text + " " + fileName);
    const promoName = detectPromoName(text, fileName);
    const category = detectCategory(text + " " + fileName);
    const t = normalizeText(text + " " + fileName).toLowerCase();

    const events = [];

    if(dates.length >= 2 && category !== "sms"){
      events.push({
        title: promoName,
        category: "promo",
        start: dates[0],
        end: dates[dates.length - 1],
        description: `Importé depuis PDF : ${fileName}`
      });
    } else if(dates.length === 1) {
      events.push({
        title: promoName,
        category,
        start: dates[0],
        end: dates[0],
        description: `Importé depuis PDF : ${fileName}`
      });
    }

    // SMS dates: if SMS mentioned, add each detected date as SMS.
    if(t.includes("sms")){
      dates.forEach(d => {
        events.push({
          title: "SMS — " + promoName,
          category: "sms",
          start: d,
          end: d,
          description: `SMS détecté dans PDF : ${fileName}`
        });
      });
    }

    // Fallback if no date detected.
    if(!events.length){
      const today = new Date().toISOString().slice(0,10);
      events.push({
        title: promoName + " — date à valider",
        category: "promo",
        start: today,
        end: today,
        description: `Aucune date claire détectée. Importé depuis : ${fileName}`
      });
    }

    // Remove exact duplicates
    const seen = new Set();
    return events.filter(e => {
      const key = `${e.title}|${e.category}|${e.start}|${e.end}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function extractPdfText(file){
    // Browser-native PDF text extraction is limited without pdf.js.
    // This premium step tries text() first; many PDFs won't expose useful text this way.
    // The fallback uses the file name and manual preview.
    try{
      const raw = await file.text();
      return raw || "";
    }catch(e){
      return "";
    }
  }

  function openReview(events){
    detectedEventsV412 = events || [];

    const modal = document.getElementById("pc409PdfReviewModal");
    const list = document.getElementById("pc409ReviewList");
    const count = document.getElementById("pc409ReviewCount");

    if(!modal || !list) return;

    if(count){
      count.textContent = `${detectedEventsV412.length} événement${detectedEventsV412.length > 1 ? "s" : ""} détecté${detectedEventsV412.length > 1 ? "s" : ""}`;
    }

    list.innerHTML = detectedEventsV412.map((e, i) => `
      <div class="pc409-review-item" data-index="${i}">
        <div class="pc409-review-item-head">
          <strong>${e.title}</strong>
          <span>${e.category}</span>
        </div>
        <div class="pc409-review-form">
          <label>Titre<input data-field="title" value="${String(e.title).replace(/"/g,"&quot;")}"></label>
          <label>Catégorie
            <select data-field="category">
              <option value="promo" ${e.category==="promo"?"selected":""}>Promo</option>
              <option value="sms" ${e.category==="sms"?"selected":""}>SMS</option>
              <option value="ferie" ${e.category==="ferie"?"selected":""}>Férié</option>
              <option value="ops" ${e.category==="ops"?"selected":""}>OPS</option>
            </select>
          </label>
          <label>Date début<input type="date" data-field="start" value="${e.start}"></label>
          <label>Date fin<input type="date" data-field="end" value="${e.end || e.start}"></label>
          <label class="full">Description<textarea data-field="description">${e.description || ""}</textarea></label>
        </div>
      </div>
    `).join("");

    modal.classList.remove("hidden");
  }

  function closeReview(){
    const modal = document.getElementById("pc409PdfReviewModal");
    if(modal) modal.classList.add("hidden");
  }

  function collectReviewEvents(){
    const items = [...document.querySelectorAll(".pc409-review-item")];

    return items.map(item => {
      const get = field => item.querySelector(`[data-field="${field}"]`)?.value || "";
      return {
        title: get("title").trim(),
        category: get("category") || "promo",
        start: get("start"),
        end: get("end") || get("start"),
        description: get("description")
      };
    }).filter(e => e.title && e.start);
  }

  function addEventsToStorage(events){
    const current = getManualEventsV412();
    current.push(...events);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));

    if(Array.isArray(window.PC409_EVENTS)){
      window.PC409_EVENTS.push(...events);
    }

    if(typeof window.renderNativeCalendar === "function"){
      window.renderNativeCalendar();
    }
  }

  function getManualEventsV412(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch(e){ return []; }
  }

  onOpsReady(() => {
    const upload = document.getElementById("pc409PdfUpload");
    const close = document.getElementById("pc409CloseReview");
    const cancel = document.getElementById("pc409CancelReview");
    const confirm = document.getElementById("pc409ConfirmReview");

    if(upload){
      upload.onchange = async (e) => {
        const file = e.target.files?.[0];
        if(!file) return;

        const text = await extractPdfText(file);
        const events = buildEventsFromText(text, file.name);
        openReview(events);

        upload.value = "";
      };
    }

    if(close) close.onclick = closeReview;
    if(cancel) cancel.onclick = closeReview;

    if(confirm){
      confirm.onclick = () => {
        const events = collectReviewEvents();
        if(!events.length){
          alert("Aucun événement valide à ajouter.");
          return;
        }

        addEventsToStorage(events);
        closeReview();
        alert(`${events.length} événement${events.length > 1 ? "s" : ""} ajouté${events.length > 1 ? "s" : ""} au calendrier.`);
      };
    }
  });

})();



// ======================================================
(function(){
  if(window.OPS_ARCHITECTURE_V40?.legacyCalendarDisabled) return;

  // Ensure global events array exists
  if(!window.PC409_EVENTS){
    window.PC409_EVENTS = [];
  }

  // Restore render bridge
  if(typeof window.renderNativeCalendar !== "function"){
    window.renderNativeCalendar = function(){
      try{
        if(typeof render === "function"){
          render();
        }
      }catch(e){
        console.warn("Calendar render restore failed", e);
      }
    };
  }

  // Force refresh after DOM load
  onOpsReady(() => {
    setTimeout(() => {
      try{
        if(typeof window.renderNativeCalendar === "function"){
          window.renderNativeCalendar();
        }
      }catch(e){}
    }, 150);
  });

})();





// ======================================================
// V4.65 Messages restaurant selector repair
// Restores a visible restaurant selector and keeps it synced with the multi-select checklist.
// ======================================================
(function(){

  const MESSAGE_RESTAURANTS_V465 = [
    "Lévis", "Beauport", "Jonquière", "Chicoutimi Nord", "St-Nicolas", "Dolbeau", "Alma",
    "St-Augustin", "Montmagny", "Donnacona", "Pont-Rouge", "Chicoutimi Sud",
    "Saint-Raymond", "Beauport Nord", "La Pocatière", "Roberval", "St-Lambert"
  ];

  function unique(list){
    return [...new Set((list || []).map(x => String(x || "").trim()).filter(Boolean))];
  }

  function messageRestaurants(){
    const source =
      (Array.isArray(window.OPS_ALLOWED_RESTAURANTS) && window.OPS_ALLOWED_RESTAURANTS.length && window.OPS_ALLOWED_RESTAURANTS) ||
      (typeof allowedRestaurants !== "undefined" && Array.isArray(allowedRestaurants) && allowedRestaurants.length && allowedRestaurants) ||
      MESSAGE_RESTAURANTS_V465;

    const normalized = source.map(r => {
      if(String(r).trim() === "St-Raymond") return "Saint-Raymond";
      return String(r || "").trim();
    });

    return unique(normalized).filter(r => MESSAGE_RESTAURANTS_V465.includes(r));
  }

  function messagesPage(){
    return document.getElementById("page-messages") ||
      document.getElementById("messages") ||
      document.querySelector(".messages-page");
  }

  function showMessageRestaurantField(select){
    if(!select) return;

    const wrapper = select.closest(".field") ||
      select.closest(".control") ||
      select.closest(".formGroup") ||
      select.parentElement;

    [select, wrapper].filter(Boolean).forEach(el => {
      el.classList.remove("hideMessageRestaurantDropdown", "messagesHiddenField");
      el.hidden = false;
      el.removeAttribute("aria-hidden");
      el.style.display = "";
      el.style.visibility = "";
      el.style.pointerEvents = "";
      el.style.opacity = "";
    });
  }

  function ensureMessageSelect(){
    const select = document.getElementById("msgRestaurant");
    if(!select) return null;

    showMessageRestaurantField(select);

    const restaurants = messageRestaurants();
    const current = select.value === "St-Raymond" ? "Saint-Raymond" : select.value;
    select.innerHTML = restaurants.map(r => `<option value="${r}">${r}</option>`).join("");

    if(restaurants.includes(current)){
      select.value = current;
    }else if(restaurants.length){
      select.value = restaurants[0];
    }

    if(!select.dataset.messageRestaurantRepairBound){
      select.dataset.messageRestaurantRepairBound = "1";
      select.addEventListener("change", () => syncChecklistFromMessageSelect(true));
    }

    return select;
  }

  function ensureMessageChecklist(){
    const page = messagesPage();
    if(!page) return null;

    let panel = document.getElementById("multiRestaurantMessagePanel");
    if(!panel){
      panel = document.createElement("div");
      panel.id = "multiRestaurantMessagePanel";
      panel.className = "panel multiRestaurantMessagePanel";
      panel.innerHTML = `
        <h3>Restaurants à inclure dans le message</h3>
        <p class="multiRestaurantHint">Sélectionne ici le ou les restaurants à inclure dans le message.</p>
        <div class="multiRestaurantActions">
          <button class="btn" id="selectAllMsgRestaurants" type="button">Tout sélectionner</button>
          <button class="btn" id="clearMsgRestaurants" type="button">Effacer</button>
        </div>
        <div id="multiRestaurantChecklist" class="multiRestaurantChecklist"></div>
      `;

      const anchor = page.querySelector(".controls") || page.querySelector(".panel") || page.firstElementChild;
      if(anchor) anchor.insertAdjacentElement("afterend", panel);
      else page.appendChild(panel);
    }

    const box = document.getElementById("multiRestaurantChecklist");
    if(!box) return null;

    const restaurants = messageRestaurants();
    const checked = new Set([...box.querySelectorAll(".msgRestaurantCheck:checked")].map(x => String(x.value || "").trim()));
    const selectValue = document.getElementById("msgRestaurant")?.value || restaurants[0] || "";

    box.innerHTML = restaurants.map(r => `
      <label class="multiRestaurantItem">
        <input type="checkbox" class="msgRestaurantCheck" value="${r}" ${checked.has(r) || (!checked.size && r === selectValue) ? "checked" : ""}>
        <span>${r}</span>
      </label>
    `).join("");

    if(!box.dataset.messageRestaurantRepairBound){
      box.dataset.messageRestaurantRepairBound = "1";
      box.addEventListener("change", syncSelectFromMessageChecklist);
    }

    const selectAll = document.getElementById("selectAllMsgRestaurants");
    if(selectAll && !selectAll.dataset.messageRestaurantRepairBound){
      selectAll.dataset.messageRestaurantRepairBound = "1";
      selectAll.addEventListener("click", () => {
        setTimeout(() => {
          document.querySelectorAll(".msgRestaurantCheck").forEach(c => { c.checked = true; });
          syncSelectFromMessageChecklist();
        }, 0);
      });
    }

    const clear = document.getElementById("clearMsgRestaurants");
    if(clear && !clear.dataset.messageRestaurantRepairBound){
      clear.dataset.messageRestaurantRepairBound = "1";
      clear.addEventListener("click", () => {
        setTimeout(() => {
          document.querySelectorAll(".msgRestaurantCheck").forEach(c => { c.checked = false; });
        }, 0);
      });
    }

    return box;
  }

  function syncChecklistFromMessageSelect(singleSelection){
    const select = document.getElementById("msgRestaurant");
    const value = select?.value;
    if(!value) return;

    const checks = [...document.querySelectorAll(".msgRestaurantCheck")];
    if(!checks.length) return;

    checks.forEach(check => {
      if(singleSelection) check.checked = check.value === value;
      else if(check.value === value) check.checked = true;
    });
  }

  function syncSelectFromMessageChecklist(){
    const select = document.getElementById("msgRestaurant");
    if(!select) return;

    const firstChecked = document.querySelector(".msgRestaurantCheck:checked");
    if(firstChecked && [...select.options].some(o => o.value === firstChecked.value)){
      select.value = firstChecked.value;
    }
  }

  function repairMessageRestaurantSelection(){
    if(!messagesPage()) return;

    const select = ensureMessageSelect();
    ensureMessageChecklist();
    showMessageRestaurantField(select);

    const hasChecked = document.querySelector(".msgRestaurantCheck:checked");
    if(!hasChecked){
      syncChecklistFromMessageSelect(false);
    }

    if(typeof window.applyIphoneMessageSizingV2993 === "function"){
      try{ window.applyIphoneMessageSizingV2993(); }catch(e){}
    }
  }

  function patchMessageRefreshers(){
    if(window.__messageRestaurantRefreshPatchV465) return;
    window.__messageRestaurantRefreshPatchV465 = true;

    try{
      if(typeof syncComplaints === "function"){
        const previousSyncComplaints = syncComplaints;
        syncComplaints = async function(...args){
          const result = await previousSyncComplaints.apply(this, args);
          setTimeout(repairMessageRestaurantSelection, 120);
          setTimeout(repairMessageRestaurantSelection, 700);
          return result;
        };
      }
    }catch(e){}

    ["renderMessages", "initMessages"].forEach(name => {
      try{
        const previous = window[name];
        if(typeof previous !== "function" || previous.__messageRestaurantPatchV465) return;
        window[name] = function(...args){
          const result = previous.apply(this, args);
          setTimeout(repairMessageRestaurantSelection, 80);
          return result;
        };
        window[name].__messageRestaurantPatchV465 = true;
      }catch(e){}
    });
  }

  window.repairMessageRestaurantSelection = repairMessageRestaurantSelection;

  onOpsReady(() => {
    patchMessageRefreshers();
    [150, 700, 1600, 3200, 5200, 7600].forEach(delay => {
      setTimeout(repairMessageRestaurantSelection, delay);
    });
  });

  document.addEventListener("click", event => {
    const target = event.target;
    const nav = target?.closest?.('[data-page="messages"]');
    if(nav){
      setTimeout(repairMessageRestaurantSelection, 80);
      setTimeout(repairMessageRestaurantSelection, 500);
    }
  }, true);

  window.addEventListener("resize", () => setTimeout(repairMessageRestaurantSelection, 150));
  window.addEventListener("orientationchange", () => setTimeout(repairMessageRestaurantSelection, 350));

})();


// V41 cleanup: legacy calendar/PDF handlers and late complaint guards removed.
