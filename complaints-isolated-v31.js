(function(){
  "use strict";

  const DEFAULT_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT8iD3fLPtv8V5z7ztEMqdJnCOhD32pRQsevAwXIexl6iwktRt_-eJQ1CgbXFiWSRgQQRi8ma9lvLv2/pub?gid=1258876961&single=true&output=csv";
  const CSV_STORAGE_KEY = "dashboard_ops_complaints_csv_url";
  const ALLOWED = [
    "L\u00e9vis","Beauport","Jonqui\u00e8re","Chicoutimi Nord","St-Nicolas","Dolbeau","Alma",
    "St-Augustin","Montmagny","Donnacona","Pont-Rouge","Chicoutimi Sud",
    "Saint-Raymond","Beauport Nord","La Pocati\u00e8re","Roberval","St-Lambert"
  ];
  const CODE_MAP = {
    "0006":"L\u00e9vis","0007":"Beauport","0013":"Jonqui\u00e8re","0014":"Chicoutimi Nord",
    "0022":"St-Nicolas","0041":"Dolbeau","0047":"Alma","0051":"St-Augustin",
    "0057":"Montmagny","0061":"Donnacona","0093":"Pont-Rouge","0097":"Chicoutimi Sud",
    "0116":"Saint-Raymond","0120":"Beauport Nord","0127":"Roberval","0129":"La Pocati\u00e8re"
  };

  let complaints = [];
  let importLog = {csvRowsRead:0, imported:[], corrected:[], rejected:[]};
  let syncPromise = null;
  let hardBound = false;

  const IDMAP = {
    complaintRestaurant:"cfComplaintRestaurant",
    complaintType:"cfComplaintType",
    complaintQuickWeek:"cfComplaintQuickWeek",
    complaintDate:"cfComplaintDate",
    complaintEndDate:"cfComplaintEndDate",
    complaintsTable:"cfComplaintsTable",
    complaintsStatus:"cfComplaintsStatus",
    complaintsTotal:"cfComplaintsTotal",
    complaintsTopRestaurant:"cfComplaintsTopRestaurant",
    complaintsTopType:"cfComplaintsTopType",
    complaintsOpen:"cfComplaintsOpen",
    complaintsTypeChart:"cfComplaintsTypeChart",
    complaintsOpsAnalysis:"cfComplaintsOpsAnalysis",
    complaintCsvSource:"cfComplaintCsvSource",
    btnComplaintsSync:"cfBtnComplaintsSync",
    btnSyncComplaintsConfig:"cfBtnComplaintsSync",
    btnComplaintsApply:"cfBtnComplaintsApply",
    btnComplaintPdf:"cfBtnComplaintPdf"
  };

  function $(id){ return document.getElementById(IDMAP[id] || id); }
  function complaintConfigField(){
    return document.getElementById("complaintsCsvUrl");
  }
  function normalizeCsvUrl(value){
    const url = String(value || "").trim().replace(/&amp;/g, "&");
    if(!url && window.OPS_AUTH_REQUIRED && window.OPS_AUTH_READY) return "";
    return url || DEFAULT_CSV_URL;
  }
  function getComplaintCsvUrl(){
    let stored = "";
    try{ stored = localStorage.getItem(CSV_STORAGE_KEY) || ""; }catch(e){}
    const fieldUrl = complaintConfigField()?.value || "";
    if(window.OPS_AUTH_REQUIRED && window.OPS_AUTH_READY) return normalizeCsvUrl(stored || fieldUrl);
    return normalizeCsvUrl(stored || fieldUrl || DEFAULT_CSV_URL);
  }
  function cacheBustUrl(url){
    return url + (url.includes("?") ? "&" : "?") + "_final=" + Date.now();
  }
  function hydrateComplaintCsvConfig(){
    const url = getComplaintCsvUrl();
    const field = complaintConfigField();
    if(field && normalizeCsvUrl(field.value) !== url) field.value = url;
    const auto = document.getElementById("complaintsAuto");
    if(auto && !auto.dataset.cfReady){
      auto.dataset.cfReady = "1";
      auto.checked = Boolean(url);
    }
    const source = $("complaintCsvSource");
    if(source){
      source.innerHTML = url
        ? `Source CSV live : <a href="${esc(url)}" target="_blank" rel="noopener">Google Sheet RAW</a>`
        : "Source CSV plaintes : non attribuée.";
    }
    return url;
  }
  function saveComplaintCsvConfig(){
    const raw = complaintConfigField()?.value || "";
    const url = window.OPS_AUTH_REQUIRED && window.OPS_AUTH_READY
      ? normalizeCsvUrl(raw)
      : normalizeCsvUrl(raw || DEFAULT_CSV_URL);
    try{ localStorage.setItem(CSV_STORAGE_KEY, url); }catch(e){}
    hydrateComplaintCsvConfig();
    const status = document.getElementById("complaintsStatus");
    if(status) status.textContent = "Lien CSV plaintes sauvegard\u00e9 : Google Sheet RAW.";
    return url;
  }
  function buildIsolatedUi(){
    const page = document.getElementById("page-complaints");
    if(!page || page.dataset.cfIsolated === "1") return;
    page.dataset.cfIsolated = "1";
    page.innerHTML = `
      <h2>Plaintes</h2>
      <p class="subtitle">Centre de gestion des plaintes r\u00e9seau - synchronis\u00e9 avec le Google Sheet RAW.</p>
      <div class="complaintCsvSource" id="cfComplaintCsvSource">Source CSV live : Google Sheet RAW</div>
      <div class="controls">
        <select id="cfComplaintRestaurant"><option value="Tous">Tous les restaurants</option></select>
        <select id="cfComplaintType"><option value="Tous">Tous les types</option></select>
        <select id="cfComplaintQuickWeek"><option value="all">Toutes les plaintes import\u00e9es</option></select>
        <input id="cfComplaintDate" type="date">
        <input id="cfComplaintEndDate" type="date">
        <button class="btn red" id="cfBtnComplaintsApply" type="button">Appliquer</button>
        <button class="btn blue" id="cfBtnComplaintsSync" type="button">Synchroniser plaintes</button>
        <button class="btn cfPdfBtn" id="cfBtnComplaintPdf" type="button">Exporter rapport PDF</button>
      </div>
      <div class="cards">
        <div class="card"><label>Plaintes</label><div class="value" id="cfComplaintsTotal">-</div><div class="note">p\u00e9riode s\u00e9lectionn\u00e9e</div></div>
        <div class="card"><label>Restaurant #1</label><div class="value" id="cfComplaintsTopRestaurant">-</div><div class="note">plus de plaintes</div></div>
        <div class="card"><label>Type #1</label><div class="value" id="cfComplaintsTopType">-</div><div class="note">cat\u00e9gorie dominante</div></div>
        <div class="card"><label>Suivi \u00e0 faire</label><div class="value" id="cfComplaintsOpen">0.00 $</div><div class="note">Montant total \u00e0 surveiller</div></div>
      </div>
      <div class="panel"><h3>Analyse plaintes OPS</h3><div id="cfComplaintsOpsAnalysis" class="complaintsInsight">Synchronisation en cours.</div></div>
      <div class="panel"><h3>R\u00e9partition par type de plainte</h3><div id="cfComplaintsTypeChart" class="complaintBarChart"></div></div>
      <div class="panel">
        <h3>Liste des plaintes</h3>
        <div id="cfComplaintsStatus" hidden>Initialisation V31...</div>
        <div class="tableWrap">
          <table>
            <thead><tr><th>Date</th><th>Restaurant</th><th>Type</th><th>Client</th><th>Valeur</th><th>Ticket</th><th>D\u00e9tail</th></tr></thead>
            <tbody id="cfComplaintsTable"><tr><td colspan="7">Synchronisation en cours.</td></tr></tbody>
          </table>
        </div>
      </div>
    `;
  }
  function esc(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[char]));
  }
  function norm(value){
    return String(value || "")
      .replace(/Ã©/g,"\u00e9")
      .replace(/Ã¨/g,"\u00e8")
      .replace(/Ãª/g,"\u00ea")
      .replace(/Ã«/g,"\u00eb")
      .replace(/Ã‰/g,"\u00c9")
      .replace(/Ãˆ/g,"\u00c8")
      .replace(/Ã /g,"\u00e0")
      .replace(/Ã¢/g,"\u00e2")
      .replace(/Ã´/g,"\u00f4")
      .replace(/Ã®/g,"\u00ee")
      .replace(/Ã§/g,"\u00e7")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/['\u2019]/g,"")
      .replace(/[^a-z0-9]+/g," ")
      .trim();
  }
  function restaurantKey(value){
    const raw = String(value || "").toLowerCase();
    if(raw.startsWith("l") && raw.includes("vis")) return "levis";
    return norm(value);
  }
  function parseCsv(text){
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for(let i = 0; i < String(text || "").length; i++){
      const char = text[i];
      const next = text[i + 1];
      if(char === '"'){
        if(quoted && next === '"'){
          field += '"';
          i++;
        }else{
          quoted = !quoted;
        }
      }else if(char === "," && !quoted){
        row.push(field);
        field = "";
      }else if((char === "\n" || char === "\r") && !quoted){
        if(char === "\r" && next === "\n") i++;
        row.push(field);
        if(row.some(cell => String(cell).trim())) rows.push(row);
        row = [];
        field = "";
      }else{
        field += char;
      }
    }
    row.push(field);
    if(row.some(cell => String(cell).trim())) rows.push(row);
    return rows;
  }
  function findHeader(rows){
    let best = {index:0, score:-1};
    rows.forEach((row, index) => {
      const joined = row.map(norm).join(" ");
      let score = 0;
      ["restaurant","plainte","categorie","description","ticket","client","valeur"].forEach(key => {
        if(joined.includes(key)) score++;
      });
      if(score > best.score) best = {index, score};
    });
    return best.index;
  }
  function mapColumns(header){
    const headers = header.map(norm);
    const find = names => {
      const keys = names.map(norm);
      for(const key of keys){
        const exact = headers.findIndex(h => h === key);
        if(exact >= 0) return exact;
      }
      for(const key of keys){
        const partial = headers.findIndex(h => h.includes(key) || key.includes(h));
        if(partial >= 0) return partial;
      }
      return -1;
    };
    return {
      restaurant: find(["Restaurant","resto","succursale"]),
      date: find(["Plaintes d\u00e9pos\u00e9es le","Plaintes deposees le","date plainte","date"]),
      type: find(["Cat\u00e9gorie de la plainte","Categorie de la plainte","type","raison"]),
      value: find(["Valeur $","valeur","montant","amount"]),
      client: find(["Nom client","client"]),
      phone: find(["T\u00e9l\u00e9phone client","telephone client","telephone","phone"]),
      ticket: find(["#ticket ZOHO DESK (VIP-1234)","ticket ZOHO","ticket","vip"]),
      description: find(["Description du probl\u00e8me","Description du probleme","description","plainte","commentaire"]),
      source: find(["Provenance Plaintes","provenance","source"]),
      compensation: find(["D\u00e9dommagement offert","Dedomagement offert","compensation"]),
      email: find(["Email du resto","email"]),
      co: find(["CO","responsable"]),
      suivi: find(["Suivi du CO","suivi"]),
      note: find(["Note CO","note"]),
      reason: find(["Raison de la non-conformit\u00e9","Raison de la non-conformite","raison"]),
      journal: find(["Journal de cr\u00e9ation","Journal de creation","journal"]),
      zoho: find(["Lien vers Zoho","zoho"]),
      link1: find(["1- Lien partage"]),
      link2: find(["2- Lien partage"]),
      link3: find(["3- Lien partage"]),
      img1: find(["1- Captures d'\u00e9cran","1- Captures d'ecran"]),
      img2: find(["2- Captures d'\u00e9cran","2- Captures d'ecran"]),
      img3: find(["3- Captures d'\u00e9cran","3- Captures d'ecran"])
    };
  }
  function cell(row, index){
    return index >= 0 && row[index] != null ? String(row[index]).trim() : "";
  }
  function fixRestaurant(raw){
    const original = String(raw || "").trim();
    const issues = [];
    if(!original) return {value:"", issues:["Restaurant manquant"]};
    const code = original.match(/SAL-(\d{4})/i);
    if(code && CODE_MAP[code[1]]){
      const value = CODE_MAP[code[1]];
      if(norm(value) !== norm(original)) issues.push("Restaurant corrige: " + original + " -> " + value);
      return {value, issues};
    }
    const cleaned = original
      .replace(/^SAL-\d+-/i,"")
      .replace(/\s*\(QC\)\s*$/i,"")
      .replace(/-/g," ")
      .replace(/\s+/g," ")
      .trim();
    const aliases = {
      "levis":"L\u00e9vis","jonquiere":"Jonqui\u00e8re","st nicolas":"St-Nicolas","saint nicolas":"St-Nicolas",
      "st augustin de desmaures":"St-Augustin","saint augustin de desmaures":"St-Augustin",
      "st augustin":"St-Augustin","saint augustin":"St-Augustin","pont rouge":"Pont-Rouge",
      "saint raymond":"Saint-Raymond","st raymond":"Saint-Raymond","beauport nord":"Beauport Nord",
      "chicoutimi nord":"Chicoutimi Nord","chicoutimi sud":"Chicoutimi Sud","chicoutimi":"Chicoutimi Sud",
      "la pocatiere":"La Pocati\u00e8re","st lambert":"St-Lambert","saint lambert":"St-Lambert",
      "saint lambert de lauzon":"St-Lambert"
    };
    const value = aliases[norm(cleaned)] || ALLOWED.find(name => norm(name) === norm(cleaned)) || "";
    if(value){
      if(norm(value) !== norm(original)) issues.push("Restaurant corrige: " + original + " -> " + value);
      return {value, issues};
    }
    return {value:"", issues:["Restaurant hors liste autorisee: " + original]};
  }
  function parseDate(raw, description, journal){
    const original = String(raw || "").trim();
    const issues = [];
    let date = null;
    let match;
    if(original){
      match = original.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})(?:\s+(\d{1,2}):(\d{2}))?/);
      if(match) date = new Date(+match[3], +match[2] - 1, +match[1], +(match[4] || 12), +(match[5] || 0));
      if(!date || isNaN(date)){
        match = original.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/);
        if(match) date = new Date(+match[1], +match[2] - 1, +match[3], +(match[4] || 12), +(match[5] || 0));
      }
      if((!date || isNaN(date)) && /^\d+(\.\d+)?$/.test(original)){
        const serial = Number(original);
        if(serial > 30000){
          date = new Date(Math.round((serial - 25569) * 86400 * 1000));
          issues.push("Date corrigee depuis Excel: " + original);
        }
      }
      if(!date || isNaN(date)){
        const guessed = new Date(original);
        if(!isNaN(guessed)){
          date = guessed;
          issues.push("Date corrigee: " + original);
        }
      }
    }
    if(!date || isNaN(date)){
      const text = [description, journal].filter(Boolean).join(" ");
      match = text.match(/(20\d{2})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
      if(match){
        date = new Date(+match[1], +match[2] - 1, +match[3], +(match[4] || 12), +(match[5] || 0));
        issues.push("Date reconstruite depuis le texte");
      }
    }
    if(!date || isNaN(date)) return {value:null, issues:["Date impossible a corriger"]};
    return {value:date, issues};
  }
  function parseMoney(value){
    const number = Number(String(value || "").replace(/\u00a0|\u202f/g,"").replace(/\s/g,"").replace("$","").replace(",",".").replace(/[^0-9.\-]/g,""));
    return isNaN(number) ? 0 : number;
  }
  function iso(date){
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }
  function inferType(type, description){
    const raw = String(type || "").trim();
    const text = norm(description);
    if(raw && raw.length < 50 && !/https?:|@|20\d{2}/i.test(raw)) return raw;
    if(/livraison|livreur|retard|delai|attente|arriv/.test(text)) return "Service";
    if(/oubli|manquant|sauce|breuvage|boisson|item/.test(text)) return "Item oubli\u00e9";
    if(/froide|brule|croute|cuisson|garniture|pizza|poutine|produit/.test(text)) return "Produit";
    if(/sale|propre|toilette|plancher|cheveux/.test(text)) return "Propret\u00e9";
    return "Non cat\u00e9goris\u00e9";
  }
  function parseComplaints(text){
    const rows = parseCsv(text);
    const headerIndex = findHeader(rows);
    const columns = mapColumns(rows[headerIndex] || []);
    const result = {csvRowsRead:Math.max(0, rows.length - headerIndex - 1), imported:[], corrected:[], rejected:[]};

    rows.slice(headerIndex + 1).forEach((row, offset) => {
      const line = headerIndex + offset + 2;
      if(!row.some(value => String(value || "").trim())) return;
      const rawRestaurant = cell(row, columns.restaurant);
      const description = cell(row, columns.description);
      const ticket = cell(row, columns.ticket);
      const restaurant = fixRestaurant(rawRestaurant);
      const date = parseDate(cell(row, columns.date), description, cell(row, columns.journal));
      const issues = [...restaurant.issues, ...date.issues];
      const critical = [];
      if(!restaurant.value) critical.push("restaurant hors liste autorisee");
      if(!date.value) critical.push("date impossible a corriger");
      if(!description && !ticket) critical.push("description et ticket manquants");
      if(critical.length){
        result.rejected.push({line, restaurant:rawRestaurant, date:cell(row, columns.date), importIssues:[...issues, ...critical]});
        return;
      }
      const item = {
        rowNumber:line,
        restaurant:restaurant.value,
        rawRestaurant,
        type:inferType(cell(row, columns.type), description),
        amount:parseMoney(cell(row, columns.value)),
        date:date.value,
        dateIso:iso(date.value),
        source:cell(row, columns.source),
        compensation:cell(row, columns.compensation),
        client:cell(row, columns.client),
        phone:cell(row, columns.phone),
        ticket,
        description,
        email:cell(row, columns.email),
        co:cell(row, columns.co),
        suivi:cell(row, columns.suivi),
        note:cell(row, columns.note),
        reason:cell(row, columns.reason),
        journal:cell(row, columns.journal),
        zoho:cell(row, columns.zoho),
        links:[columns.link1, columns.link2, columns.link3, columns.img1, columns.img2, columns.img3].map(index => cell(row, index)).filter(Boolean),
        importIssues:issues
      };
      result.imported.push(item);
      if(issues.length) result.corrected.push({line, restaurant:item.restaurant, date:item.dateIso, importIssues:issues});
    });
    return result;
  }
  function weekStart(date){
    const copy = new Date(date);
    const diff = (copy.getDay() - 2 + 7) % 7;
    copy.setDate(copy.getDate() - diff);
    copy.setHours(0,0,0,0);
    return copy;
  }
  function weekEnd(date){
    const end = weekStart(date);
    end.setDate(end.getDate() + 6);
    end.setHours(23,59,59,999);
    return end;
  }
  function weekLabel(date){
    return iso(weekStart(date)) + " au " + iso(weekEnd(date));
  }
  function countBy(rows, field){
    const counts = {};
    rows.forEach(row => counts[row[field] || "Non pr\u00e9cis\u00e9"] = (counts[row[field] || "Non pr\u00e9cis\u00e9"] || 0) + 1);
    return Object.entries(counts).sort((a,b) => b[1] - a[1]);
  }
  function fillFilters(){
    const restaurant = $("complaintRestaurant");
    const type = $("complaintType");
    const week = $("complaintQuickWeek");
    if(restaurant){
      const current = restaurant.value || "Tous";
      const used = new Set(complaints.map(row => row.restaurant));
      const items = ["Tous", ...ALLOWED.filter(name => used.has(name))];
      restaurant.innerHTML = items.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("");
      restaurant.value = items.includes(current) ? current : "Tous";
    }
    if(type){
      const current = type.value || "Tous";
      const items = ["Tous", ...[...new Set(complaints.map(row => row.type).filter(Boolean))].sort((a,b) => a.localeCompare(b, "fr"))];
      type.innerHTML = items.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("");
      type.value = items.includes(current) ? current : "Tous";
    }
    if(week){
      const current = week.value || "all";
      const items = [...new Set(complaints.map(row => weekLabel(row.date)))].sort((a,b) => new Date(a.slice(0,10)) - new Date(b.slice(0,10)));
      week.innerHTML = `<option value="all">Toutes les plaintes import\u00e9es</option><option value="latest">Derni\u00e8re semaine avec plaintes</option>` +
        items.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("");
      week.value = [...week.options].some(option => option.value === current) ? current : "all";
    }
  }
  function selectedRows(){
    const restaurantSelect = $("complaintRestaurant");
    const typeSelect = $("complaintType");
    const weekSelect = $("complaintQuickWeek");
    const restaurant = restaurantSelect?.value || restaurantSelect?.selectedOptions?.[0]?.textContent || "Tous";
    const type = typeSelect?.value || typeSelect?.selectedOptions?.[0]?.textContent || "Tous";
    const customStart = $("complaintDate")?.value;
    const customEnd = $("complaintEndDate")?.value;
    let start = new Date(0);
    let end = new Date(8640000000000000);
    if(customStart || customEnd){
      start = customStart ? new Date(customStart + "T00:00:00") : start;
      end = customEnd ? new Date(customEnd + "T23:59:59") : end;
    }else{
      let week = weekSelect?.value || weekSelect?.selectedOptions?.[0]?.textContent || "all";
      if(week === "latest"){
        const labels = [...new Set(complaints.map(row => weekLabel(row.date)))].sort((a,b) => new Date(a.slice(0,10)) - new Date(b.slice(0,10)));
        week = labels[labels.length - 1] || "all";
      }
      const match = String(week).match(/(\d{4}-\d{2}-\d{2}) au (\d{4}-\d{2}-\d{2})/);
      if(match){
        start = new Date(match[1] + "T00:00:00");
        end = new Date(match[2] + "T23:59:59");
      }
    }
    return complaints.filter(row => {
      if(row.date < start || row.date > end) return false;
      if(restaurant !== "Tous" && restaurantKey(row.restaurant) !== restaurantKey(restaurant)) return false;
      if(type !== "Tous" && norm(row.type) !== norm(type)) return false;
      return true;
    });
  }
  function reportDate(value, endOfDay){
    if(!value) return null;
    const date = new Date(value + (endOfDay ? "T23:59:59" : "T00:00:00"));
    return isNaN(date) ? null : date;
  }
  function addDays(date, days, endOfDay){
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    if(endOfDay) copy.setHours(23,59,59,999);
    else copy.setHours(0,0,0,0);
    return copy;
  }
  function latestComplaintWeekLabel(){
    const labels = [...new Set(complaints.map(row => weekLabel(row.date)))].sort((a,b) => new Date(a.slice(0,10)) - new Date(b.slice(0,10)));
    return labels[labels.length - 1] || "";
  }
  function parseComplaintWeekRange(value){
    const week = value === "latest" ? latestComplaintWeekLabel() : String(value || "");
    const match = week.match(/(\d{4}-\d{2}-\d{2}) au (\d{4}-\d{2}-\d{2})/);
    if(!match) return null;
    const start = reportDate(match[1], false);
    const end = reportDate(match[2], true);
    if(!start || !end) return null;
    return {start, end, label:`${match[1]} au ${match[2]}`, complete:true};
  }
  function readComplaintReportFilters(){
    const restaurantSelect = $("complaintRestaurant");
    const typeSelect = $("complaintType");
    const weekSelect = $("complaintQuickWeek");
    const restaurant = restaurantSelect?.value || restaurantSelect?.selectedOptions?.[0]?.textContent || "Tous";
    const type = typeSelect?.value || typeSelect?.selectedOptions?.[0]?.textContent || "Tous";
    const rawWeek = weekSelect?.value || weekSelect?.selectedOptions?.[0]?.textContent || "all";
    const week = rawWeek === "latest" ? (latestComplaintWeekLabel() || "all") : rawWeek;
    return {
      restaurant,
      type,
      rawWeek,
      week,
      customStart: $("complaintDate")?.value || "",
      customEnd: $("complaintEndDate")?.value || ""
    };
  }
  function getComplaintReportRange(filters){
    if(filters.customStart || filters.customEnd){
      const start = reportDate(filters.customStart, false);
      const end = reportDate(filters.customEnd, true);
      const label = start && end
        ? `${iso(start)} au ${iso(end)}`
        : start
          ? `Depuis ${iso(start)}`
          : end
            ? `Jusqu'au ${iso(end)}`
            : "P\u00e9riode personnalis\u00e9e";
      return {start, end, label, complete:Boolean(start && end)};
    }
    const parsed = parseComplaintWeekRange(filters.week);
    if(parsed) return parsed;
    return null;
  }
  function complaintReportBaseRows(filters){
    return complaints.filter(row => {
      if(filters.restaurant !== "Tous" && restaurantKey(row.restaurant) !== restaurantKey(filters.restaurant)) return false;
      if(filters.type !== "Tous" && norm(row.type) !== norm(filters.type)) return false;
      return true;
    });
  }
  function rowsInRange(rows, range){
    if(!range) return rows.slice();
    return rows.filter(row => {
      if(range.start && row.date < range.start) return false;
      if(range.end && row.date > range.end) return false;
      return true;
    });
  }
  function sumComplaintAmount(rows){
    return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  }
  function previousReportRange(range){
    if(!range || !range.complete || !range.start || !range.end) return null;
    const days = Math.max(1, Math.round((range.end - range.start) / 86400000) + 1);
    return {
      start: addDays(range.start, -days, false),
      end: addDays(range.end, -days, true),
      label:`${iso(addDays(range.start, -days, false))} au ${iso(addDays(range.end, -days, true))}`,
      complete:true
    };
  }
  function categoryReportStats(rows){
    const map = {};
    rows.forEach(row => {
      const category = row.type || "Non pr\u00e9cis\u00e9";
      if(!map[category]) map[category] = {category, count:0, amount:0};
      map[category].count += 1;
      map[category].amount += Number(row.amount) || 0;
    });
    return Object.values(map).sort((a,b) => b.count - a.count || b.amount - a.amount || a.category.localeCompare(b.category, "fr"));
  }
  function percentVariation(current, previous){
    if(previous == null) return null;
    if(previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / Math.abs(previous)) * 100;
  }
  function formatMoney(value){
    if(value == null || !isFinite(value)) return "\u2014";
    return Number(value || 0).toLocaleString("fr-CA", {minimumFractionDigits:2, maximumFractionDigits:2}) + " $";
  }
  function formatNumber(value, decimals){
    if(value == null || !isFinite(value)) return "\u2014";
    return Number(value).toLocaleString("fr-CA", {minimumFractionDigits:decimals || 0, maximumFractionDigits:decimals || 0});
  }
  function formatPercent(value){
    if(value == null || !isFinite(value)) return "\u2014";
    const sign = value > 0 ? "+" : "";
    return sign + value.toLocaleString("fr-CA", {minimumFractionDigits:1, maximumFractionDigits:1}) + " %";
  }
  function deltaClass(value, lowerIsBetter){
    if(value == null || !isFinite(value) || value === 0) return "neutral";
    return lowerIsBetter ? (value < 0 ? "good" : "bad") : (value > 0 ? "good" : "bad");
  }
  function getComplaintReportData(){
    const filters = readComplaintReportFilters();
    const range = getComplaintReportRange(filters);
    const baseRows = complaintReportBaseRows(filters).sort((a,b) => a.date - b.date || (a.rowNumber || 0) - (b.rowNumber || 0));
    const rows = rowsInRange(baseRows, range).sort((a,b) => a.date - b.date || (a.rowNumber || 0) - (b.rowNumber || 0));
    return {
      generatedAt: new Date(),
      filters,
      range,
      periodLabel: range ? range.label : "Toutes les plaintes import\u00e9es",
      restaurantLabel: filters.restaurant === "Tous" ? "R\u00e9seau complet" : filters.restaurant,
      typeLabel: filters.type === "Tous" ? "Tous les types" : filters.type,
      rows,
      baseRows,
      importSummary: {
        csvRowsRead: importLog.csvRowsRead,
        imported: importLog.imported.length,
        corrected: importLog.corrected.length,
        rejected: importLog.rejected.length
      }
    };
  }
  function calculateComplaintReportStats(data){
    const currentCount = data.rows.length;
    const currentAmount = sumComplaintAmount(data.rows);
    const previousRange = previousReportRange(data.range);
    const previousRows = previousRange ? rowsInRange(data.baseRows, previousRange) : [];
    const previousCount = previousRange ? previousRows.length : null;
    const previousAmount = previousRange ? sumComplaintAmount(previousRows) : null;
    const categoryStats = categoryReportStats(data.rows);
    const amountCategoryStats = categoryStats.slice().sort((a,b) => b.amount - a.amount || b.count - a.count || a.category.localeCompare(b.category, "fr"));
    const periodLengthDays = data.range && data.range.complete
      ? Math.max(1, Math.round((data.range.end - data.range.start) / 86400000) + 1)
      : null;
    const sixWeekWindows = [];
    if(data.range && data.range.complete && periodLengthDays){
      for(let i = 0; i < 6; i++){
        const start = addDays(data.range.start, -periodLengthDays * i, false);
        const end = addDays(data.range.end, -periodLengthDays * i, true);
        const rows = rowsInRange(data.baseRows, {start, end, complete:true});
        sixWeekWindows.push({start, end, rows, count:rows.length, amount:sumComplaintAmount(rows)});
      }
    }
    const averageCount6 = sixWeekWindows.length ? sixWeekWindows.reduce((sum, item) => sum + item.count, 0) / sixWeekWindows.length : null;
    const averageAmount6 = sixWeekWindows.length ? sixWeekWindows.reduce((sum, item) => sum + item.amount, 0) / sixWeekWindows.length : null;
    const topCategory = categoryStats[0] || null;
    const costlyCategory = amountCategoryStats[0] || null;
    return {
      currentCount,
      currentAmount,
      previousRange,
      previousCount,
      previousAmount,
      countVariation: percentVariation(currentCount, previousCount),
      amountVariation: percentVariation(currentAmount, previousAmount),
      averageCount6,
      averageAmount6,
      countGapVsAverage6: averageCount6 == null ? null : currentCount - averageCount6,
      amountGapVsAverage6: averageAmount6 == null ? null : currentAmount - averageAmount6,
      categoryStats,
      topCategory,
      costlyCategory,
      sixWeekWindows
    };
  }
  function complaintReportSummary(data, stats){
    if(!data.rows.length){
      return `Aucune plainte n'est visible pour ${data.restaurantLabel} sur la p\u00e9riode ${data.periodLabel}. Le rapport demeure g\u00e9n\u00e9r\u00e9 pour conserver une trace claire du filtre actif.`;
    }
    const trend = stats.previousRange
      ? `Le volume varie de ${formatPercent(stats.countVariation)} et le montant de ${formatPercent(stats.amountVariation)} versus la p\u00e9riode pr\u00e9c\u00e9dente.`
      : "La comparaison avec la semaine pr\u00e9c\u00e9dente n'est pas disponible pour ce filtre.";
    const top = stats.topCategory ? `La cat\u00e9gorie la plus fr\u00e9quente est ${stats.topCategory.category}.` : "";
    const costly = stats.costlyCategory ? `La cat\u00e9gorie la plus co\u00fbteuse est ${stats.costlyCategory.category}.` : "";
    return `${data.restaurantLabel} affiche ${stats.currentCount} plainte(s) pour ${formatMoney(stats.currentAmount)} sur ${data.periodLabel}. ${trend} ${top} ${costly}`.trim();
  }
  function renderComplaintReportPdf(data, stats){
    const generated = data.generatedAt.toLocaleString("fr-CA", {dateStyle:"long", timeStyle:"short"});
    const logoUrl = esc(new URL("salvatore-logo.jpg", window.location.href).href);
    const categoryMaxCount = Math.max(1, ...stats.categoryStats.map(item => item.count));
    const categoryMaxAmount = Math.max(1, ...stats.categoryStats.map(item => item.amount));
    const categoryRows = stats.categoryStats.map(item => {
      const countWidth = Math.max(6, item.count / categoryMaxCount * 100);
      const amountWidth = Math.max(6, item.amount / categoryMaxAmount * 100);
      return `<tr><td><strong>${esc(item.category)}</strong></td><td>${item.count}</td><td>${formatMoney(item.amount)}</td><td><div class="bar"><span style="width:${countWidth.toFixed(2)}%"></span></div></td><td><div class="bar money"><span style="width:${amountWidth.toFixed(2)}%"></span></div></td></tr>`;
    }).join("") || `<tr><td colspan="5" class="empty">Aucune cat\u00e9gorie pour cette p\u00e9riode.</td></tr>`;
    const detailRows = data.rows.map(row => {
      const details = row.description || row.reason || row.note || "\u2014";
      return `<tr><td>${esc(row.dateIso || iso(row.date))}</td><td>${esc(row.restaurant || "\u2014")}</td><td>${esc(row.type || "\u2014")}</td><td>${esc(row.client || "\u2014")}</td><td>${formatMoney(Number(row.amount) || 0)}</td><td>${esc(row.ticket || "\u2014")}</td><td>${esc(details)}</td></tr>`;
    }).join("") || `<tr><td colspan="7" class="empty">Aucune plainte pour cette s\u00e9lection.</td></tr>`;
    const weekRows = stats.sixWeekWindows.map((item, index) => `<tr><td>${index === 0 ? "P\u00e9riode actuelle" : "Semaine -" + index}</td><td>${iso(item.start)} au ${iso(item.end)}</td><td>${item.count}</td><td>${formatMoney(item.amount)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">Moyenne 6 semaines non disponible pour cette s\u00e9lection.</td></tr>`;
    const comparisonLabel = stats.previousRange ? stats.previousRange.label : "\u2014";
    const summary = complaintReportSummary(data, stats);
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport plaintes - ${esc(data.restaurantLabel)}</title>
<style>
  @page{size:A4;margin:13mm}
  *{box-sizing:border-box}
  body{margin:0;background:#eef2f7;color:#111827;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.45}
  .toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;gap:10px;padding:14px 24px;background:rgba(9,14,24,.92);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,.12)}
  .toolbar button{border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#182233;color:#fff;font-weight:800;padding:11px 15px;cursor:pointer}
  .toolbar button.primary{background:linear-gradient(135deg,#e21d2b,#b91525);border-color:#f45461;box-shadow:0 12px 28px rgba(225,29,43,.28)}
  .report{max-width:1180px;margin:0 auto;padding:28px}
  .hero{position:relative;overflow:hidden;border-radius:26px;padding:28px;background:radial-gradient(circle at 78% 12%,rgba(226,29,43,.38),transparent 34%),linear-gradient(135deg,#07101d 0%,#101827 58%,#250912 100%);color:#fff;box-shadow:0 28px 70px rgba(15,23,42,.22)}
  .brand{display:flex;align-items:center;gap:14px;margin-bottom:28px}
  .brand img{width:52px;height:52px;object-fit:contain;border-radius:14px;background:#fff;padding:6px}
  .brand strong{font-size:14px;letter-spacing:.12em;text-transform:uppercase}
  .brand span{display:block;color:#aeb8c9;font-size:12px;margin-top:2px}
  .hero h1{margin:0 0 8px;font-size:34px;letter-spacing:-.02em}
  .hero p{margin:0;color:#d6deec;font-size:15px}
  .context{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px}
  .context div,.kpi,.panel{background:#fff;border:1px solid #dbe2ec;border-radius:18px;box-shadow:0 16px 42px rgba(15,23,42,.08)}
  .context div{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.12);padding:14px;color:#fff;box-shadow:none}
  .eyebrow{display:block;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;font-size:11px;font-weight:900;margin-bottom:5px}
  .context strong{font-size:14px}
  .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin:18px 0}
  .kpi{padding:18px}
  .kpi strong{display:block;font-size:25px;letter-spacing:-.02em;margin-top:4px}
  .kpi small{display:block;color:#64748b;margin-top:6px;font-weight:700}
  .good{color:#16a34a!important}.bad{color:#dc2626!important}.neutral{color:#64748b!important}
  .grid{display:grid;grid-template-columns:1.05fr .95fr;gap:16px}
  .panel{padding:20px;margin-bottom:16px}
  .panel h2{margin:0 0 14px;font-size:18px;letter-spacing:-.01em}
  .summary{font-size:15px;color:#334155;background:linear-gradient(135deg,#f8fafc,#eef4ff);border:1px solid #dce6f5;border-radius:16px;padding:16px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{text-align:left;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-size:10px;border-bottom:1px solid #e2e8f0;padding:9px 8px}
  td{border-bottom:1px solid #eef2f7;padding:10px 8px;vertical-align:top}
  tr:last-child td{border-bottom:0}
  .bar{height:9px;border-radius:999px;background:#e7edf5;overflow:hidden;min-width:84px}
  .bar span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#ef4444,#f97316,#22c55e)}
  .bar.money span{background:linear-gradient(90deg,#2563eb,#06b6d4)}
  .empty{text-align:center;color:#64748b;font-weight:800;padding:22px!important}
  .details table{table-layout:fixed}
  .details th,.details td{white-space:normal;overflow-wrap:anywhere;word-break:break-word}
  .details td:last-child{max-width:460px;color:#334155;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
  .footer{color:#64748b;font-size:11px;text-align:center;margin:22px 0 8px}
  @media(max-width:820px){.report{padding:14px}.hero{padding:22px}.hero h1{font-size:26px}.context,.kpis,.grid{grid-template-columns:1fr}.toolbar{justify-content:stretch}.toolbar button{flex:1}.panel{overflow-x:auto}.details table{min-width:900px}}
  @media print{body{background:#fff}.toolbar{display:none}.report{max-width:none;padding:0}.hero,.kpi,.panel{box-shadow:none}.hero{border-radius:18px}.panel{break-inside:avoid}.details{break-inside:auto}.details tr{break-inside:avoid}}
</style>
</head>
<body>
<div class="toolbar"><button type="button" onclick="window.close()">Fermer</button><button class="primary" type="button" onclick="window.print()">Imprimer / Enregistrer PDF</button></div>
<main class="report">
  <section class="hero">
    <div class="brand"><img src="${logoUrl}" alt="Dashboard OPS"><div><strong>Dashboard OPS</strong><span>Rapport premium des plaintes</span></div></div>
    <h1>Rapport plaintes</h1>
    <p>Analyse des plaintes selon les filtres actifs de l'onglet Plaintes.</p>
    <div class="context">
      <div><span class="eyebrow">Restaurant</span><strong>${esc(data.restaurantLabel)}</strong></div>
      <div><span class="eyebrow">P\u00e9riode</span><strong>${esc(data.periodLabel)}</strong></div>
      <div><span class="eyebrow">Type</span><strong>${esc(data.typeLabel)}</strong></div>
      <div><span class="eyebrow">G\u00e9n\u00e9r\u00e9</span><strong>${esc(generated)}</strong></div>
    </div>
  </section>
  <section class="kpis">
    <div class="kpi"><span class="eyebrow">Plaintes</span><strong>${stats.currentCount}</strong><small>P\u00e9riode actuelle</small></div>
    <div class="kpi"><span class="eyebrow">Montant</span><strong>${formatMoney(stats.currentAmount)}</strong><small>Total plaintes</small></div>
    <div class="kpi"><span class="eyebrow">Variation plaintes</span><strong class="${deltaClass(stats.countVariation, true)}">${formatPercent(stats.countVariation)}</strong><small>vs ${esc(comparisonLabel)}</small></div>
    <div class="kpi"><span class="eyebrow">Variation montant</span><strong class="${deltaClass(stats.amountVariation, true)}">${formatPercent(stats.amountVariation)}</strong><small>vs p\u00e9riode pr\u00e9c\u00e9dente</small></div>
    <div class="kpi"><span class="eyebrow">Moyenne 6 semaines</span><strong>${formatNumber(stats.averageCount6, 1)}</strong><small>${formatMoney(stats.averageAmount6)}</small></div>
  </section>
  <section class="panel"><h2>R\u00e9sum\u00e9 ex\u00e9cutif</h2><div class="summary">${esc(summary)}</div></section>
  <section class="grid">
    <div class="panel"><h2>Plaintes par cat\u00e9gorie</h2><table><thead><tr><th>Cat\u00e9gorie</th><th>Nb</th><th>Montant</th><th>Volume</th><th>Co\u00fbt</th></tr></thead><tbody>${categoryRows}</tbody></table></div>
    <div>
      <div class="panel"><h2>Comparaison</h2><table><tbody>
        <tr><th>P\u00e9riode actuelle</th><td>${esc(data.periodLabel)}</td><td>${stats.currentCount}</td><td>${formatMoney(stats.currentAmount)}</td></tr>
        <tr><th>P\u00e9riode pr\u00e9c\u00e9dente</th><td>${esc(comparisonLabel)}</td><td>${formatNumber(stats.previousCount, 0)}</td><td>${formatMoney(stats.previousAmount)}</td></tr>
        <tr><th>\u00c9cart vs moyenne 6 sem.</th><td></td><td class="${deltaClass(stats.countGapVsAverage6, true)}">${formatNumber(stats.countGapVsAverage6, 1)}</td><td class="${deltaClass(stats.amountGapVsAverage6, true)}">${formatMoney(stats.amountGapVsAverage6)}</td></tr>
      </tbody></table></div>
      <div class="panel"><h2>Top cat\u00e9gories</h2><table><tbody>
        <tr><th>Plus fr\u00e9quente</th><td>${esc(stats.topCategory?.category || "\u2014")}</td><td>${stats.topCategory ? stats.topCategory.count : "\u2014"}</td></tr>
        <tr><th>Plus co\u00fbteuse</th><td>${esc(stats.costlyCategory?.category || "\u2014")}</td><td>${stats.costlyCategory ? formatMoney(stats.costlyCategory.amount) : "\u2014"}</td></tr>
      </tbody></table></div>
    </div>
  </section>
  <section class="panel"><h2>Historique 6 semaines</h2><table><thead><tr><th>Semaine</th><th>P\u00e9riode</th><th>Plaintes</th><th>Montant</th></tr></thead><tbody>${weekRows}</tbody></table></section>
  <section class="panel details"><h2>Liste d\u00e9taill\u00e9e des plaintes</h2><table><thead><tr><th>Date</th><th>Restaurant</th><th>Type</th><th>Client</th><th>Montant</th><th>Ticket</th><th>D\u00e9tail</th></tr></thead><tbody>${detailRows}</tbody></table></section>
  <div class="footer">Source : CSV live Plaintes Google Sheets | Lignes lues : ${data.importSummary.csvRowsRead} | Import\u00e9es : ${data.importSummary.imported} | Corrig\u00e9es : ${data.importSummary.corrected} | Rejet\u00e9es : ${data.importSummary.rejected}</div>
</main>
</body>
</html>`;
  }
  function exportComplaintReportPdf(){
    if(typeof window.exportPremiumPdfReport === "function"){
      return window.exportPremiumPdfReport("complaints");
    }
    const data = getComplaintReportData();
    const stats = calculateComplaintReportStats(data);
    const reportWindow = window.open("", "_blank");
    if(!reportWindow){
      alert("Le rapport n'a pas pu s'ouvrir. Autorise les popups pour Dashboard OPS, puis r\u00e9essaie.");
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(renderComplaintReportPdf(data, stats));
    reportWindow.document.close();
    reportWindow.focus();
  }
  function render(){
    window.COMPLAINTS = complaints;
    try{ COMPLAINTS = complaints; }catch(e){}
    const rows = selectedRows();
    const topRestaurant = countBy(rows, "restaurant")[0];
    const topType = countBy(rows, "type")[0];
    const totalAmount = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    if($("complaintsTotal")) $("complaintsTotal").textContent = String(rows.length);
    if($("complaintsTopRestaurant")) $("complaintsTopRestaurant").textContent = topRestaurant ? topRestaurant[0] : "-";
    if($("complaintsTopType")) $("complaintsTopType").textContent = topType ? topType[0] : "-";
    if($("complaintsOpen")) $("complaintsOpen").textContent = totalAmount.toFixed(2) + " $";
    const chart = $("complaintsTypeChart");
    if(chart){
      const counts = countBy(rows, "type");
      const max = counts[0]?.[1] || 1;
      chart.innerHTML = counts.map(([name, value]) => `<div class="complaintBarRow"><div class="complaintBarName" title="${esc(name)}">${esc(name)}</div><div class="complaintBarTrack"><div class="complaintBarFill" style="width:${Math.max(8, value / max * 100)}%"></div></div><div class="complaintBarValue">${value}</div></div>`).join("") || "<div class='alert'>Aucune plainte pour cette s\u00e9lection.</div>";
    }
    if($("complaintsOpsAnalysis")){
      $("complaintsOpsAnalysis").textContent = rows.length
        ? `S\u00e9lection: ${rows.length} plainte(s), ${totalAmount.toFixed(2)} $ en compensation. Type dominant: ${topType ? topType[0] : "-"}. Restaurant le plus touch\u00e9: ${topRestaurant ? topRestaurant[0] : "-"}.`
        : "Aucune plainte pour cette s\u00e9lection.";
    }
    const table = $("complaintsTable");
    if(table){
      table.innerHTML = rows.map((row, index) => `<tr><td><div class="complaintDate"><div class="day">${esc(row.dateIso)}</div><div class="time">${esc(row.date.toLocaleTimeString("fr-CA",{hour:"2-digit",minute:"2-digit"}))}</div></div></td><td>${esc(row.restaurant)}</td><td><span class="complaintTypeBadge">${esc(row.type)}</span></td><td>${esc(row.client || "-")}</td><td>${row.amount ? `<span class="complaintMoney">${Number(row.amount).toFixed(2)} $</span>` : "-"}</td><td><div class="complaintTicket">${esc(row.ticket || "-")}</div></td><td><button class="complaintDetailBtn" type="button" onclick="window.openComplaintFinalDetail(${index})">Voir d\u00e9tail</button></td></tr>`).join("") || '<tr><td colspan="7">Aucune plainte pour cette s\u00e9lection.</td></tr>';
    }
    if($("complaintsStatus")){
      const missingAssignedCsv = window.OPS_AUTH_REQUIRED && window.OPS_AUTH_READY && !getComplaintCsvUrl();
      $("complaintsStatus").textContent = missingAssignedCsv
        ? "Aucun lien CSV plaintes attribué à cet utilisateur."
        : `CSV live isol\u00e9 V31 | Lignes CSV lues : ${importLog.csvRowsRead} | Plaintes import\u00e9es : ${importLog.imported.length} | Corrig\u00e9es : ${importLog.corrected.length} | Rejet\u00e9es : ${importLog.rejected.length} | Affich\u00e9es : ${rows.length}`;
    }
  }
  async function sync(){
    if(syncPromise) return syncPromise;
    syncPromise = (async () => {
      if(window.OPS_AUTH_REQUIRED && !window.OPS_AUTH_READY){
        if($("complaintsStatus")) $("complaintsStatus").textContent = "Connexion requise avant synchronisation des plaintes.";
        return [];
      }
      const csvUrl = hydrateComplaintCsvConfig();
      if(!csvUrl){
        if($("complaintsStatus")) $("complaintsStatus").textContent = "Aucun lien CSV plaintes attribué à cet utilisateur.";
        complaints = [];
        window.COMPLAINTS = complaints;
        render();
        return [];
      }
      if($("complaintsStatus")) $("complaintsStatus").textContent = "Synchronisation finale des plaintes...";
      const response = await fetch(cacheBustUrl(csvUrl), {cache:"no-store"});
      if(!response.ok) throw new Error("CSV plaintes inaccessible");
      importLog = parseComplaints(await response.text());
      complaints = importLog.imported;
      window.COMPLAINTS = complaints;
      fillFilters();
      render();
      return complaints;
    })();
    try{
      return await syncPromise;
    }finally{
      syncPromise = null;
    }
  }
  function bind(){
    hydrateComplaintCsvConfig();
    window.syncComplaints = sync;
    window.renderComplaints = render;
    window.filteredComplaints = selectedRows;
    window.getComplaintReportData = getComplaintReportData;
    window.calculateComplaintReportStats = calculateComplaintReportStats;
    window.renderComplaintReportPdf = renderComplaintReportPdf;
    window.exportComplaintReportPdf = exportComplaintReportPdf;
    window.COMPLAINTS = complaints;
    ["btnComplaintsSync","btnSyncComplaintsConfig"].forEach(id => {
      const button = $(id);
      if(button) button.onclick = sync;
    });
    const apply = $("btnComplaintsApply");
    if(apply) apply.onclick = render;
    const pdf = $("btnComplaintPdf");
    if(pdf) pdf.onclick = exportComplaintReportPdf;
    const saveCsv = document.getElementById("btnSaveComplaintsCsv");
    if(saveCsv) saveCsv.onclick = saveComplaintCsvConfig;
    const configSync = document.getElementById("btnSyncComplaintsConfig");
    if(configSync) configSync.onclick = () => {
      saveComplaintCsvConfig();
      sync().catch(error => {
        console.error(error);
        const status = document.getElementById("complaintsStatus");
        if(status) status.textContent = "Erreur CSV plaintes : " + error.message;
      });
    };
    ["complaintRestaurant","complaintType","complaintQuickWeek","complaintDate","complaintEndDate"].forEach(id => {
      const field = $(id);
      if(field) field.onchange = render;
    });
  }
  function hardBind(){
    bind();
    if(hardBound) return;
    hardBound = true;
    document.addEventListener("change", event => {
      const id = event.target && event.target.id;
      if(["complaintRestaurant","complaintType","complaintQuickWeek","complaintDate","complaintEndDate","cfComplaintRestaurant","cfComplaintType","cfComplaintQuickWeek","cfComplaintDate","cfComplaintEndDate"].includes(id)){
        render();
      }
    }, true);
    document.addEventListener("click", event => {
      const id = event.target && event.target.id;
      if(id === "complaintDetailViewer"){
        window.closeComplaintDetail();
      }
      if(id === "btnComplaintsApply" || id === "cfBtnComplaintsApply"){
        event.preventDefault();
        render();
      }
      if(id === "btnComplaintsSync" || id === "cfBtnComplaintsSync"){
        event.preventDefault();
        sync().catch(error => {
          console.error(error);
          if($("complaintsStatus")) $("complaintsStatus").textContent = "Erreur CSV live isol\u00e9 V31 : " + error.message;
        });
      }
      if(id === "btnSaveComplaintsCsv"){
        event.preventDefault();
        event.stopImmediatePropagation();
        saveComplaintCsvConfig();
      }
      if(id === "btnSyncComplaintsConfig"){
        event.preventDefault();
        event.stopImmediatePropagation();
        saveComplaintCsvConfig();
        sync().catch(error => {
          console.error(error);
          const status = document.getElementById("complaintsStatus");
          if(status) status.textContent = "Erreur CSV plaintes : " + error.message;
        });
      }
      if(id === "btnComplaintPdf" || id === "cfBtnComplaintPdf"){
        event.preventDefault();
        event.stopImmediatePropagation();
        exportComplaintReportPdf();
      }
    }, true);
    document.addEventListener("keydown", event => {
      if(event.key === "Escape") window.closeComplaintDetail();
    });
  }
  window.openComplaintFinalDetail = function(index){
    const row = selectedRows()[index];
    const viewer = $("complaintDetailViewer");
    const content = $("complaintDetailContent");
    if(!row || !viewer || !content) return;
    const links = (row.links || []).map((link, number) => `<a href="${esc(link)}" target="_blank" rel="noopener">Lien ${number + 1}</a>`).join("");
    content.innerHTML = `<div class="complaintDetailGrid"><div class="complaintDetailItem"><strong>Date</strong>${esc(row.date.toLocaleString("fr-CA"))}</div><div class="complaintDetailItem"><strong>Restaurant</strong>${esc(row.restaurant)}</div><div class="complaintDetailItem"><strong>Type</strong>${esc(row.type)}</div><div class="complaintDetailItem"><strong>Client</strong>${esc(row.client || "-")}</div><div class="complaintDetailItem"><strong>Ticket</strong>${esc(row.ticket || "-")}</div><div class="complaintDetailItem"><strong>Valeur</strong>${Number(row.amount || 0).toFixed(2)} $</div></div><div class="complaintDescriptionBox">${esc(row.description || "Description non disponible")}</div><div class="complaintDetailLinks">${links}</div>`;
    viewer.classList.remove("hidden");
  };
  window.closeComplaintDetail = function(){
    const viewer = $("complaintDetailViewer");
    if(viewer) viewer.classList.add("hidden");
  };
  window.syncComplaintsFinal = sync;
  window.renderComplaintsFinal = render;
  window.parseComplaintsFinalCsv = parseComplaints;
  window.getComplaintCsvUrl = getComplaintCsvUrl;
  window.saveComplaintCsvConfig = saveComplaintCsvConfig;
  window.getComplaintReportData = getComplaintReportData;
  window.calculateComplaintReportStats = calculateComplaintReportStats;
  window.renderComplaintReportPdf = renderComplaintReportPdf;
  window.exportComplaintReportPdf = exportComplaintReportPdf;
  window.getAllComplaints = function(){ return complaints.slice(); };
  window.getComplaintImportSummary = function(){
    return {
      csvRowsRead: importLog.csvRowsRead,
      imported: importLog.imported.length,
      corrected: importLog.corrected.length,
      rejected: importLog.rejected.length
    };
  };
  let enforcing = false;
  function enforceFinalRender(){
    if(enforcing || !complaints.length) return;
    const expected = selectedRows().length;
    const totalText = $("complaintsTotal")?.textContent || "";
    const statusText = $("complaintsStatus")?.textContent || "";
    const current = Number(String(totalText).replace(/[^0-9.-]/g,""));
    if(current !== expected || !statusText.includes("V31")){
      enforcing = true;
      try{
        bind();
        render();
      }finally{
        enforcing = false;
      }
    }
  }
  window.enforceComplaintsFinalV31 = enforceFinalRender;

  document.addEventListener("DOMContentLoaded", () => {
    window.OPS_ARCHITECTURE_V40 = Object.assign({}, window.OPS_ARCHITECTURE_V40, {
      complaintsEngineReady: true,
      complaintsFallbackDisabled: true
    });
    try{
      localStorage.removeItem("dashboard_ops_complaints_cache");
    }catch(e){}
    buildIsolatedUi();
    hardBind();
    if(window.OPS_AUTH_REQUIRED){
      if($("complaintsStatus")) $("complaintsStatus").textContent = "Connexion requise avant synchronisation des plaintes.";
    }else{
      setTimeout(() => sync().catch(error => {
        console.error(error);
        if($("complaintsStatus")) $("complaintsStatus").textContent = "Erreur CSV live isol\u00e9 V31 : " + error.message;
      }), 300);
    }
    setTimeout(hardBind, 6500);
    setTimeout(() => { hardBind(); render(); }, 8500);
    const guard = setInterval(() => {
      hardBind();
      enforceFinalRender();
    }, 2000);
    setTimeout(() => clearInterval(guard), 30000);
    try{
      const observer = new MutationObserver(() => enforceFinalRender());
      ["complaintsTotal","complaintsTable","complaintsStatus"].forEach(id => {
        const target = $(id);
        if(target) observer.observe(target, {childList:true, subtree:true, characterData:true});
      });
    }catch(e){}
  });
})();
