const STANDARD_ACTIONS = new Set([
  "analyzeRestaurant",
  "generateOpsMessage",
  "analyzeRequest",
  "generateFoodOrderFromStock",
  "generateFoodOrderFromHistory",
  "generateFoodOrderHybrid",
  "generateFranchiseeReport"
]);

let OpenAIClient = null;

exports.handler = async function(event){
  console.log("[OPS AI] ai-provider appelée", {
    method:event.httpMethod,
    hasOpenAiKey:Boolean(process.env.OPENAI_API_KEY),
    provider:process.env.AI_PROVIDER || "openai"
  });
  if(event.httpMethod === "OPTIONS"){
    return json(204, {});
  }
  if(event.httpMethod === "GET"){
    return json(200, {
      success:true,
      message:"AI Provider Online",
      function:"ai-provider",
      openaiKeyDetected:Boolean(process.env.OPENAI_API_KEY),
      provider:process.env.AI_PROVIDER || "openai",
      version:"v528"
    });
  }
  if(event.httpMethod !== "POST"){
    return json(405, { error:"Méthode non autorisée" });
  }

  try{
    const body = JSON.parse(event.body || "{}");
    const provider = normalizeProvider(body.provider || process.env.AI_PROVIDER || "openai");
    const action = String(body.action || "analyzeRequest");
    const payload = body.payload || {};
    if(!STANDARD_ACTIONS.has(action)) return json(400, { error:"Action IA non supportée" });

    const auth = event.headers.authorization || event.headers.Authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    const verifiedUser = token ? await verifySupabaseUser(token) : null;
    const contextUser = payload?.context?.auth?.user || payload?.context?.user || {};
    const user = verifiedUser?.id ? verifiedUser : {
      id:contextUser.id || contextUser.email || "ops-ai-user",
      email:contextUser.email || ""
    };
    const sessionVerified = Boolean(verifiedUser?.id);

    console.log("[OPS AI] requête validée", {
      provider,
      action,
      user_id:user.id,
      session_verified:sessionVerified,
      frontend_context_user:Boolean(contextUser?.email || contextUser?.id),
      openai_key_detected:Boolean(process.env.OPENAI_API_KEY)
    });
    const prompt = buildPrompt(action, payload);
    const result = await providerRequest(provider, prompt);
    console.log("[OPS AI] réponse fournisseur reçue", {
      provider,
      action,
      model:result.model,
      openai_call_executed:Boolean(result.debug?.openaiCallExecuted),
      openai_response_received:Boolean(result.debug?.openaiResponseReceived),
      total_tokens:result.usage?.totalTokens || null
    });
    return json(200, {
      provider,
      action,
      model:result.model,
      answer:result.answer || payload.localAnswer || "Aucune analyse disponible.",
      usage:result.usage || null,
      metadata:{
        architecture:"provider_agnostic",
        user_id:user.id,
        sessionVerified,
        functionCalled:true,
        openaiKeyDetected:Boolean(process.env.OPENAI_API_KEY),
        openaiCallExecuted:Boolean(result.debug?.openaiCallExecuted),
        openaiResponseReceived:Boolean(result.debug?.openaiResponseReceived)
      }
    });
  }catch(error){
    console.error("[OPS AI] erreur ai-provider", error);
    return json(500, { error:error.message || "Erreur IA" });
  }
};

function normalizeProvider(provider){
  const clean = String(provider || "openai").toLowerCase().trim();
  return ["openai", "gemini", "claude"].includes(clean) ? clean : "openai";
}

function buildPrompt(action, payload){
  const references = payload.opsReferences || {};
  const format = Array.isArray(payload.requiredReportFormat) ? payload.requiredReportFormat : [];
