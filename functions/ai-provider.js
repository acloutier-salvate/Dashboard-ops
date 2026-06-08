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
      version:"v523"
    });
  }
  if(event.httpMethod !== "POST"){
    return json(405, { error:"Méthode non autorisée" });
  }

  try{
    const auth = event.headers.authorization || event.headers.Authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if(!token) return json(401, { error:"Session requise" });
    const user = await verifySupabaseUser(token);
    if(!user?.id) return json(401, { error:"Session invalide" });

    const body = JSON.parse(event.body || "{}");
    const provider = normalizeProvider(body.provider || process.env.AI_PROVIDER || "openai");
    const action = String(body.action || "analyzeRequest");
    const payload = body.payload || {};
    if(!STANDARD_ACTIONS.has(action)) return json(400, { error:"Action IA non supportée" });

    console.log("[OPS AI] requête validée", {
      provider,
      action,
      user_id:user.id,
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
  return [
    "Tu es OPS AI, un directeur des opérations senior pour un réseau Pizza Salvatoré.",
    "Tu dois utiliser uniquement les données autorisées dans le contexte fourni.",
    "Tu ne dois jamais inventer d'information, ni mentionner un restaurant absent des permissions.",
    "Réponds en français, avec un style professionnel, concis, intelligent et actionnable.",
    "Analyse le dossier OPS complet transmis dans context.completeOpsFile avant de répondre.",
    "Ne réponds jamais de façon générique si le dossier contient des données exploitables.",
    "Si context.needsRestaurant est vrai, demande simplement: Quel restaurant veux-tu analyser ?",
    "Pour 'Que dois-je faire aujourd'hui ?', analyse tous les restaurants accessibles et retourne les top 5 interventions OPS prioritaires.",
    "Pour les commandes intelligentes, utilise les 6 dernières commandes disponibles si elles sont présentes dans payload.lastSixOrders ou context.completeOpsFile.orders.lastSixForSmartOrder.",
    "Utilise les tendances, les derniers audits, les commandes, les inventaires, les plaintes et les KPI quand ces données sont disponibles.",
    "Si une donnée n'est pas présente dans le dossier, indique-le clairement au lieu de l'inventer.",
    "",
    "Références OPS Salvatoré:",
    `- CSI vert: ${references?.csi?.green ?? 88}% et plus`,
    `- CSI jaune: ${references?.csi?.yellowMin ?? 85}% à ${references?.csi?.yellowMax ?? 87.99}%`,
    `- CSI rouge: moins de ${references?.csi?.redBelow ?? 85}%`,
    `- Délai livraison cible réseau: ${references?.deliveryDelayMinutes ?? 34} minutes`,
    `- Food Cost cible: ${references?.foodCostPercent ?? 31.5}%`,
    `- Labor cible: ${references?.laborPercent ?? 27}%`,
    "",
    "Format attendu lorsque l'analyse est détaillée:",
    ...(format.length ? format.map((item, index) => `${index + 1}. ${item}`) : [
      "1. Résumé exécutif",
      "2. Forces",
      "3. Risques",
      "4. Causes probables",
      "5. Actions recommandées",
      "6. Niveau de priorité",
      "7. Message suggéré au franchisé"
    ]),
    "",
    "Action demandée:",
    action,
    "",
    "Question utilisateur:",
    payload.question || "Analyse OPS",
    "",
    "Réponse locale calculée par Dashboard OPS:",
    payload.localAnswer || "Non disponible",
    "",
    "Contexte autorisé filtré:",
    JSON.stringify(payload.context || {}, null, 2),
    "",
    "Données de tendance à considérer si présentes:",
    "- semaine actuelle",
    "- 4 semaines précédentes",
    "- dernier audit",
    "- dernière commande",
    "- dernier inventaire"
  ].join("\n");
}

async function providerRequest(provider, prompt){
  if(provider === "gemini") return geminiProvider(prompt);
  if(provider === "claude") return claudeProvider(prompt);
  return openAiProvider(prompt);
}

async function openAiProvider(prompt){
  const apiKey = process.env.OPENAI_API_KEY;
  console.log("[OPS AI] OpenAI provider", { key_detected:Boolean(apiKey) });
  if(!apiKey) throw new Error("OpenAI non configuré: variable OPENAI_API_KEY manquante");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const OpenAI = await loadOpenAI();
  const client = new OpenAI({ apiKey });
  console.log("[OPS AI] appel OpenAI exécuté", { model });
  const completion = await client.chat.completions.create({
    model,
    temperature:0.25,
    max_tokens:900,
    messages:[
      { role:"system", content:"Tu es OPS AI, un directeur des opérations virtuel pour Pizza Salvatoré. Respecte strictement les permissions et les données fournies." },
      { role:"user", content:prompt }
    ]
  });
  return {
    model,
    answer:completion?.choices?.[0]?.message?.content?.trim() || "",
    usage:{
      promptTokens:completion?.usage?.prompt_tokens || null,
      outputTokens:completion?.usage?.completion_tokens || null,
      totalTokens:completion?.usage?.total_tokens || null
    },
    debug:{
      openaiKeyDetected:true,
      openaiCallExecuted:true,
      openaiResponseReceived:Boolean(completion?.choices?.[0]?.message?.content)
    }
  };
}

async function loadOpenAI(){
  if(OpenAIClient) return OpenAIClient;
  try{
    const mod = await import("openai");
    OpenAIClient = mod.default || mod.OpenAI || mod;
    return OpenAIClient;
  }catch(error){
    throw new Error("SDK OpenAI non installé. Vérifie que package.json est publié sur Netlify et que le build a réinstallé les dépendances.");
  }
}

async function geminiProvider(prompt){
  const apiKey = process.env.GEMINI_API_KEY;
  if(!apiKey) throw new Error("Gemini non configuré: variable GEMINI_API_KEY manquante");
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      contents:[{ role:"user", parts:[{ text:prompt }] }],
      generationConfig:{ temperature:0.25, topP:0.85, maxOutputTokens:900 }
    })
  });
  const data = await response.json();
  if(!response.ok) throw new Error(data?.error?.message || "Erreur Gemini");
  return {
    model,
    answer:data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "",
    usage:{
      promptTokens:data?.usageMetadata?.promptTokenCount || null,
      outputTokens:data?.usageMetadata?.candidatesTokenCount || null,
      totalTokens:data?.usageMetadata?.totalTokenCount || null
    }
  };
}

async function claudeProvider(prompt){
  const apiKey = process.env.CLAUDE_API_KEY;
  if(!apiKey) throw new Error("Claude non configuré: variable CLAUDE_API_KEY manquante");
  const model = process.env.CLAUDE_MODEL || "claude-3-5-haiku-latest";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key":apiKey,
      "anthropic-version":"2023-06-01"
    },
    body:JSON.stringify({
      model,
      max_tokens:900,
      temperature:0.25,
      messages:[{ role:"user", content:prompt }]
    })
  });
  const data = await response.json();
  if(!response.ok) throw new Error(data?.error?.message || "Erreur Claude");
  return {
    model,
    answer:(data?.content || []).map((part) => part.text || "").join("").trim(),
    usage:{
      promptTokens:data?.usage?.input_tokens || null,
      outputTokens:data?.usage?.output_tokens || null,
      totalTokens:(data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0) || null
    }
  };
}

async function verifySupabaseUser(token){
  const url = process.env.SUPABASE_URL || "https://kbygjmcnntaoqmzfchta.supabase.co";
  const anon = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJrYnlnam1jbm50YW9xbXpmY2h0YSIsInJlZiI6ImtieWdqbWNubnRhb3FtemZjaHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTQxMTMsImV4cCI6MjA5MzY5MDExM30.xy2nJsJDOOWIJr8_J-GdZKwjhsgMjaf2OcTpXf01sUA";
  const response = await fetch(`${url}/auth/v1/user`, {
    headers:{ "apikey":anon, "Authorization":`Bearer ${token}` }
  });
  if(!response.ok) return null;
  return response.json();
}

function json(statusCode, payload){
  return {
    statusCode,
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Headers":"Content-Type, Authorization",
      "Access-Control-Allow-Methods":"POST, OPTIONS"
    },
    body:statusCode === 204 ? "" : JSON.stringify(payload)
  };
}
