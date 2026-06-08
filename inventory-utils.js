export const text = (value) => String(value ?? "").trim();

export const norm = (value) => text(value)
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

export const round = (value) => Math.round(Number(value || 0) * 100) / 100;

export const money = (value) => Number.isFinite(Number(value))
  ? Number(value).toLocaleString("fr-CA", { style:"currency", currency:"CAD", maximumFractionDigits:0 })
  : "—";

export const moneyPrecise = (value) => Number.isFinite(Number(value))
  ? Number(value).toLocaleString("fr-CA", { style:"currency", currency:"CAD", minimumFractionDigits:2, maximumFractionDigits:2 })
  : "—";

export const number = (value, digits=0) => Number.isFinite(Number(value))
  ? Number(value).toLocaleString("fr-CA", { maximumFractionDigits:digits })
  : "—";

export const safe = (value) => text(value).replace(/[&<>"']/g, (char) => ({
  "&":"&amp;",
  "<":"&lt;",
  ">":"&gt;",
  '"':"&quot;",
  "'":"&#039;"
}[char]));

export const uid = (prefix="inv") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

export function normalizeLocation(value){
  const raw = text(value);
  const key = norm(raw);
  if(!raw) return "Sec";
  if(key.includes("cong") || key.includes("freez") || key.includes("surgel")) return "Congélateur";
  if(key.includes("frigo") || key.includes("refriger")) return "Réfrigérateur";
  if(key.includes("ingredient") && key.includes("sec")) return "Sec";
  if(key === "sec" || key.includes("sec -") || key.includes("sec/") || key === "ingredients secs" || key === "ingredient sec") return "Sec";
  return raw;
}

export function parseNumber(value){
  const clean = text(value)
    .replace(/\s/g, "")
    .replace("$", "")
    .replace(",", ".")
    .replace(/[^0-9.\-]/g, "");
  if(!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export function parseQtyUnit(value){
  const match = text(value).match(/^([0-9]+(?:[\.,][0-9]+)?)\s*(.*)$/);
  if(!match) return { size:null, unit:text(value) || "UN" };
  return { size:parseNumber(match[1]), unit:text(match[2]).toUpperCase() || "UN" };
}

export function inferStorage(category, name){
  const hay = norm(`${category} ${name}`);
  if(/congel|surgel|volaille|poulet|boeuf|porc|charcuterie/.test(hay)) return "Congélateur";
  if(/laitier|oeuf|fromage|legume|fruit|refriger|frigo/.test(hay)) return "Réfrigérateur";
  if(/nettoyage|chimique/.test(hay)) return "Entretien";
  if(/jetable|sac|boite|emballage/.test(hay)) return "Sec - emballage";
  return "Sec";
}

export function stableProductId(...parts){
  const source = parts.map((part) => norm(part)).join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x12345678;
  for(let i=0; i<source.length; i++){
    h1 = Math.imul(h1 ^ source.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ source.charCodeAt(i), 1597334677);
  }
  const hex = (h1 >>> 0).toString(16).padStart(8,"0") + (h2 >>> 0).toString(16).padStart(8,"0") + "0000000000000000";
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
