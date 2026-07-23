import { Router, type Request, type Response } from "express";
import multer from "multer";
import { openai } from "@workspace/integrations-openai-ai-server";
import { scoreFlipItem } from "../lib/scoring";
import { db, inventoryItemsTable } from "@workspace/db";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const RETAILER_TAG_HINTS: Record<string, string> = {
  Costco: "Costco price signs typically show item number, price ending in .97/.88/.00, and a star for discontinued items.",
  Walmart: "Walmart clearance tags are yellow with large CLEARANCE text, showing original price, clearance price, and percent off.",
  Target: "Target clearance tags show percent off (30%/50%/70%/90%) and DPCI/TCIN identifiers.",
  "BJ's": "BJ's Wholesale price tags are similar to Costco with item number and price endings.",
  "Sam's Club": "Sam's Club tags show item number, member price, and sometimes a clearance sticker.",
  "Home Depot": "Home Depot clearance items show orange tags with item SKU and original vs clearance price.",
  "Lowe's": "Lowe's clearance shows red/yellow tags with item SKU and markdown price.",
};

const photoScanHandler = async (req: Request, res: Response) => {
  try {
    const retailer = (req.body.retailer as string) || "Costco";
    const store_location = req.body.store_location as string;
    const category = (req.body.category as string) ?? "Other";

    if (!req.file) {
      res.status(400).json({ success: false, error_message: "No image uploaded." });
      return;
    }

    const imageBase64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";
    const tagHint = RETAILER_TAG_HINTS[retailer] ?? "Extract product name, price, and any identifier visible on the tag.";

    const systemPrompt = `You are an expert at reading retail price tags, clearance stickers, shelf signs, barcodes, and inventory screenshots across multiple retailers including Costco, Walmart, Target, BJ's, Sam's Club, Home Depot, Lowe's, and others.
Extract product information from the image. Return ONLY valid JSON — no markdown, no extra text.
If a field cannot be determined, use null.
For price, extract the numeric value (e.g. 14.97).
For markdown_code, extract the price ending as a string (e.g. ".97", ".88", ".00", ".99").
For percent_off, extract as a number (e.g. 30 for 30% off).
For stock_status, use "Seen in store" as default if item was seen on shelf.
${tagHint}`;

    const userPrompt = `Extract product details from this ${retailer} image.
Store: ${store_location}
Retailer: ${retailer}
Category hint: ${category}

Return JSON with these exact fields:
{
  "retailer": "${retailer}",
  "product_name": string or null,
  "brand": string or null,
  "item_number": string or null,
  "upc": string or null,
  "sku": string or null,
  "dpci": string or null,
  "tcin": string or null,
  "price": number or null,
  "regular_price": number or null,
  "clearance_price": number or null,
  "percent_off": number or null,
  "markdown_code": string or null,
  "visible_brand": string or null,
  "stock_status": "Seen in store",
  "store_location": "${store_location}",
  "scan_time": "${new Date().toISOString()}",
  "category": "${category}",
  "box_condition": "sealed" or "new" or "open_box" or "damaged" or null,
  "notes_from_image": string or null,
  "confidence": "high" or "medium" or "low"
}`;

    let extracted: Record<string, unknown> = {};
    let parseError: string | null = null;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_completion_tokens: 600,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" },
              },
            ],
          },
        ],
      });

      const text = completion.choices[0]?.message?.content ?? "{}";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      }
    } catch (aiErr) {
      req.log.error({ aiErr }, "AI extraction failed");
      parseError = "Could not read the image clearly. Try a closer photo of the price tag.";
    }

    if (!extracted.product_name && !extracted.price) {
      res.json({
        success: false,
        extracted,
        error_message: parseError ?? "Could not read the image clearly. Try a closer photo of the price tag.",
      });
      return;
    }

    // Score the item
    const price = typeof extracted.price === "number" ? extracted.price :
      typeof extracted.clearance_price === "number" ? extracted.clearance_price : 0;

    const decision = scoreFlipItem({
      retailer,
      product_name: String(extracted.product_name ?? "Unknown Item"),
      item_number: extracted.item_number ? String(extracted.item_number) : undefined,
      price,
      regular_price: typeof extracted.regular_price === "number" ? extracted.regular_price : undefined,
      clearance_price: typeof extracted.clearance_price === "number" ? extracted.clearance_price : undefined,
      percent_off: typeof extracted.percent_off === "number" ? extracted.percent_off : undefined,
      markdown_code: extracted.markdown_code ? String(extracted.markdown_code) : undefined,
      category: extracted.category ? String(extracted.category) : category,
      visible_brand: extracted.visible_brand ? String(extracted.visible_brand) : undefined,
      brand: extracted.brand ? String(extracted.brand) : undefined,
      stock_status: "Seen in store",
      box_condition: extracted.box_condition ? String(extracted.box_condition) : undefined,
    });

    // Auto-save to inventory
    const [saved] = await db
      .insert(inventoryItemsTable)
      .values({
        retailer,
        source_type: "photo_scan",
        store_location,
        product_name: String(extracted.product_name ?? "Unknown Item"),
        brand: extracted.brand ? String(extracted.brand) : null,
        item_number: extracted.item_number ? String(extracted.item_number) : null,
        upc: extracted.upc ? String(extracted.upc) : null,
        sku: extracted.sku ? String(extracted.sku) : null,
        dpci: extracted.dpci ? String(extracted.dpci) : null,
        tcin: extracted.tcin ? String(extracted.tcin) : null,
        price,
        regular_price: typeof extracted.regular_price === "number" ? extracted.regular_price : null,
        clearance_price: typeof extracted.clearance_price === "number" ? extracted.clearance_price : null,
        percent_off: typeof extracted.percent_off === "number" ? extracted.percent_off : null,
        markdown_code: extracted.markdown_code ? String(extracted.markdown_code) : null,
        stock_status: "Seen in store",
        visible_brand: extracted.visible_brand ? String(extracted.visible_brand) : null,
        category,
        box_condition: extracted.box_condition ? String(extracted.box_condition) : null,
        scan_time: new Date().toISOString(),
        notes_from_image: extracted.notes_from_image ? String(extracted.notes_from_image) : null,
        flip_score: decision.flip_score,
        recommendation: decision.recommendation,
        facebook_list_price: decision.facebook_list_price,
        expected_sale_price: decision.expected_sale_price,
        estimated_profit: decision.estimated_profit,
        max_quantity: decision.max_quantity,
        risk_notes: decision.risk_notes,
      })
      .returning();

    res.json({
      success: true,
      extracted,
      decision,
      saved_item: {
        ...saved,
        created_at: saved.created_at.toISOString(),
        updated_at: saved.updated_at.toISOString(),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Photo scan failed");
    res.status(500).json({ success: false, error_message: "Photo scan failed. Please try again." });
  }
};

// Keep both URL styles for compatibility:
// - /api/photo-scan (current)
// - /api/scan/photo-scan (legacy)
router.post("/photo-scan", upload.single("image"), photoScanHandler);
router.post("/scan/photo-scan", upload.single("image"), photoScanHandler);

const screenshotOcrHandler = async (req: Request, res: Response) => {
  try {
    const retailer = (req.body.retailer as string) || "Costco";
    const store_location = req.body.store_location as string;
    const search_term = (req.body.search_term as string) ?? "";

    if (!req.file) {
      res.status(400).json({ success: false, rows: [], error_message: "No image uploaded." });
      return;
    }

    const imageBase64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";

    const systemPrompt = `You are an expert at reading retail inventory screenshots from apps and websites including Costco, Walmart, Target, BJ's, Sam's Club, Home Depot, Lowe's, and others.
Extract ALL visible product rows from the image. Return ONLY valid JSON — no markdown, no extra text.`;

    const userPrompt = `Extract all visible inventory rows from this ${retailer} screenshot.
Store: ${store_location}
Retailer: ${retailer}
Search term: ${search_term}
Viewed at: ${new Date().toLocaleString()}

Return JSON:
{
  "retailer": "${retailer}",
  "store_location": "${store_location}",
  "search_term": string or "${search_term}",
  "viewed_at": "${new Date().toISOString()}",
  "items": [
    {
      "product_name": string or null,
      "brand": string or null,
      "item_number": string or null,
      "upc": string or null,
      "price": number or null,
      "regular_price": number or null,
      "clearance_price": number or null,
      "percent_off": number or null,
      "markdown_code": string or null,
      "stock_status": string or "In Stock",
      "visible_brand": string or null,
      "category": string or null,
      "notes_from_image": string or null,
      "needs_review": boolean
    }
  ]
}`;

    let parsed: { retailer?: string; store_location?: string; search_term?: string; viewed_at?: string; items?: unknown[] } = { items: [] };

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_completion_tokens: 2000,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" },
              },
            ],
          },
        ],
      });

      const text = completion.choices[0]?.message?.content ?? "{}";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (aiErr) {
      req.log.error({ aiErr }, "OCR extraction failed");
      res.json({
        success: false,
        rows: [],
        error_message: "No inventory rows detected. Try uploading a clearer screenshot.",
      });
      return;
    }

    const rows = (parsed.items ?? []).map((item: unknown) => {
      const i = item as Record<string, unknown>;
      return {
        product_name: i.product_name ?? null,
        brand: i.brand ?? null,
        item_number: i.item_number ?? null,
        upc: i.upc ?? null,
        price: i.price ?? null,
        regular_price: i.regular_price ?? null,
        clearance_price: i.clearance_price ?? null,
        percent_off: i.percent_off ?? null,
        markdown_code: i.markdown_code ?? null,
        stock_status: i.stock_status ?? "In Stock",
        needs_review: Boolean(i.needs_review),
      };
    });

    if (rows.length === 0) {
      res.json({
        success: false,
        rows: [],
        error_message: "No inventory rows detected. Try uploading a clearer screenshot.",
      });
      return;
    }

    res.json({
      success: true,
      store_location: parsed.store_location ?? store_location,
      search_term: parsed.search_term ?? search_term,
      viewed_at: parsed.viewed_at ?? new Date().toISOString(),
      rows,
    });
  } catch (err) {
    req.log.error({ err }, "Screenshot OCR failed");
    res.status(500).json({ success: false, rows: [], error_message: "Screenshot processing failed." });
  }
};

// Keep both URL styles for compatibility:
// - /api/screenshot-ocr (current)
// - /api/scan/screenshot-ocr (legacy)
router.post("/screenshot-ocr", upload.single("image"), screenshotOcrHandler);
router.post("/scan/screenshot-ocr", upload.single("image"), screenshotOcrHandler);

// POST /public-web-check
router.post("/public-web-check", async (req, res) => {
  const { retailer = "Costco", search_term } = req.body as {
    retailer?: string;
    search_term: string;
    store_location: string;
    product_url?: string;
    item_identifier?: string;
  };

  const retailerSearchUrls: Record<string, string> = {
    Costco: `https://www.costco.com/s?keyword=${encodeURIComponent(search_term)}`,
    Walmart: `https://www.walmart.com/search?q=${encodeURIComponent(search_term)}`,
    Target: `https://www.target.com/s?searchTerm=${encodeURIComponent(search_term)}`,
    "BJ's": `https://www.bjs.com/search?query=${encodeURIComponent(search_term)}`,
    "Sam's Club": `https://www.samsclub.com/s?searchTerm=${encodeURIComponent(search_term)}`,
    "Home Depot": `https://www.homedepot.com/s/${encodeURIComponent(search_term)}`,
    "Lowe's": `https://www.lowes.com/search?searchTerm=${encodeURIComponent(search_term)}`,
  };

  const sourceUrl = retailerSearchUrls[retailer] ?? `https://www.google.com/search?q=${encodeURIComponent(`${retailer} ${search_term} clearance`)}`;

  res.json({
    status: "no_inventory_visible",
    message: `Public web data was not available for this retailer or item. Use Photo Scan, Screenshot Upload, or Manual Add.`,
    rows: [],
    source_url: sourceUrl,
  });
});

// POST /score-item
router.post("/score-item", async (req, res) => {
  try {
    const body = req.body as {
      retailer?: string;
      product_name: string;
      item_number?: string;
      price: number;
      regular_price?: number;
      clearance_price?: number;
      percent_off?: number;
      markdown_code?: string;
      category?: string;
      visible_brand?: string;
      brand?: string;
      stock_status?: string;
      box_condition?: string;
      normal_retail_estimate?: number;
      local_demand_notes?: string;
    };

    const decision = scoreFlipItem({
      retailer: body.retailer,
      product_name: body.product_name,
      item_number: body.item_number,
      price: body.price,
      regular_price: body.regular_price,
      clearance_price: body.clearance_price,
      percent_off: body.percent_off,
      markdown_code: body.markdown_code,
      category: body.category,
      visible_brand: body.visible_brand,
      brand: body.brand,
      stock_status: body.stock_status,
      box_condition: body.box_condition,
      normal_retail_estimate: body.normal_retail_estimate,
      local_demand_notes: body.local_demand_notes,
    });

    res.json(decision);
  } catch (err) {
    req.log.error({ err }, "Score item failed");
    res.status(500).json({ error: "Scoring failed" });
  }
});

// POST /generate-listing
router.post("/generate-listing", async (req, res) => {
  try {
    const body = req.body as {
      product_name: string;
      item_number?: string;
      price: number;
      facebook_list_price?: number;
      expected_sale_price?: string;
      category?: string;
      store_location?: string;
      retailer?: string;
      negotiation_floor?: number;
    };

    const retailer = body.retailer ?? "Costco";
    const listPrice = body.facebook_list_price ?? Math.round(body.price * 1.8);
    const floor = body.negotiation_floor ?? Math.round(body.price * 1.35);
    const bundlePrice = Math.round(listPrice * 2 * 0.9);

    const isLego = body.category === "LEGO";
    const locationText = body.store_location ?? "Local area";

    const title = `New Sealed ${body.product_name} — ${retailer} Find`;
    const description = `New sealed ${body.product_name}. ${isLego ? "Perfect for LEGO fans. " : ""}Great gift or collection addition. Pickup in ${locationText}. Asking $${listPrice} or 2 for $${bundlePrice}. Cash/Venmo. No holds without pickup time.`;

    const keywords = [
      body.product_name,
      body.category ?? "Item",
      retailer,
      "New Sealed",
      "Facebook Marketplace",
      locationText,
    ].filter(Boolean);

    res.json({
      title,
      asking_price: listPrice,
      description,
      bundle_offer: `2 for $${bundlePrice}`,
      pickup_text: `Pickup in ${locationText}. Cash or Venmo only.`,
      negotiation_floor: floor,
      keywords,
    });
  } catch (err) {
    req.log.error({ err }, "Generate listing failed");
    res.status(500).json({ error: "Listing generation failed" });
  }
});

export default router;
