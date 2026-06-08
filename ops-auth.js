(function(){
  "use strict";

  const CONFIG = Object.assign({
    supabaseUrl: "",
    supabaseAnonKey: "",
    superAdminEmail: "a.cloutier@salvatore.com"
  }, window.OPS_AUTH_CONFIG || {});

  const DEFAULT_RESTAURANTS = [
    "Lévis","Beauport","Jonquière","Chicoutimi Nord","St-Nicolas","Dolbeau","Alma",
    "St-Augustin","Montmagny","Donnacona","Pont-Rouge","Chicoutimi Sud",
    "Saint-Raymond","Beauport Nord","La Pocatière","Roberval","St-Lambert"
  ];

  const DEFAULT_KPI_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQVnbsslU6yfX4CNcXAH1cw4-7DFrZyMLt6NJmymwITALwvloEfZ9u0hhg_gNUNE8XmvgAZNO-LUG5z/pub?output=csv";
  const DEFAULT_COMPLAINTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT8iD3fLPtv8V5z7ztEMqdJnCOhD32pRQsevAwXIexl6iwktRt_-eJQ1CgbXFiWSRgQQRi8ma9lvLv2/pub?gid=1258876961&single=true&output=csv";

  const state = {
    client:null,
    session:null,
    user:null,
    profile:null,
    role:"user",
    restaurants:[],
    sheetSources:null,
    adminData:null,
    recoverySession:null,
    signupInFlight:false,
    signupLastAttemptAt:0,
    signupSelectedRestaurants:new Set(),
    adminSection:"overview",
    adminUserCreationInFlight:false,
    autoSyncSignature:"",
    autoSyncTimer:null,
    autoSyncRunning:false,
    contextSignature:"",
    welcomeShownFor:""
  };

  const $ = (id) => document.getElementById(id);
  const safe = (value) => String(value == null ? "" : value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
  const norm = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"");
  const cleanEmail = (value) => String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
  const cleanPassword = (value) => String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
  const isSuperAdminEmail = (email) => norm(email) === norm(CONFIG.superAdminEmail);
  const unique = (items) => [...new Set((items || []).map(canonicalRestaurant).filter(Boolean))];

  function canonicalRestaurant(value){
    const raw = String(value || "").trim();
    if(!raw) return "";
    const key = norm(raw);
    const aliases = {
      levis:"Lévis",
      jonquiere:"Jonquière",
      chicoutiminord:"Chicoutimi Nord",
      chicoutimisud:"Chicoutimi Sud",
      chicoutimi:"Chicoutimi Sud",
      stnicolas:"St-Nicolas",
      saintnicolas:"St-Nicolas",
      staugustin:"St-Augustin",
      saintaugustin:"St-Augustin",
      staugustindedesmaures:"St-Augustin",
      saintaugustindedesmaures:"St-Augustin",
      pontrouge:"Pont-Rouge",
      saintraymond:"Saint-Raymond",
      straymond:"Saint-Raymond",
      beauportnord:"Beauport Nord",
      lapocatiere:"La Pocatière",
      stlambert:"St-Lambert",
      saintlambert:"St-Lambert",
      saintlambertdelauzon:"St-Lambert",
      stlambertdelauzon:"St-Lambert"
    };
    if(aliases[key]) return aliases[key];
    return DEFAULT_RESTAURANTS.find((restaurant) => norm(restaurant) === key) || raw;
  }

  function setMessage(text, tone){
    const el = $("opsAuthMessage");
    if(!el) return;
    el.textContent = text || "";
    el.className = `opsAuthMessage ${tone || ""}`;
  }

  function showToast(message){
    if(typeof window.toast === "function"){
      try{ window.toast(message); return; }catch(e){}
    }
    setMessage(message);
  }

  function authErrorMessage(error, context){
    const raw = String(error?.message || error?.error_description || error?.error || error || "").toLowerCase();
    if(!raw) return "Une erreur est survenue. Réessaie dans quelques instants.";
    if(raw.includes("email rate limit") || raw.includes("rate limit") || raw.includes("too many") || raw.includes("over_email_send_rate_limit")){
      return "Trop de tentatives ont été effectuées. Veuillez attendre quelques minutes avant de réessayer.";
    }
    if(raw.includes("already registered") || raw.includes("already exists") || raw.includes("user already") || raw.includes("email already")){
      return "Cette adresse courriel est déjà utilisée. Connecte-toi ou utilise mot de passe oublié.";
    }
    if(raw.includes("weak password") || raw.includes("password should") || raw.includes("password must") || raw.includes("at least 6") || raw.includes("at least 8")){
      return "Le mot de passe est trop faible. Utilise au moins 8 caractères.";
    }
    if(raw.includes("email not confirmed") || raw.includes("not confirmed") || raw.includes("confirm")){
      return "Ce compte n'est pas encore confirmé. Vérifie le courriel de confirmation avant de te connecter.";
    }
    if(raw.includes("invalid login credentials") || raw.includes("invalid credentials") || raw.includes("invalid password")){
      return context === "login"
        ? "Email ou mot de passe invalide. Vérifie les informations et réessaie."
        : "Les informations saisies ne sont pas valides.";
    }
    if(raw.includes("network") || raw.includes("failed to fetch") || raw.includes("fetch failed") || raw.includes("load failed")){
      return "Connexion réseau impossible. Vérifie Internet puis réessaie.";
    }
    if(context === "signup") return "Impossible de créer le compte pour le moment. Réessaie dans quelques minutes.";
    if(context === "reset") return "Impossible d'envoyer le lien pour le moment. Réessaie dans quelques minutes.";
    if(context === "recovery") return "Impossible de modifier le mot de passe pour le moment. Réessaie dans quelques minutes.";
    return "Connexion impossible pour le moment. Réessaie dans quelques minutes.";
  }

  function setButtonLoading(button, loading, text){
    if(!button) return;
    if(!button.dataset.defaultText) button.dataset.defaultText = button.textContent || "";
    button.disabled = Boolean(loading);
    button.classList.toggle("is-loading", Boolean(loading));
    button.textContent = loading ? (text || "Chargement...") : button.dataset.defaultText;
  }

  function buildLoginOverlay(){
    if($("opsAuthOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "opsAuthOverlay";
    overlay.className = "opsAuthOverlay show";
    overlay.innerHTML = `
      <div class="opsAuthGlow"></div>
      <section class="opsAuthCard" aria-labelledby="opsAuthTitle">
        <div class="opsAuthBrand">
          <img src="salvatore-logo.jpg" alt="Salvatoré">
          <span>Dashboard OPS</span>
        </div>
        <div class="opsAuthTabs" role="tablist" aria-label="Authentification">
          <button type="button" class="active" data-auth-mode="login">Connexion</button>
          <button type="button" data-auth-mode="signup">Créer un compte</button>
        </div>
        <form id="opsAuthLogin" class="opsAuthForm active">
          <h2 id="opsAuthTitle">Connexion</h2>
          <p>Connecte-toi pour charger tes restaurants et tes sources CSV.</p>
          <label>Email</label>
          <input id="opsLoginEmail" type="email" autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" required>
          <label>Mot de passe</label>
          <div class="opsAuthPasswordWrap">
            <input id="opsLoginPassword" type="password" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" required>
            <button type="button" data-toggle-password="opsLoginPassword">Afficher</button>
          </div>
          <button class="opsAuthPrimary" type="submit">Connexion</button>
          <button class="opsAuthLinkBtn" type="button" data-auth-mode="forgot">Mot de passe oublié?</button>
          <button class="opsAuthResetBtn" type="button" id="opsMobileResetBtn">Réinitialiser l'app mobile</button>
        </form>
        <form id="opsAuthSignup" class="opsAuthForm">
          <h2>Créer un compte</h2>
          <p>Sélectionne les restaurants dont tu t'occupes. Un super admin pourra valider les accès.</p>
          <label>Email</label>
          <input id="opsSignupEmail" type="email" autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" required>
          <label>Mot de passe</label>
          <div class="opsAuthPasswordWrap">
            <input id="opsSignupPassword" type="password" autocomplete="new-password" autocapitalize="none" autocorrect="off" spellcheck="false" required minlength="8">
            <button type="button" data-toggle-password="opsSignupPassword">Afficher</button>
          </div>
          <div class="opsRestaurantSelector">
            <div class="opsRestaurantSelectorTop">
              <label for="opsSignupRestaurantSearch">Restaurants</label>
              <input id="opsSignupRestaurantSearch" type="search" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Rechercher un restaurant">
            </div>
            <div class="opsRestaurantActions">
              <button type="button" id="opsSignupSelectAll">Tout sélectionner</button>
              <button type="button" id="opsSignupClearAll">Tout retirer</button>
            </div>
            <div class="opsSignupRestaurants" id="opsSignupRestaurants"></div>
          </div>
          <button class="opsAuthPrimary" id="opsSignupSubmit" type="submit">Créer le compte</button>
        </form>
        <form id="opsAuthForgot" class="opsAuthForm">
          <h2>Réinitialiser le mot de passe</h2>
          <p>Entre ton email. Supabase enverra un lien sécurisé pour choisir un nouveau mot de passe.</p>
          <label>Email</label>
          <input id="opsForgotEmail" type="email" autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" required>
          <button class="opsAuthPrimary" type="submit">Envoyer le lien</button>
          <button class="opsAuthLinkBtn" type="button" data-auth-mode="login">Retour à la connexion</button>
        </form>
        <form id="opsAuthRecovery" class="opsAuthForm">
          <h2>Nouveau mot de passe</h2>
          <p>Choisis un nouveau mot de passe pour terminer la réinitialisation.</p>
          <label>Nouveau mot de passe</label>
          <div class="opsAuthPasswordWrap">
            <input id="opsNewPassword" type="password" autocomplete="new-password" autocapitalize="none" autocorrect="off" spellcheck="false" required minlength="8">
            <button type="button" data-toggle-password="opsNewPassword">Afficher</button>
          </div>
          <label>Confirmer le mot de passe</label>
          <div class="opsAuthPasswordWrap">
            <input id="opsNewPasswordConfirm" type="password" autocomplete="new-password" autocapitalize="none" autocorrect="off" spellcheck="false" required minlength="8">
            <button type="button" data-toggle-password="opsNewPasswordConfirm">Afficher</button>
          </div>
          <button class="opsAuthPrimary" type="submit">Mettre à jour</button>
        </form>
        <div class="opsAuthMessage" id="opsAuthMessage">Connexion Supabase requise.</div>
      </section>`;
    document.body.appendChild(overlay);

    renderSignupRestaurantOptions();

    overlay.addEventListener("click", (event) => {
      const modeButton = event.target.closest("[data-auth-mode]");
      if(modeButton){
        switchAuthMode(modeButton.dataset.authMode);
      }
      const toggle = event.target.closest("[data-toggle-password]");
      if(toggle){
        togglePasswordField(toggle);
      }
    });
    $("opsAuthLogin").addEventListener("submit", (event) => {
      event.preventDefault();
      signIn();
    });
    $("opsAuthSignup").addEventListener("submit", (event) => {
      event.preventDefault();
      signUp(event.submitter || $("opsSignupSubmit"));
    });
    $("opsAuthForgot").addEventListener("submit", (event) => {
      event.preventDefault();
      requestPasswordReset();
    });
    $("opsAuthRecovery").addEventListener("submit", (event) => {
      event.preventDefault();
      updateRecoveryPassword();
    });
    $("opsMobileResetBtn")?.addEventListener("click", resetMobileAppCache);
    $("opsSignupRestaurantSearch")?.addEventListener("input", filterSignupRestaurants);
    $("opsSignupSelectAll")?.addEventListener("click", () => {
      DEFAULT_RESTAURANTS.forEach((restaurant) => state.signupSelectedRestaurants.add(restaurant));
      renderSignupRestaurantOptions();
      filterSignupRestaurants();
    });
    $("opsSignupClearAll")?.addEventListener("click", () => {
      state.signupSelectedRestaurants.clear();
      renderSignupRestaurantOptions();
      filterSignupRestaurants();
    });
  }

  function renderSignupRestaurantOptions(){
    const root = $("opsSignupRestaurants");
    if(!root) return;
    root.innerHTML = DEFAULT_RESTAURANTS.map((restaurant) => `
      <label class="opsRestaurantChoice" data-restaurant-name="${safe(norm(restaurant))}">
        <input type="checkbox" value="${safe(restaurant)}" ${state.signupSelectedRestaurants.has(restaurant) ? "checked" : ""}>
        <span>${safe(restaurant)}</span>
      </label>
    `).join("");
    root.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.addEventListener("change", () => {
        const restaurant = canonicalRestaurant(input.value);
        if(input.checked) state.signupSelectedRestaurants.add(restaurant);
        else state.signupSelectedRestaurants.delete(restaurant);
      });
    });
  }

  function filterSignupRestaurants(){
    const query = norm($("opsSignupRestaurantSearch")?.value || "");
    document.querySelectorAll("#opsSignupRestaurants .opsRestaurantChoice").forEach((label) => {
      const name = label.dataset.restaurantName || "";
      label.classList.toggle("opsRestaurantChoiceHidden", Boolean(query) && !name.includes(query));
    });
  }

  function togglePasswordField(button){
    const input = $(button?.dataset?.togglePassword || "");
    if(!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Masquer" : "Afficher";
  }

  function switchAuthMode(mode){
    const labels = {
      login:"Connexion Supabase requise.",
      signup:"Création de compte Supabase.",
      forgot:"Entre ton email pour recevoir un lien de réinitialisation.",
      recovery:"Entre ton nouveau mot de passe."
    };
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.authMode === mode);
    });
    $("opsAuthLogin")?.classList.toggle("active", mode === "login");
    $("opsAuthSignup")?.classList.toggle("active", mode === "signup");
    $("opsAuthForgot")?.classList.toggle("active", mode === "forgot");
    $("opsAuthRecovery")?.classList.toggle("active", mode === "recovery");
    setMessage(labels[mode] || labels.login);
  }

  function isRecoveryUrl(){
    const full = `${window.location.search || ""}${window.location.hash || ""}`.toLowerCase();
    return full.includes("type=recovery") || full.includes("recovery_token") || full.includes("access_token=");
  }

  function clearRecoveryUrl(){
    try{
      const clean = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, clean);
    }catch(e){}
  }

  function setAuthLocked(locked){
    document.documentElement.classList.toggle("ops-auth-locked", locked);
    document.body.classList.toggle("ops-auth-locked", locked);
    const app = document.querySelector(".app");
    if(app) app.classList.toggle("opsAuthBlurred", locked);
    const overlay = $("opsAuthOverlay");
    if(overlay) overlay.classList.toggle("show", locked);
  }

  function createClient(){
    if(state.client){
      window.OPS_SUPABASE_CLIENT = state.client;
      return state.client;
    }
    if(!window.supabase || !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey){
      setMessage("Supabase n'est pas disponible. Vérifie le chargement réseau.", "bad");
      return null;
    }
    state.client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true
      }
    });
    window.OPS_SUPABASE_CLIENT = state.client;
    try{
      const url = $("supabaseUrl");
      const key = $("supabaseKey");
      if(url) url.value = CONFIG.supabaseUrl;
      if(key) key.value = CONFIG.supabaseAnonKey;
    }catch(e){}
    return state.client;
  }

  async function signIn(){
    const client = createClient();
    if(!client) return;
    const email = cleanEmail($("opsLoginEmail")?.value);
    const password = cleanPassword($("opsLoginPassword")?.value);
    if(!email || !password){
      setMessage("Entre ton email et ton mot de passe.", "bad");
      return;
    }
    setMessage("Connexion en cours...");
    try{
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if(error){
        const mapped = authErrorMessage(error, "login");
        setMessage(mapped.includes("Email ou mot de passe")
          ? `${mapped} Sur mobile, utilise Afficher pour confirmer la saisie.`
          : mapped, "bad");
        return;
      }
      await loadUserContext(data.session);
    }catch(error){
      setMessage(authErrorMessage(error, "login"), "bad");
    }
  }

  function selectedSignupRestaurants(){
    return unique([...state.signupSelectedRestaurants]);
  }

  async function signUp(button){
    const client = createClient();
    if(!client) return;
    const now = Date.now();
    if(state.signupInFlight) return;
    if(state.signupLastAttemptAt && now - state.signupLastAttemptAt < 10000){
      setMessage("Veuillez patienter avant de refaire une tentative.", "bad");
      return;
    }
    const email = cleanEmail($("opsSignupEmail")?.value);
    const password = cleanPassword($("opsSignupPassword")?.value);
    const requestedRestaurants = selectedSignupRestaurants();
    if(!email || !password){
      setMessage("Entre un email et un mot de passe.", "bad");
      return;
    }
    if(!requestedRestaurants.length){
      setMessage("Sélectionne au moins un restaurant.", "bad");
      return;
    }
    state.signupInFlight = true;
    state.signupLastAttemptAt = now;
    setButtonLoading(button || $("opsSignupSubmit"), true, "Création...");
    setMessage("Création du compte en cours...");
    try{
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options:{ data:{ requested_restaurants:requestedRestaurants } }
      });
      if(error){
        setMessage(authErrorMessage(error, "signup"), "bad");
        return;
      }
      if(data?.user){
        await saveRestaurantRequests(data.user, requestedRestaurants);
      }
      if(data?.session){
        await loadUserContext(data.session);
      }else{
        setMessage("Compte créé. Si la confirmation email est active, confirme le compte avant la connexion.", "good");
        switchAuthMode("login");
        if($("opsLoginEmail")) $("opsLoginEmail").value = email;
      }
    }catch(error){
      setMessage(authErrorMessage(error, "signup"), "bad");
    }finally{
      state.signupInFlight = false;
      setButtonLoading(button || $("opsSignupSubmit"), false);
    }
  }

  async function requestPasswordReset(){
    const client = createClient();
    if(!client) return;
    const email = cleanEmail($("opsForgotEmail")?.value);
    if(!email){
      setMessage("Entre ton email pour recevoir le lien.", "bad");
      return;
    }
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    setMessage("Envoi du lien de réinitialisation...");
    try{
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if(error){
        setMessage(authErrorMessage(error, "reset"), "bad");
        return;
      }
      setMessage("Lien envoyé. Ouvre le courriel sur cet appareil, puis choisis ton nouveau mot de passe.", "good");
      switchAuthMode("login");
      if($("opsLoginEmail")) $("opsLoginEmail").value = email;
    }catch(error){
      setMessage(authErrorMessage(error, "reset"), "bad");
    }
  }

  function showPasswordRecovery(session){
    state.recoverySession = session || state.recoverySession;
    setAuthLocked(true);
    switchAuthMode("recovery");
    const overlay = $("opsAuthOverlay");
    if(overlay) overlay.classList.add("show");
    const app = document.querySelector(".app");
    if(app) app.classList.add("opsAuthBlurred");
  }

  async function updateRecoveryPassword(){
    const client = createClient();
    if(!client) return;
    const password = cleanPassword($("opsNewPassword")?.value);
    const confirm = cleanPassword($("opsNewPasswordConfirm")?.value);
    if(password.length < 8){
      setMessage("Le mot de passe doit contenir au moins 8 caractères.", "bad");
      return;
    }
    if(password !== confirm){
      setMessage("Les deux mots de passe ne sont pas identiques.", "bad");
      return;
    }
    setMessage("Mise à jour du mot de passe...");
    try{
      const { error } = await client.auth.updateUser({ password });
      if(error){
        setMessage(authErrorMessage(error, "recovery"), "bad");
        return;
      }
      clearRecoveryUrl();
      state.recoverySession = null;
      await client.auth.signOut();
      setAuthLocked(true);
      switchAuthMode("login");
      if($("opsNewPassword")) $("opsNewPassword").value = "";
      if($("opsNewPasswordConfirm")) $("opsNewPasswordConfirm").value = "";
      setMessage("Mot de passe mis à jour. Connecte-toi avec le nouveau mot de passe.", "good");
    }catch(error){
      setMessage(authErrorMessage(error, "recovery"), "bad");
    }
  }

  async function resetMobileAppCache(){
    setMessage("Réinitialisation locale de l'app mobile...");
    try{
      const client = createClient();
      if(client) await client.auth.signOut();
    }catch(e){}
    try{
      if("caches" in window){
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith("dashboard-ops-")).map((key) => caches.delete(key)));
      }
    }catch(e){}
    try{
      if(navigator.serviceWorker?.getRegistrations){
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    }catch(e){}
    try{
      Object.keys(localStorage).forEach((key) => {
        if(key.startsWith("sb-") || key.includes("supabase") || key.startsWith("dashboard-ops-")){
          localStorage.removeItem(key);
        }
      });
      sessionStorage.clear();
    }catch(e){}
    setTimeout(() => window.location.reload(), 450);
  }

  async function saveRestaurantRequests(user, restaurants){
    const client = createClient();
    if(!client || !user) return;
    try{
      await client.from("profiles").upsert({
        id:user.id,
        email:user.email,
        role:"user"
      }, { onConflict:"id" });
    }catch(e){}
    try{
      const rows = restaurants.map((restaurant) => ({
        user_id:user.id,
        restaurant_name:restaurant
      }));
      await client.from("user_restaurant_requests").delete().eq("user_id", user.id);
      if(rows.length) await client.from("user_restaurant_requests").insert(rows);
    }catch(e){
      console.warn("Restaurant requests not saved:", e.message || e);
    }
  }

  async function fetchMaybe(query){
    const { data, error } = await query;
    if(error) throw error;
    return data;
  }

  async function loadProfile(user){
    const client = createClient();
    try{
      return await fetchMaybe(client.from("profiles").select("id,email,role,created_at").eq("id", user.id).maybeSingle());
    }catch(error){
      console.warn("Profile unavailable:", error.message || error);
      return null;
    }
  }

  async function loadRestaurants(role, user){
    const client = createClient();
    if(role === "super_admin"){
      try{
        const rows = await fetchMaybe(client.from("restaurants").select("id,name,active,created_at").eq("active", true).order("name"));
        const names = unique((rows || []).map((row) => row.name));
        return names.length ? names : DEFAULT_RESTAURANTS.slice();
      }catch(error){
        console.warn("Restaurants unavailable:", error.message || error);
        return DEFAULT_RESTAURANTS.slice();
      }
    }

    try{
      const rows = await fetchMaybe(client
        .from("user_restaurants")
        .select("restaurant_id, restaurants(id,name,active)")
        .eq("user_id", user.id));
      return unique((rows || [])
        .map((row) => row.restaurants)
        .filter((restaurant) => restaurant && restaurant.active !== false)
        .map((restaurant) => restaurant.name));
    }catch(error){
      console.warn("User restaurants unavailable:", error.message || error);
      return [];
    }
  }

  async function loadSheetSources(user){
    const client = createClient();
    try{
      return await fetchMaybe(client.from("user_sheet_sources").select("user_id,kpi_csv_url,complaints_csv_url,created_at,updated_at").eq("user_id", user.id).maybeSingle());
    }catch(error){
      console.warn("Sheet sources unavailable:", error.message || error);
      return null;
    }
  }

  async function loadUserContext(session){
    const client = createClient();
    const activeSession = session || (await client.auth.getSession()).data.session;
    if(!activeSession?.user){
      lockToLogin();
      return;
    }

    const user = activeSession.user;
    const profile = await loadProfile(user);
    const role = profile?.role || (isSuperAdminEmail(user.email) ? "super_admin" : "user");
    const restaurants = await loadRestaurants(role, user);
    const dbSources = await loadSheetSources(user);
    const kpiCsvUrl = dbSources?.kpi_csv_url || (isSuperAdminEmail(user.email) ? DEFAULT_KPI_CSV_URL : "");
    const complaintsCsvUrl = dbSources?.complaints_csv_url || (isSuperAdminEmail(user.email) ? DEFAULT_COMPLAINTS_CSV_URL : "");
    const contextSignature = [
      user.id || user.email || "",
      role,
      restaurants.join("|"),
      kpiCsvUrl,
      complaintsCsvUrl
    ].join("::");
    const contextChanged = contextSignature !== state.contextSignature;

    state.session = activeSession;
    state.user = user;
    state.profile = profile || { id:user.id, email:user.email, role };
    state.role = role;
    state.restaurants = restaurants;
    state.sheetSources = {
      kpi_csv_url:kpiCsvUrl,
      complaints_csv_url:complaintsCsvUrl
    };

    if(!contextChanged && window.OPS_AUTH_READY){
      return;
    }
    state.contextSignature = contextSignature;

    applyContext();
    setAuthLocked(false);
    renderAuthBar();
    renderAdminVisibility();
    if(role === "super_admin") renderAdminPanel();
    try{
      client.from("profiles").update({ last_login_at:new Date().toISOString() }).eq("id", user.id).then(() => {});
    }catch(e){}
    try{
      if(typeof window.opsRecordActivity === "function"){
        window.opsRecordActivity({ action:"Connexion", module:"Authentification" });
      }
    }catch(e){}
    setMessage("");
    if(state.welcomeShownFor !== contextSignature){
      state.welcomeShownFor = contextSignature;
      showToast(`Connecté: ${user.email}`);
    }

    scheduleContextAutoSync(user, kpiCsvUrl, complaintsCsvUrl);
  }

  function scheduleContextAutoSync(user, kpiCsvUrl, complaintsCsvUrl){
    const signature = [
      user?.id || user?.email || "",
      kpiCsvUrl || "",
      complaintsCsvUrl || ""
    ].join("|");
    if(!kpiCsvUrl && !complaintsCsvUrl) return;
    if(signature === state.autoSyncSignature) return;
    state.autoSyncSignature = signature;
    if(state.autoSyncTimer) clearTimeout(state.autoSyncTimer);
    state.autoSyncTimer = setTimeout(async () => {
      if(state.autoSyncRunning) return;
      state.autoSyncRunning = true;
      try{
        if(kpiCsvUrl && typeof window.syncSheet === "function"){
          await window.syncSheet();
        }
        if(complaintsCsvUrl && typeof window.syncComplaints === "function"){
          await window.syncComplaints();
        }
      }catch(error){
        console.error(error);
      }finally{
        state.autoSyncRunning = false;
        state.autoSyncTimer = null;
      }
    }, 350);
  }

  function applyContext(){
    window.OPS_AUTH_READY = true;
    window.OPS_AUTH_ROLE = state.role;
    window.OPS_AUTH_USER = state.user;
    window.OPS_AUTH_ALLOWED_RESTAURANTS = state.restaurants.slice();
    window.OPS_AUTH_HAS_KPI_SOURCE = Boolean(state.sheetSources?.kpi_csv_url);
    window.OPS_AUTH_HAS_COMPLAINTS_SOURCE = Boolean(state.sheetSources?.complaints_csv_url);
    window.OPS_AUTH_CONTEXT = {
      user:state.user,
      role:state.role,
      restaurants:state.restaurants.slice(),
      kpiCsvUrl:state.sheetSources?.kpi_csv_url || "",
      complaintsCsvUrl:state.sheetSources?.complaints_csv_url || ""
    };
    if(typeof window.applyOpsAccessContext === "function"){
      window.applyOpsAccessContext(window.OPS_AUTH_CONTEXT);
    }
    window.dispatchEvent(new CustomEvent("ops-auth-context", { detail:window.OPS_AUTH_CONTEXT }));
    const dot = $("statusDot");
    const status = $("statusText");
    if(dot) dot.classList.add("on");
    if(status) status.textContent = state.role === "super_admin" ? "Connecté super admin" : "Connecté";
    lockConfigRestaurants();
  }

  function lockConfigRestaurants(){
    const isAdmin = state.role === "super_admin";
    document.querySelectorAll("#restaurantAccess input, #btnSaveRestaurants, #btnSelectAllRestaurants").forEach((el) => {
      el.disabled = !isAdmin;
    });
    const oldLoginPanel = $("loginEmail")?.closest(".panel");
    if(oldLoginPanel) oldLoginPanel.classList.add("opsAuthLegacyHidden");
  }

  function renderAuthBar(){
    let bar = $("opsAuthBar");
    if(!bar){
      bar = document.createElement("div");
      bar.id = "opsAuthBar";
      bar.className = "opsAuthBar";
      const brand = document.querySelector(".hero .brand");
      const hero = document.querySelector(".hero");
      if(brand) brand.insertAdjacentElement("afterend", bar);
      else if(hero) hero.insertAdjacentElement("afterbegin", bar);
      else document.body.appendChild(bar);
    }
    const email = safe(state.user?.email || "");
    bar.innerHTML = `
      <div class="opsAuthIdentity">
        <span title="${email}">${email}</span>
        <strong>${safe(state.role === "super_admin" ? "Super admin" : "Utilisateur")}</strong>
      </div>
      <button type="button" id="opsLogoutBtn">Déconnexion</button>`;
    $("opsLogoutBtn").onclick = signOut;
  }

  function renderAdminVisibility(){
    const isAdmin = state.role === "super_admin";
    document.querySelectorAll(".opsAdminOnly").forEach((el) => {
      el.classList.toggle("hidden", !isAdmin);
    });
    const adminPage = $("page-admin");
    if(adminPage) adminPage.classList.toggle("hidden", !isAdmin);
  }

  async function signOut(){
    const client = createClient();
    try{
      if(typeof window.opsRecordActivity === "function"){
        await window.opsRecordActivity({ action:"Déconnexion", module:"Authentification" });
      }
    }catch(e){}
    if(client) await client.auth.signOut();
    state.session = null;
    state.user = null;
    state.profile = null;
    state.role = "user";
    state.restaurants = [];
    state.sheetSources = null;
    state.contextSignature = "";
    state.welcomeShownFor = "";
    state.autoSyncSignature = "";
    state.autoSyncRunning = false;
    if(state.autoSyncTimer){
      clearTimeout(state.autoSyncTimer);
      state.autoSyncTimer = null;
    }
    window.OPS_AUTH_READY = false;
    window.OPS_AUTH_ROLE = "user";
    window.OPS_AUTH_ALLOWED_RESTAURANTS = [];
    window.OPS_SUPABASE_CLIENT = null;
    try{
      localStorage.removeItem("sheetUrl");
      localStorage.removeItem("dashboard_ops_complaints_csv_url");
      localStorage.removeItem("allowedRestaurants");
    }catch(e){}
    if(typeof window.applyOpsAccessContext === "function"){
      window.applyOpsAccessContext({ user:null, role:"user", restaurants:[], kpiCsvUrl:"", complaintsCsvUrl:"" });
    }
    window.dispatchEvent(new CustomEvent("ops-auth-context", { detail:{ user:null, role:"user", restaurants:[] } }));
    const dot = $("statusDot");
    const status = $("statusText");
    if(dot) dot.classList.remove("on");
    if(status) status.textContent = "Non connecté";
    renderAdminVisibility();
    const bar = $("opsAuthBar");
    if(bar) bar.remove();
    lockToLogin();
    showToast("Déconnecté");
  }

  function lockToLogin(){
    window.OPS_AUTH_READY = false;
    window.OPS_AUTH_ROLE = "user";
    window.OPS_AUTH_ALLOWED_RESTAURANTS = [];
    setAuthLocked(true);
    renderAdminVisibility();
  }

  async function renderAdminPanel(){
    if(typeof window.renderOpsAdminCenterV513 === "function"){
      await window.renderOpsAdminCenterV513();
      return;
    }
    const root = $("opsAdminRoot");
    if(!root) return;
    root.innerHTML = `<div class="panel"><h3>Admin Supabase</h3><div class="alert">Chargement des utilisateurs...</div></div>`;
    const client = createClient();
    try{
      const [profiles, restaurants, assignments, sources] = await Promise.all([
        fetchMaybe(client.from("profiles").select("id,email,role,created_at").order("email")),
        fetchMaybe(client.from("restaurants").select("id,name,active,created_at").order("name")),
        fetchMaybe(client.from("user_restaurants").select("user_id,restaurant_id")),
        fetchMaybe(client.from("user_sheet_sources").select("user_id,kpi_csv_url,complaints_csv_url,updated_at"))
      ]);
      state.adminData = { profiles:profiles || [], restaurants:restaurants || [], assignments:assignments || [], sources:sources || [] };
      root.innerHTML = renderAdminHtml(state.adminData);
      bindAdminPanel();
    }catch(error){
      const rawMessage = String(error.message || error || "");
      const setupHint = rawMessage.includes("public.profiles") || rawMessage.includes("schema cache") || rawMessage.includes("Could not find the table")
        ? "Les tables Supabase Auth ne sont pas encore créées dans ce projet."
        : "Impossible de charger les tables admin.";
      root.innerHTML = `
        <div class="panel opsAdminSetupRequired">
          <h3>Configuration Supabase requise</h3>
          <div class="alert">${safe(setupHint)}</div>
          <p class="subtitle">Pour activer l'administration, exécute le fichier <strong>SUPABASE_AUTH_SETUP.md</strong> dans le SQL Editor Supabase, puis recharge l'app.</p>
          <div class="opsAdminSetupGrid">
            <span>profiles</span>
            <span>restaurants</span>
            <span>user_restaurants</span>
            <span>user_sheet_sources</span>
          </div>
          <div class="opsAdminSetupNote">Détail technique : ${safe(rawMessage)}</div>
        </div>`;
    }
  }

  function renderAdminHtml(data){
    const restaurantRows = data.restaurants.map((restaurant) => `
      <div class="opsAdminRestaurantRow" data-restaurant-id="${safe(restaurant.id)}">
        <input data-admin-restaurant-name value="${safe(restaurant.name)}">
        <label><input type="checkbox" data-admin-restaurant-active ${restaurant.active !== false ? "checked" : ""}> Actif</label>
        <button type="button" class="btn" data-admin-save-restaurant>Sauvegarder</button>
      </div>
    `).join("");
    const userOptions = data.profiles.map((profile) => `
      <option value="${safe(profile.id)}">${safe(profile.email || profile.id)} - ${safe(profile.role || "user")}</option>
    `).join("");
    const users = data.profiles.map((profile) => {
      const assigned = new Set(data.assignments.filter((row) => row.user_id === profile.id).map((row) => row.restaurant_id));
      const source = data.sources.find((row) => row.user_id === profile.id) || {};
      const checks = data.restaurants.map((restaurant) => `
        <label><input type="checkbox" value="${safe(restaurant.id)}" ${assigned.has(restaurant.id) ? "checked" : ""}> <span>${safe(restaurant.name)}</span></label>
      `).join("");
      return `
        <article class="opsAdminUser" data-user-id="${safe(profile.id)}">
          <div class="opsAdminUserHead">
            <div>
              <strong>${safe(profile.email || profile.id)}</strong>
              <span>${safe(profile.id)}</span>
            </div>
            <select data-admin-role>
              <option value="user" ${profile.role !== "super_admin" ? "selected" : ""}>user</option>
              <option value="super_admin" ${profile.role === "super_admin" ? "selected" : ""}>super_admin</option>
            </select>
          </div>
          <div class="opsAdminRestaurantGrid">${checks || "<p>Aucun restaurant.</p>"}</div>
          <label>Lien KPI CSV</label>
          <textarea data-admin-kpi>${safe(source.kpi_csv_url || "")}</textarea>
          <label>Lien plaintes CSV</label>
          <textarea data-admin-complaints>${safe(source.complaints_csv_url || "")}</textarea>
          <div class="controls">
            <button type="button" class="btn red" data-admin-save-user>Enregistrer</button>
          </div>
        </article>`;
    }).join("");
    const directoryUsers = data.profiles.map((profile) => {
      const isCurrentUser = profile.id === state.user?.id;
      const protectedAdmin = profile.role === "super_admin";
      return `
        <article class="opsUserDirectoryRow" data-user-directory-id="${safe(profile.id)}">
          <div>
            <strong>${safe(profile.email || profile.id)}</strong>
            <span>${safe(profile.role || "user")}</span>
          </div>
          <button type="button" class="btn" data-admin-delete-user ${isCurrentUser || protectedAdmin ? "disabled" : ""}>
            ${isCurrentUser ? "Compte actuel" : protectedAdmin ? "Protégé" : "Supprimer"}
          </button>
        </article>`;
    }).join("");
    return `
      <div class="panel opsUsersOnly opsUserManagement">
        <div class="opsUserManagementHead">
          <div>
            <span class="opsAdminEyebrow">Utilisateurs</span>
            <h3>Gestion des comptes</h3>
            <p>Ajoute un utilisateur ou supprime proprement un accès existant.</p>
          </div>
          <button type="button" class="btn blue" id="opsAdminUsersRefresh">Rafraîchir</button>
        </div>
        <div class="opsUserCreateGrid">
          <input id="opsAdminNewUserEmail" type="email" autocomplete="off" placeholder="Courriel de l'utilisateur">
          <input id="opsAdminNewUserPassword" type="password" autocomplete="new-password" placeholder="Mot de passe temporaire">
          <button type="button" class="btn red" id="opsAdminAddUser">Ajouter l'utilisateur</button>
        </div>
        <p class="subtitle">Le mot de passe temporaire doit contenir au moins 8 caractères. L'utilisateur pourra ensuite utiliser « Mot de passe oublié ».</p>
        <div class="opsUserDirectoryList">${directoryUsers || "<p>Aucun utilisateur configuré.</p>"}</div>
      </div>
      <div class="panel opsAdminHeroPanel opsAdminOverviewOnly">
        <div>
          <span class="opsAdminEyebrow">Administration réseau</span>
          <h3>Gestion des accès</h3>
          <p>Utilisateurs, rôles, restaurants autorisés et sources CSV par compte.</p>
        </div>
        <div class="opsAdminStats">
          <div><strong>${data.profiles.length}</strong><span>Utilisateurs</span></div>
          <div><strong>${data.restaurants.length}</strong><span>Restaurants</span></div>
          <div><strong>${data.sources.length}</strong><span>Sources CSV</span></div>
        </div>
      </div>
      <div class="panel opsAdminCreate opsAdminOverviewOnly">
        <h3>Ajouter un restaurant</h3>
        <div class="controls">
          <input id="opsAdminNewRestaurant" placeholder="Nom du restaurant">
          <button type="button" class="btn red" id="opsAdminAddRestaurant">Ajouter</button>
          <button type="button" class="btn blue" id="opsAdminRefresh">Rafraîchir</button>
        </div>
      </div>
      <div class="panel opsAdminOverviewOnly">
        <h3>Restaurants</h3>
        <div class="opsAdminRestaurants">${restaurantRows || "<p>Aucun restaurant configuré.</p>"}</div>
      </div>
      <div class="panel opsAdminUserPicker opsAdminOverviewOnly">
        <h3>Utilisateur</h3>
        <div class="controls">
          <select id="opsAdminUserSelect" ${userOptions ? "" : "disabled"}>
            ${userOptions || '<option value="">Aucun utilisateur</option>'}
          </select>
        </div>
        <p class="subtitle">Sélectionne un utilisateur pour modifier son rôle, ses restaurants et ses liens CSV.</p>
      </div>
      <div class="opsAdminUsers opsAdminOverviewOnly">${users || "<div class='panel'>Aucun utilisateur.</div>"}</div>`;
  }

  function bindAdminPanel(){
    $("opsAdminRefresh")?.addEventListener("click", renderAdminPanel);
    $("opsAdminAddRestaurant")?.addEventListener("click", addRestaurant);
    $("opsAdminUsersRefresh")?.addEventListener("click", renderAdminPanel);
    $("opsAdminAddUser")?.addEventListener("click", addAdminUser);
    $("opsAdminUserSelect")?.addEventListener("change", filterAdminUserCards);
    document.querySelectorAll("[data-admin-save-user]").forEach((button) => {
      button.addEventListener("click", () => saveAdminUser(button.closest(".opsAdminUser")));
    });
    document.querySelectorAll("[data-admin-save-restaurant]").forEach((button) => {
      button.addEventListener("click", () => saveAdminRestaurant(button.closest(".opsAdminRestaurantRow")));
    });
    document.querySelectorAll("[data-admin-delete-user]").forEach((button) => {
      button.addEventListener("click", () => deleteAdminUser(button.closest(".opsUserDirectoryRow")));
    });
    filterAdminUserCards();
    setOpsAdminSection(state.adminSection);
  }

  function setOpsAdminSection(section){
    if(typeof window.setOpsAdminCenterSectionV513 === "function"){
      window.setOpsAdminCenterSectionV513(section);
      return;
    }
    state.adminSection = section === "users" ? "users" : "overview";
    const page = $("page-admin");
    if(!page) return;
    page.classList.toggle("opsAdminUsersMode", state.adminSection === "users");
    const title = page.querySelector("h2");
    const subtitle = page.querySelector(":scope > .subtitle");
    if(title) title.textContent = state.adminSection === "users" ? "Utilisateurs" : "Administration";
    if(subtitle) subtitle.textContent = state.adminSection === "users"
      ? "Ajout et suppression sécurisée des comptes utilisateurs."
      : "Gestion des utilisateurs, restaurants et sources CSV.";
  }

  async function addAdminUser(){
    if(state.adminUserCreationInFlight) return;
    const emailInput = $("opsAdminNewUserEmail");
    const passwordInput = $("opsAdminNewUserPassword");
    const button = $("opsAdminAddUser");
    const email = cleanEmail(emailInput?.value);
    const password = cleanPassword(passwordInput?.value);
    if(!email) return showToast("Courriel utilisateur requis");
    if(password.length < 8) return showToast("Le mot de passe temporaire doit contenir au moins 8 caractères");
    if(!window.supabase || !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) return showToast("Supabase n'est pas disponible");
    state.adminUserCreationInFlight = true;
    setButtonLoading(button, true, "Ajout...");
    try{
      const childClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
        auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }
      });
      const { data, error } = await childClient.auth.signUp({ email, password });
      if(error) return showToast(authErrorMessage(error, "signup"));
      if(data?.session?.user){
        const profile = await childClient.from("profiles").upsert({
          id:data.session.user.id,
          email:data.session.user.email,
          role:"user"
        });
        if(profile.error) return showToast(profile.error.message || "Compte créé, mais profil non synchronisé");
        await childClient.auth.signOut();
      }
      if(emailInput) emailInput.value = "";
      if(passwordInput) passwordInput.value = "";
      showToast(data?.session
        ? "Utilisateur ajouté"
        : "Compte créé. Il apparaîtra après la confirmation du courriel et sa première connexion.");
      renderAdminPanel();
    }catch(error){
      showToast(authErrorMessage(error, "signup"));
    }finally{
      state.adminUserCreationInFlight = false;
      setButtonLoading(button, false);
    }
  }

  async function deleteAdminUser(row){
    if(!row) return;
    const userId = row.dataset.userDirectoryId;
    const email = row.querySelector("strong")?.textContent || "cet utilisateur";
    if(!userId || userId === state.user?.id) return showToast("Impossible de supprimer le compte actuellement connecté");
    if(!window.confirm(`Supprimer définitivement ${email} ?`)) return;
    const client = createClient();
    const { error } = await client.rpc("delete_ops_user", { target_user_id:userId });
    if(error){
      const raw = String(error.message || error);
      if(raw.includes("delete_ops_user") || raw.includes("schema cache") || raw.includes("function")){
        return showToast("Suppression sécurisée non activée. Exécute SUPABASE_USER_MANAGEMENT_V108.sql dans Supabase.");
      }
      return showToast(raw || "Suppression impossible");
    }
    showToast("Utilisateur supprimé");
    renderAdminPanel();
  }

  function filterAdminUserCards(){
    const selected = $("opsAdminUserSelect")?.value || "";
    document.querySelectorAll(".opsAdminUser").forEach((card, index) => {
      const show = selected ? card.dataset.userId === selected : index === 0;
      card.classList.toggle("opsAdminUserHidden", !show);
    });
  }

  async function addRestaurant(){
    const input = $("opsAdminNewRestaurant");
    const name = canonicalRestaurant(input?.value || "");
    if(!name) return showToast("Nom de restaurant requis");
    const client = createClient();
    const { error } = await client.from("restaurants").insert({ name, active:true });
    if(error){
      showToast(error.message || "Ajout impossible");
      return;
    }
    showToast("Restaurant ajouté");
    if(input) input.value = "";
    renderAdminPanel();
  }

  async function saveAdminUser(card){
    if(!card) return;
    const userId = card.dataset.userId;
    const role = card.querySelector("[data-admin-role]")?.value || "user";
    const restaurantIds = [...card.querySelectorAll(".opsAdminRestaurantGrid input:checked")].map((input) => input.value);
    const kpi = card.querySelector("[data-admin-kpi]")?.value?.trim() || "";
    const complaints = card.querySelector("[data-admin-complaints]")?.value?.trim() || "";
    const client = createClient();
    const roleUpdate = await client.from("profiles").update({ role }).eq("id", userId);
    if(roleUpdate.error) return showToast(roleUpdate.error.message || "Rôle non sauvegardé");
    const del = await client.from("user_restaurants").delete().eq("user_id", userId);
    if(del.error) return showToast(del.error.message || "Accès non sauvegardés");
    if(restaurantIds.length){
      const insert = await client.from("user_restaurants").insert(restaurantIds.map((restaurantId) => ({ user_id:userId, restaurant_id:restaurantId })));
      if(insert.error) return showToast(insert.error.message || "Accès non sauvegardés");
    }
    const source = await client.from("user_sheet_sources").upsert({
      user_id:userId,
      kpi_csv_url:kpi || null,
      complaints_csv_url:complaints || null,
      updated_at:new Date().toISOString()
    }, { onConflict:"user_id" });
    if(source.error) return showToast(source.error.message || "Sources non sauvegardées");
    showToast("Utilisateur sauvegardé");
    renderAdminPanel();
  }

  async function saveAdminRestaurant(row){
    if(!row) return;
    const restaurantId = row.dataset.restaurantId;
    const name = canonicalRestaurant(row.querySelector("[data-admin-restaurant-name]")?.value || "");
    const active = Boolean(row.querySelector("[data-admin-restaurant-active]")?.checked);
    if(!restaurantId || !name) return showToast("Restaurant invalide");
    const client = createClient();
    const { error } = await client.from("restaurants").update({ name, active }).eq("id", restaurantId);
    if(error) return showToast(error.message || "Restaurant non sauvegardé");
    showToast("Restaurant sauvegardé");
    renderAdminPanel();
  }

  async function init(){
    buildLoginOverlay();
    setAuthLocked(true);
    const client = createClient();
    if(!client) return;
    client.auth.onAuthStateChange((event, session) => {
      if(event === "PASSWORD_RECOVERY"){
        showPasswordRecovery(session);
        return;
      }
      if(event === "TOKEN_REFRESHED"){
        state.session = session || state.session;
        return;
      }
      if(session?.user){
        if(isRecoveryUrl()){
          showPasswordRecovery(session);
          return;
        }
        loadUserContext(session);
      }
      else lockToLogin();
    });
    const { data } = await client.auth.getSession();
    if(data?.session?.user){
      if(isRecoveryUrl()) showPasswordRecovery(data.session);
      else await loadUserContext(data.session);
    }
    else lockToLogin();
  }

  window.opsAuth = {
    signOut,
    refreshAdmin:renderAdminPanel,
    getContext:() => Object.assign({}, window.OPS_AUTH_CONTEXT || {})
  };
  window.setOpsAdminSection = setOpsAdminSection;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init, { once:true });
  }else{
    init();
  }
})();
