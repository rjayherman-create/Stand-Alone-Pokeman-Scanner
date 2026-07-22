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
      max_completion_tokens: 1000,
      messages: [
        {
          role: "system",
          content: "You identify sealed Pokémon Trading Card Game products from package photos. Return only valid JSON. Never invent a UPC, set, promo, language, or product identifier. Use null when uncertain.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Identify this exact Pokémon product. Return JSON with: product_name, set_name, series_name, product_type, language, region, upc, sku, promo_card_name, booster_pack_count, pokemon_center_exclusive, sealed_status, box_condition, confidence (0-100), match_notes, needs_review. Retailer: ${retailer}. Purchase date: ${purchaseDate}.`,
            },
            ...imageContent,
          ],
        },
      ],
    });

    const extracted = parseJson(completion.choices[0]?.message?.content ?? "{}");
    const productName = String(extracted.product_name || "Unknown Pokémon product");
    const confidence = Number(extracted.confidence || 0);

    const savedItems = [];
    for (let unit = 1; unit <= quantity; unit += 1) {
      const [saved] = await db.insert(inventoryItemsTable).values({
        retailer,
        source_type: "pokemon_scan",
        store_location: storeLocation,
        product_name: productName,
        brand: "Pokémon",
        subcategory: extracted.product_type ? String(extracted.product_type) : "Sealed Pokémon product",
        upc: extracted.upc ? String(extracted.upc) : null,
        sku: extracted.sku ? String(extracted.sku) : null,
        price: Number.isFinite(purchasePrice) ? purchasePrice : 0,
        current_store_price: Number.isFinite(purchasePrice) ? purchasePrice : 0,
        category: "Pokemon",
        box_condition: extracted.box_condition ? String(extracted.box_condition) : null,
        sealed_status: extracted.sealed_status ? String(extracted.sealed_status) : "sealed",
        confidence_score: Number.isFinite(confidence) ? Math.round(confidence) : 0,
        match_confidence: Number.isFinite(confidence) ? Math.round(confidence) : 0,
        recommendation: confidence >= 75 ? "HOLD" : "UNDER REVIEW",
        scan_time: new Date().toISOString(),
        analysis_json: {
          ...extracted,
          purchaseDate,
          inventoryUnit: unit,
          sourceImageCount: files.length,
          marketCheckedAt: null,
        },
      }).returning();
      savedItems.push(saved);
    }

    res.json({
      success: true,
      extracted,
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
  });
});

export default router;
