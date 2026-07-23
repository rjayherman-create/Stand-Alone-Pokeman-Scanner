import { Router } from "express";
import multer from "multer";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = file.mimetype.startsWith("image/");
    cb(allowed ? null : new Error("Upload a photo of the UPC label."), allowed);
  },
});

function normalizeCode(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : "";
}

function parseJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {} as Record<string, unknown>;
  return JSON.parse(match[0]) as Record<string, unknown>;
}

router.post("/pokemon/upc-label", upload.single("image"), async (req, res): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, error: "Take or upload a clear photo of the complete UPC label." });
      return;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      max_completion_tokens: 300,
      messages: [
        {
          role: "system",
          content: "Read retail UPC/EAN labels. Return only JSON. Do not guess missing digits.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Read the human-readable digits printed below or beside the barcode. Return JSON with code, format, confidence, and needs_retake. code must contain digits only and be null when uncertain. Valid lengths are UPC-E 8, UPC-A 12, EAN-13 13, or GTIN-14 14.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    const extracted = parseJson(completion.choices[0]?.message?.content ?? "{}");
    const code = normalizeCode(extracted.code);
    if (!code) {
      res.status(422).json({
        success: false,
        error: "The printed UPC number was not clear enough to read. Retake the photo straight-on with the entire label visible and no glare.",
        extracted,
      });
      return;
    }

    res.json({
      success: true,
      code,
      format: extracted.format ?? null,
      confidence: Number(extracted.confidence ?? 0),
      needs_retake: Boolean(extracted.needs_retake),
    });
  } catch (error) {
    req.log?.error?.({ error }, "UPC label OCR failed");
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "UPC label scan failed." });
  }
});

export default router;
