import {detectBarcode,openBarcodeCamera,stopBarcodeCamera,supportsLiveBarcodeScan} from "./live-barcode";

const style=document.createElement("style");
style.textContent=`
.pv-barcode-launch{position:fixed;right:20px;bottom:20px;z-index:900;border:0;border-radius:999px;background:#f59e0b;color:#172033;font-weight:800;padding:14px 18px;box-shadow:0 12px 35px rgba(0,0,0,.25);cursor:pointer}
.pv-barcode-backdrop{position:fixed;inset:0;z-index:2000;background:rgba(15,23,42,.82);display:grid;place-items:center;padding:16px}
.pv-barcode-modal{width:min(560px,100%);background:#fff;border-radius:22px;padding:20px;position:relative}
.pv-barcode-modal h2{margin:0 42px 8px 0}.pv-barcode-modal p{color:#64748b;line-height:1.45}
.pv-barcode-close{position:absolute;right:16px;top:16px;border:1px solid #e2e8f0;background:#fff;border-radius:999px;width:38px;height:38px;font-size:24px;cursor:pointer}
.pv-barcode-view{position:relative;overflow:hidden;border-radius:16px;background:#111;aspect-ratio:4/3}.pv-barcode-view video{width:100%;height:100%;object-fit:cover}
.pv-barcode-guide{position:absolute;left:8%;right:8%;top:36%;height:28%;border:3px solid #fbbf24;border-radius:12px;box-shadow:0 0 0 999px rgba(0,0,0,.25)}
.pv-barcode-status{min-height:24px;font-weight:700;color:#92400e}.pv-barcode-actions{display:flex;gap:10px;margin-top:12px}.pv-barcode-actions button{flex:1;border:0;border-radius:12px;padding:12px;font-weight:800;cursor:pointer}.pv-primary{background:#f59e0b}.pv-secondary{background:#eef2f7}
.pv-upc-input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:12px;font-size:16px;margin-top:8px}
@media(max-width:600px){.pv-barcode-launch{right:12px;bottom:12px}.pv-barcode-modal{padding:16px}}
`;
document.head.appendChild(style);

const launch=document.createElement("button");
launch.className="pv-barcode-launch";
launch.type="button";
launch.textContent="Scan package UPC";
document.body.appendChild(launch);

let stream:MediaStream|null=null;
let timer:number|null=null;
let busy=false;

function closeModal(backdrop:HTMLElement){
  if(timer!==null)window.clearInterval(timer);
  timer=null;
  stopBarcodeCamera(stream);
  stream=null;
  backdrop.remove();
}

async function submitUpc(upc:string,status:HTMLElement,submit:HTMLButtonElement){
  const digits=upc.replace(/\D/g,"");
  if(digits.length<8||digits.length>14){status.textContent="Enter or scan a valid 8–14 digit UPC/EAN.";return;}
  if(busy)return;
  busy=true;submit.disabled=true;status.textContent="Looking up the product by UPC…";
  try{
    const body=new FormData();
    body.append("upc",digits);
    body.append("retailer","Unknown retailer");
    body.append("store_location","Unknown location");
    body.append("purchase_price","0");
    body.append("quantity","1");
    body.append("purchase_date",new Date().toISOString().slice(0,10));
    const response=await fetch("/api/pokemon/scan",{method:"POST",body});
    const json=await response.json() as {success?:boolean;error?:string;extracted?:{product_name?:string};openai_used?:boolean};
    if(!response.ok||!json.success)throw new Error(json.error||`UPC lookup returned ${response.status}`);
    status.textContent=`${json.extracted?.product_name||"Product"} saved. OpenAI was ${json.openai_used?"used as fallback":"not used"}.`;
    window.setTimeout(()=>window.location.reload(),900);
  }catch(error){status.textContent=error instanceof Error?error.message:"UPC lookup failed.";}
  finally{busy=false;submit.disabled=false;}
}

launch.addEventListener("click",async()=>{
  const backdrop=document.createElement("div");
  backdrop.className="pv-barcode-backdrop";
  backdrop.innerHTML=`<section class="pv-barcode-modal" role="dialog" aria-modal="true" aria-label="Scan package UPC"><button class="pv-barcode-close" aria-label="Close">×</button><h2>Scan package barcode</h2><p>Hold the UPC or EAN inside the yellow frame. The product database is checked first; OpenAI is only used later when a package photo is needed.</p><div class="pv-barcode-view"><video muted playsinline></video><div class="pv-barcode-guide"></div></div><p class="pv-barcode-status">Starting rear camera…</p><input class="pv-upc-input" inputmode="numeric" autocomplete="off" placeholder="Or type UPC / EAN number"><div class="pv-barcode-actions"><button class="pv-secondary" type="button">Use product photo instead</button><button class="pv-primary" type="button">Look up UPC</button></div></section>`;
  document.body.appendChild(backdrop);
  const video=backdrop.querySelector("video")!;
  const status=backdrop.querySelector(".pv-barcode-status") as HTMLElement;
  const input=backdrop.querySelector(".pv-upc-input") as HTMLInputElement;
  const close=backdrop.querySelector(".pv-barcode-close") as HTMLButtonElement;
  const photo=backdrop.querySelector(".pv-secondary") as HTMLButtonElement;
  const submit=backdrop.querySelector(".pv-primary") as HTMLButtonElement;
  close.onclick=()=>closeModal(backdrop);
  backdrop.addEventListener("mousedown",event=>{if(event.target===backdrop)closeModal(backdrop);});
  photo.onclick=()=>{closeModal(backdrop);const existing=[...document.querySelectorAll("button")].find(button=>button.textContent?.includes("Scan purchase"));(existing as HTMLButtonElement|undefined)?.click();};
  submit.onclick=()=>void submitUpc(input.value,status,submit);
  if(!supportsLiveBarcodeScan()){
    status.textContent="Live barcode detection is not supported in this browser. Type the UPC below, or use the product-photo scanner.";
    return;
  }
  try{
    stream=await openBarcodeCamera(video);
    status.textContent="Scanning… keep the barcode steady and avoid glare.";
    timer=window.setInterval(async()=>{
      if(busy||video.readyState<2)return;
      try{
        const upc=await detectBarcode(video);
        if(upc){input.value=upc;status.textContent=`Barcode detected: ${upc}`;if(timer!==null)window.clearInterval(timer);timer=null;void submitUpc(upc,status,submit);}
      }catch{/* Continue scanning frames. */}
    },450);
  }catch(error){status.textContent=error instanceof Error?`Camera unavailable: ${error.message}`:"Camera unavailable. Type the UPC below.";}
});
