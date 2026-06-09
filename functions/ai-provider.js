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
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "AI Provider Online",
        function: "ai-provider",
        provider: "openai",
        version: "v529",
        openaiKeyDetected: Boolean(process.env.OPENAI_API_KEY)
      })
    };
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
        version: "v529"
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
      temperature: 0.25,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content: "Tu es OPS AI, un directeur des opérations virtuel pour Pizza Salvatoré. Réponds en français, de façon professionnelle, concise et actionnable. Utilise seulement les données fournies."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    return json(200, headers, {
      provider: "openai",
      action,
      model,
      version: "v529",
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
        openaiResponseReceived: Boolean(completion?.choices?.[0]?.message?.content)
      }
    });
  } catch (error) {
    return json(500, headers, {
      error: error?.message || "Erreur IA",
      provider: "provider_error",
      version: "v529"
    });
  }
};

function buildPrompt(action, payload) {
  const context = payload.context || {};
  const references = payload.opsReferences || {};
  const format = payload.requiredReportFormat || [
    "Résumé exécutif",
    "Forces",
    "Risques",
    "Causes probables",
    "Actions recommandées",
    "Niveau de priorité",
    "Message suggéré au franchisé"
  ];

  return [
    "Action demandée:",
    action,
    "",
    "Question utilisateur:",
    payload.question || "Analyse OPS",
    "",
    "Réponse locale calculée par Dashboard OPS:",
    payload.localAnswer || "Non disponible",
    "",
    "Références OPS Salvatoré:",
    "- CSI vert: 88% et plus",
    "- CSI jaune: 85% à 87,99%",
    "- CSI rouge: moins de 85%",
    "- Délai livraison cible réseau: 34 minutes",
    "- Food Cost cible: 31,5%",
    "- Labor cible: 27%",
    "",
    "Format attendu:",
    format.map((item, index) => `${index + 1}. ${item}`).join("\n"),
    "",
    "Contexte autorisé transmis par Dashboard OPS:",
    JSON.stringify(context, null, 2),
    "",
    "Important:",
    "- Ne jamais inventer une donnée absente.",
    "- Respecter les restaurants et permissions présents dans le contexte.",
    "- Si l'utilisateur demande quoi faire aujourd'hui, retourner les 5 priorités OPS les plus importantes selon les données disponibles.",
    "- Pour les commandes intelligentes, tenir compte des dernières commandes et inventaires si présents."
  ].join("\n");
}

async function loadOpenAI() {
  const mod = await import("openai");
  return mod.default || mod.OpenAI || mod;
}

function json(statusCode, headers, payload) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(payload)
  };
}
