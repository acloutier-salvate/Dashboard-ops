(function(){
  "use strict";

  if(window.OPS_AI_PROVIDER?.analyzeRequest){
    console.log("AI Provider loaded", "existing");
    console.log("Provider =", window.OPS_AI_CONFIG?.provider || "openai");
    window.OPS_AI_PROVIDER_READY = true;
    return;
  }

  const VERSION = "v522";
  const STANDARD_ACTIONS = [
    "analyzeRestaurant",
    "generateOpsMessage",
    "analyzeRequest",
    "generateFoodOrderFromStock",
    "generateFoodOrderFromHistory",
    "generateFoodOrderHybrid",
    "generateFranchiseeReport"
  ];

  function config(){
    return Object.assign({
      enabled:true,
      provider:"openai",
      endpoint:"/.netlify/functions/ai-provider"
    }, window.OPS_AI_CONFIG || {});
  }

  async function authToken(){
    try{
      if(!window.supabase || !window.OPS_AUTH_CONFIG?.supabaseUrl || !window.OPS_AUTH_CONFIG?.supabaseAnonKey) return "";
      const client = window.supabase.createClient(window.OPS_AUTH_CONFIG.supabaseUrl, window.OPS_AUTH_CONFIG.supabaseAnonKey);
      const { data } = await client.auth.getSession();
      return data?.session?.access_token || "";
    }catch(error){
      return "";
    }
  }

  function providerError(action, reason){
    const cleanReason = String(reason || "unknown_provider_error");
    return {
      provider:"provider_error",
      action,
      answer:`OpenAI n'a pas été appelé. Erreur réelle : ${cleanReason}`,
      usage:null,
      metadata:{ reason:cleanReason, version:VERSION, openaiCalled:false }
    };
  }

  async function request(action, payload){
    const cfg = config();
    const provider = cfg.provider || "openai";
    console.log("Provider =", provider);
    if(!STANDARD_ACTIONS.includes(action)) return providerError(action, `Action IA non supportée: ${action}`);
    if(!cfg.enabled) return providerError(action, "ai_provider_disabled");
    const token = await authToken();
    if(!token) return providerError(action, "missing_supabase_session");
    const preparedPayload = enrichPayload(action, payload || {});
    console.log("Calling Netlify function", cfg.endpoint || "/.netlify/functions/ai-provider");
    const response = await fetch(cfg.endpoint || "/.netlify/functions/ai-provider", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${token}`
      },
      body:JSON.stringify({
        provider,
        action,
        payload:Object.assign({}, preparedPayload, {
          opsReferences:cfg.opsReferences || null,
          requiredReportFormat:cfg.requiredReportFormat || null
        })
      })
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok) return providerError(action, data?.error || `netlify_function_${response.status}`);
    return {
      provider:data.provider || provider,
      model:data.model || null,
      action:data.action || action,
      answer:String(data.answer || "").trim(),
      usage:data.usage || null,
      metadata:Object.assign({}, data.metadata || {}, { functionCalled:true })
    };
  }

  function enrichPayload(action, payload){
    const out = Object.assign({}, payload || {});
    const needsOpsContext = action === "analyzeRestaurant" ||
      action === "analyzeRequest" ||
      action === "generateFoodOrderFromStock" ||
      action === "generateFoodOrderFromHistory" ||
      action === "generateFoodOrderHybrid" ||
      action === "generateFranchiseeReport";
    if(needsOpsContext && !out.context && window.OPS_AI_ACCESS?.buildDataSummary){
      try{
        out.context = window.OPS_AI_ACCESS.buildDataSummary(out.question || action);
      }catch(error){}
    }
    if(action.startsWith("generateFoodOrder") && out.context?.completeOpsFile?.orders){
      out.lastSixOrders = out.context.completeOpsFile.orders.lastSixForSmartOrder || out.context.completeOpsFile.orders.latest || [];
    }
    return out;
  }

  const api = { version:VERSION, request };
  STANDARD_ACTIONS.forEach((action) => {
    api[action] = (payload) => request(action, payload);
  });

  window.OPS_AI_PROVIDER = api;
  window.OPS_AI_PROVIDER_READY = true;
  console.log("AI Provider loaded");
  console.log("Provider =", config().provider || "openai");
  window.dispatchEvent(new CustomEvent("ops-ai-provider-ready", { detail:{ provider:config().provider || "openai", version:VERSION } }));
})();
