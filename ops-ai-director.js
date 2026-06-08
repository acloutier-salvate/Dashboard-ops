(function(){
  "use strict";

  const VERSION = "v509";
  const CSI_TARGET = 88;
  const DELAY_TARGET = 33.23;
  const DAY_NAMES = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];

  const norm = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const fixed = (value, decimals = 1) => {
    const n = num(value);
    return n == null ? "—" : n.toFixed(decimals).replace(".", ",");
  };
  const pct = (value, signed = true) => {
    const n = num(value);
    return n == null ? "—" : `${signed && n >= 0 ? "+" : ""}${fixed(n)} %`;
  };
  const pts = (value, suffix = " pts") => {
    const n = num(value);
    return n == null ? "—" : `${n >= 0 ? "+" : ""}${fixed(n)}${suffix}`;
  };
  const money = (value) => {
    const n = num(value);
    return n == null ? "—" : n.toLocaleString("fr-CA", { style:"currency", currency:"CAD", maximumFractionDigits:0 });
  };
  const amount = (value) => {
    const n = num(value);
    return n == null ? "—" : n.toLocaleString("fr-CA", { minimumFractionDigits:2, maximumFractionDigits:2 }) + " $";
  };
  const average = (values) => {
    const list = values.map(num).filter((value) => value != null);
    return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
  };
  const variation = (current, previous) => {
    const c = num(current);
    const p = num(previous);
    if(c == null || p == null) return null;
    if(p === 0) return c === 0 ? 0 : 100;
    return ((c - p) / Math.abs(p)) * 100;
  };
  const QUICK_MEMO_MS = 280;
  const analysisCache = new Map();

  function analysisStamp(scope){
    const value = (id) => document.getElementById(id)?.value || "";
    return [
      scope,
      Array.isArray(window.DATA) ? window.DATA.length : 0,
      Array.isArray(window.COMPLAINTS) ? window.COMPLAINTS.length : 0,
      value("dashWeek"),
      value("profileRestaurant") || value("restaurantSelect"),
      value("profileWeek") || value("restaurantWeek"),
      value("cfComplaintRestaurant") || value("complaintRestaurant"),
      value("cfComplaintType") || value("complaintType"),
      value("cfComplaintQuickWeek") || value("complaintQuickWeek"),
      document.getElementById("inventoryValueKpi")?.textContent?.trim() || ""
    ].join("|");
  }

  function memoizedAnalysis(scope, compute){
    const key = analysisStamp(scope);
    const now = Date.now();
    const cached = analysisCache.get(key);
    if(cached && now - cached.createdAt < QUICK_MEMO_MS) return cached.value;
    const value = compute();
    if(analysisCache.size > 28) analysisCache.clear();
    analysisCache.set(key, { createdAt:now, value });
    return value;
  }

  function calculate(name){
    if(typeof window[name] !== "function") return null;
    try{
      return window[name]();
    }catch(error){
      console.warn(`OPS AI Director ${name}`, error);
      return null;
    }
  }

  function complaintRows(){
    try{
      if(typeof window.getAllComplaints === "function"){
        const rows = window.getAllComplaints();
        if(Array.isArray(rows)) return rows.slice();
      }
    }catch(error){}
    return Array.isArray(window.COMPLAINTS) ? window.COMPLAINTS.slice() : [];
  }

  function activeComplaintRows(){
    const insights = calculate("calculateComplaintInsights");
    return Array.isArray(insights?.rows) ? insights.rows.slice() : [];
  }

  function complaintDate(row){
    if(row?.date instanceof Date && !Number.isNaN(row.date.getTime())) return row.date;
    const parsed = new Date(row?.dateIso || row?.date || row?.createdAt || "");
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function aggregate(rows, selector){
    const map = new Map();
    rows.forEach((row) => {
      const label = selector(row);
      if(!label) return;
      const item = map.get(label) || { label, count:0, amount:0 };
      item.count += 1;
      item.amount += num(row.amount) || 0;
      map.set(label, item);
    });
    return [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount || a.label.localeCompare(b.label, "fr"));
  }

  function complaintAnalysis(){
    return memoizedAnalysis("complaints", complaintAnalysisFresh);
  }

  function complaintAnalysisFresh(){
    const insights = calculate("calculateComplaintInsights");
    const rows = Array.isArray(insights?.rows) ? insights.rows.slice() : activeComplaintRows();
    const categories = aggregate(rows, (row) => row.type || "Non précisé");
    const days = aggregate(rows, (row) => {
      const date = complaintDate(row);
      return date ? DAY_NAMES[date.getDay()] : "";
    });
    const products = aggregate(rows, (row) => row.product || row.productName || row.item || row.produit || "");
    const inferredCategory = insights?.topCategory
      ? { label:insights.topCategory.name, count:insights.topCategory.count, amount:insights.topCategory.amount || 0 }
      : null;
    const topCategory = categories[0]?.label === "Non précisé" && inferredCategory ? inferredCategory : (categories[0] || inferredCategory);
    const topDay = days[0] || null;
    const topProduct = products[0] || null;
    return {
      rows,
      count:rows.length,
      total:rows.reduce((sum, row) => sum + (num(row.amount) || 0), 0) || num(insights?.amount) || 0,
      countVariation:num(insights?.countVariation),
      amountVariation:num(insights?.amountVariation),
      average6:num(insights?.avg6?.count),
      topCategory,
      topDay,
      topProduct,
      topCategoryShare:topCategory && rows.length ? topCategory.count / rows.length * 100 : null,
      topDayShare:topDay && rows.length ? topDay.count / rows.length * 100 : null,
      unusual:Boolean(insights?.avg6?.count != null && rows.length > Math.max(insights.avg6.count * 1.35, insights.avg6.count + 3))
    };
  }

  function inventoryAnalysis(){
    return memoizedAnalysis("inventory", inventoryAnalysisFresh);
  }

  function inventoryAnalysisFresh(){
    const value = document.getElementById("inventoryValueKpi")?.textContent?.trim() || "—";
    const alerts = [...document.querySelectorAll("#page-inventory .inventoryAlert")]
      .map((item) => ({
        title:item.querySelector("strong")?.textContent?.trim() || "",
        text:item.querySelector("p")?.textContent?.trim() || ""
      }))
      .filter((item) => item.title)
      .slice(0, 5);
    return { value, alerts, loaded:Boolean(document.getElementById("inventoryValueKpi")) };
  }

  function selectedOperationalRow(){
    const restaurant = document.getElementById("profileRestaurant")?.value || document.getElementById("restaurantSelect")?.value || "";
    const week = document.getElementById("profileWeek")?.value || document.getElementById("restaurantWeek")?.value || "";
    let rows = Array.isArray(window.DATA) ? window.DATA : [];
    try{
      if(Array.isArray(DATA)) rows = DATA;
    }catch(error){}
    const selected = rows.filter((row) => row.restaurant === restaurant && (!week || week === "latest" || row.week === week));
    return selected[selected.length - 1] || null;
  }

  function risk(level, code, title, observation, action, score){
    return { level, code, title, observation, action, score };
  }

  function opportunity(code, observation){
    return { code, observation };
  }

  function correlation(code, observation, action){
    return { code, observation, action };
  }

  function networkAnalysis(){
    return memoizedAnalysis("network", networkAnalysisFresh);
  }

  function networkAnalysisFresh(){
    const trends = calculate("calculateNetworkTrends");
    const complaints = complaintAnalysis();
    const current = trends?.current || {};
    const csi = num(current.csi);
    const delay = num(current.delay);
    const sales = num(current.sales);
    const csiGap = csi == null ? null : csi - CSI_TARGET;
    const delayGap = delay == null ? null : delay - DELAY_TARGET;
    const risks = [];
    const opportunities = [];
    const correlations = [];

    if(csiGap != null && csiGap < 0){
      risks.push(risk(csi < 84 ? "critical" : "attention", "csi_below_target", "CSI sous la cible", `Le CSI réseau est à ${fixed(csi)} %, soit ${pts(csiGap)} vs l'objectif de ${CSI_TARGET} %.`, "Prioriser les restaurants sous la cible et valider les irritants clients récurrents.", Math.abs(csiGap) * 10));
    }
    if(delayGap != null && delayGap > 0){
      risks.push(risk(delay > 40 ? "critical" : "attention", "delay_above_target", "Délai supérieur à la cible", `Le délai réseau est à ${fixed(delay)} min, soit ${pts(delayGap, " min")} vs la cible de ${fixed(DELAY_TARGET, 2)} min.`, "Identifier les périodes de pointe à vérifier sur le terrain.", delayGap * 4));
    }
    if(num(trends?.complaintVariation) > 0){
      risks.push(risk(trends.complaintVariation > 30 ? "critical" : "attention", "complaints_up", "Plaintes en hausse", `Le volume de plaintes augmente de ${pct(trends.complaintVariation)} vs la période précédente.`, complaints.topCategory ? `Vérifier en priorité la catégorie « ${complaints.topCategory.label} ».` : "Analyser les causes récurrentes.", Math.abs(trends.complaintVariation)));
    }
    if(num(trends?.salesVariation) < 0){
      risks.push(risk(trends.salesVariation < -10 ? "critical" : "attention", "sales_down", "Ventes en recul", `Les ventes réseau reculent de ${pct(trends.salesVariation)} vs la période précédente.`, "Comparer les restaurants en recul et valider les facteurs locaux.", Math.abs(trends.salesVariation)));
    }

    if(csiGap != null && csiGap >= 0) opportunities.push(opportunity("csi_target", `Le CSI réseau atteint ${fixed(csi)} %, soit ${pts(csiGap)} au-dessus de l'objectif.`));
    if(num(trends?.salesVariation) > 0) opportunities.push(opportunity("sales_up", `Les ventes progressent de ${pct(trends.salesVariation)} vs la période précédente.`));
    if(num(trends?.complaintVariation) < 0) opportunities.push(opportunity("complaints_down", `Les plaintes diminuent de ${pct(Math.abs(trends.complaintVariation), false)} vs la période précédente.`));
    if(delayGap != null && delayGap <= 0) opportunities.push(opportunity("delay_controlled", `Le délai réseau demeure sous la cible à ${fixed(delay)} min.`));

    if(delayGap != null && delayGap > 0 && (csiGap < 0 || num(trends?.csiVariation) < 0)){
      correlations.push(correlation("delay_csi", "Une corrélation probable est observée entre les délais élevés et la pression sur le CSI.", "Valider les opérations pendant les périodes de livraison plus lentes."));
    }
    if(num(trends?.complaintVariation) > 0 && (csiGap < 0 || num(trends?.csiVariation) < 0)){
      correlations.push(correlation("complaints_csi", "Une corrélation probable est observée entre la hausse des plaintes et la pression sur le CSI.", complaints.topCategory ? `Prioriser la cause « ${complaints.topCategory.label} ».` : "Analyser les causes dominantes."));
    }
    if(num(trends?.salesVariation) > 0 && delayGap != null && delayGap > 0){
      correlations.push(correlation("sales_delay", "La croissance des ventes semble exercer une pression sur les délais.", "Valider la capacité opérationnelle lors des périodes plus achalandées."));
    }
    if(num(trends?.salesVariation) > 0 && num(trends?.complaintVariation) > 0){
      correlations.push(correlation("sales_complaints", "Les plaintes augmentent pendant une période de croissance des ventes.", "Renforcer la vérification des commandes lorsque le volume augmente."));
    }

    risks.sort((a, b) => b.score - a.score);
    return {
      scope:"network",
      trends,
      complaints,
      inventory:inventoryAnalysis(),
      csi,
      csiGap,
      delay,
      delayGap,
      sales,
      risks,
      opportunities,
      correlations
    };
  }

  function restaurantAnalysis(){
    return memoizedAnalysis("restaurant", restaurantAnalysisFresh);
  }

  function restaurantAnalysisFresh(){
    const data = calculate("calculateRestaurantInsights");
    if(!data?.restaurant || !data.current) return null;
    const complaints = complaintAnalysis();
    const current = data.current;
    const csi = num(current.csi);
    const delay = num(current.delay);
    const csiGap = csi == null ? null : csi - CSI_TARGET;
    const delayGap = delay == null ? null : delay - DELAY_TARGET;
    const salesGrowth = num(data.salesGrowth);
    const risks = [];
    const opportunities = [];
    const correlations = [];

    if(csiGap != null && csiGap < 0) risks.push(risk(csi < 84 ? "critical" : "attention", "csi_below_target", "CSI sous la cible", `Le CSI de ${data.restaurant} est à ${fixed(csi)} %, soit ${pts(csiGap)} vs l'objectif.`, "Valider les irritants clients et les standards d'exécution.", Math.abs(csiGap) * 10));
    if(delayGap != null && delayGap > 0) risks.push(risk(delay > 40 ? "critical" : "attention", "delay_above_target", "Délai à surveiller", `Le délai est à ${fixed(delay)} min, soit ${pts(delayGap, " min")} vs la cible.`, "Revoir l'organisation des périodes plus lentes.", delayGap * 4));
    if(num(data.complaintDelta) > 0) risks.push(risk(data.complaintDelta > 30 ? "critical" : "attention", "complaints_up", "Plaintes en hausse", `Les plaintes augmentent de ${pct(data.complaintDelta)} vs la période précédente.`, complaints.topCategory ? `Vérifier la cause « ${complaints.topCategory.label} ».` : "Analyser les causes dominantes.", Math.abs(data.complaintDelta)));
    if(salesGrowth < 0) risks.push(risk(salesGrowth < -10 ? "critical" : "attention", "sales_down", "Diminution des ventes", `L'indicateur d'augmentation des ventes est à ${pct(salesGrowth)}.`, "Valider les facteurs locaux et les leviers de croissance.", Math.abs(salesGrowth)));

    if(csiGap != null && csiGap >= 0) opportunities.push(opportunity("csi_target", `Le CSI est au-dessus de la cible à ${fixed(csi)} %.`));
    if(salesGrowth > 0) opportunities.push(opportunity("sales_up", `L'augmentation des ventes est positive à ${pct(salesGrowth)}.`));
    if(num(data.complaintDelta) < 0) opportunities.push(opportunity("complaints_down", `Les plaintes diminuent de ${pct(Math.abs(data.complaintDelta), false)}.`));
    if(delayGap != null && delayGap <= 0) opportunities.push(opportunity("delay_controlled", `Le délai est sous la cible à ${fixed(delay)} min.`));

    if(delayGap != null && delayGap > 0 && csiGap != null && csiGap < 0) correlations.push(correlation("delay_csi", "Une corrélation probable est observée entre le délai au-dessus de la cible et le CSI sous l'objectif.", "Valider la livraison et l'exécution terrain."));
    if(num(data.complaintDelta) > 0 && csiGap != null && csiGap < 0) correlations.push(correlation("complaints_csi", "La hausse des plaintes semble contribuer à la pression sur le CSI.", complaints.topCategory ? `Prioriser la cause « ${complaints.topCategory.label} ».` : "Analyser les plaintes récurrentes."));
    if(salesGrowth > 0 && delayGap != null && delayGap > 0) correlations.push(correlation("sales_delay", "L'augmentation des ventes semble exercer une pression sur les délais.", "Ajuster les ressources pendant les pointes."));

    risks.sort((a, b) => b.score - a.score);
    return {
      scope:"restaurant",
      restaurant:data.restaurant,
      data,
      complaints,
      inventory:inventoryAnalysis(),
      row:selectedOperationalRow(),
      csi,
      csiGap,
      delay,
      delayGap,
      risks,
      opportunities,
      correlations
    };
  }

  function context(){
    return document.querySelector(".page.active")?.id === "page-restaurant"
      ? (restaurantAnalysis() || networkAnalysis())
      : networkAnalysis();
  }

  function executiveSummary(scope){
    const analysis = scope === "restaurant" ? (restaurantAnalysis() || networkAnalysis()) : networkAnalysis();
    const positive = analysis.opportunities.slice(0, 3).map((item) => item.observation);
    const watch = analysis.correlations.slice(0, 3).map((item) => item.observation);
    const action = analysis.risks.slice(0, 3).map((item) => `${item.title} : ${item.action}`);
    return {
      scope:analysis.scope,
      positive:positive.length ? positive : ["Aucune opportunité confirmée avec les données actuellement chargées."],
      watch:watch.length ? watch : ["Aucune corrélation préoccupante confirmée avec les données actuellement chargées."],
      action:action.length ? action : ["Maintenir les pratiques actuelles et poursuivre le suivi régulier."]
    };
  }

  function answerCsi(){
    const analysis = context();
    const label = analysis.scope === "restaurant" ? `CSI de ${analysis.restaurant}` : "CSI réseau";
    if(analysis.csi == null) return `${label} : donnée indisponible pour la période sélectionnée.`;
    const correlation = analysis.correlations.find((item) => item.code === "delay_csi" || item.code === "complaints_csi");
    const cause = correlation ? ` ${correlation.observation}` : "";
    const action = correlation ? ` Action recommandée : ${correlation.action}` : analysis.csiGap < 0 ? " Action recommandée : prioriser les irritants clients récurrents." : " Le résultat atteint la cible; maintenir les pratiques actuelles.";
    return `${label} : ${fixed(analysis.csi)} %. Écart vs objectif de ${CSI_TARGET} % : ${pts(analysis.csiGap)}.${cause}${action}`;
  }

  function answerComplaints(){
    const analysis = context();
    const data = analysis.complaints;
    if(!data.count) return "Aucune plainte n'est visible pour la sélection active.";
    const trend = data.countVariation == null ? "comparaison précédente indisponible" : `${pct(data.countVariation)} vs période précédente`;
    const category = data.topCategory ? ` Cause dominante : « ${data.topCategory.label} » avec ${data.topCategory.count} plainte(s), soit ${fixed(data.topCategoryShare)} % du total.` : "";
    const day = data.topDay ? ` Journée la plus représentée : ${data.topDay.label} (${fixed(data.topDayShare)} %).` : "";
    const action = data.topCategory ? ` Action recommandée : revoir le processus lié à « ${data.topCategory.label} ».` : "";
    return `Plaintes : ${data.count} pour ${amount(data.total)} de compensation; ${trend}.${category}${day}${action}`;
  }

  function answerDelay(){
    const analysis = context();
    const label = analysis.scope === "restaurant" ? `Délai de ${analysis.restaurant}` : "Délai réseau";
    if(analysis.delay == null) return `${label} : donnée indisponible pour la période sélectionnée.`;
    const status = analysis.delayGap > 0 ? "au-dessus" : "sous";
    const correlation = analysis.correlations.find((item) => item.code === "delay_csi" || item.code === "sales_delay");
    return `${label} : ${fixed(analysis.delay)} min, soit ${pts(analysis.delayGap, " min")} ${status} de la cible de ${fixed(DELAY_TARGET, 2)} min.${correlation ? ` ${correlation.observation} Action recommandée : ${correlation.action}` : ""}`;
  }

  function answerSales(){
    const analysis = context();
    const variationValue = analysis.scope === "restaurant" ? analysis.data.salesGrowth : analysis.trends?.salesVariation;
    const sales = analysis.scope === "restaurant" ? analysis.data.current.sales : analysis.sales;
    const label = analysis.scope === "restaurant" ? `Ventes de ${analysis.restaurant}` : "Ventes réseau";
    if(sales == null) return `${label} : donnée indisponible pour la période sélectionnée.`;
    const correlation = analysis.correlations.find((item) => item.code === "sales_delay" || item.code === "sales_complaints");
    return analysis.scope === "restaurant"
      ? `${label} : ${money(sales)}. Indicateur d'augmentation des ventes : ${pct(variationValue)}.${correlation ? ` ${correlation.observation}` : ""}`
      : `${label} : ${money(sales)}. Évolution : ${pct(variationValue)} vs période précédente.${correlation ? ` ${correlation.observation}` : ""}`;
  }

  function answerRisk(){
    const analysis = context();
    const riskItem = analysis.risks[0];
    if(!riskItem) return "Aucun risque opérationnel dominant n'est détecté avec les données actuellement chargées.";
    return `Risque ${riskItem.level === "critical" ? "critique" : "à surveiller"} : ${riskItem.observation} Action recommandée : ${riskItem.action}`;
  }

  function answerActions(){
    const analysis = context();
    const actions = analysis.risks.slice(0, 3).map((item) => item.action);
    if(!actions.length) return "Aucune intervention urgente n'est détectée. Recommandation : maintenir les pratiques actuelles et poursuivre le suivi des indicateurs.";
    return `Priorités recommandées : ${actions.map((item, index) => `${index + 1}. ${item}`).join("  ")}`;
  }

  function answerIntervention(){
    const analysis = networkAnalysis();
    const rows = analysis.trends?.notableDecline || [];
    if(!rows.length) return "Aucun restaurant ne présente une détérioration notable avec les données de la période sélectionnée.";
    return `Restaurants à vérifier en priorité : ${rows.slice(0, 3).map((row) => `${row.restaurant}${row.csiDelta != null ? ` (CSI ${pts(row.csiDelta)})` : ""}${row.delayDelta != null ? `, délais ${pts(row.delayDelta, " min")}` : ""}`).join(" ; ")}.`;
  }

  function answerProducts(){
    const data = complaintAnalysis();
    if(data.topProduct){
      return `Produit le plus souvent mentionné dans les données structurées : « ${data.topProduct.label} » avec ${data.topProduct.count} plainte(s).`;
    }
    const category = data.topCategory ? ` La cause dominante disponible est « ${data.topCategory.label} » (${data.topCategory.count} plainte(s)).` : "";
    return `Les plaintes chargées ne contiennent pas un champ produit structuré suffisamment fiable pour classer les produits sans risque d'erreur.${category}`;
  }

  function answerInventory(){
    const data = inventoryAnalysis();
    if(!data.loaded) return "Ouvre l'onglet Inventaire pour charger la lecture stock actuelle.";
    return `Valeur d'inventaire actuelle : ${data.value}.${data.alerts.length ? ` Points à surveiller : ${data.alerts.slice(0, 3).map((item) => item.title).join(" ; ")}.` : " Aucun signal de rupture n'est affiché."}`;
  }

  function answerFoodLabor(question){
    const row = selectedOperationalRow();
    const key = norm(question);
    if(!row) return "Sélectionne un restaurant pour analyser le Food Cost ou le Labor Cost.";
    if(key.includes("food") || key.includes("nourriture")){
      return row.foodCost == null ? `Food Cost de ${row.restaurant} : donnée indisponible.` : `Food Cost de ${row.restaurant} : ${fixed(row.foodCost)} %.`;
    }
    return row.laborCost == null ? `Labor Cost de ${row.restaurant} : donnée indisponible.` : `Labor Cost de ${row.restaurant} : ${fixed(row.laborCost)} %.`;
  }

  function answer(question){
    const key = norm(question);
    if(!key) return "Pose une question opérationnelle précise.";
    if(key.includes("resume") || key.includes("portrait") || key.includes("situation")) {
      const summary = executiveSummary(context().scope);
      return `Résumé exécutif. Ce qui va bien : ${summary.positive[0]} Ce qui doit être surveillé : ${summary.watch[0]} Priorité : ${summary.action[0]}`;
    }
    if(key.includes("correlation") || key.includes("lien entre")) {
      const correlations = context().correlations;
      return correlations.length ? `Corrélation probable : ${correlations[0].observation} Action recommandée : ${correlations[0].action}` : "Aucune corrélation suffisamment crédible n'est détectée avec les données actuellement chargées.";
    }
    if(key.includes("inventaire") || key.includes("stock") || key.includes("rupture")) return answerInventory();
    if(key.includes("food") || key.includes("nourriture") || key.includes("labor") || key.includes("salaire")) return answerFoodLabor(question);
    if(key.includes("produit")) return answerProducts();
    if(key.includes("action") || key.includes("recommand")) return answerActions();
    if(key.includes("restaurant") || key.includes("intervention")) return answerIntervention();
    if(key.includes("plainte") || key.includes("compensation")) return answerComplaints();
    if(key.includes("csi")) return answerCsi();
    if(key.includes("delai") || key.includes("livraison")) return answerDelay();
    if(key.includes("vente") || key.includes("volume")) return answerSales();
    if(key.includes("risque") || key.includes("probleme") || key.includes("priorite")) return answerRisk();
    return "Je n'ai pas identifié précisément le sujet. Je peux analyser le CSI, les plaintes, les délais, les ventes, l'inventaire, le Food Cost, le Labor Cost, les risques et les actions recommandées.";
  }

  window.OPS_AI_DIRECTOR = {
    version:VERSION,
    targets:{ csi:CSI_TARGET, delay:DELAY_TARGET },
    analyzeNetwork:networkAnalysis,
    analyzeRestaurant:restaurantAnalysis,
    analyzeComplaints:complaintAnalysis,
    analyzeInventory:inventoryAnalysis,
    executiveSummary,
    answer
  };
})();
