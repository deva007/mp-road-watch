"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { translateState, type Language } from "./i18n";

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Listing = {
  id: string;
  bank: string;
  branch: string;
  propertyType: string;
  title: string;
  address: string;
  district: string;
  stateId: number;
  reservePrice: number;
  emd: number | null;
  auctionDate: string;
  noticeUrl: string;
  lat: number | null;
  lng: number | null;
  coordConfidence: string;
  sample: boolean;
};

type AuctionIndex = {
  generatedAt: string;
  source: string;
  sample: boolean;
  totalListings: number;
  states: { id: number; name: string; count: number }[];
};

const TYPE_COLORS: Record<string, string> = {
  Residential: "#2f7d5b",
  Commercial: "#d96f38",
  Industrial: "#8a5a9e",
  "Agricultural land": "#c7a008",
  "Plot / land": "#3a6ea5",
};

const STRINGS = {
  en: {
    title: "Bank auction watch",
    subtitle:
      "Distressed properties banks are auctioning under SARFAESI, on a map with road-connectivity context. Official notices only — verify with the bank before bidding.",
    chooseState: "State",
    allStates: "All states",
    propertyType: "Property type",
    allTypes: "All types",
    maxPrice: "Max reserve price",
    daysToAuction: "Auction within",
    anyTime: "Any time",
    days: "days",
    reserve: "Reserve price",
    emd: "EMD",
    auctionOn: "Auction",
    openNotice: "Open official notice",
    roadsNear: "Explore road connectivity",
    noResults: "No listings match these filters.",
    results: "listings",
    sampleBanner:
      "Showing sample data. Live IBAPI / bank e-auction notices are wired through the pipeline and replace this automatically.",
    disclaimer:
      "Information service, not a broker. Listings are aggregated from public bank e-auction notices; reserve prices, dates and terms can change. Auction purchases carry their own risks (occupancy, dues). Always confirm with the issuing bank before acting.",
    dataFrom: "Data refreshed",
    home: "Road watch",
    approx: "Approximate area — exact plot not in the notice",
    precise: "Mapped location",
    lang: "हिंदी",
  },
  hi: {
    title: "बैंक नीलामी वॉच",
    subtitle:
      "SARFAESI के तहत बैंकों द्वारा नीलाम की जा रही संपत्तियाँ, सड़क-कनेक्टिविटी संदर्भ के साथ मानचित्र पर। केवल आधिकारिक सूचनाएँ — बोली से पहले बैंक से पुष्टि करें।",
    chooseState: "राज्य",
    allStates: "सभी राज्य",
    propertyType: "संपत्ति प्रकार",
    allTypes: "सभी प्रकार",
    maxPrice: "अधिकतम आरक्षित मूल्य",
    daysToAuction: "नीलामी इतने दिनों में",
    anyTime: "कभी भी",
    days: "दिन",
    reserve: "आरक्षित मूल्य",
    emd: "ईएमडी",
    auctionOn: "नीलामी",
    openNotice: "आधिकारिक सूचना खोलें",
    roadsNear: "सड़क कनेक्टिविटी देखें",
    noResults: "इन फ़िल्टरों से कोई सूची मेल नहीं खाती।",
    results: "सूचियाँ",
    sampleBanner:
      "नमूना डेटा दिखाया जा रहा है। लाइव IBAPI / बैंक ई-नीलामी सूचनाएँ पाइपलाइन से जुड़ी हैं और इसे स्वतः बदल देंगी।",
    disclaimer:
      "यह एक सूचना सेवा है, दलाल नहीं। सूचियाँ सार्वजनिक बैंक ई-नीलामी सूचनाओं से एकत्रित हैं; मूल्य, तिथियाँ और शर्तें बदल सकती हैं। नीलामी खरीद के अपने जोखिम हैं। कार्रवाई से पहले संबंधित बैंक से पुष्टि करें।",
    dataFrom: "डेटा अद्यतन",
    home: "रोड वॉच",
    approx: "अनुमानित क्षेत्र — सटीक प्लॉट सूचना में नहीं",
    precise: "मानचित्रित स्थान",
    lang: "English",
  },
};

const PRECISE_CONFIDENCE = new Set(["rooftop", "street", "locality"]);

const PRICE_BANDS = [2500000, 5000000, 10000000, 20000000];
const DAY_BANDS = [7, 15, 30];

function formatINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString("en-IN")}`;
}

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function AuctionMap({
  listings,
  selectedId,
  onSelect,
}: {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [22.5, 79.0],
        zoom: 5,
        zoomControl: false,
        attributionControl: true,
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      window.setTimeout(() => map.invalidateSize(), 0);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      const map = mapRef.current;
      if (!map || cancelled) return;
      layerRef.current?.remove();
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;

      const points: [number, number][] = [];
      listings.forEach((listing) => {
        if (listing.lat == null || listing.lng == null) return;
        const selected = listing.id === selectedId;
        const color = TYPE_COLORS[listing.propertyType] ?? "#555";
        const precise = PRECISE_CONFIDENCE.has(listing.coordConfidence);
        if (precise) {
          const marker = L.circleMarker([listing.lat, listing.lng], {
            radius: selected ? 11 : 7,
            color: "#fffdf7",
            weight: 2,
            fillColor: color,
            fillOpacity: selectedId && !selected ? 0.4 : 0.9,
          }).addTo(layer);
          marker.bindTooltip(`${listing.title} · ${formatINR(listing.reservePrice)}`, { direction: "top" });
          marker.on("click", () => onSelect(listing.id));
        } else {
          // Approximate: a soft area circle, never a precise-looking pin.
          const area = L.circle([listing.lat, listing.lng], {
            radius: 1400,
            color,
            weight: selected ? 2 : 1,
            opacity: selectedId && !selected ? 0.35 : 0.8,
            fillColor: color,
            fillOpacity: selectedId && !selected ? 0.06 : 0.14,
            dashArray: "4 4",
          }).addTo(layer);
          area.bindTooltip(`${listing.title} · ${formatINR(listing.reservePrice)} · ~`, { direction: "top" });
          area.on("click", () => onSelect(listing.id));
        }
        points.push([listing.lat, listing.lng]);
      });

      const selected = listings.find((l) => l.id === selectedId);
      if (selected && selected.lat != null && selected.lng != null) {
        map.setView([selected.lat, selected.lng], 11);
      } else if (points.length) {
        map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 9 });
      } else {
        map.setView([22.5, 79.0], 5);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [listings, selectedId, onSelect]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%", borderRadius: 14 }} />;
}

export function AuctionWatch() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    const saved = window.localStorage.getItem("mrw-lang");
    return saved === "hi" || saved === "en" ? saved : "en";
  });
  const [index, setIndex] = useState<AuctionIndex | null>(null);
  const [listingsByState, setListingsByState] = useState<Record<number, Listing[]>>({});
  const [stateFilter, setStateFilter] = useState<number | "all">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [maxPrice, setMaxPrice] = useState<number | "all">("all");
  const [maxDays, setMaxDays] = useState<number | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const t = STRINGS[language];

  useEffect(() => {
    fetch(`${PUBLIC_BASE_PATH}/data/auctions/index.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<AuctionIndex>) : Promise.reject(new Error("no index"))))
      .then(setIndex)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!index) return;
    const wanted = stateFilter === "all" ? index.states.map((s) => s.id) : [stateFilter];
    wanted.forEach((id) => {
      if (listingsByState[id]) return;
      fetch(`${PUBLIC_BASE_PATH}/data/auctions/${id}/listings.json`, { cache: "no-cache" })
        .then((r) => (r.ok ? (r.json() as Promise<Listing[]>) : Promise.reject(new Error("no listings"))))
        .then((rows) => setListingsByState((prev) => ({ ...prev, [id]: rows })))
        .catch(() => {});
    });
  }, [index, stateFilter, listingsByState]);

  const allLoaded = useMemo(() => Object.values(listingsByState).flat(), [listingsByState]);

  const filtered = useMemo(() => {
    return allLoaded
      .filter((l) => (stateFilter === "all" ? true : l.stateId === stateFilter))
      .filter((l) => (typeFilter === "all" ? true : l.propertyType === typeFilter))
      .filter((l) => (maxPrice === "all" ? true : l.reservePrice <= maxPrice))
      .filter((l) => (maxDays === "all" ? true : daysUntil(l.auctionDate) <= maxDays))
      .sort((a, b) => a.auctionDate.localeCompare(b.auctionDate));
  }, [allLoaded, stateFilter, typeFilter, maxPrice, maxDays]);

  const propertyTypes = useMemo(
    () => Array.from(new Set(allLoaded.map((l) => l.propertyType))).sort(),
    [allLoaded],
  );

  function toggleLanguage() {
    const next: Language = language === "en" ? "hi" : "en";
    setLanguage(next);
    try {
      window.localStorage.setItem("mrw-lang", next);
    } catch {
      /* private mode */
    }
  }

  const generated = index
    ? new Date(index.generatedAt).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN")
    : "";

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 20px 60px" }} data-language={language}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: 30, fontFamily: "var(--font-display, serif)" }}>{t.title}</h1>
          <p style={{ margin: 0, maxWidth: 640, color: "#4a5750", lineHeight: 1.5 }}>{t.subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href={`${PUBLIC_BASE_PATH}/`} style={btnStyle}>← {t.home}</a>
          <button type="button" onClick={toggleLanguage} style={btnStyle}>{t.lang}</button>
        </div>
      </header>

      {index?.sample && (
        <div style={bannerStyle} role="status">⚠ {t.sampleBanner}</div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "18px 0" }}>
        <label style={fieldStyle}>
          <span style={labelStyle}>{t.chooseState}</span>
          <select
            value={stateFilter}
            onChange={(e) => { setStateFilter(e.target.value === "all" ? "all" : Number(e.target.value)); setSelectedId(null); }}
            style={selectStyle}
          >
            <option value="all">{t.allStates}</option>
            {index?.states.map((s) => (
              <option key={s.id} value={s.id}>{translateState(s.name, language, null)} ({s.count})</option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>{t.propertyType}</span>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
            <option value="all">{t.allTypes}</option>
            {propertyTypes.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
          </select>
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>{t.maxPrice}</span>
          <select value={maxPrice} onChange={(e) => setMaxPrice(e.target.value === "all" ? "all" : Number(e.target.value))} style={selectStyle}>
            <option value="all">{t.allTypes}</option>
            {PRICE_BANDS.map((p) => <option key={p} value={p}>{formatINR(p)}</option>)}
          </select>
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>{t.daysToAuction}</span>
          <select value={maxDays} onChange={(e) => setMaxDays(e.target.value === "all" ? "all" : Number(e.target.value))} style={selectStyle}>
            <option value="all">{t.anyTime}</option>
            {DAY_BANDS.map((d) => <option key={d} value={d}>{d} {t.days}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)", gap: 18, alignItems: "stretch" }}>
        <div style={{ minHeight: 460, height: "62vh", position: "sticky", top: 16 }}>
          <AuctionMap listings={filtered} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div>
          <p style={{ margin: "0 0 10px", color: "#4a5750", fontSize: 14 }}>{filtered.length} {t.results}</p>
          {filtered.length === 0 && <p style={{ color: "#7a857e" }}>{t.noResults}</p>}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((l) => {
              const active = l.id === selectedId;
              const dd = daysUntil(l.auctionDate);
              return (
                <li
                  key={l.id}
                  onClick={() => setSelectedId(l.id)}
                  style={{
                    border: `1px solid ${active ? "#214f42" : "#e2e6e2"}`,
                    borderLeft: `5px solid ${TYPE_COLORS[l.propertyType] ?? "#555"}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                    cursor: "pointer",
                    background: active ? "#f4f8f4" : "#fff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong style={{ fontSize: 15 }}>{l.title}</strong>
                    <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" }}>{formatINR(l.reservePrice)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#4a5750", margin: "3px 0" }}>
                    {l.bank}{l.branch ? ` · ${l.branch}` : ""} · {l.propertyType}
                  </div>
                  <div style={{ fontSize: 13, color: "#4a5750" }}>
                    {t.auctionOn}: {new Date(l.auctionDate).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN")}
                    {dd >= 0 ? ` · ${dd} ${t.days}` : ""}
                    {l.emd != null ? ` · ${t.emd} ${formatINR(l.emd)}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: PRECISE_CONFIDENCE.has(l.coordConfidence) ? "#2f7d5b" : "#a06a12", marginTop: 3 }}>
                    {PRECISE_CONFIDENCE.has(l.coordConfidence) ? `◍ ${t.precise}` : `◌ ${t.approx}`}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {l.noticeUrl && (
                      <a href={l.noticeUrl} target="_blank" rel="noopener noreferrer" style={linkStyle} onClick={(e) => e.stopPropagation()}>
                        {t.openNotice} ↗
                      </a>
                    )}
                    <a href={`${PUBLIC_BASE_PATH}/`} style={linkStyle} onClick={(e) => e.stopPropagation()}>
                      {t.roadsNear} →
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <footer style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid #e2e6e2", color: "#6a746e", fontSize: 12.5, lineHeight: 1.6 }}>
        <p style={{ margin: "0 0 6px" }}>{t.disclaimer}</p>
        {index && <p style={{ margin: 0 }}>{t.dataFrom}: {generated} · {index.source}</p>}
      </footer>
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  border: "1px solid #cdd4ce",
  background: "#fff",
  borderRadius: 8,
  padding: "7px 12px",
  fontSize: 13,
  cursor: "pointer",
  textDecoration: "none",
  color: "#214f42",
};
const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, minWidth: 150 };
const labelStyle: React.CSSProperties = { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "#6a746e" };
const selectStyle: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #cdd4ce", background: "#fff", fontSize: 14 };
const linkStyle: React.CSSProperties = { fontSize: 13, color: "#214f42", fontWeight: 600, textDecoration: "none" };
const bannerStyle: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 14px",
  borderRadius: 10,
  background: "#fff5e6",
  border: "1px solid #f0d8a8",
  color: "#7a5a12",
  fontSize: 13.5,
};
