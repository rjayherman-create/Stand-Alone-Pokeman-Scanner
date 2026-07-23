declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
    };
  }
}

let detectedUpc = "";

function normalizeUpc(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : "";
}

function updateInput(value: string, status?: string) {
  detectedUpc = normalizeUpc(value);
  const input = document.querySelector<HTMLInputElement>("#pokevault-upc-input");
  if (input) input.value = detectedUpc;
  const statusNode = document.querySelector<HTMLElement>("#pokevault-upc-status");
  if (statusNode) statusNode.textContent = status || (detectedUpc ? `UPC detected: ${detectedUpc}` : "No UPC detected. OpenAI will be used only if needed.");
}

async function detectBarcode(file: File) {
  if (!window.BarcodeDetector || !file.type.startsWith("image/")) return;
  try {
    const detector = new window.BarcodeDetector({ formats: ["upc_a", "upc_e", "ean_13", "ean_8", "code_128"] });
    const bitmap = await createImageBitmap(file);
    const results = await detector.detect(bitmap);
    bitmap.close();
    const upc = normalizeUpc(results[0]?.rawValue || "");
    if (upc) updateInput(upc, `UPC detected from package: ${upc}. Product database will be checked before OpenAI.`);
  } catch {
    updateInput("", "Barcode was not readable. You can enter the UPC manually or continue with picture recognition.");
  }
}

function addUpcField() {
  const dialog = document.querySelector<HTMLElement>(".scan-dialog");
  if (!dialog || dialog.querySelector("#pokevault-upc-input")) return;
  const submit = dialog.querySelector<HTMLElement>(".scan-submit");
  if (!submit) return;

  const wrapper = document.createElement("div");
  wrapper.className = "upc-first-field";
  wrapper.innerHTML = `
    <label for="pokevault-upc-input"><b>UPC barcode first</b><span>Scan the package photo or enter the number below. A successful UPC match skips OpenAI.</span></label>
    <input id="pokevault-upc-input" inputmode="numeric" autocomplete="off" placeholder="Enter 8–14 digit UPC or EAN" />
    <small id="pokevault-upc-status">No UPC detected yet. OpenAI will be used only as backup.</small>
  `;
  submit.parentElement?.insertBefore(wrapper, submit);
  const input = wrapper.querySelector<HTMLInputElement>("input");
  if (input) {
    input.value = detectedUpc;
    input.addEventListener("input", () => {
      detectedUpc = normalizeUpc(input.value);
    });
  }
}

document.addEventListener("change", event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== "file") return;
  const file = target.files?.[0];
  if (file) void detectBarcode(file);
}, true);

new MutationObserver(addUpcField).observe(document.documentElement, { childList: true, subtree: true });

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes("/api/pokemon/scan") && init?.body instanceof FormData) {
    const inputValue = document.querySelector<HTMLInputElement>("#pokevault-upc-input")?.value || detectedUpc;
    const upc = normalizeUpc(inputValue);
    if (upc) init.body.set("upc", upc);
  }
  return originalFetch(input, init);
};

export {};
