exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod === "GET") {
    return json(200, headers, {
      success: true,
      message: "AI Provider Online",
      function: "ai-provider",
      provider: "openai",
      version: "v531",
      openaiKeyDetected: Boolean(process.env.OPENAI_API_KEY)
    });
  }

  if (event.httpMethod !== "POST") {
    return json(405, headers, { error: "Méthode non autorisée" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json(500, headers, {
        error: "OPENAI_API_KEY manquante dans Netlify",
        provider: "provider_error",
        version: "v531"
      });
    }

    const body = JSON.parse(event.body || "{}");
    const action = body.action || "analyzeRequest";
    const payload = body.payload || {};
    const prompt = buildPrompt(action, payload);

    const OpenAI = await loadOpenAI();
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.12,
      max_tokens: 1100,
      messages: [
        {
          role: "system",
          content: [
            "Tu es OPS AI, un directeur des opérations virtuel pour Pizza Salvatoré.",
            "Tu dois être strictement fidèle aux données JSON fournies.",
            "Tu n'as jamais le droit d'inventer un CSI, une vente, un délai, une plainte, un inventaire, un stock, une quantité ou une commande.",
            "Si une réponse locale calculée par Dashboard OPS ou context.lockedDashboardFacts est fournie, elle contient les chiffres exacts. Tu dois l'utiliser comme source de vérité, sans modifier les chiffres, puis seulement expliquer et prioriser.",
            "Si une donnée manque, écris clairement: donnée non disponible.",
            "Tu dois toujours respecter le contexte d'écran: Centre de contrôle = réseau complet; Restaurant = restaurant sélectionné; Plaintes = filtres plaintes actifs; Inventaire = restaurant et inventaire actifs.",
            "Pour l'inventaire et les commandes, tu ne dois jamais remplacer les calculs déterministes du logiciel. Tu peux seulement expliquer, vérifier, prioriser et recommander à partir des valeurs présentes.",
            "Si les dernières commandes, le dernier inventaire ou les stocks cibles ne sont pas présents, indique que la recommandation doit être validée manuellement.",
            "Réponds en français, de façon professionnelle, concise, terrain et actionnable."
          ].join(" ")
        },
        { role: "user", content: prompt }
      ]
    });

    return json(200, headers, {
      provider: "openai",
      action,
      model,
      version: "v534",
      answer: completion?.choices?.[0]?.message?.content?.trim() || "Aucune réponse générée.",
      usage: {
        promptTokens: completion?.usage?.prompt_tokens || null,
        outputTokens: completion?.usage?.completion_tokens || null,
        totalTokens: completion?.usage?.total_tokens || null
      },
      metadata: {
        functionCalled: true,
        openaiKeyDetected: true,
        openaiCallExecuted: true,
        openaiResponseReceived: Boolean(completion?.choices?.[0]?.message?.content),
        strictOpsMode: true,
        inventorySafetyMode: true
      }
    });
  } catch (error) {
    return json(500, headers, {
      error: error?.message || "Erreur IA",
      provider: "provider_error",
      version: "v534"
    });
  }
};

function buildPrompt(action, payload) {
  const context = payload.context || {};
