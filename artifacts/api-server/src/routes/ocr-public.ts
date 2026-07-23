import { Router, type Request, type Response } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// OCR endpoint that does not require database availability.
const handleScreenshotOcr = async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const retailer = (body.retailer as string) || "Costco";
    const store_location = (body.store_location as string) || "Unknown store";
    const search_term = (body.search_term as string) ?? "";

    if (!req.file) {
      res.status(400).json({ success: false, rows: [], error_message: "No image uploaded." });
      return;
    }

    let openaiClient: Awaited<typeof import("@workspace/integrations-openai-ai-server")>["openai"];
    try {
      ({ openai: openaiClient } = await import("@workspace/integrations-openai-ai-server"));
    } catch {
      res.status(503).json({
        success: false,
        rows: [],
        error_message: "OpenAI is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL.",
      });
      return;
    }

    const imageBase64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";

    const systemPrompt = `You are an expert at reading retail inventory screenshots from apps and websites including Costco, Walmart, Target, BJ's, Sam's Club, Home Depot, Lowe's, and others.
Extract ALL visible product rows from the image. Return ONLY valid JSON - no markdown, no extra text.`;

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
      const completion = await openaiClient.chat.completions.create({
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
      const status = Number((aiErr as { status?: unknown })?.status ?? 0);
      if (status === 401 || status === 403) {
        res.status(503).json({
          success: false,
          rows: [],
          error_message: "OpenAI authentication failed. Check AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY.",
        });
        return;
      }
      if (status === 429) {
        res.status(503).json({
          success: false,
          rows: [],
          error_message: "OpenAI rate limit reached. Retry shortly.",
        });
        return;
      }
      if (status >= 500) {
        res.status(503).json({
          success: false,
          rows: [],
          error_message: "OpenAI is temporarily unavailable. Retry shortly.",
        });
        return;
      }
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

router.post("/screenshot-ocr", upload.single("image"), handleScreenshotOcr);
router.post("/scan/screenshot-ocr", upload.single("image"), handleScreenshotOcr);

export default router;
