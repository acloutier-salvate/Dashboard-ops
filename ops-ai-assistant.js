(function(){
  "use strict";

  const VERSION = "v522";
  const CSI_TARGET = 88;
  const QUESTIONS = [
    "Que dois-je faire aujourd'hui ?",
    "Pourquoi mon CSI baisse ?",
    "Pourquoi les plaintes augmentent ?",
    "Quels restaurants nécessitent une intervention ?",
    "Quel est le principal risque opérationnel ?",
    "Quels produits génèrent le plus de plaintes ?",
    "Quelles actions recommandez-vous ?"
  ];

  const safe = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const norm = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const percent = (value) => Number.isFinite(Number(value))
    ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1).replace(".", ",")} %`
    : "—";
  const points = (value) => Number.isFinite(Number(value))
    ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1).replace(".", ",")} pts`
    : "—";
  const absolutePercent = (value) => Number.isFinite(Number(value))
    ? `${Math.abs(Number(value)).toFixed(1).replace(".", ",")} %`
    : "—";
  const absolutePoints = (value) => Number.isFinite(Number(value))
    ? `${Math.abs(Number(value)).toFixed(1).replace(".", ",")} pts`
    : "—";
  const money = (value) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString("fr-CA", { style:"currency", currency:"CAD", maximumFractionDigits:0 })
    : "—";
  const number = (value, decimals = 1) => Number.isFinite(Number(value))
    ? Number(value).toFixed(decimals).replace(".", ",")
    : "—";
  const minutes = (value) => Number.isFinite(Number(value))
    ? `${number(value)} min`
    : "—";

  function available(name){
    return typeof window[name] === "function";
  }

  function calculate(name){
    if(!available(name)) return null;
    try{
      return window[name]();
    }catch(error){
      console.warn(`OPS AI ${name}`, error);
      return null;
    }
  }

  function network(){
    return calculate("calculateNetworkTrends");
  }

  function complaints(){
    return calculate("calculateComplaintInsights");
  }

  function restaurant(){
    return calculate("calculateRestaurantInsights");
  }

  function dataPending(){
    return "Les données nécessaires ne sont pas encore disponibles. Synchronise les sources actives, puis repose la question.";
  }

  function restaurantLine(item){
    if(!item) return "";
    const parts = [];
    if(item.csiDelta != null) parts.push(`CSI ${points(item.csiDelta)}`);
    if(item.delayDelta != null) parts.push(`délais ${points(item.delayDelta).replace("pts", "min")}`);
    if(item.salesDelta != null) parts.push(`ventes ${percent(item.salesDelta)}`);
    return `${item.restaurant}${parts.length ? ` (${parts.join(", ")})` : ""}`;
  }

  function activeRestaurant(){
    if(document.querySelector(".page.active")?.id !== "page-restaurant") return null;
    const data = restaurant();
    return data?.restaurant && data?.current ? data : null;
  }

  function namedRestaurant(question, trends){
    const key = norm(question);
    return (trends?.current?.grouped || []).find((item) => key.includes(norm(item.restaurant))) || null;
  }

  function answerCsi(question){
    const activePage = document.querySelector(".page.active")?.id || "";
    if(activePage === "page-restaurant"){
      const data = restaurant();
      if(!data || !data.restaurant || !data.current) return dataPending();
      const gap = data.current.csi - CSI_TARGET;
      const support = [];
      if(Number(data.delayDelta) > 0) support.push(`les délais sont en hausse de ${points(data.delayDelta).replace("pts", "min")}`);
      if(Number(data.complaintDelta) > 0) support.push(`les plaintes augmentent de ${percent(data.complaintDelta)}`);
      const context = support.length ? ` Signal(s) à vérifier : ${support.join(" et ")}.` : "";
      return `CSI de ${data.restaurant} : ${number(data.current.csi)} %. Écart vs objectif de ${CSI_TARGET} % : ${points(gap)}.${context}`;
    }
    const data = network();
    if(!data) return dataPending();
    if(data.current?.csi == null) return "Le CSI réseau n'est pas encore disponible pour la période sélectionnée.";
    const named = namedRestaurant(question, data);
    if(named?.csi != null){
      return `CSI de ${named.restaurant} : ${number(named.csi)} %. Écart vs objectif de ${CSI_TARGET} % : ${points(named.csi - CSI_TARGET)}.`;
    }
    const gap = data.current.csi - CSI_TARGET;
    const belowTarget = (data.current.grouped || [])
      .filter((item) => item.csi != null && item.csi < CSI_TARGET)
      .sort((a, b) => a.csi - b.csi)
      .slice(0, 3)
      .map((item) => `${item.restaurant} (${number(item.csi)} %)`);
    const context = belowTarget.length ? ` Sous l'objectif : ${belowTarget.join(", ")}.` : " Aucun restaurant chargé n'est sous l'objectif.";
    return `CSI réseau : ${number(data.current.csi)} %. Écart vs objectif de ${CSI_TARGET} % : ${points(gap)}.${context}`;
  }

  function answerComplaints(question){
    const data = complaints();
    if(!data) return dataPending();
    if(!data.rows?.length) return "Aucune plainte n'est visible pour la sélection active. Il n'y a donc pas de hausse à expliquer sur cette période.";
    const key = norm(question);
    if(key.includes("combien") || key.includes("nombre") || key.includes("total")){
      return `Plaintes visibles pour la sélection active : ${data.rows.length}. Compensation totale : ${money(data.amount)}.`;
    }
    const trend = data.countVariation == null
      ? "La comparaison avec la période précédente n'est pas disponible."
      : `Le volume est ${data.countVariation > 0 ? "en hausse" : data.countVariation < 0 ? "en baisse" : "stable"} de ${absolutePercent(data.countVariation)} versus la période précédente.`;
    const category = data.topCategory
      ? ` La catégorie la plus fréquente est « ${data.topCategory.name} » avec ${data.topCategory.count} plainte(s).`
      : "";
    const amount = data.amountVariation == null
      ? ""
      : ` Les compensations évoluent de ${percent(data.amountVariation)}.`;
    return `${trend}${category}${amount}`;
  }

  function answerRestaurants(){
    const data = network();
    if(!data) return dataPending();
    const decline = data.notableDecline || [];
    if(!decline.length){
      return "Aucune détérioration notable n'est détectée avec les données de la période sélectionnée.";
    }
    return `Les restaurants à examiner en priorité sont : ${decline.map(restaurantLine).join(" ; ")}.`;
  }

  function answerRisk(){
    const trends = network();
    const complaintData = complaints();
    if(!trends) return dataPending();
    const risks = [];
    const csiGap = trends.current?.csi == null ? null : trends.current.csi - CSI_TARGET;
    if(csiGap != null && csiGap < 0) risks.push({ score:Math.abs(csiGap) * 8, text:`CSI réseau sous l'objectif de ${absolutePoints(csiGap)}` });
    if(trends.delayVariation != null && trends.delayVariation > 0) risks.push({ score:Math.abs(trends.delayVariation) * 3, text:`délais réseau en hausse de ${points(trends.delayVariation).replace("pts", "min")}` });
    if(trends.complaintVariation != null && trends.complaintVariation > 0) risks.push({ score:Math.abs(trends.complaintVariation), text:`plaintes en hausse de ${percent(trends.complaintVariation)}` });
    if(!risks.length) return "Aucun risque opérationnel dominant n'est détecté avec les données actuellement chargées.";
    risks.sort((a, b) => b.score - a.score);
    const restaurantRisk = trends.decline ? ` Le restaurant à vérifier en premier est ${restaurantLine(trends.decline)}.` : "";
    const category = complaintData?.topCategory ? ` Cause de plainte dominante : « ${complaintData.topCategory.name} ».` : "";
    return `Risque prioritaire : ${risks[0].text}.${restaurantRisk}${category}`;
  }

  function answerProducts(){
    const data = complaints();
    if(!data) return dataPending();
    const category = data.topCategory ? ` La catégorie actuellement la plus fréquente est « ${data.topCategory.name} ».` : "";
    return `Les données plaintes chargées ne contiennent pas un champ produit structuré suffisamment fiable pour classer les produits sans risque d'erreur.${category}`;
  }

  function answerActions(){
    const trends = network();
    const complaintData = complaints();
    if(!trends) return dataPending();
    const actions = [];
    const csiGap = trends.current?.csi == null ? null : trends.current.csi - CSI_TARGET;
    if(trends.decline) actions.push(`prioriser une revue terrain chez ${trends.decline.restaurant}`);
    if(trends.delayVariation != null && trends.delayVariation > 0) actions.push("vérifier les périodes où les délais dépassent la cible");
    if(complaintData?.topCategory) actions.push(`analyser les plaintes « ${complaintData.topCategory.name} » et leur traitement opérationnel`);
    if(csiGap != null && csiGap < 0) actions.push(`cibler les restaurants sous l'objectif CSI de ${CSI_TARGET} %`);
    if(!actions.length) return "Les indicateurs chargés ne montrent pas de détérioration notable. Maintiens le suivi régulier des KPI et des plaintes.";
    return `Actions recommandées : ${actions.slice(0, 3).map((item, index) => `${index + 1}. ${item}.`).join("  ")}`;
  }

  function answerRestaurantProblems(){
    const data = restaurant();
    if(!data || !data.restaurant) return "Sélectionne d'abord un restaurant dans la fiche santé opérationnelle.";
    if(!data.current) return `Aucune donnée opérationnelle n'est disponible pour ${data.restaurant} sur la période sélectionnée.`;
    const issues = [];
    if(data.current.csi != null && data.current.csi < CSI_TARGET) issues.push(`CSI sous l'objectif de ${absolutePoints(data.current.csi - CSI_TARGET)}`);
    if(data.delayDelta != null && data.delayDelta > 0) issues.push(`délais en hausse de ${points(data.delayDelta).replace("pts", "min")}`);
    if(data.complaintDelta != null && data.complaintDelta > 0) issues.push(`plaintes en hausse de ${percent(data.complaintDelta)}`);
    if(data.salesGrowth != null && data.salesGrowth < 0) issues.push(`augmentation ventes négative de ${absolutePercent(data.salesGrowth)}`);
    return issues.length
      ? `Pour ${data.restaurant}, les points à surveiller sont : ${issues.join(" ; ")}.`
      : `Aucune détérioration notable n'est détectée pour ${data.restaurant} sur la période sélectionnée.`;
  }

  function answerSales(){
    const scoped = activeRestaurant();
    if(scoped){
      return `Ventes de ${scoped.restaurant} : ${money(scoped.current.sales)}. Indicateur d'augmentation des ventes : ${percent(scoped.salesGrowth)}.`;
    }
    const data = network();
    return data ? `Ventes réseau : ${money(data.current?.sales)}. Évolution vs période précédente : ${percent(data.salesVariation)}.` : dataPending();
  }

  function answerDelay(){
    const scoped = activeRestaurant();
    if(scoped){
      return `Délai de ${scoped.restaurant} : ${minutes(scoped.current.delay)}. Évolution vs période précédente : ${points(scoped.delayDelta).replace("pts", "min")}.`;
    }
    const data = network();
    return data ? `Délai réseau : ${minutes(data.current?.delay)}. Évolution vs période précédente : ${points(data.delayVariation).replace("pts", "min")}.` : dataPending();
  }

  function answerInventory(){
    const value = document.getElementById("inventoryValueKpi")?.textContent?.trim();
    const alerts = [...document.querySelectorAll("#page-inventory .inventoryAlert strong")]
      .map((el) => el.textContent.trim())
      .filter(Boolean)
      .slice(0, 3);
    if(!value && !alerts.length) return "Ouvre l'onglet Inventaire pour charger la lecture stock actuelle.";
    return `Inventaire actuel : ${value || "—"}.${alerts.length ? ` Points à surveiller : ${alerts.join(" ; ")}.` : " Aucun signal de stock n'est affiché."}`;
  }

  function localAnswer(question){
    if(typeof window.OPS_AI_DIRECTOR?.answer === "function"){
      try{
        return window.OPS_AI_DIRECTOR.answer(question);
      }catch(error){
        console.warn("OPS AI Director answer", error);
      }
    }
    const key = norm(question);
    if(!key) return "Pose une question opérationnelle pour obtenir une lecture basée sur les données déjà chargées.";
    if(key.includes("que dois je faire") || key.includes("aujourdhui") || key.includes("aujourd hui")) return answerToday();
    if(key.includes("inventaire") || key.includes("stock") || key.includes("rupture")) return answerInventory();
    if(key.includes("produit")) return answerProducts();
    if(key.includes("action") || key.includes("recommand")) return answerActions();
    if(key.includes("restaurant") && (key.includes("probleme") || key.includes("principal"))) return answerRestaurantProblems();
    if(key.includes("restaurant") || key.includes("intervention")) return answerRestaurants();
    if(key.includes("plainte") || key.includes("compensation")) return answerComplaints(question);
    if(key.includes("csi")) return answerCsi(question);
    if(key.includes("risque") || key.includes("priorite")) return answerRisk();
    if(key.includes("vente")) {
      return answerSales();
    }
    if(key.includes("delai") || key.includes("livraison")) {
      return answerDelay();
    }
    return "Je n'ai pas identifié précisément le sujet demandé. Pose une question sur le CSI, les ventes, les délais, les plaintes, l'inventaire, un restaurant à surveiller ou une action recommandée.";
  }

  function answerToday(){
    const actions = [];
    try{
      const networkData = network();
      const complaintData = complaints();
      const restaurantData = restaurant();
      const grouped = networkData?.current?.grouped || [];
      const lowCsi = grouped.filter((item) => Number(item.csi) < CSI_TARGET).sort((a, b) => Number(a.csi) - Number(b.csi)).slice(0, 2);
      lowCsi.forEach((item) => actions.push(`Vérifier ${item.restaurant}: CSI ${number(item.csi)} %, sous l'objectif de ${CSI_TARGET} %. `));
      if(Number(networkData?.current?.delay) > 34) actions.push(`Surveiller les délais réseau: ${minutes(networkData.current.delay)} vs cible 34 min.`);
      if(Number(complaintData?.current?.count || complaintData?.totalComplaints) > 0) actions.push(`Revoir les plaintes principales: ${complaintData?.topCategory || complaintData?.dominantCategory || "cause dominante à confirmer"}.`);
      if(restaurantData?.restaurant && Number(restaurantData?.current?.delay) > 34) actions.push(`Prioriser ${restaurantData.restaurant}: délai au-dessus de la cible réseau.`);
    }catch(error){}
    if(!actions.length) actions.push("Commencer par vérifier CSI, plaintes, délais, dernier audit et dernier inventaire de la période active.");
    return `Top priorités du jour : ${actions.slice(0, 5).join(" ")}`;
  }

  async function answer(question){
    const local = localAnswer(question);
    if(window.OPS_AI_ACCESS?.answerWithPermissions){
      return window.OPS_AI_ACCESS.answerWithPermissions(question, local);
    }
    return local;
  }

  function addMessage(text, type){
    const box = document.getElementById("opsAiMessages");
    if(!box) return;
    const message = document.createElement("div");
    message.className = `opsAiMessage ${type || "assistant"}`;
    message.textContent = text;
    box.appendChild(message);
    box.scrollTop = box.scrollHeight;
    return message;
  }

  function submitQuestion(question){
    const clean = String(question || "").trim();
    if(!clean) return;
    addMessage(clean, "user");
    const pending = addMessage("Analyse en cours...", "assistant");
    answer(clean).then((response) => {
      if(pending) pending.textContent = response;
      else addMessage(response, "assistant");
      updateSourceIndicator();
    }).catch((error) => {
      console.warn("OPS AI answer", error);
      if(pending) pending.textContent = "Je ne peux pas compléter l'analyse pour le moment. Réessaie dans quelques instants.";
      window.OPS_AI_LAST_SOURCE = { provider:"fallback", label:"Source : Fallback", metadata:{ error:String(error?.message || error) } };
      updateSourceIndicator();
    });
  }

  function updateSourceIndicator(){
    const el = document.getElementById("opsAiSource");
    if(!el) return;
    const source = window.OPS_AI_LAST_SOURCE || {};
    const provider = source.provider || (window.OPS_AI_PROVIDER_READY ? "openai" : "fallback");
    el.textContent = source.label || (provider === "openai" ? "Source : OpenAI" : provider === "provider_error" ? "Source : Erreur provider" : "Source : Fallback");
    el.dataset.source = provider === "openai" ? "openai" : provider === "provider_error" ? "error" : "fallback";
  }

  function toggle(open){
    const panel = document.getElementById("opsAiPanel");
    const launcher = document.getElementById("opsAiLauncher");
    if(!panel || !launcher) return;
    const shouldOpen = open == null ? panel.hidden : Boolean(open);
    panel.hidden = !shouldOpen;
    launcher.setAttribute("aria-expanded", String(shouldOpen));
    if(shouldOpen) document.getElementById("opsAiInput")?.focus();
  }

  function render(){
    if(document.getElementById("opsAiAssistant")) return;
    const root = document.createElement("div");
    root.id = "opsAiAssistant";
    root.className = "opsAiAssistant";
    root.hidden = Boolean(window.OPS_AUTH_REQUIRED && !window.OPS_AUTH_READY);
    root.innerHTML = `
      <section class="opsAiPanel" id="opsAiPanel" hidden aria-labelledby="opsAiTitle">
        <header class="opsAiHead">
          <div>
            <span class="opsAiEyebrow">Analyse automatique</span>
            <h2 id="opsAiTitle">OPS AI</h2>
            <p>Directeur des opérations virtuel</p>
            <p class="opsAiSource" id="opsAiSource" data-source="pending">Source : En attente</p>
          </div>
          <button class="opsAiClose" id="opsAiClose" type="button" aria-label="Fermer">×</button>
        </header>
        <div class="opsAiMessages" id="opsAiMessages" aria-live="polite">
          <div class="opsAiMessage assistant">Je suis prêt. Pose une question sur les données opérationnelles déjà chargées.</div>
        </div>
        <div class="opsAiSuggestions">
          ${QUESTIONS.map((question) => `<button class="opsAiSuggestion" type="button" data-ops-ai-question="${safe(question)}">${safe(question)}</button>`).join("")}
        </div>
        <form class="opsAiForm" id="opsAiForm">
          <input class="opsAiInput" id="opsAiInput" type="text" autocomplete="off" placeholder="Posez une question à OPS AI">
          <button class="opsAiSend" type="submit">Envoyer</button>
        </form>
      </section>
      <button class="opsAiLauncher" id="opsAiLauncher" type="button" aria-expanded="false" aria-controls="opsAiPanel">OPS AI</button>`;
    document.body.appendChild(root);
    window.addEventListener("ops-auth-context", () => { root.hidden = false; });
    document.getElementById("opsAiLauncher").addEventListener("click", () => toggle());
    document.getElementById("opsAiClose").addEventListener("click", () => toggle(false));
    window.addEventListener("ops-ai-provider-ready", () => {
      if(!window.OPS_AI_LAST_SOURCE) window.OPS_AI_LAST_SOURCE = { provider:"openai", label:"Source : OpenAI", metadata:{ ready:true } };
      updateSourceIndicator();
    });
    if(window.OPS_AI_PROVIDER_READY){
      window.OPS_AI_LAST_SOURCE = { provider:"openai", label:"Source : OpenAI", metadata:{ ready:true } };
      updateSourceIndicator();
    }
    document.getElementById("opsAiForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.getElementById("opsAiInput");
      submitQuestion(input?.value);
      if(input) input.value = "";
    });
    root.addEventListener("click", (event) => {
      const suggestion = event.target.closest("[data-ops-ai-question]");
      if(suggestion) submitQuestion(suggestion.dataset.opsAiQuestion);
    });
    document.addEventListener("keydown", (event) => {
      if(event.key === "Escape") toggle(false);
    });
  }

  window.askOpsAi = answer;
  window.openOpsAiAssistant = () => toggle(true);
  window.OPS_AI_ASSISTANT_VERSION = VERSION;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", render, { once:true });
  }else{
    render();
  }
})();
