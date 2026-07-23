import { Router } from "express";
import multer from "multer";
import { db, inventoryItemsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    const allowed = file.mimetype.startsWith("image/");
    cb(allowed ? null : new Error("Only image files are supported for Pokémon product scans."), allowed);
  },
});

function parseJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The scanner did not return valid product data.");
  return JSON.parse(match[0]) as Record<string, unknown>;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function collectorNumberBase(value: unknown) {
  return clean(value).split("/")[0]?.trim() ?? "";
}

function escapePokemonQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function findPokemonCardMatches(extracted: Record<string, unknown>) {
  const productType = clean(extracted.product_type).toLowerCase();
  const cardName = clean(extracted.card_name || extracted.pokemon_name || extracted.product_name);
  const cardNumber = collectorNumberBase(extracted.collector_number || extracted.card_number);
  const setName = clean(extracted.set_name);

  if (!cardName || (!productType.includes("card") && !cardNumber)) return [];

  const queryParts = [`name:"${escapePokemonQuery(cardName)}"`];
  if (cardNumber) queryParts.push(`number:"${escapePokemonQuery(cardNumber)}"`);
  if (setName) queryParts.push(`set.name:"${escapePokemonQuery(setName)}"`);

  const params = new URLSearchParams({ q: queryParts.join(" "), pageSize: "5" });
  const response = await fetch(`https://api.pokemontcg.io/v2/cards?${params}`, {
    headers: process.env.POKEMON_TCG_API_KEY ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY } : {},
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return [];
  const json = await response.json() as { data?: Array<Record<string, any>> };

  return (json.data ?? []).map(card => ({
    id: card.id,
    name: card.name,
    number: card.number,
    rarity: card.rarity ?? null,
    set_name: card.set?.name ?? null,
    image: card.images?.small ?? null,
    prices: card.tcgplayer?.prices ?? null,
  }));
}

async function lookupUpc(upcValue: unknown) {
  const upc = clean(upcValue).replace(/\D/g, "");
  if (upc.length < 8 || upc.length > 14) return null;

  const paidMode = process.env.UPCITEMDB_MODE === "paid";
  const endpoint = paidMode
    ? "https://api.upcitemdb.com/prod/v1/lookup"
    : "https://api.upcitemdb.com/prod/trial/lookup";
  const headers: Record<string, string> = { Accept: "application/json" };

  if (paidMode && process.env.UPCITEMDB_USER_KEY && process.env.UPCITEMDB_KEY_TYPE) {
    headers.user_key = process.env.UPCITEMDB_USER_KEY;
    headers.key_type = process.env.UPCITEMDB_KEY_TYPE;
  }

  const response = await fetch(`${endpoint}?${new URLSearchParams({ upc })}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;

  const json = await response.json() as { items?: Array<Record<string, any>> };
  const item = json.items?.[0];
  if (!item) return null;

  return {
    upc,
    title: item.title ?? null,
    brand: item.brand ?? null,
    category: item.category ?? null,
    images: item.images ?? [],
    lowest_recorded_price: item.lowest_recorded_price ?? null,
  };
}

function estimateOpenAiCost(inputTokens: number, outputTokens: number) {
  // GPT-4.1 mini pricing: $0.40/M input tokens and $1.60/M output tokens.
  return Number((((inputTokens / 1_000_000) * 0.4) + ((outputTokens / 1_000_000) * 1.6)).toFixed(6));
}

router.post("/pokemon/scan", upload.array("images", 4), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) return res.status(400).json({ success: false, error: "Upload at least one product image using the images field." });

    const retailer = String(req.body.retailer || "Unknown retailer");
    const storeLocation = String(req.body.store_location || "Unknown location");
    const purchasePrice = Number(req.body.purchase_price || 0);
    const quantity = Math.max(1, Number(req.body.quantity || 1));
    const purchaseDate = String(req.body.purchase_date || new Date().toISOString().slice(0, 10));

    const imageContent = files.map(file => ({
      type: "image_url" as const,
      image_url: { url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`, detail: "high" as const },
    }));

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 1200,
      messages: [
        {
          role: "system",
          content: "You identify Pokémon TCG cards, graded cards, and sealed products from photos. Return only valid JSON. Never invent a UPC, set, collector number, promo, language, grade, or identifier. Use null when uncertain. Identification is not authentication.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Identify this exact Pokémon item. Return JSON with: product_name, card_name, pokemon_name, collector_number, set_name, series_name, product_type, rarity, language, region, upc, sku, grading_company, grade, promo_card_name, booster_pack_count, pokemon_center_exclusive, sealed_status, box_condition, card_condition, confidence (0-100), match_notes, needs_review. Retailer: ${retailer}. Purchase date: ${purchaseDate}.`,
            },
            ...imageContent,
          ],
        },
      ],
    });

    const extracted = parseJson(completion.choices[0]?.message?.content ?? "{}");
    const productName = String(extracted.product_name || extracted.card_name || "Unknown Pokémon product");
    const confidence = Number(extracted.confidence || 0);
    const warnings: string[] = [];

    const [cardMatches, upcMatch] = await Promise.all([
      findPokemonCardMatches(extracted).catch(error => {
        warnings.push(`Pokémon card confirmation unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
        return [];
      }),
      lookupUpc(extracted.upc).catch(error => {
        warnings.push(`UPC confirmation unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
        return null;
      }),
    ]);

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    const scanCostUsd = estimateOpenAiCost(inputTokens, outputTokens);

    const savedItems = [];
    for (let unit = 1; unit <= quantity; unit += 1) {
      const [saved] = await db.insert(inventoryItemsTable).values({
        retailer,
        source_type: "pokemon_scan",
        store_location: storeLocation,
        product_name: productName,
        brand: "Pokémon",
        subcategory: extracted.product_type ? String(extracted.product_type) : "Pokémon product",
        upc: extracted.upc ? String(extracted.upc) : null,
        sku: extracted.sku ? String(extracted.sku) : null,
        price: Number.isFinite(purchasePrice) ? purchasePrice : 0,
        current_store_price: Number.isFinite(purchasePrice) ? purchasePrice : 0,
        category: "Pokemon",
        box_condition: extracted.box_condition ? String(extracted.box_condition) : null,
        sealed_status: extracted.sealed_status ? String(extracted.sealed_status) : null,
        confidence_score: Number.isFinite(confidence) ? Math.round(confidence) : 0,
        match_confidence: Number.isFinite(confidence) ? Math.round(confidence) : 0,
        recommendation: confidence >= 75 ? "HOLD" : "UNDER REVIEW",
        scan_time: new Date().toISOString(),
        analysis_json: {
          ...extracted,
          purchaseDate,
          inventoryUnit: unit,
          sourceImageCount: files.length,
          pokemonCardMatches: cardMatches,
          upcMatch,
          scanUsage: { inputTokens, outputTokens, estimatedOpenAiCostUsd: scanCostUsd },
          warnings,
          marketCheckedAt: null,
        },
      }).returning();
      savedItems.push(saved);
    }

    res.json({
      success: true,
      extracted,
      confirmations: { pokemon_card_matches: cardMatches, upc_match: upcMatch },
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_openai_cost_usd: scanCostUsd },
      warnings,
      saved_items: savedItems,
      next: {
        portfolio: "/api/pokemon/portfolio",
        market_check: savedItems.map(item => `/api/pokemon/market-check/${item.id}`),
      },
    });
  } catch (error) {
    req.log?.error?.({ error }, "Pokemon scan failed");
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Pokémon scan failed." });
  }
});

router.get("/pokemon/scan/status", (_req, res) => {
  res.json({
    status: "ok",
    endpoint: "POST /api/pokemon/scan",
    fields: ["images", "retailer", "store_location", "purchase_price", "quantity", "purchase_date"],
    imageLimit: 4,
    maxFileSizeMb: 20,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    openaiConfigured: Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY),
    pokemonTcgConfigured: Boolean(process.env.POKEMON_TCG_API_KEY),
    upcItemDbMode: process.env.UPCITEMDB_MODE || "trial",
  });
});

export default router;
