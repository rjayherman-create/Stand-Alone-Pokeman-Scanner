export type BarcodeDetectorResult={rawValue:string;format?:string};

declare global{
  interface Window{
    BarcodeDetector?:new(options?:{formats?:string[]})=>{detect(source:ImageBitmapSource):Promise<BarcodeDetectorResult[]>};
  }
}

export const barcodeFormats=["upc_a","upc_e","ean_8","ean_13"];

export function supportsLiveBarcodeScan(){
  return typeof navigator!=="undefined"&&Boolean(navigator.mediaDevices?.getUserMedia)&&typeof window.BarcodeDetector!=="undefined";
}

export async function openBarcodeCamera(video:HTMLVideoElement){
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},audio:false});
  video.srcObject=stream;
  video.setAttribute("playsinline","true");
  await video.play();
  return stream;
}

export function stopBarcodeCamera(stream:MediaStream|null){
  stream?.getTracks().forEach(track=>track.stop());
}

export async function detectBarcode(video:HTMLVideoElement){
  if(!window.BarcodeDetector)return null;
  const detector=new window.BarcodeDetector({formats:barcodeFormats});
  const results=await detector.detect(video);
  const value=results[0]?.rawValue?.replace(/\D/g,"")||"";
  return value.length>=8&&value.length<=14?value:null;
}
