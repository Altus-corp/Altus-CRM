import { useEffect, useMemo, useState } from "react";
import { api } from "../../shared/api/client";
import "./product-master.css";

type Summary = { product: string; stage: string; resolution: string; total: number };
type Lead = { id: string; name: string; lead_no: string | null; company: string | null; phone: string | null; stage: string | null; calling_resolution: string | null };
type Response = { summary: Summary[]; leads: Lead[] };

export function ProductMasterPage() {
  const [data, setData] = useState<Response>({ summary: [], leads: [] });
  const [product, setProduct] = useState(""); const [stage, setStage] = useState(""); const [resolution, setResolution] = useState("");
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const products = useMemo(() => [...new Set(data.summary.map((item) => item.product))], [data.summary]);
  const stages = useMemo(() => [...new Set(data.summary.filter((item) => !product || item.product === product).map((item) => item.stage))], [data.summary, product]);
  const resolutions = useMemo(() => [...new Set(data.summary.filter((item) => (!product || item.product === product) && (!stage || item.stage === stage)).map((item) => item.resolution))], [data.summary, product, stage]);
  const total = useMemo(() => data.summary.filter((item) => (!product || item.product === product) && (!stage || item.stage === stage) && (!resolution || item.resolution === resolution)).reduce((sum, item) => sum + item.total, 0), [data.summary, product, stage, resolution]);
  const productTotals = useMemo(() => Object.fromEntries(products.map((value) => [value, data.summary.filter((item) => item.product === value).reduce((sum, item) => sum + item.total, 0)])), [data.summary, products]);
  useEffect(() => { let live = true; setLoading(true); setError(""); const params = new URLSearchParams(); if (product) params.set("product", product); if (stage) params.set("stage", stage); if (resolution) params.set("resolution", resolution); void api<Response>(`/api/product-master?${params}`).then((result) => { if (live) setData(result); }).catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : "Unable to load Product Master."); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [product, stage, resolution]);
  function selectProduct(value: string) { setProduct(value); setStage(""); setResolution(""); }
  function selectStage(value: string) { setStage(value); setResolution(""); }
  return <main className="product-master-page">
    <header><p>MY WORKSPACE</p><h1>Product Master</h1><span>Your assigned leads, organised by product, stage, and calling resolution.</span></header>
    {error && <div className="product-master-error">{error}</div>}
    <section className="product-master-summary"><div><small>YOUR LEADS</small><strong>{total}</strong><span>matching assigned leads</span></div>{(product || stage || resolution) && <button type="button" onClick={() => selectProduct("")}>Clear selection</button>}</section>
    <section className="product-master-filters" aria-label="Product lead filters">
      <div className="product-master-filter-group"><div className="product-master-filter-head"><b>1. Choose a product</b><span>{products.length} available</span></div><div className="product-master-products">{products.map((value) => <button key={value} className={product === value ? "active" : ""} onClick={() => selectProduct(value)}><span>{value}</span><strong>{productTotals[value]}</strong></button>)}</div>{!products.length && !loading && <p>No products have been assigned to you yet.</p>}</div>
      {product && <div className="product-master-filter-group"><div className="product-master-filter-head"><b>2. Narrow by stage</b><span>Optional</span></div><div className="product-master-chips"><button className={!stage ? "active" : ""} onClick={() => selectStage("")}>All stages</button>{stages.map((value) => <button key={value} className={stage === value ? "active" : ""} onClick={() => selectStage(value)}>{value}</button>)}</div></div>}
      {product && <div className="product-master-filter-group"><div className="product-master-filter-head"><b>3. Narrow by calling resolution</b><span>Optional</span></div><div className="product-master-chips"><button className={!resolution ? "active" : ""} onClick={() => setResolution("")}>All resolutions</button>{resolutions.map((value) => <button key={value} className={resolution === value ? "active" : ""} onClick={() => setResolution(value)}>{value}</button>)}</div></div>}
    </section>
    <section className="product-master-leads"><h2>{product ? `${product} leads` : "Choose a product to view leads"}</h2>{loading ? <p>Loading…</p> : !product ? <p>Select a product above. This keeps the page fast and focused.</p> : data.leads.length ? <table><thead><tr><th>Lead no</th><th>Name</th><th>Company</th><th>Phone</th><th>Stage</th><th>Calling resolution</th></tr></thead><tbody>{data.leads.map((lead) => <tr key={lead.id}><td>{lead.lead_no || "—"}</td><td><strong>{lead.name}</strong></td><td>{lead.company || "—"}</td><td>{lead.phone || "—"}</td><td>{lead.stage || "—"}</td><td>{lead.calling_resolution || "—"}</td></tr>)}</tbody></table> : <p>No assigned leads match this selection.</p>}</section>
  </main>;
}
