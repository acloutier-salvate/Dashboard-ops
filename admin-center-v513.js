(function(){
  "use strict";

  const CONFIG = Object.assign({
    supabaseUrl:"",
    supabaseAnonKey:"",
    superAdminEmail:"a.cloutier@salvatore.com"
  }, window.OPS_AUTH_CONFIG || {});

  const state = {
    data:null,
    activeTab:"users",
    loading:false,
    activityReady:true
  };

  const ROLE_OPTIONS = [
    { value:"super_admin", label:"Super Admin" },
    { value:"co", label:"CO" },
    { value:"franchise", label:"Franchisé" },
    { value:"manager", label:"Gérant" },
    { value:"user", label:"Employé" }
  ];

  const MODULES = [
    ["Dashboard","Centre de contrôle"],
    ["Restaurants","Fiche restaurant"],
    ["Inventaire","Inventaires et commandes"],
    ["Plaintes","Plaintes et compensations"],
    ["Audit","Audits"],
    ["Rapports","Rapports"],
    ["Calendrier","Calendrier OPS"],
    ["Admin","Administration"]
  ];

  const PERMISSIONS = {
    super_admin:["Dashboard","Restaurants","Inventaire","Plaintes","Audit","Rapports","Calendrier","Admin"],
    co:["Dashboard","Restaurants","Inventaire","Plaintes","Audit","Rapports","Calendrier"],
    franchise:["Dashboard","Restaurants","Inventaire","Plaintes","Audit","Rapports"],
    manager:["Inventaire","Plaintes","Audit"],
    user:["Dashboard","Plaintes"]
  };

  const $ = (id) => document.getElementById(id);
  const safe = (value) => String(value == null ? "" : value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
  const clean = (value) => String(value || "").trim();
  const lower = (value) => clean(value).toLowerCase();
  const formatDate = (value) => {
    if(!value) return "—";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("fr-CA", { day:"2-digit", month:"short", year:"numeric" });
  };
  const formatDateTime = (value) => {
    if(!value) return "—";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("fr-CA", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
  };

  function toast(message){
    if(typeof window.toast === "function"){
      try{ window.toast(message); return; }catch(error){}
    }
    console.log(message);
  }

  function createClient(){
    if(!window.supabase || !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) return null;
    return window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  }

  async function maybe(query){
    const { data, error } = await query;
    if(error) throw error;
    return data;
  }

  async function fetchActivity(client){
    try{
      const rows = await maybe(client.from("ops_activity_log").select("*").order("created_at", { ascending:false }).limit(250));
      state.activityReady = true;
      return rows || [];
    }catch(error){
      state.activityReady = false;
      return [];
    }
  }

  async function loadAdminData(){
    const client = createClient();
    if(!client) throw new Error("Supabase n'est pas disponible.");
    const [profiles, restaurants, assignments, sources, activity] = await Promise.all([
      maybe(client.from("profiles").select("*").order("email")),
      maybe(client.from("restaurants").select("id,name,active,created_at").order("name")),
      maybe(client.from("user_restaurants").select("user_id,restaurant_id")),
      maybe(client.from("user_sheet_sources").select("user_id,kpi_csv_url,complaints_csv_url,updated_at")),
      fetchActivity(client)
    ]);
    state.data = {
      profiles:profiles || [],
      restaurants:restaurants || [],
      assignments:assignments || [],
      sources:sources || [],
      activity:activity || []
    };
    return state.data;
  }

  function roleLabel(role){
    return ROLE_OPTIONS.find((item) => item.value === role)?.label || "Employé";
  }

  function roleClass(role){
    if(role === "super_admin") return "danger";
    if(role === "co") return "blue";
    if(role === "franchise") return "green";
    if(role === "manager") return "yellow";
    return "muted";
  }

  function profileName(profile){
    return clean(profile.full_name) || clean(profile.name) || clean(profile.email).split("@")[0] || "Utilisateur";
  }

  function profileStatus(profile){
    return clean(profile.status) || "active";
  }

  function profileLastLogin(profile){
    return profile.last_login_at || profile.last_sign_in_at || profile.updated_at || "";
  }

  function assignedRestaurantIds(userId){
    return new Set((state.data?.assignments || []).filter((row) => row.user_id === userId).map((row) => row.restaurant_id));
  }

  function assignedRestaurantNames(profile){
    const restaurants = state.data?.restaurants || [];
    if(profile.role === "super_admin") return ["Tous"];
    const ids = assignedRestaurantIds(profile.id);
    return restaurants.filter((restaurant) => ids.has(restaurant.id)).map((restaurant) => restaurant.name);
  }

  function sourceFor(userId){
    return (state.data?.sources || []).find((row) => row.user_id === userId) || {};
  }

  function userText(profile){
    return [
      profileName(profile),
      profile.email,
      roleLabel(profile.role),
      assignedRestaurantNames(profile).join(" ")
    ].join(" ").toLowerCase();
  }

  function statsHtml(data){
    const roleCount = (role) => data.profiles.filter((profile) => profile.role === role).length;
    const activeRestaurants = data.restaurants.filter((restaurant) => restaurant.active !== false).length;
    const stats = [
      ["Réseau","Pizza Salvatoré"],
      ["Utilisateurs", data.profiles.length],
      ["Super Admin", roleCount("super_admin")],
      ["CO", roleCount("co")],
      ["Franchisés", roleCount("franchise")],
      ["Gérants", roleCount("manager")],
      ["Employés", roleCount("user")],
      ["Restaurants actifs", activeRestaurants]
    ];
    return stats.map(([label,value]) => `
      <div class="opsAdminMetric">
        <span>${safe(label)}</span>
        <strong>${safe(value)}</strong>
      </div>`).join("");
  }

  function recentActivityHtml(data){
    const rows = data.activity.slice(0, 10);
    if(!state.activityReady){
      return `<div class="opsAdminEmpty">Journal d'activité prêt à activer. Exécute le SQL V5.13 pour enregistrer les actions réseau.</div>`;
    }
    if(!rows.length){
      return `<div class="opsAdminEmpty">Aucune activité récente pour le moment.</div>`;
    }
    return rows.map((row) => `
      <div class="opsAdminActivityMini">
        <strong>${safe(row.action || "Action")}</strong>
        <span>${safe(row.user_email || "Système")} · ${safe(row.restaurant_name || row.module || "Réseau")}</span>
        <em>${safe(formatDateTime(row.created_at))}</em>
      </div>`).join("");
  }

  function renderAdminHtml(data){
    return `
      <section class="opsAdminV513">
        <div class="opsAdminControlHero">
          <div class="opsAdminHeroCopy">
            <span class="opsAdminEyebrow">Centre de contrôle Admin</span>
            <h3>Administration réseau</h3>
            <p>Gère les utilisateurs, les rôles, les restaurants assignés et les actions importantes sans quitter l'onglet Admin.</p>
          </div>
          <div class="opsAdminMetrics">${statsHtml(data)}</div>
        </div>

        <div class="opsAdminRecentCard">
          <div class="opsAdminSectionHead">
            <div>
              <span class="opsAdminEyebrow">Activité récente</span>
              <h3>10 dernières actions</h3>
            </div>
            <button class="btn blue" id="opsAdminRefresh" type="button">Actualiser</button>
          </div>
          <div class="opsAdminRecentList">${recentActivityHtml(data)}</div>
        </div>

        <div class="opsAdminTabs" role="tablist" aria-label="Sections Admin">
          <button type="button" data-admin-center-tab="users" class="${state.activeTab === "users" ? "active" : ""}">Utilisateurs</button>
          <button type="button" data-admin-center-tab="permissions" class="${state.activeTab === "permissions" ? "active" : ""}">Permissions</button>
          <button type="button" data-admin-center-tab="activity" class="${state.activeTab === "activity" ? "active" : ""}">Activité</button>
        </div>

        <div class="opsAdminPanelWrap">
          <div data-admin-panel="users" class="${state.activeTab === "users" ? "active" : ""}">${usersPanelHtml(data)}</div>
          <div data-admin-panel="permissions" class="${state.activeTab === "permissions" ? "active" : ""}">${permissionsPanelHtml(data)}</div>
          <div data-admin-panel="activity" class="${state.activeTab === "activity" ? "active" : ""}">${activityPanelHtml(data)}</div>
        </div>
      </section>
      <div id="opsAdminModalRoot"></div>`;
  }

  function usersPanelHtml(data){
    const rows = data.profiles.map((profile) => {
      const restaurants = assignedRestaurantNames(profile);
      const status = profileStatus(profile);
      const deleteProtected = profile.id === window.OPS_AUTH_USER?.id || profile.role === "super_admin";
      return `
        <tr class="opsAdminUserRow" data-user-row="${safe(profile.id)}" data-role="${safe(profile.role || "user")}" data-status="${safe(status)}" data-user-text="${safe(userText(profile))}">
          <td>
            <strong>${safe(profileName(profile))}</strong>
            <span>${safe(profile.id)}</span>
          </td>
          <td>${safe(profile.email || "—")}</td>
          <td><mark class="opsAdminRole ${safe(roleClass(profile.role))}">${safe(roleLabel(profile.role))}</mark></td>
          <td>${safe(restaurants.length ? restaurants.join(", ") : "Aucun")}</td>
          <td>${safe(formatDateTime(profileLastLogin(profile)))}</td>
          <td><mark class="opsAdminStatus ${status === "inactive" ? "off" : "on"}">${status === "inactive" ? "Désactivé" : "Actif"}</mark></td>
          <td>
            <div class="opsAdminActions">
              <button type="button" data-admin-user-action="edit" data-user-id="${safe(profile.id)}">Modifier</button>
              <button type="button" data-admin-user-action="restaurants" data-user-id="${safe(profile.id)}">Restaurants</button>
              <button type="button" data-admin-user-action="reset" data-user-id="${safe(profile.id)}">Réinitialiser</button>
              <button type="button" data-admin-user-action="toggle" data-user-id="${safe(profile.id)}">${status === "inactive" ? "Réactiver" : "Désactiver"}</button>
              <button type="button" data-admin-user-action="delete" data-user-id="${safe(profile.id)}" ${deleteProtected ? "disabled" : ""}>Supprimer</button>
            </div>
          </td>
        </tr>`;
    }).join("");

    return `
      <div class="opsAdminSectionHead">
        <div>
          <span class="opsAdminEyebrow">Utilisateurs</span>
          <h3>Gestion des accès</h3>
          <p>Recherche, modifie les rôles, attribue les restaurants et gère les comptes.</p>
        </div>
        <button class="btn red" id="opsAdminOpenCreateUser" type="button">Ajouter un utilisateur</button>
      </div>
      <div class="opsAdminFilters">
        <input id="opsAdminUserSearch" type="search" placeholder="Rechercher par nom, courriel ou restaurant">
        <select id="opsAdminRoleFilter">
          <option value="all">Tous</option>
          ${ROLE_OPTIONS.map((role) => `<option value="${safe(role.value)}">${safe(role.label)}</option>`).join("")}
        </select>
      </div>
      <div class="opsAdminTableShell">
        <table class="opsAdminTable">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Courriel</th>
              <th>Rôle</th>
              <th>Restaurants assignés</th>
              <th>Dernière connexion</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="7">Aucun utilisateur.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function permissionsPanelHtml(data){
    const userOptions = data.profiles.map((profile) => `<option value="${safe(profile.id)}">${safe(profileName(profile))} · ${safe(profile.email || "")}</option>`).join("");
    return `
      <div class="opsAdminPermissionsGrid">
        <div class="opsAdminMatrixCard">
          <div class="opsAdminSectionHead">
            <div>
              <span class="opsAdminEyebrow">Permissions</span>
              <h3>Matrice des rôles</h3>
              <p>Vue simple des accès par rôle.</p>
            </div>
          </div>
          <div class="opsAdminTableShell">
            <table class="opsAdminTable opsAdminMatrix">
              <thead>
                <tr>
                  <th>Module</th>
                  ${ROLE_OPTIONS.map((role) => `<th>${safe(role.label)}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${MODULES.map(([key,label]) => `
                  <tr>
                    <td><strong>${safe(label)}</strong></td>
                    ${ROLE_OPTIONS.map((role) => `<td>${PERMISSIONS[role.value]?.includes(key) ? "✅ Autorisé" : "❌ Refusé"}</td>`).join("")}
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
        <div class="opsAdminAssignCard">
          <span class="opsAdminEyebrow">Restaurants assignés</span>
          <h3>Affectation multiple</h3>
          <p>Sélectionne un utilisateur, coche ses restaurants, puis sauvegarde.</p>
          <select id="opsAdminPermissionUserSelect">${userOptions || `<option value="">Aucun utilisateur</option>`}</select>
          <div id="opsAdminPermissionRestaurantGrid" class="opsAdminRestaurantGrid"></div>
          <button type="button" class="btn red" id="opsAdminSavePermissionAssignments">Sauvegarder les accès</button>
        </div>
      </div>`;
  }

  function activityPanelHtml(data){
    const userOptions = data.profiles.map((profile) => `<option value="${safe(profile.email || profile.id)}">${safe(profileName(profile))}</option>`).join("");
    const restaurantOptions = data.restaurants.map((restaurant) => `<option value="${safe(restaurant.name)}">${safe(restaurant.name)}</option>`).join("");
    const rows = (data.activity || []).map((row) => `
      <tr class="opsAdminActivityRow" data-activity-text="${safe([row.user_email,row.action,row.module,row.restaurant_name,formatDate(row.created_at)].join(" ").toLowerCase())}">
        <td>${safe(formatDate(row.created_at))}</td>
        <td>${safe(formatDateTime(row.created_at)).split(" ").slice(-1)[0] || "—"}</td>
        <td>${safe(row.user_email || "Système")}</td>
        <td>${safe(row.action || "Action")}</td>
        <td>${safe(row.restaurant_name || "Réseau")}</td>
        <td>${safe(row.module || "Admin")}</td>
      </tr>`).join("");
    return `
      <div class="opsAdminSectionHead">
        <div>
          <span class="opsAdminEyebrow">Activité</span>
          <h3>Journal réseau</h3>
          <p>Connexion, modifications, inventaires, commandes et actions importantes.</p>
        </div>
      </div>
      <div class="opsAdminFilters">
        <input id="opsAdminActivitySearch" type="search" placeholder="Rechercher une action">
        <select id="opsAdminActivityUser"><option value="all">Tous les utilisateurs</option>${userOptions}</select>
        <select id="opsAdminActivityRestaurant"><option value="all">Tous les restaurants</option>${restaurantOptions}</select>
        <input id="opsAdminActivityDate" type="date">
      </div>
      ${state.activityReady ? "" : `<div class="opsAdminNotice">Le journal complet sera actif après l'exécution du SQL V5.13.</div>`}
      <div class="opsAdminTableShell">
        <table class="opsAdminTable">
          <thead>
            <tr><th>Date</th><th>Heure</th><th>Utilisateur</th><th>Action</th><th>Restaurant</th><th>Module</th></tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6">Aucune activité enregistrée.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function bindAdminCenter(){
    $("opsAdminRefresh")?.addEventListener("click", () => render(true));
    $("opsAdminOpenCreateUser")?.addEventListener("click", () => openUserModal("create"));
    document.querySelectorAll("[data-admin-center-tab]").forEach((button) => {
      button.addEventListener("click", () => setSection(button.dataset.adminCenterTab));
    });
    document.querySelectorAll("[data-admin-user-action]").forEach((button) => {
      button.addEventListener("click", () => handleUserAction(button.dataset.adminUserAction, button.dataset.userId));
    });
    $("opsAdminUserSearch")?.addEventListener("input", filterUsers);
    $("opsAdminRoleFilter")?.addEventListener("change", filterUsers);
    $("opsAdminActivitySearch")?.addEventListener("input", filterActivity);
    $("opsAdminActivityUser")?.addEventListener("change", filterActivity);
    $("opsAdminActivityRestaurant")?.addEventListener("change", filterActivity);
    $("opsAdminActivityDate")?.addEventListener("change", filterActivity);
    $("opsAdminPermissionUserSelect")?.addEventListener("change", renderPermissionRestaurantGrid);
    $("opsAdminSavePermissionAssignments")?.addEventListener("click", savePermissionAssignments);
    renderPermissionRestaurantGrid();
    filterUsers();
    filterActivity();
  }

  function setSection(section){
    state.activeTab = ["users","permissions","activity"].includes(section) ? section : "users";
    document.querySelectorAll("[data-admin-center-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.adminCenterTab === state.activeTab);
    });
    document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.adminPanel === state.activeTab);
    });
  }

  function filterUsers(){
    const search = lower($("opsAdminUserSearch")?.value);
    const role = $("opsAdminRoleFilter")?.value || "all";
    document.querySelectorAll(".opsAdminUserRow").forEach((row) => {
      const matchSearch = !search || row.dataset.userText.includes(search);
      const matchRole = role === "all" || row.dataset.role === role;
      row.classList.toggle("hidden", !(matchSearch && matchRole));
    });
  }

  function filterActivity(){
    const search = lower($("opsAdminActivitySearch")?.value);
    const user = $("opsAdminActivityUser")?.value || "all";
    const restaurant = $("opsAdminActivityRestaurant")?.value || "all";
    const date = $("opsAdminActivityDate")?.value || "";
    document.querySelectorAll(".opsAdminActivityRow").forEach((row) => {
      const text = row.dataset.activityText || "";
      const matchSearch = !search || text.includes(search);
      const matchUser = user === "all" || text.includes(lower(user));
      const matchRestaurant = restaurant === "all" || text.includes(lower(restaurant));
      const matchDate = !date || text.includes(date);
      row.classList.toggle("hidden", !(matchSearch && matchUser && matchRestaurant && matchDate));
    });
  }

  function renderPermissionRestaurantGrid(){
    const userId = $("opsAdminPermissionUserSelect")?.value;
    const grid = $("opsAdminPermissionRestaurantGrid");
    if(!grid || !state.data) return;
    const assigned = assignedRestaurantIds(userId);
    grid.innerHTML = state.data.restaurants.map((restaurant) => `
      <label>
        <input type="checkbox" value="${safe(restaurant.id)}" ${assigned.has(restaurant.id) ? "checked" : ""}>
        <span>${safe(restaurant.name)}</span>
      </label>`).join("");
  }

  async function savePermissionAssignments(){
    const userId = $("opsAdminPermissionUserSelect")?.value;
    if(!userId) return toast("Sélectionne un utilisateur.");
    const ids = [...document.querySelectorAll("#opsAdminPermissionRestaurantGrid input:checked")].map((input) => input.value);
    await saveAssignments(userId, ids);
    await recordActivity({ action:"Restaurants assignés modifiés", module:"Admin", metadata:{ user_id:userId, count:ids.length } });
    toast("Accès restaurants sauvegardés");
    await render(true);
    setSection("permissions");
  }

  function handleUserAction(action, userId){
    if(action === "edit" || action === "restaurants") return openUserModal("edit", userId, action);
    if(action === "reset") return openResetModal(userId);
    if(action === "toggle") return openToggleModal(userId);
    if(action === "delete") return openDeleteModal(userId);
  }

  function roleOptionsHtml(selected){
    return ROLE_OPTIONS.map((role) => `<option value="${safe(role.value)}" ${role.value === selected ? "selected" : ""}>${safe(role.label)}</option>`).join("");
  }

  function restaurantChecksHtml(userId){
    const assigned = userId ? assignedRestaurantIds(userId) : new Set();
    return (state.data?.restaurants || []).map((restaurant) => `
      <label>
        <input type="checkbox" value="${safe(restaurant.id)}" ${assigned.has(restaurant.id) ? "checked" : ""}>
        <span>${safe(restaurant.name)}</span>
      </label>`).join("");
  }

  function openUserModal(mode, userId){
    const profile = mode === "create" ? {} : state.data.profiles.find((row) => row.id === userId);
    if(mode !== "create" && !profile) return toast("Utilisateur introuvable");
    const source = profile?.id ? sourceFor(profile.id) : {};
    const title = mode === "create" ? "Ajouter un utilisateur" : "Modifier l'utilisateur";
    openModal(`
      <div class="opsAdminModalCard wide">
        <div class="opsAdminModalHead">
          <div>
            <span class="opsAdminEyebrow">Admin</span>
            <h3>${safe(title)}</h3>
          </div>
          <button type="button" data-admin-modal-close>Fermer</button>
        </div>
        ${mode === "create" ? `
          <div class="opsAdminCreateRoleNotice">
            <strong>Rôle du nouvel utilisateur</strong>
            <span>Choisis son rôle tout de suite. Ce rôle détermine les accès disponibles dans le logiciel.</span>
          </div>` : ""}
        <div class="opsAdminModalGrid">
          <label>Nom complet
            <input id="opsAdminModalName" value="${safe(profileName(profile) === "Utilisateur" ? "" : profileName(profile))}" placeholder="Nom complet">
          </label>
          <label>Courriel
            <input id="opsAdminModalEmail" type="email" value="${safe(profile.email || "")}" ${mode === "create" ? "" : "readonly"}>
          </label>
          <label>${mode === "create" ? "Rôle à attribuer" : "Rôle"}
            <select id="opsAdminModalRole">${roleOptionsHtml(profile.role || "user")}</select>
          </label>
          ${mode === "create" ? `<label>Mot de passe temporaire<input id="opsAdminModalPassword" type="password" autocomplete="new-password" placeholder="Minimum 8 caractères"></label>` : ""}
          <label>Statut
            <select id="opsAdminModalStatus">
              <option value="active" ${profileStatus(profile) !== "inactive" ? "selected" : ""}>Actif</option>
              <option value="inactive" ${profileStatus(profile) === "inactive" ? "selected" : ""}>Désactivé</option>
            </select>
          </label>
        </div>
        <div class="opsAdminModalColumns">
          <div>
            <h4>Restaurants assignés</h4>
            <div class="opsAdminRestaurantGrid" id="opsAdminModalRestaurants">${restaurantChecksHtml(profile.id)}</div>
          </div>
          <div>
            <h4>Sources CSV</h4>
            <label>Lien KPI CSV<textarea id="opsAdminModalKpi">${safe(source.kpi_csv_url || "")}</textarea></label>
            <label>Lien plaintes CSV<textarea id="opsAdminModalComplaints">${safe(source.complaints_csv_url || "")}</textarea></label>
          </div>
        </div>
        <div class="opsAdminModalActions">
          <button type="button" class="btn" data-admin-modal-close>Annuler</button>
          <button type="button" class="btn red" id="opsAdminModalSaveUser">${mode === "create" ? "Créer l'utilisateur" : "Sauvegarder"}</button>
        </div>
      </div>`);
    $("opsAdminModalSaveUser")?.addEventListener("click", () => {
      if(mode === "create") createUserFromModal();
      else saveUserFromModal(profile.id);
    });
  }

  function openResetModal(userId){
    const profile = state.data.profiles.find((row) => row.id === userId);
    if(!profile) return toast("Utilisateur introuvable");
    openConfirmModal({
      title:"Réinitialiser le mot de passe",
      body:`Envoyer un lien de réinitialisation à ${profile.email || "cet utilisateur"} ?`,
      action:"Envoyer le lien",
      onConfirm:() => resetUserPassword(profile)
    });
  }

  function openToggleModal(userId){
    const profile = state.data.profiles.find((row) => row.id === userId);
    if(!profile) return toast("Utilisateur introuvable");
    const inactive = profileStatus(profile) === "inactive";
    openConfirmModal({
      title:inactive ? "Réactiver l'utilisateur" : "Désactiver l'utilisateur",
      body:`${inactive ? "Réactiver" : "Désactiver"} ${profile.email || "cet utilisateur"} ?`,
      action:inactive ? "Réactiver" : "Désactiver",
      onConfirm:() => toggleUserStatus(profile)
    });
  }

  function openDeleteModal(userId){
    const profile = state.data.profiles.find((row) => row.id === userId);
    if(!profile) return toast("Utilisateur introuvable");
    if(profile.id === window.OPS_AUTH_USER?.id || profile.role === "super_admin") return toast("Ce compte est protégé.");
    openConfirmModal({
      title:"Supprimer l'utilisateur",
      body:`Supprimer définitivement ${profile.email || "cet utilisateur"} ?`,
      action:"Supprimer",
      onConfirm:() => deleteUser(profile)
    });
  }

  function openConfirmModal({ title, body, action, onConfirm }){
    openModal(`
      <div class="opsAdminModalCard">
        <div class="opsAdminModalHead">
          <h3>${safe(title)}</h3>
          <button type="button" data-admin-modal-close>Fermer</button>
        </div>
        <p>${safe(body)}</p>
        <div class="opsAdminModalActions">
          <button type="button" class="btn" data-admin-modal-close>Annuler</button>
          <button type="button" class="btn red" id="opsAdminModalConfirm">${safe(action)}</button>
        </div>
      </div>`);
    $("opsAdminModalConfirm")?.addEventListener("click", async () => {
      await onConfirm();
      closeModal();
    });
  }

  function openModal(html){
    let root = $("opsAdminModalRoot");
    if(!root){
      root = document.createElement("div");
      root.id = "opsAdminModalRoot";
      document.body.appendChild(root);
    }
    root.innerHTML = `<div class="opsAdminModalBackdrop">${html}</div>`;
    root.querySelectorAll("[data-admin-modal-close]").forEach((button) => button.addEventListener("click", closeModal));
  }

  function closeModal(){
    const root = $("opsAdminModalRoot");
    if(root) root.innerHTML = "";
  }

  function modalRestaurantIds(){
    return [...document.querySelectorAll("#opsAdminModalRestaurants input:checked")].map((input) => input.value);
  }

  function profilePayloadFromModal(){
    const role = $("opsAdminModalRole")?.value || "user";
    if(!ROLE_OPTIONS.some((item) => item.value === role)){
      throw new Error("Rôle invalide");
    }
    const payload = {
      email:clean($("opsAdminModalEmail")?.value).toLowerCase(),
      role
    };
    const sample = state.data?.profiles?.[0] || {};
    if(Object.prototype.hasOwnProperty.call(sample, "full_name")) payload.full_name = clean($("opsAdminModalName")?.value) || null;
    if(Object.prototype.hasOwnProperty.call(sample, "status")) payload.status = $("opsAdminModalStatus")?.value || "active";
    return payload;
  }

  async function createUserFromModal(){
    const client = createClient();
    const email = clean($("opsAdminModalEmail")?.value).toLowerCase();
    const password = clean($("opsAdminModalPassword")?.value);
    if(!email) return toast("Courriel requis");
    if(password.length < 8) return toast("Le mot de passe temporaire doit contenir au moins 8 caractères");
    const button = $("opsAdminModalSaveUser");
    setButton(button, true, "Création...");
    try{
      const childClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
        auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }
      });
      const { data, error } = await childClient.auth.signUp({ email, password });
      if(error) throw error;
      const user = data?.user || data?.session?.user;
      if(user?.id){
        const payload = Object.assign({ id:user.id }, profilePayloadFromModal(), { email:user.email || email });
        const profile = await client.from("profiles").upsert(payload, { onConflict:"id" });
        if(profile.error) throw profile.error;
        await saveAssignments(user.id, modalRestaurantIds());
      }
      await recordActivity({ action:"Création utilisateur", module:"Admin", metadata:{ email } });
      const selectedRole = roleLabel($("opsAdminModalRole")?.value || "user");
      toast(user?.id ? `Utilisateur créé avec le rôle ${selectedRole}` : "Compte créé. Il apparaîtra après confirmation du courriel.");
      closeModal();
      await render(true);
    }catch(error){
      toast(authMessage(error, "Création impossible. Vérifie le SQL V5.13 si le rôle ou le profil ne se sauvegarde pas."));
    }finally{
      setButton(button, false);
    }
  }

  async function saveUserFromModal(userId){
    const client = createClient();
    const button = $("opsAdminModalSaveUser");
    setButton(button, true, "Sauvegarde...");
    try{
      const payload = profilePayloadFromModal();
      const update = await client.from("profiles").update(payload).eq("id", userId);
      if(update.error) throw update.error;
      await saveAssignments(userId, modalRestaurantIds());
      await saveSources(userId);
      await recordActivity({ action:"Modification utilisateur", module:"Admin", metadata:{ user_id:userId, role:payload.role } });
      toast("Utilisateur sauvegardé");
      closeModal();
      await render(true);
    }catch(error){
      toast(authMessage(error, "Utilisateur non sauvegardé. Vérifie les rôles et le SQL V5.13."));
    }finally{
      setButton(button, false);
    }
  }

  async function saveAssignments(userId, restaurantIds){
    const client = createClient();
    const del = await client.from("user_restaurants").delete().eq("user_id", userId);
    if(del.error) throw del.error;
    if(restaurantIds.length){
      const insert = await client.from("user_restaurants").insert(restaurantIds.map((restaurantId) => ({ user_id:userId, restaurant_id:restaurantId })));
      if(insert.error) throw insert.error;
    }
  }

  async function saveSources(userId){
    const client = createClient();
    const kpi = clean($("opsAdminModalKpi")?.value);
    const complaints = clean($("opsAdminModalComplaints")?.value);
    const source = await client.from("user_sheet_sources").upsert({
      user_id:userId,
      kpi_csv_url:kpi || null,
      complaints_csv_url:complaints || null,
      updated_at:new Date().toISOString()
    }, { onConflict:"user_id" });
    if(source.error) throw source.error;
  }

  async function resetUserPassword(profile){
    const client = createClient();
    const email = clean(profile.email);
    if(!email) return toast("Courriel introuvable");
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo:window.location.origin + window.location.pathname
    });
    if(error) return toast(authMessage(error, "Lien impossible à envoyer"));
    await recordActivity({ action:"Réinitialisation mot de passe", module:"Admin", metadata:{ email } });
    toast("Lien de réinitialisation envoyé");
  }

  async function toggleUserStatus(profile){
    const client = createClient();
    const next = profileStatus(profile) === "inactive" ? "active" : "inactive";
    const { error } = await client.from("profiles").update({ status:next }).eq("id", profile.id);
    if(error) return toast("Statut non sauvegardé. Exécute le SQL V5.13 pour activer le statut utilisateur.");
    await recordActivity({ action:next === "inactive" ? "Utilisateur désactivé" : "Utilisateur réactivé", module:"Admin", metadata:{ user_id:profile.id } });
    toast(next === "inactive" ? "Utilisateur désactivé" : "Utilisateur réactivé");
    await render(true);
  }

  async function deleteUser(profile){
    const client = createClient();
    const { error } = await client.rpc("delete_ops_user", { target_user_id:profile.id });
    if(error){
      const raw = String(error.message || error);
      if(raw.includes("delete_ops_user") || raw.includes("schema cache") || raw.includes("function")){
        return toast("Suppression sécurisée non activée. Exécute SUPABASE_USER_MANAGEMENT_V108.sql dans Supabase.");
      }
      return toast(raw || "Suppression impossible");
    }
    await recordActivity({ action:"Suppression utilisateur", module:"Admin", metadata:{ user_id:profile.id, email:profile.email } });
    toast("Utilisateur supprimé");
    await render(true);
  }

  function setButton(button, loading, text){
    if(!button) return;
    if(!button.dataset.defaultText) button.dataset.defaultText = button.textContent || "";
    button.disabled = Boolean(loading);
    button.textContent = loading ? text : button.dataset.defaultText;
  }

  function authMessage(error, fallback){
    const raw = String(error?.message || error || "");
    const low = raw.toLowerCase();
    if(low.includes("rate limit") || low.includes("too many")) return "Trop de tentatives. Attends quelques minutes avant de réessayer.";
    if(low.includes("already")) return "Cette adresse courriel existe déjà.";
    if(low.includes("weak") || low.includes("password")) return "Le mot de passe est trop faible.";
    if(low.includes("check constraint") || low.includes("role")) return "Rôle non disponible. Exécute le SQL V5.13 dans Supabase.";
    if(low.includes("column") || low.includes("schema cache")) return "Structure Admin V5.13 non active dans Supabase. Exécute le SQL V5.13 puis recharge l'app.";
    return fallback || "Action impossible pour le moment.";
  }

  async function recordActivity(entry){
    try{
      const client = createClient();
      if(!client) return;
      const context = window.OPS_AUTH_CONTEXT || {};
      const user = context.user || window.OPS_AUTH_USER || {};
      const payload = {
        user_id:user.id || null,
        user_email:user.email || "",
        action:entry.action || "Action",
        module:entry.module || "Admin",
        restaurant_id:entry.restaurant_id || null,
        restaurant_name:entry.restaurant_name || null,
        metadata:entry.metadata || {}
      };
      await client.from("ops_activity_log").insert(payload);
    }catch(error){}
  }

  async function render(force){
    const root = $("opsAdminRoot");
    if(!root) return;
    if(window.OPS_AUTH_ROLE !== "super_admin"){
      root.innerHTML = `<div class="panel"><h3>Admin</h3><div class="alert">Connecte-toi avec un compte super admin pour charger les outils.</div></div>`;
      return;
    }
    if(state.loading) return;
    state.loading = true;
    if(force || !state.data){
      root.innerHTML = `<div class="panel opsAdminLoading"><h3>Admin</h3><div class="alert">Chargement du centre de contrôle...</div></div>`;
    }
    try{
      const data = force || !state.data ? await loadAdminData() : state.data;
      root.innerHTML = renderAdminHtml(data);
      bindAdminCenter();
      setSection(state.activeTab);
    }catch(error){
      const raw = String(error.message || error || "");
      root.innerHTML = `
        <div class="panel opsAdminSetupRequired">
          <h3>Configuration Admin requise</h3>
          <div class="alert">Impossible de charger les tables Admin.</div>
          <p class="subtitle">Vérifie que les tables d'authentification et le SQL V5.13 sont bien exécutés dans le même projet Supabase.</p>
          <div class="opsAdminSetupNote">${safe(raw)}</div>
        </div>`;
    }finally{
      state.loading = false;
    }
  }

  window.renderOpsAdminCenterV513 = render;
  window.setOpsAdminCenterSectionV513 = (section) => {
    if(section) state.activeTab = ["overview","users"].includes(section) ? "users" : section;
    if($("opsAdminRoot")) render(false);
  };
  window.opsRecordActivity = recordActivity;

  window.addEventListener("ops-auth-context", () => {
    if(window.OPS_AUTH_ROLE === "super_admin" && $("page-admin")?.classList.contains("active")){
      render(true);
    }
  });
})();
