(function(){
  "use strict";

  const CONFIG_URL = "tools-config.json";
  const RECENT_KEY = "dashboard_ops_recent_tools_v1";
  const LINK_OVERRIDES_KEY = "dashboard_ops_tool_link_overrides_v1";
  const CATEGORIES = ["Opérations", "Livraison", "Liens divers"];
  const FALLBACK_RESTAURANTS = [
    "Lévis","Beauport","Jonquière","Chicoutimi Nord","St-Nicolas","Dolbeau","Alma",
    "St-Augustin","Montmagny","Donnacona","Pont-Rouge","Chicoutimi Sud",
    "Saint-Raymond","Beauport Nord","La Pocatière","Roberval","St-Lambert"
  ];

  let config = {restaurants:FALLBACK_RESTAURANTS, tools:[]};
  let activeRestaurant = FALLBACK_RESTAURANTS[0];
  let searchTerm = "";
  let loadingPromise = null;
  let editingToolId = "";

  function $(id){ return document.getElementById(id); }
  function esc(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[char]));
  }
  function norm(value){
    return String(value || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g," ")
      .trim();
  }
  function slug(value){
    return norm(value).replace(/\s+/g, "-") || "tool";
  }
  function normalizeUrl(value){
    return String(value || "").trim();
  }
  function validUrl(value){
    try{
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    }catch(e){
      return false;
    }
  }
  function toolId(tool){
    return tool.id || slug(`${tool.category}-${tool.name}`);
  }
  function toolKey(tool){
    return toolId(tool);
  }
  function findConfigTool(id){
    const wanted = norm(id);
    return config.tools.find(tool => norm(toolId(tool)) === wanted) || null;
  }
  function findConfigToolForRecent(item){
    if(!item) return null;
    const direct = findConfigTool(item.id || item.key || "");
    if(direct) return direct;
    const keyParts = String(item.key || "").split("|").map(part => part.trim());
    const keyCategory = keyParts.length >= 3 ? keyParts[1] : "";
    const keyName = keyParts.length >= 3 ? keyParts[2] : "";
    const name = item.name || keyName;
    const category = item.category || keyCategory;
    const categoryMatch = config.tools.find(tool =>
      norm(tool.name) === norm(name) &&
      (!category || norm(tool.category) === norm(category))
    );
    if(categoryMatch) return categoryMatch;
    return config.tools.find(tool => norm(tool.name) === norm(name)) || null;
  }
  function readJsonStorage(key, fallback){
    try{
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" ? value : fallback;
    }catch(e){
      return fallback;
    }
  }
  function writeJsonStorage(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){}
  }
  function getOverrides(){
    return readJsonStorage(LINK_OVERRIDES_KEY, {});
  }
  function setRestaurantOverride(id, restaurant, url){
    const overrides = getOverrides();
    if(!overrides[id]) overrides[id] = {restaurants:{}};
    if(!overrides[id].restaurants) overrides[id].restaurants = {};
    overrides[id].restaurants[restaurant] = normalizeUrl(url);
    writeJsonStorage(LINK_OVERRIDES_KEY, overrides);
  }
  function localOverrideUrl(tool){
    const overrides = getOverrides()[toolId(tool)] || {};
    return normalizeUrl(overrides.restaurants?.[activeRestaurant] || overrides.global || "");
  }
  function resolveToolUrl(tool){
    const local = localOverrideUrl(tool);
    if(local) return local;
    const specific = tool.restaurantSpecificUrls?.[activeRestaurant] || "";
    return normalizeUrl(specific || tool.defaultUrl || tool.url || "");
  }
  function normalizeConfig(raw){
    const tools = Array.isArray(raw) ? raw : Array.isArray(raw?.tools) ? raw.tools : [];
    const restaurants = Array.isArray(raw?.restaurants) && raw.restaurants.length ? raw.restaurants : FALLBACK_RESTAURANTS;
    return {
      restaurants:[...new Set(restaurants.filter(Boolean))],
      tools:tools
        .filter(tool => tool && tool.name && tool.category)
        .map(tool => ({
          id: tool.id || slug(`${tool.category}-${tool.name}`),
          restaurant: tool.restaurant || "Tous",
          category: tool.category,
          name: tool.name,
          defaultUrl: normalizeUrl(tool.defaultUrl || tool.url || ""),
          restaurantSpecificUrls: tool.restaurantSpecificUrls && typeof tool.restaurantSpecificUrls === "object" ? tool.restaurantSpecificUrls : {},
          favorite: Boolean(tool.favorite),
          configurable: tool.configurable !== false,
          logoUrl: tool.logoUrl || "",
          logoText: tool.logoText || String(tool.name).slice(0,2).toUpperCase(),
          accent: tool.accent || "#e11d2e"
        }))
    };
  }
  async function loadToolsConfig(){
    if(loadingPromise) return loadingPromise;
    loadingPromise = fetch(CONFIG_URL + "?v=" + Date.now(), {cache:"no-store"})
      .then(response => {
        if(!response.ok) throw new Error("Configuration outils inaccessible");
        return response.json();
      })
      .then(raw => {
        config = normalizeConfig(raw);
        if(!config.restaurants.includes(activeRestaurant)) activeRestaurant = config.restaurants[0] || FALLBACK_RESTAURANTS[0];
        return config;
      })
      .catch(error => {
        console.error(error);
        config = normalizeConfig({restaurants:FALLBACK_RESTAURANTS, tools:[]});
        return config;
      });
    return loadingPromise;
  }
  function getRecent(){
    const items = readJsonStorage(RECENT_KEY, []);
    return Array.isArray(items) ? items : [];
  }
  function canonicalRecentTool(item){
    const canonical = findConfigToolForRecent(item);
    if(canonical){
      return {
        ...canonical,
        restaurant: item.restaurant || activeRestaurant,
        url: resolveToolUrl(canonical),
        localOverride: Boolean(localOverrideUrl(canonical)),
        usedAt: item.usedAt || 0
      };
    }
    const fallback = {
      id: item.id || slug(`${item.category || ""}-${item.name || ""}`),
      restaurant: item.restaurant || activeRestaurant,
      category: item.category || "Outils",
      name: item.name || "Outil",
      defaultUrl: normalizeUrl(item.url || ""),
      restaurantSpecificUrls: {},
      favorite: false,
      configurable: true,
      logoUrl: item.logoUrl || "",
      logoText: item.logoText || String(item.name || "OT").slice(0,2).toUpperCase(),
      accent: item.accent || "#e11d2e"
    };
    return {
      ...fallback,
      url: resolveToolUrl(fallback),
      usedAt: item.usedAt || 0
    };
  }
  function recentToolsForActiveRestaurant(){
    const seen = new Set();
    return getRecent()
      .map(canonicalRecentTool)
      .filter(tool => {
        const id = toolId(tool);
        if(seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0,4);
  }
  function saveRecent(tool){
    const url = resolveToolUrl(tool);
    if(!validUrl(url)) return;
    const item = {
      id: toolId(tool),
      key: toolKey(tool),
      name: tool.name,
      category: tool.category,
      restaurant: activeRestaurant,
      url,
      logoUrl: tool.logoUrl,
      logoText: tool.logoText,
      accent: tool.accent,
      configurable: tool.configurable,
      usedAt: Date.now()
    };
    const next = [item, ...getRecent().filter(entry => (entry.id || entry.key) !== item.id)].slice(0,8);
    writeJsonStorage(RECENT_KEY, next);
  }
  function toolsForActiveRestaurant(){
    const activeNorm = norm(activeRestaurant);
    const seen = new Set();
    const specific = [];
    const shared = [];
    config.tools.forEach(tool => {
      const restaurant = norm(tool.restaurant || "Tous");
      if(restaurant === activeNorm){
        specific.push(tool);
        seen.add(toolId(tool));
      }
    });
    config.tools.forEach(tool => {
      const restaurant = norm(tool.restaurant || "Tous");
      if((restaurant === "tous" || restaurant === "reseau complet" || restaurant === "default") && !seen.has(toolId(tool))){
        shared.push(tool);
      }
    });
    return [...specific, ...shared].map(tool => ({
      ...tool,
      url: resolveToolUrl(tool),
      localOverride: Boolean(localOverrideUrl(tool))
    }));
  }
  function getVisibleToolById(id){
    return toolsForActiveRestaurant().find(tool => toolId(tool) === id) ||
      findConfigTool(id) ||
      recentToolsForActiveRestaurant().find(tool => toolId(tool) === id) ||
      getRecent().map(canonicalRecentTool).find(tool => toolId(tool) === id);
  }
  function applySearch(tools){
    const needle = norm(searchTerm);
    if(!needle) return tools;
    return tools.filter(tool => norm(`${tool.name} ${tool.category} ${tool.restaurant}`).includes(needle));
  }
  function logoMarkup(tool){
    const text = esc(tool.logoText || tool.name.slice(0,2).toUpperCase());
    const style = `--tool-accent:${esc(tool.accent || "#e11d2e")}`;
    if(tool.logoUrl){
      return `<div class="toolLogo" style="${style}"><img src="${esc(tool.logoUrl)}" alt="${esc(tool.name)}" loading="lazy" onerror="this.closest('.toolLogo').classList.add('logoFailed');this.remove();"><span>${text}</span></div>`;
    }
    return `<div class="toolLogo logoFailed" style="${style}"><span>${text}</span></div>`;
  }
  function toolMenu(tool, enabled){
    if(!enabled) return "";
    const id = esc(toolId(tool));
    return `<div class="toolMenuWrap">
      <button class="toolMenuBtn" type="button" aria-label="Options ${esc(tool.name)}" data-tool-menu="${id}">⋮</button>
      <div class="toolMenu" role="menu">
        <button type="button" data-tool-edit="${id}">Modifier le lien</button>
      </div>
    </div>`;
  }
  function toolCard(tool, compact){
    const enabled = validUrl(tool.url);
    const id = esc(toolId(tool));
    const cardStyle = `--tool-card-accent:${esc(tool.accent || "#e11d2e")}`;
    const action = enabled
      ? `<a class="toolOpen" href="${esc(tool.url)}" target="_blank" rel="noopener" data-tool-open="${id}">Ouvrir</a>`
      : `<button class="toolOpen configure" type="button" data-tool-configure="${id}">Configurer</button>`;
    return `<article class="toolCard ${compact ? "compact" : ""} ${enabled ? "isActive" : "needsConfig"}" style="${cardStyle}" data-tool-card="${id}">
      ${toolMenu(tool, enabled)}
      <div class="toolCardTop">
        ${logoMarkup(tool)}
        <div>
          <h4>${esc(tool.name)}</h4>
          <p>${esc(tool.category)}</p>
        </div>
      </div>
      <div class="toolCardBottom">
        ${action}
      </div>
    </article>`;
  }
  function emptyState(text){
    return `<div class="toolsEmpty">${esc(text)}</div>`;
  }
  function renderRestaurantRail(){
    const rail = $("toolsRestaurantRail");
    if(!rail) return;
    rail.innerHTML = config.restaurants.map(name => {
      const active = name === activeRestaurant;
      return `<button class="toolRestaurantPill ${active ? "active" : ""}" type="button" data-tools-restaurant="${esc(name)}">${esc(name)}</button>`;
    }).join("");
  }
  function renderTools(){
    const allTools = applySearch(toolsForActiveRestaurant());
    const favorites = allTools.filter(tool => tool.favorite);
    const recents = recentToolsForActiveRestaurant();

    if($("toolsFavoriteCount")) $("toolsFavoriteCount").textContent = String(favorites.length);
    if($("toolsRecentCount")) $("toolsRecentCount").textContent = String(recents.length);
    if($("toolsFavorites")) $("toolsFavorites").innerHTML = favorites.map(tool => toolCard(tool, true)).join("") || emptyState("Aucun favori pour cette sélection.");
    if($("toolsRecent")) $("toolsRecent").innerHTML = recents.map(item => toolCard(item, true)).join("") || emptyState("Aucun outil récent.");

    const grid = $("toolsCategoryGrid");
    if(grid){
      grid.innerHTML = CATEGORIES.map(category => {
        const categoryTools = allTools.filter(tool => tool.category === category);
        return `<section class="toolsPanel toolCategoryPanel">
          <div class="toolsPanelHead"><h3>${esc(category)}</h3><span>${categoryTools.length}</span></div>
          <div class="toolsCards">${categoryTools.map(tool => toolCard(tool, false)).join("") || emptyState("Aucun outil dans cette catégorie.")}</div>
        </section>`;
      }).join("");
    }
  }
  function ensureToolsModal(){
    if($("toolsLinkModal")) return;
    document.body.insertAdjacentHTML("beforeend", `<div class="toolsModal hidden" id="toolsLinkModal" aria-hidden="true">
      <div class="toolsModalCard" role="dialog" aria-modal="true" aria-labelledby="toolsLinkModalTitle">
        <div class="toolsModalHead">
          <div>
            <span>Configuration locale</span>
            <h3 id="toolsLinkModalTitle">Configurer le lien</h3>
          </div>
          <button class="toolsModalClose" type="button" data-tools-modal-close aria-label="Fermer">×</button>
        </div>
        <p class="toolsModalHint" id="toolsLinkModalHint">Le lien sera sauvegardé localement pour le restaurant sélectionné.</p>
        <label class="toolsModalLabel" for="toolsLinkInput">Lien de l'outil</label>
        <input id="toolsLinkInput" type="url" inputmode="url" placeholder="https://...">
        <div class="toolsModalError" id="toolsLinkError"></div>
        <div class="toolsModalActions">
          <button class="toolsModalGhost" type="button" data-tools-modal-close>Annuler</button>
          <button class="toolsModalSave" type="button" id="toolsLinkSave">Sauvegarder</button>
        </div>
      </div>
    </div>`);
  }
  function openToolsModal(id){
    ensureToolsModal();
    const tool = getVisibleToolById(id);
    if(!tool) return;
    editingToolId = toolId(tool);
    const modal = $("toolsLinkModal");
    const title = $("toolsLinkModalTitle");
    const hint = $("toolsLinkModalHint");
    const input = $("toolsLinkInput");
    const error = $("toolsLinkError");
    if(title) title.textContent = validUrl(tool.url) ? `Modifier ${tool.name}` : `Configurer ${tool.name}`;
    if(hint) hint.textContent = `Sauvegarde locale pour ${activeRestaurant}. Ce lien remplacera le lien par défaut seulement pour ce restaurant.`;
    if(input){
      input.value = normalizeUrl(tool.url);
      setTimeout(() => input.focus(), 40);
    }
    if(error) error.textContent = "";
    if(modal){
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
    }
  }
  function closeToolsModal(){
    const modal = $("toolsLinkModal");
    if(modal){
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }
    editingToolId = "";
  }
  function saveToolsModalLink(){
    const input = $("toolsLinkInput");
    const error = $("toolsLinkError");
    const url = normalizeUrl(input?.value || "");
    if(!validUrl(url)){
      if(error) error.textContent = "Entre un lien valide qui commence par http:// ou https://.";
      return;
    }
    setRestaurantOverride(editingToolId, activeRestaurant, url);
    closeToolsModal();
    renderTools();
  }
  function closeToolMenus(exceptCard){
    document.querySelectorAll(".toolCard.menuOpen").forEach(card => {
      if(card !== exceptCard) card.classList.remove("menuOpen");
    });
  }
  function setLoading(isLoading){
    const hub = $("toolsHub");
    if(hub) hub.classList.toggle("is-loading", Boolean(isLoading));
  }
  async function renderToolsHub(){
    const hub = $("toolsHub");
    if(!hub) return;
    ensureToolsModal();
    setLoading(true);
    await loadToolsConfig();
    renderRestaurantRail();
    renderTools();
    setLoading(false);
  }
  function bindToolsHub(){
    ensureToolsModal();
    const search = $("toolsSearch");
    if(search && !search.dataset.toolsBound){
      search.dataset.toolsBound = "1";
      search.addEventListener("input", () => {
        searchTerm = search.value || "";
        renderTools();
      });
    }
    document.addEventListener("click", event => {
      const menuButton = event.target.closest?.("[data-tool-menu]");
      if(menuButton){
        event.preventDefault();
        event.stopPropagation();
        const card = menuButton.closest(".toolCard");
        const willOpen = !card?.classList.contains("menuOpen");
        closeToolMenus(card);
        if(card) card.classList.toggle("menuOpen", willOpen);
        return;
      }

      const edit = event.target.closest?.("[data-tool-edit]");
      if(edit){
        event.preventDefault();
        event.stopPropagation();
        closeToolMenus();
        openToolsModal(edit.getAttribute("data-tool-edit"));
        return;
      }

      const configure = event.target.closest?.("[data-tool-configure]");
      if(configure){
        event.preventDefault();
        event.stopPropagation();
        openToolsModal(configure.getAttribute("data-tool-configure"));
        return;
      }

      const save = event.target.closest?.("#toolsLinkSave");
      if(save){
        event.preventDefault();
        saveToolsModalLink();
        return;
      }

      if(event.target.closest?.("[data-tools-modal-close]") || event.target.id === "toolsLinkModal"){
        event.preventDefault();
        closeToolsModal();
        return;
      }

      const pill = event.target.closest?.("[data-tools-restaurant]");
      if(pill){
        activeRestaurant = pill.getAttribute("data-tools-restaurant") || activeRestaurant;
        const hub = $("toolsHub");
        if(hub){
          hub.classList.remove("toolsSwitching");
          requestAnimationFrame(() => hub.classList.add("toolsSwitching"));
          setTimeout(() => hub.classList.remove("toolsSwitching"), 420);
        }
        closeToolMenus();
        renderRestaurantRail();
        renderTools();
        return;
      }

      const open = event.target.closest?.("[data-tool-open]");
      if(open){
        const id = open.getAttribute("data-tool-open");
        const tool = getVisibleToolById(id);
        if(tool) saveRecent(tool);
        return;
      }

      closeToolMenus();
    }, true);

    document.addEventListener("keydown", event => {
      if(event.key === "Escape"){
        closeToolMenus();
        closeToolsModal();
      }
    });
  }

  window.renderToolsHub = renderToolsHub;
  window.getToolsConfig = () => config;
  window.getToolsLinkOverrides = getOverrides;

  document.addEventListener("DOMContentLoaded", () => {
    bindToolsHub();
    if(document.getElementById("page-tools")?.classList.contains("active")) renderToolsHub();
    else loadToolsConfig().then(() => {
      renderRestaurantRail();
      renderTools();
    });
  });
})();
