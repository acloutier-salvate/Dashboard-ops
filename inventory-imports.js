import {
  inferStorage,
  normalizeLocation,
  norm,
  number,
  parseNumber,
  parseQtyUnit,
  round,
  stableProductId,
  text,
  uid
} from "./inventory-utils.js?v=98";
import { inventoryValue } from "./inventory-calculations.js?v=98";

export function parseCsv(csvText){
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for(let i=0; i<csvText.length; i++){
    const char = csvText[i];
    const next = csvText[i+1];
    if(char === '"' && inQuotes && next === '"'){ cell += '"'; i++; continue; }
    if(char === '"'){ inQuotes = !inQuotes; continue; }
    if(char === "," && !inQuotes){ row.push(cell); cell = ""; continue; }
    if((char === "\n" || char === "\r") && !inQuotes){
      if(char === "\r" && next === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if(row.some((value) => text(value))) rows.push(row);
  const headers = (rows.shift() || []).map((header) => text(header));
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function supplierRowsToProducts(rows){
  return rows
    .filter((row) => text(row["Description de produit"]) || text(row["Produit #"]))
    .map((row) => {
      const qtyUnit = parseQtyUnit(row["Qté unité"]);
      const caseCost = parseNumber(row["Prix de la caisse"]);
      const qty = parseNumber(row["Quantité"]);
      const unitCost = parseNumber(row["Prix unitaire"]) ?? (caseCost && qty ? caseCost / qty : null);
      const product = {
        id:stableProductId("supplier", row["Produit #"], row["Description de produit"], row["Marque"]),
        category:text(row["Catégorie"]) || "Non classé",
        supplier:text(row["Marque"]) || "Fournisseur",
        supplier_product_code:text(row["Produit #"]) || text(row["Code de produit fournisseur"]),
        product_name:text(row["Description de produit"]),
        format:[qty ? number(qty) : "", qtyUnit.size ? `x ${number(qtyUnit.size,2)} ${qtyUnit.unit}` : ""].filter(Boolean).join(" ") || "Caisse",
        unit_type:qtyUnit.unit,
        unit_size:qtyUnit.size,
        case_cost:caseCost,
        unit_cost:unitCost,
        storage_location:normalizeLocation(text(row["Espace d'entreposage"]) || inferStorage(row["Catégorie"], row["Description de produit"])),
        minimum_stock:0,
        current_stock:parseNumber(row["Qté en inventaire"]) || 0,
        source:"supplier_csv",
        active_status:true
      };
      product.inventory_value = inventoryValue(product);
      return product;
    });
}

export async function importSupplierCsvFile(file){
  const csvText = await file.text();
  const rows = parseCsv(csvText);
  return supplierRowsToProducts(rows);
}

export async function parseFoodCostWorkbook(file){
  const buffer = await file.arrayBuffer();
  const zip = await readZipEntries(buffer);
  const shared = await readSharedStrings(zip);
  const sheets = await readWorkbookSheets(zip);
  const recipes = [];
  const ingredients = [];
  const byProduct = new Map();

  for(const sheet of sheets.slice(0, 260)){
    const xml = await zipText(zip, sheet.path);
    if(!xml) continue;
    const matrix = worksheetMatrix(xml, shared, 260, 16);
    const headerIndex = matrix.findIndex((row) =>
      row.some((cell) => norm(cell) === "marque") &&
      row.some((cell) => norm(cell) === "code") &&
      row.some((cell) => norm(cell).includes("produit"))
    );
    if(headerIndex < 0) continue;

    const recipeId = stableProductId("recipe", sheet.name);
    const recipeName = text(matrix[0]?.[1]) || sheet.name;
    const category = text(matrix[1]?.[5]) || "Autre";
    const format = text(matrix[0]?.[5]) || "N/A";
    let blanks = 0;
    let started = false;
    let total = 0;
    let count = 0;

    for(let r=headerIndex+1; r<matrix.length; r++){
      const row = matrix[r] || [];
      const brand = text(row[0]);
      const code = text(row[1]);
      const name = text(row[2]);
      const qty = parseNumber(row[3]);
      const unit = text(row[4]).toUpperCase();
      const unitCost = parseNumber(row[5]);
      const rau = parseNumber(row[6]);

      if(norm(row[0]).startsWith("cout") || norm(row[0]).startsWith("prix vente")){
        if(started) break;
      }
      if(!name && !code){
        if(started && ++blanks >= 4) break;
        continue;
      }
      blanks = 0;
      if(norm(name) === "produit" || norm(name) === "mo") continue;

      started = true;
      count++;
      total += rau || 0;
      ingredients.push({
        id:uid("ingredient"),
        recipe_id:recipeId,
        recipe_name:recipeName,
        recipe_category:category,
        ingredient_code:code,
        ingredient_name:name,
        brand,
        quantity:qty,
        unit_type:unit,
        unit_cost:unitCost,
        rau_cost:rau,
        preparation:text(row[7])
      });

      const key = `${norm(code)}|${norm(name)}|${norm(brand)}`;
      const acc = byProduct.get(key) || { code, name, brand, category, unit, costs:[], uses:0 };
      acc.uses++;
      if(unitCost !== null) acc.costs.push(unitCost);
      byProduct.set(key, acc);
    }

    recipes.push({ id:recipeId, sheet_name:sheet.name, recipe_name:recipeName, category, format, ingredient_count:count, total_cost:round(total) });
  }

  const products = [...byProduct.values()].map((product) => {
    const unitCost = product.costs.length ? product.costs.reduce((a,b) => a+b,0) / product.costs.length : null;
    return {
      id:stableProductId("foodcost", product.code, product.name, product.brand),
      category:product.category || "FoodCost",
      supplier:product.brand || "FoodCost",
      supplier_product_code:product.code,
      product_name:product.name,
      format:product.unit || "UN",
      unit_type:product.unit || "UN",
      unit_size:null,
      case_cost:null,
      unit_cost:unitCost === null ? null : round(unitCost),
      storage_location:normalizeLocation(inferStorage(product.category, product.name)),
      minimum_stock:0,
      current_stock:0,
      inventory_value:0,
      active_status:true,
      source:"foodcost_xlsm",
      foodcost_usage_count:product.uses,
      foodcost_avg_unit_cost:unitCost === null ? null : round(unitCost)
    };
  });

  return { recipes, recipeIngredients:ingredients, products };
}

async function readZipEntries(buffer){
  const view = new DataView(buffer);
  let eocd = -1;
  for(let i=view.byteLength - 22; i>=0 && i>view.byteLength - 66000; i--){
    if(view.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if(eocd < 0) throw new Error("Fichier Excel invalide");
  const total = view.getUint16(eocd + 10, true);
  const dirOffset = view.getUint32(eocd + 16, true);
  const entries = new Map();
  let ptr = dirOffset;
  for(let i=0; i<total; i++){
    if(view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const fileNameLength = view.getUint16(ptr + 28, true);
    const extraLength = view.getUint16(ptr + 30, true);
    const commentLength = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(buffer.slice(ptr + 46, ptr + 46 + fileNameLength)).replace(/\\/g, "/");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, { method, data:buffer.slice(dataStart, dataStart + compressedSize) });
    ptr += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

async function zipText(entries, path){
  const entry = entries.get(path) || entries.get(path.replace(/^xl\//, ""));
  if(!entry) return "";
  let bytes;
  if(entry.method === 0){
    bytes = entry.data;
  }else if(entry.method === 8){
    const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    bytes = await new Response(stream).arrayBuffer();
  }else{
    throw new Error("Compression Excel non supportée");
  }
  return new TextDecoder("utf-8").decode(bytes);
}

async function readSharedStrings(zip){
  const xml = await zipText(zip, "xl/sharedStrings.xml");
  if(!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.getElementsByTagName("si")].map((si) => [...si.getElementsByTagName("t")].map((t) => t.textContent || "").join(""));
}

async function readWorkbookSheets(zip){
  const workbook = await zipText(zip, "xl/workbook.xml");
  const rels = await zipText(zip, "xl/_rels/workbook.xml.rels");
  const relDoc = new DOMParser().parseFromString(rels, "application/xml");
  const relMap = new Map([...relDoc.getElementsByTagName("Relationship")].map((rel) => [rel.getAttribute("Id"), "xl/" + rel.getAttribute("Target").replace(/^\/?xl\//, "")]));
  const doc = new DOMParser().parseFromString(workbook, "application/xml");
  return [...doc.getElementsByTagName("sheet")]
    .map((sheet) => ({
      name:sheet.getAttribute("name") || "",
      path:relMap.get(sheet.getAttribute("r:id")) || ""
    }))
    .filter((sheet) => sheet.path);
}

function worksheetMatrix(xml, shared, maxRows, maxCols){
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const matrix = Array.from({ length:maxRows }, () => Array(maxCols).fill(""));
  [...doc.getElementsByTagName("c")].forEach((cell) => {
    const ref = cell.getAttribute("r") || "";
    const pos = cellRef(ref);
    if(!pos || pos.row >= maxRows || pos.col >= maxCols) return;
    const type = cell.getAttribute("t");
    let value = "";
    if(type === "inlineStr"){
      value = [...cell.getElementsByTagName("t")].map((t) => t.textContent || "").join("");
    }else{
      value = cell.getElementsByTagName("v")[0]?.textContent || "";
      if(type === "s") value = shared[Number(value)] || "";
    }
    matrix[pos.row][pos.col] = value;
  });
  return matrix;
}

function cellRef(ref){
  const match = ref.match(/^([A-Z]+)(\d+)$/i);
  if(!match) return null;
  let col = 0;
  for(const char of match[1].toUpperCase()) col = col * 26 + char.charCodeAt(0) - 64;
  return { col:col - 1, row:Number(match[2]) - 1 };
}
