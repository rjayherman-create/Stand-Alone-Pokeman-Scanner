import { Router } from "express";
import multer from "multer";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, inventoryItemsTable, quickScanResultsTable, quickScanSessionsTable } from "@workspace/db";
import { lookupEbayComps } from "../lib/ebay";
import {
  buildCompSummary,
  calculateProfit,
  makeQuickDecision,
  type ScannedItemInput,
} from "../lib/quick-decision";
import { eq } from "drizzle-orm";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const RETAILER_TAG_HINTS: Record<string, string> = {
  Costco: "Costco price signs show item number, price ending in .97/.88/.00, star for discontinued items.",
  Walmart: "Walmart clearance tags are yellow with CLEARANCE text, original price, clearance price, and percent off.",
  Target: "Target clearance tags show percent off (30/50/70/90%) and DPCI/TCIN identifiers.",
  "BJ's": "BJ's Wholesale uses item numbers and .97/.88 price endings similar to Costco.",
  "Sam's Club": "Sam's Club shows item number, member price, and sometimes a clearance sticker.",
  "Home Depot": "Home Depot clearance has orange tags with SKU, original vs clearance price.",
  "Lowe's": "Lowe's clearance shows red/yellow tags with SKU and markdown price.",
};

// POST /quick-scan — main entry point
router.post("/quick-scan", upload.single("image"), async (req, res) => {
  try {
    const retailer = (req.body.retailer as string) || "Costco";
    const store_location = (req.body.store_location as string) || "Local Store";
    const category_hint = (req.body.category as string) ?? "Other";
    const session_id = req.body.session_id ? parseInt(req.body.session_id as string, 10) : null;

    if (!req.file) {
      res.status(400).json({ success: false, error_message: "No image uploaded." });
      return;
    }

    const imageBase64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";
    const tagHint = RETAILER_TAG_HINTS[retailer] ?? "Extract all visible product identifiers, name, brand, and price.";

    // ── Step 1: AI extraction ──
    const systemPrompt = `You are an expert at reading retail price tags, clearance stickers, shelf signs, barcodes, and product boxes across all major retailers.
Extract all visible product information precisely. Return ONLY valid JSON — no markdown, no extra text.
If a field cannot be determined, use null.
For prices, extract the numeric value only (e.g. 14.97).
For percent_off, extract as a number (e.g. 30 for 30% off).
For box_condition use: "sealed", "new", "open_box", "damaged", or null.
For confidence use: "high", "medium", or "low" based on how clearly the image shows the item details.
${tagHint}`;

    const userPrompt = `Extract all product details from this ${retailer} image.
Store: ${store_location}, Retailer: ${retailer}, Category hint: ${category_hint}

Return JSON with EXACTLY these fields:
{
  "product_name": string or null,
  "brand": string or null,
  "category": string or null,
  "subcategory": string or null,
  "current_store_price": number or null,
  "regular_price": number or null,
  "clearance_price": number or null,
  "percent_off": number or null,
  "markdown_code": string or null,
  "upc": string or null,
  "gtin": string or null,
  "sku": string or null,
  "dpci": string or null,
  "tcin": string or null,
  "costco_item_number": string or null,
  "model_number": string or null,
  "box_condition": "sealed" or "new" or "open_box" or "damaged" or null,
  "stock_status": "Seen in store",
  "retailer_detected": string or null,
  "confidence": "high" or "medium" or "low",
  "notes": string or null
}`;

    let extracted: Record<string, unknown> = {};
    let parseError: string | null = null;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_completion_tokens: 700,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" } },
            ],
          },
        ],
      });

      const text = completion.choices[0]?.message?.content ?? "{}";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
    } catch (aiErr) {
      req.log.error({ aiErr }, "Quick scan AI extraction failed");
      parseError = "Could not read the image. Try a closer photo of the price tag or barcode.";
    }

    const price = typeof extracted.current_store_price === "number" ? extracted.current_store_price
      : typeof extracted.clearance_price === "number" ? extracted.clearance_price
      : null;

    if (!extracted.product_name && !price) {
      res.json({
        success: false,
        extracted,
        error_message: parseError ?? "Could not read the image. Try a closer photo or scan the barcode.",
        quick_decision: {
          recommendation: "RESEARCH_MORE",
          confidence_score: 15,
          one_sentence_reason: "Product identity or price could not be determined from the image.",
          risk_warning: "Try scanning the barcode, model number, or front of the box.",
          max_quantity: "0",
          best_next_action: "Take a closer photo of the price tag, barcode, or model number.",
        },
      });
      return;
    }

    const scannedItem: ScannedItemInput = {
      retailer,
      product_name: extracted.product_name ? String(extracted.product_name) : null,
      brand: extracted.brand ? String(extracted.brand) : null,
      category: extracted.category ? String(extracted.category) : category_hint,
      current_store_price: price,
      regular_price: typeof extracted.regular_price === "number" ? extracted.regular_price : null,
      clearance_price: typeof extracted.clearance_price === "number" ? extracted.clearance_price : null,
      percent_off: typeof extracted.percent_off === "number" ? extracted.percent_off : null,
      markdown_code: extracted.markdown_code ? String(extracted.markdown_code) : null,
      upc: extracted.upc ? String(extracted.upc) : null,
      gtin: extracted.gtin ? String(extracted.gtin) : null,
      sku: extracted.sku ? String(extracted.sku) : null,
      dpci: extracted.dpci ? String(extracted.dpci) : null,
      tcin: extracted.tcin ? String(extracted.tcin) : null,
      costco_item_number: extracted.costco_item_number ? String(extracted.costco_item_number) : null,
      model_number: extracted.model_number ? String(extracted.model_number) : null,
      box_condition: extracted.box_condition ? String(extracted.box_condition) : null,
      stock_status: "Seen in store",
      extraction_confidence: extracted.confidence ? String(extracted.confidence) : null,
    };

    // ── Step 2: eBay comp lookup ──
    const ebayData = await lookupEbayComps({
      upc: scannedItem.upc ?? scannedItem.gtin,
      model_number: scannedItem.model_number,
      product_name: scannedItem.product_name,
      brand: scannedItem.brand,
      category: scannedItem.category,
    });

    // ── Step 3: Build comp summary + profit ──
    const compSummary = buildCompSummary(scannedItem, ebayData);
    const profitSummary = calculateProfit(scannedItem, compSummary);
    const quickDecision = makeQuickDecision(scannedItem, compSummary, profitSummary);

    // ── Step 4: Save result to quick_scan_results table ──
    const [savedResult] = await db
      .insert(quickScanResultsTable)
      .values({
        session_id: session_id ?? null,
        retailer,
        store_location,
        product_name: scannedItem.product_name ?? null,
        brand: scannedItem.brand ?? null,
        category: scannedItem.category ?? null,
        current_store_price: price ?? null,
        regular_price: scannedItem.regular_price ?? null,
        clearance_price: scannedItem.clearance_price ?? null,
        percent_off: scannedItem.percent_off ?? null,
        upc: scannedItem.upc ?? null,
        gtin: scannedItem.gtin ?? null,
        sku: scannedItem.sku ?? null,
        dpci: scannedItem.dpci ?? null,
        tcin: scannedItem.tcin ?? null,
        costco_item_number: scannedItem.costco_item_number ?? null,
        model_number: scannedItem.model_number ?? null,
        ebay_active_median: compSummary.ebay_active_median ?? null,
        ebay_sold_median: compSummary.ebay_sold_median ?? null,
        ebay_active_range: compSummary.ebay_active_low && compSummary.ebay_active_high
          ? `$${compSummary.ebay_active_low}–$${compSummary.ebay_active_high}`
          : null,
        suggested_facebook_list_price: compSummary.suggested_facebook_list_price ?? null,
        expected_facebook_sale_price: compSummary.estimated_local_facebook_sale_price ?? null,
        estimated_profit: profitSummary.estimated_net_profit ?? null,
        profit_margin_percent: profitSummary.profit_margin_percent ?? null,
        recommendation: quickDecision.recommendation,
        confidence_score: quickDecision.confidence_score,
        risk_warning: quickDecision.risk_warning ?? null,
        one_sentence_reason: quickDecision.one_sentence_reason,
        max_quantity: quickDecision.max_quantity,
      })
      .returning();

    // ── Step 5: Update session counts if session_id provided ──
    if (session_id) {
      const countField = quickDecision.recommendation === "BUY" ? "buy_count"
        : quickDecision.recommendation === "MAYBE" ? "maybe_count"
        : quickDecision.recommendation === "SKIP" ? "skip_count"
        : "research_more_count";

      try {
        const session = await db
          .select()
          .from(quickScanSessionsTable)
          .where(eq(quickScanSessionsTable.id, session_id))
          .limit(1);

        if (session[0]) {
          await db
            .update(quickScanSessionsTable)
            .set({
              total_scans: (session[0].total_scans ?? 0) + 1,
              [countField]: ((session[0][countField as keyof typeof session[0]] as number) ?? 0) + 1,
              estimated_total_profit: (session[0].estimated_total_profit ?? 0) + (profitSummary.estimated_net_profit ?? 0),
            })
            .where(eq(quickScanSessionsTable.id, session_id));
        }
      } catch (e) {
        req.log.warn({ e }, "Session update failed");
      }
    }

    res.json({
      success: true,
      extracted: scannedItem,
      comp_summary: compSummary,
      profit_summary: profitSummary,
      quick_decision: quickDecision,
      quick_scan_result_id: savedResult?.id,
    });
  } catch (err) {
    req.log.error({ err }, "Quick scan failed");
    res.status(500).json({ success: false, error_message: "Quick scan failed. Please try again." });
  }
});

// POST /lookup-ebay-comps — standalone eBay lookup
router.post("/lookup-ebay-comps", async (req, res) => {
  try {
    const body = req.body as {
      upc?: string;
      gtin?: string;
      model_number?: string;
      product_name?: string;
      brand?: string;
      category?: string;
    };

    const ebayData = await lookupEbayComps({
      upc: body.upc ?? body.gtin,
      model_number: body.model_number,
      product_name: body.product_name,
      brand: body.brand,
      category: body.category,
    });

    res.json(ebayData);
  } catch (err) {
    req.log.error({ err }, "eBay comp lookup failed");
    res.status(500).json({ ebay_available: false, reason: "eBay lookup failed." });
  }
});

// POST /save-quick-scan — save a quick scan result to main inventory
router.post("/save-quick-scan", async (req, res) => {
  try {
    const body = req.body as {
      quick_scan_result_id?: number;
      retailer: string;
      store_location: string;
      product_name: string;
      brand?: string;
      category?: string;
      current_store_price?: number;
      regular_price?: number;
      clearance_price?: number;
      percent_off?: number;
      upc?: string;
      sku?: string;
      dpci?: string;
      tcin?: string;
      costco_item_number?: string;
      model_number?: string;
      box_condition?: string;
      suggested_facebook_list_price?: number;
      expected_facebook_sale_price?: number;
      estimated_profit?: number;
      recommendation?: string;
      confidence_score?: number;
      risk_warning?: string;
      max_quantity?: string;
    };

    const [item] = await db
      .insert(inventoryItemsTable)
      .values({
        retailer: body.retailer ?? "Costco",
        source_type: "photo_scan",
        store_location: body.store_location,
        product_name: body.product_name,
        brand: body.brand ?? null,
        category: body.category ?? null,
        price: body.current_store_price ?? body.clearance_price ?? null,
        regular_price: body.regular_price ?? null,
        clearance_price: body.clearance_price ?? null,
        percent_off: body.percent_off ?? null,
        upc: body.upc ?? null,
        sku: body.sku ?? null,
        dpci: body.dpci ?? null,
        tcin: body.tcin ?? null,
        item_number: body.costco_item_number ?? null,
        box_condition: body.box_condition ?? null,
        stock_status: "Seen in store",
        facebook_list_price: body.suggested_facebook_list_price ?? null,
        expected_sale_price: body.expected_facebook_sale_price ? `$${body.expected_facebook_sale_price}` : null,
        estimated_profit: body.estimated_profit ? `$${body.estimated_profit} est.` : null,
        recommendation: body.recommendation ?? null,
        max_quantity: body.max_quantity ?? null,
        risk_notes: body.risk_warning ?? null,
        scan_time: new Date().toISOString(),
      })
      .returning();

    if (body.quick_scan_result_id) {
      await db
        .update(quickScanResultsTable)
        .set({ inventory_item_id: item.id })
        .where(eq(quickScanResultsTable.id, body.quick_scan_result_id));
    }

    res.status(201).json({
      ...item,
      created_at: item.created_at.toISOString(),
      updated_at: item.updated_at.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Save quick scan failed");
    res.status(500).json({ error: "Failed to save item." });
  }
});

// POST /quick-scan-sessions — create a new scan session
router.post("/quick-scan-sessions", async (req, res) => {
  try {
    const { retailer = "Costco", store_location = "Local Store" } = req.body as {
      retailer?: string;
      store_location?: string;
    };

    const [session] = await db
      .insert(quickScanSessionsTable)
      .values({ retailer, store_location })
      .returning();

    res.status(201).json({
      ...session,
      started_at: session.started_at.toISOString(),
      created_at: session.created_at.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Create session failed");
    res.status(500).json({ error: "Failed to create session." });
  }
});

// PATCH /quick-scan-sessions/:id/end — end a session
router.patch("/quick-scan-sessions/:id/end", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [session] = await db
      .update(quickScanSessionsTable)
      .set({ ended_at: new Date() })
      .where(eq(quickScanSessionsTable.id, id))
      .returning();

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json({
      ...session,
      started_at: session.started_at.toISOString(),
      ended_at: session.ended_at?.toISOString() ?? null,
      created_at: session.created_at.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "End session failed");
    res.status(500).json({ error: "Failed to end session." });
  }
});

export default router;
