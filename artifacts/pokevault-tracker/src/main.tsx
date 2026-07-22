import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bell, Box, Camera, ChevronRight, CircleDollarSign, Clock3, FileImage,
  Gauge, ImagePlus, LayoutDashboard, LineChart, PackagePlus, Search,
  ShieldCheck, Sparkles, Target, TrendingUp, Upload, WalletCards, X
} from "lucide-react";
import "./styles.css";

type Signal = "HOLD" | "WATCH" | "SELL";
type Item = {
  id: number; name: string; type: string; qty: number; cost: number;
  value: number; trend: number; signal: Signal; target: number; note: string;
};

type ScanMode = "receipt" | "product";

const inventory: Item[] = [
  { id: 1, name: "Pitch Black Elite Trainer Box", type: "Elite Trainer Box", qty: 1, cost: 65.17, value: 84, trend: 8.2, signal: "HOLD", target: 99, note: "Strongest sealed hold in this purchase." },
  { id: 2, name: "Chaos Rising Elite Trainer Box", type: "Elite Trainer Box", qty: 1, cost: 65.17, value: 70, trend: 4.6, signal: "HOLD", target: 85, note: "Hold while retail supply remains active." },
  { id: 3, name: "Mega Greninja ex Premium Collection", type: "Premium Collection", qty: 1, cost: 48.85, value: 52, trend: 2.1, signal: "WATCH", target: 70, note: "Bulky product; sell sooner if local demand strengthens." },
  { id: 4, name: "Chaos Rising Booster Bundle", type: "Booster Bundle", qty: 1, cost: 34.73, value: 44, trend: 11.4, signal: "WATCH", target: 55, note: "Compact and liquid; monitor sales velocity." },
  { id: 5, name: "Chaos Rising Charmeleon 3-Pack", type: "3-Pack Blister", qty: 1, cost: 16.28, value: 25, trend: 7.3, signal: "HOLD", target: 35, note: "Promo character supports collector demand." },
  { id: 6, name: "Pitch Black Binacle 3-Pack", type: "3-Pack Blister", qty: 1, cost: 16.28, value: 28, trend: 9.8, signal: "WATCH", target: 38, note: "Near target; wait for a stronger selling window." },
  { id: 7, name: "Pitch Black Sleeved Booster", type: "Sleeved Booster", qty: 2, cost: 10.93, value: 18, trend: 5.9, signal: "HOLD", target: 24, note: "Low storage burden; suitable long-term hold." },
];

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function App() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("Dashboard");
  const [scanMode, setScanMode] = useState<ScanMode | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [scanMessage, setScanMessage] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => inventory.filter(i => i.name.toLowerCase().includes(query.toLowerCase())), [query]);
  const totals = useMemo(() => {
    const invested = inventory.reduce((s, i) => s + i.cost, 0);
    const market = inventory.reduce((s, i) => s + i.value, 0);
    const onlineNet = market * .86;
    return { invested, market, onlineNet, gain: market - invested, roi: ((market - invested) / invested) * 100 };
  }, []);

  const nav = [
    ["Dashboard", LayoutDashboard], ["Add Purchase", PackagePlus], ["Scan Receipt", Camera],
    ["My Collection", Box], ["Market Watch", LineChart], ["Sell Signals", Gauge],
    ["Price Targets", Target], ["Capital Recovery", WalletCards], ["Alerts", Bell],
  ] as const;

  function openScanner(mode: ScanMode) {
    setScanMode(mode);
    setSelectedFiles([]);
    setScanMessage("");
  }

  function closeScanner() {
    setScanMode(null);
    setSelectedFiles([]);
    setScanMessage("");
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setSelectedFiles(Array.from(files));
    setScanMessage("");
  }

  async function startScan() {
    if (!selectedFiles.length) {
      setScanMessage("Take a photo or choose a receipt/product file first.");
      return;
    }

    setScanMessage("File ready. The scanner will analyze it after the Pokémon scan API is connected.");
  }

  function handleNav(label: string) {
    setActive(label);
    if (label === "Scan Receipt") openScanner("receipt");
    if (label === "Add Purchase") openScanner("product");
  }

  return <div className="app-shell">
    <input ref={cameraInput} className="hidden-file" type="file" accept="image/*" capture="environment" onChange={e => handleFiles(e.target.files)} />
    <input ref={documentInput} className="hidden-file" type="file" accept="image/*,.pdf,application/pdf" multiple onChange={e => handleFiles(e.target.files)} />

    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">PV</div><div><strong>PokéVault</strong><span>Investment Tracker</span></div></div>
      <nav>{nav.map(([label, Icon]) => <button key={label} className={active===label?"active":""} onClick={()=>handleNav(label)}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <div className="side-card"><ShieldCheck size={20}/><div><b>Portfolio protected</b><span>7 products · 8 sealed units</span></div></div>
    </aside>

    <main>
      <header>
        <div><p className="eyebrow">POKÉMON SEALED PORTFOLIO</p><h1>{active}</h1><p>Track cost, value, market momentum, and the best time to sell.</p></div>
        <div className="header-actions">
          <button className="ghost" onClick={()=>openScanner("receipt")}><Upload size={17}/>Import receipt</button>
          <button className="primary" onClick={()=>openScanner("product")}><Camera size={17}/>Scan purchase</button>
        </div>
      </header>

      <section className="hero">
        <div><span className="live-pill"><Sparkles size={14}/> Portfolio updated today</span><h2>Your collection is up <em>{totals.roi.toFixed(1)}%</em></h2><p>Current gross appreciation is {money(totals.gain)}. Two products are approaching their target selling range.</p><div className="hero-actions"><button className="light">Review sell signals <ChevronRight size={16}/></button><button className="transparent">Set investment strategy</button></div></div>
        <div className="score"><span>Portfolio score</span><strong>78</strong><small>Healthy hold</small></div>
      </section>

      <section className="metrics">
        <Metric icon={<CircleDollarSign/>} label="Total invested" value={money(totals.invested)} sub="Including allocated tax"/>
        <Metric icon={<TrendingUp/>} label="Gross market value" value={money(totals.market)} sub={`+${money(totals.gain)} unrealized`}/>
        <Metric icon={<WalletCards/>} label="Estimated online net" value={money(totals.onlineNet)} sub="After modeled selling costs"/>
        <Metric icon={<Clock3/>} label="Next review" value="Jan 21, 2027" sub="Six-month portfolio check"/>
      </section>

      <section className="content-grid">
        <div className="panel portfolio-panel">
          <div className="panel-head"><div><h3>My sealed inventory</h3><p>Exact products from your Target purchase</p></div><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search products"/></div></div>
          <div className="table-wrap"><table><thead><tr><th>Product</th><th>Cost</th><th>Market</th><th>30-day</th><th>Target</th><th>Signal</th></tr></thead><tbody>
            {filtered.map(item => <tr key={item.id}><td><div className="product"><div className="product-art">{item.name.slice(0,2).toUpperCase()}</div><div><b>{item.name}</b><span>{item.type}{item.qty>1?` · Qty ${item.qty}`:""}</span></div></div></td><td>{money(item.cost)}</td><td><b>{money(item.value)}</b></td><td className="positive">+{item.trend}%</td><td>{money(item.target)}</td><td><span className={`signal ${item.signal.toLowerCase()}`}>{item.signal}</span></td></tr>)}
          </tbody></table></div>
        </div>

        <aside className="right-column">
          <div className="panel signal-card"><div className="panel-head"><div><h3>Top sell opportunity</h3><p>Based on current portfolio data</p></div><span className="signal watch">WATCH</span></div><h4>Pitch Black Binacle 3-Pack</h4><div className="signal-price"><strong>$28</strong><span>Target $38</span></div><div className="progress"><i style={{width:"74%"}}/></div><ul><li>Up 9.8% over 30 days</li><li>Compact and inexpensive to ship</li><li>Wait for another $8–$10 of appreciation</li></ul><button className="full">Open sell analysis</button></div>
          <div className="panel alert-list"><div className="panel-head"><div><h3>Recent alerts</h3><p>Market conditions worth reviewing</p></div></div>
            <Alert title="Booster Bundle momentum increased" time="2 hours ago"/>
            <Alert title="Greninja collection is under target" time="Yesterday"/>
            <Alert title="Six-month review dates created" time="Jul 21"/>
          </div>
        </aside>
      </section>
    </main>

    {scanMode && <div className="scan-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeScanner(); }}>
      <section className="scan-dialog" role="dialog" aria-modal="true" aria-labelledby="scan-title">
        <button className="scan-close" onClick={closeScanner} aria-label="Close scanner"><X size={20}/></button>
        <div className="scan-icon"><Camera size={28}/></div>
        <p className="eyebrow">POKÉVAULT SCANNER</p>
        <h2 id="scan-title">{scanMode === "receipt" ? "Scan or upload a receipt" : "Photograph a Pokémon purchase"}</h2>
        <p className="scan-help">Use your phone camera, choose a saved photo, or attach a PDF receipt. On mobile, “Open camera” requests the rear camera.</p>

        <div className="scan-options">
          <button className="scan-option" onClick={() => cameraInput.current?.click()}>
            <Camera size={24}/><span><b>Open camera</b><small>Take a new photo</small></span>
          </button>
          <button className="scan-option" onClick={() => documentInput.current?.click()}>
            <ImagePlus size={24}/><span><b>Choose file</b><small>Photo, image, or PDF</small></span>
          </button>
        </div>

        {selectedFiles.length > 0 && <div className="selected-files">
          <b>{selectedFiles.length === 1 ? "Selected file" : `${selectedFiles.length} selected files`}</b>
          {selectedFiles.map((file, index) => <div className="selected-file" key={`${file.name}-${index}`}><FileImage size={17}/><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></div>)}
        </div>}

        {scanMessage && <p className="scan-message">{scanMessage}</p>}
        <button className="primary scan-submit" onClick={startScan} disabled={!selectedFiles.length}>Analyze {scanMode === "receipt" ? "receipt" : "purchase"}</button>
      </section>
    </div>}
  </div>;
}

function Metric({icon,label,value,sub}:{icon:React.ReactNode,label:string,value:string,sub:string}) { return <div className="metric"><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div> }
function Alert({title,time}:{title:string,time:string}) { return <div className="alert"><div className="dot"/><div><b>{title}</b><span>{time}</span></div><ChevronRight size={16}/></div> }

createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
