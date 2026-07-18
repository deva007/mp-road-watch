"use client";

import { useEffect, useMemo, useState } from "react";
import { type Language } from "./i18n";

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Listing = {
  id: string;
  bank: string;
  branch: string;
  propertyType: string;
  title: string;
  address: string;
  district: string;
  pincode?: string;
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

type PortalLink = { label: string; url: string };
type Portals = {
  national: Record<string, PortalLink>;
  states: Record<string, Partial<Record<"landRecords" | "registration" | "rera", PortalLink>>>;
};

const PRECISE = new Set(["rooftop", "street", "locality"]);

const STRINGS = {
  en: {
    title: "Due-diligence pack",
    subtitle:
      "A structured verification pack for this auction property, built from official public sources. This is red-flag screening — not a title guarantee, valuation, or legal opinion. India follows presumptive (not conclusive) land titling; always verify with the issuing bank and a local lawyer before bidding.",
    property: "Property",
    reserve: "Reserve price",
    emd: "EMD",
    auctionOn: "Auction date",
    mapped: "Mapped location",
    approx: "Approximate area — exact plot not in the notice",
    directions: "Get directions",
    notice: "Official auction notice",
    sources: "Verify at official sources",
    sourcesIntro:
      "Run these checks yourself on the government portals — free, and authoritative. Search using the owner/borrower name from the auction notice and the property's survey/khasra number.",
    landRecords: "1 · Ownership & land record",
    landRecordsWhy: "Confirm the recorded owner matches the borrower named in the bank's notice, and check the plot's survey/khasra entry.",
    registration: "2 · Circle rate & registration",
    registrationWhy: "Compare the government guidance/circle value with the reserve price to judge the discount honestly.",
    litigation: "3 · Litigation",
    litigationWhy: "Search the borrower and property in court records; SARFAESI sales can be challenged, and pending suits transfer risk to you.",
    cersai: "4 · Other loans on this property",
    cersaiWhy: "CERSAI records security interests — check whether more than one lender holds a charge on the same asset.",
    rera: "5 · RERA (for flats/projects)",
    reraWhy: "If the property is in a registered project, check the project status and complaints.",
    connectivity: "6 · Road connectivity",
    connectivityWhy: "Roads near the plot — existing and sanctioned — are the strongest public signal of land-value direction.",
    exploreRoads: "Open road map for this district",
    checklist: "Before you bid — checklist",
    checklistItems: [
      "Read the full auction notice: 'as-is-where-is' terms, dues, and inspection dates.",
      "Visit the property; confirm occupancy status (eviction after sale can take time and money).",
      "Verify outstanding dues: property tax, society charges, electricity/water arrears often pass to the buyer.",
      "Match the notice's owner name with the land record entry.",
      "Get the encumbrance certificate from the sub-registrar for the last 13–30 years.",
      "Confirm EMD refund terms and the payment schedule (typically 25% on award, 75% in 15 days).",
      "Consult a local property lawyer before depositing EMD.",
    ],
    disclaimer:
      "Information service, not a broker or legal advisor. Links go to official government portals; their data is authoritative, ours is a guide. Auction purchases carry real risks (occupancy, dues, litigation).",
    back: "← Bank auctions",
    notFound: "Property not found. Open this page from a listing's 'Due-diligence pack' link.",
    forState: "state portals",
  },
  hi: {
    title: "ड्यू-डिलिजेंस पैक",
    subtitle:
      "इस नीलामी संपत्ति के लिए आधिकारिक सार्वजनिक स्रोतों से बना सत्यापन पैक। यह रेड-फ्लैग जांच है — स्वामित्व की गारंटी, मूल्यांकन या कानूनी राय नहीं। बोली से पहले बैंक और स्थानीय वकील से पुष्टि करें।",
    property: "संपत्ति",
    reserve: "आरक्षित मूल्य",
    emd: "ईएमडी",
    auctionOn: "नीलामी तिथि",
    mapped: "मानचित्रित स्थान",
    approx: "अनुमानित क्षेत्र — सटीक प्लॉट सूचना में नहीं",
    directions: "रास्ता पाएं",
    notice: "आधिकारिक नीलामी सूचना",
    sources: "आधिकारिक स्रोतों पर सत्यापित करें",
    sourcesIntro:
      "ये जांच सरकारी पोर्टलों पर स्वयं करें — निःशुल्क और प्रामाणिक। नोटिस में दिए उधारकर्ता के नाम और खसरा/सर्वे नंबर से खोजें।",
    landRecords: "1 · स्वामित्व और भूमि अभिलेख",
    landRecordsWhy: "पुष्टि करें कि दर्ज मालिक बैंक की सूचना में नामित उधारकर्ता से मेल खाता है।",
    registration: "2 · सर्किल रेट और पंजीकरण",
    registrationWhy: "सरकारी मूल्य की तुलना आरक्षित मूल्य से करें।",
    litigation: "3 · मुकदमेबाज़ी",
    litigationWhy: "अदालती रिकॉर्ड में उधारकर्ता और संपत्ति खोजें।",
    cersai: "4 · इस संपत्ति पर अन्य ऋण",
    cersaiWhy: "CERSAI में जांचें कि क्या एक से अधिक बैंक का दावा है।",
    rera: "5 · RERA (फ्लैट/प्रोजेक्ट के लिए)",
    reraWhy: "पंजीकृत प्रोजेक्ट की स्थिति और शिकायतें देखें।",
    connectivity: "6 · सड़क कनेक्टिविटी",
    connectivityWhy: "प्लॉट के पास मौजूदा और स्वीकृत सड़कें भूमि-मूल्य का सबसे मजबूत सार्वजनिक संकेत हैं।",
    exploreRoads: "इस जिले का सड़क मानचित्र खोलें",
    checklist: "बोली से पहले — चेकलिस्ट",
    checklistItems: [
      "पूरी नीलामी सूचना पढ़ें: 'जैसा है-जहाँ है' शर्तें, बकाया और निरीक्षण तिथियाँ।",
      "संपत्ति देखें; कब्जे की स्थिति जांचें।",
      "बकाया जांचें: संपत्ति कर, सोसाइटी शुल्क, बिजली/पानी बकाया अक्सर खरीदार पर आते हैं।",
      "सूचना का मालिक नाम भूमि अभिलेख से मिलाएं।",
      "सब-रजिस्ट्रार से ऋणभार प्रमाणपत्र (EC) लें।",
      "ईएमडी वापसी शर्तें और भुगतान अनुसूची पुष्टि करें।",
      "ईएमडी जमा करने से पहले स्थानीय वकील से सलाह लें।",
    ],
    disclaimer:
      "यह सूचना सेवा है, दलाल या कानूनी सलाहकार नहीं। लिंक आधिकारिक सरकारी पोर्टलों पर जाते हैं।",
    back: "← बैंक नीलामी",
    notFound: "संपत्ति नहीं मिली। किसी लिस्टिंग के 'ड्यू-डिलिजेंस पैक' लिंक से खोलें।",
    forState: "राज्य पोर्टल",
  },
};

function formatINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString("en-IN")}`;
}

export function DueDiligence() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    const saved = window.localStorage.getItem("mrw-lang");
    return saved === "hi" || saved === "en" ? saved : "en";
  });
  const [listing, setListing] = useState<Listing | null>(null);
  const [portals, setPortals] = useState<Portals | null>(null);
  const [loaded, setLoaded] = useState(() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    return !(p.get("id") && p.get("state"));
  });

  const params = useMemo(() => {
    if (typeof window === "undefined") return { id: null as string | null, state: null as string | null };
    const p = new URLSearchParams(window.location.search);
    return { id: p.get("id"), state: p.get("state") };
  }, []);

  useEffect(() => {
    fetch(`${PUBLIC_BASE_PATH}/data/state-portals.json`, { cache: "force-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<Portals>) : Promise.reject(new Error("no portals"))))
      .then(setPortals)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!params.id || !params.state) return;
    fetch(`${PUBLIC_BASE_PATH}/data/auctions/${params.state}/listings.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<Listing[]>) : Promise.reject(new Error("none"))))
      .then((rows) => setListing(rows.find((l) => l.id === params.id) ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [params]);

  const t = STRINGS[language];
  const statePortals = portals && params.state ? portals.states[params.state] ?? {} : {};
  const precise = listing ? PRECISE.has(listing.coordConfidence) : false;

  function toggleLanguage() {
    const next: Language = language === "en" ? "hi" : "en";
    setLanguage(next);
    try { window.localStorage.setItem("mrw-lang", next); } catch { /* private mode */ }
  }

  const directions = listing && listing.lat != null && listing.lng != null && precise
    ? `https://www.google.com/maps/dir/?api=1&destination=${listing.lat},${listing.lng}`
    : listing
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(listing.address || listing.district)}`
      : "#";

  const sections: { key: string; title: string; why: string; links: PortalLink[] }[] = listing && portals ? [
    { key: "land", title: t.landRecords, why: t.landRecordsWhy, links: [statePortals.landRecords].filter(Boolean) as PortalLink[] },
    { key: "reg", title: t.registration, why: t.registrationWhy, links: [statePortals.registration].filter(Boolean) as PortalLink[] },
    { key: "lit", title: t.litigation, why: t.litigationWhy, links: [portals.national.ecourts, portals.national.njdg] },
    { key: "cersai", title: t.cersai, why: t.cersaiWhy, links: [portals.national.cersai] },
    { key: "rera", title: t.rera, why: t.reraWhy, links: [statePortals.rera].filter(Boolean) as PortalLink[] },
  ] : [];

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px 60px" }} data-language={language}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 8px", fontSize: 30, fontFamily: "var(--font-display, serif)" }}>{t.title}</h1>
          <p style={{ margin: 0, color: "#4a5750", lineHeight: 1.55, fontSize: 14.5 }}>{t.subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href={`${PUBLIC_BASE_PATH}/auctions`} style={btn}>{t.back}</a>
          <button type="button" onClick={toggleLanguage} style={btn}>{language === "en" ? "हिंदी" : "English"}</button>
        </div>
      </header>

      {loaded && !listing && (
        <p style={{ marginTop: 28, color: "#7a857e" }}>{t.notFound}</p>
      )}

      {listing && (
        <>
          <section style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "#6a746e" }}>{t.property}</div>
                <strong style={{ fontSize: 19 }}>{listing.title}</strong>
                <div style={{ fontSize: 13.5, color: "#4a5750", marginTop: 4 }}>
                  {listing.bank}{listing.branch ? ` · ${listing.branch}` : ""} · {listing.propertyType}
                </div>
                <div style={{ fontSize: 13.5, color: "#4a5750" }}>{listing.address}</div>
                <div style={{ fontSize: 12.5, marginTop: 6, color: precise ? "#2f7d5b" : "#a06a12" }}>
                  {precise ? `◍ ${t.mapped}` : `◌ ${t.approx}`}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "#6a746e" }}>{t.reserve}</div>
                <strong style={{ fontSize: 22 }}>{formatINR(listing.reservePrice)}</strong>
                <div style={{ fontSize: 13, color: "#4a5750", marginTop: 4 }}>
                  {t.auctionOn}: {new Date(listing.auctionDate).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN")}
                </div>
                {listing.emd != null && <div style={{ fontSize: 13, color: "#4a5750" }}>{t.emd}: {formatINR(listing.emd)}</div>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
              <a href={listing.noticeUrl} target="_blank" rel="noopener noreferrer" style={link}>{t.notice} ↗</a>
              <a href={directions} target="_blank" rel="noopener noreferrer" style={link}>{t.directions} ↗</a>
            </div>
          </section>

          <h2 style={h2}>{t.sources}</h2>
          <p style={{ margin: "0 0 14px", color: "#4a5750", fontSize: 14 }}>{t.sourcesIntro}</p>

          {sections.map((s) => (
            <section key={s.key} style={row}>
              <div style={{ flex: "1 1 300px" }}>
                <strong style={{ fontSize: 15 }}>{s.title}</strong>
                <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "#4a5750", lineHeight: 1.5 }}>{s.why}</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                {s.links.length === 0 && <span style={{ fontSize: 13, color: "#7a857e" }}>—</span>}
                {s.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={link}>{l.label} ↗</a>
                ))}
              </div>
            </section>
          ))}

          <section style={row}>
            <div style={{ flex: "1 1 300px" }}>
              <strong style={{ fontSize: 15 }}>{t.connectivity}</strong>
              <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "#4a5750", lineHeight: 1.5 }}>{t.connectivityWhy}</p>
            </div>
            <a href={`${PUBLIC_BASE_PATH}/?state=${listing.stateId}`} style={link}>{t.exploreRoads} →</a>
          </section>

          <h2 style={h2}>{t.checklist}</h2>
          <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
            {t.checklistItems.map((item, i) => (
              <li key={i} style={{ fontSize: 14, color: "#33403a", lineHeight: 1.5 }}>{item}</li>
            ))}
          </ol>
        </>
      )}

      <footer style={{ marginTop: 30, paddingTop: 14, borderTop: "1px solid #e2e6e2", color: "#6a746e", fontSize: 12.5, lineHeight: 1.6 }}>
        {t.disclaimer}
      </footer>
    </main>
  );
}

const btn: React.CSSProperties = { border: "1px solid #cdd4ce", background: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", textDecoration: "none", color: "#214f42", fontFamily: "inherit" };
const card: React.CSSProperties = { border: "1px solid #e2e6e2", borderLeft: "5px solid #214f42", borderRadius: 12, padding: "16px 18px", margin: "22px 0", background: "#fff" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", border: "1px solid #e2e6e2", borderRadius: 12, padding: "14px 16px", marginBottom: 10, background: "#fff" };
const link: React.CSSProperties = { fontSize: 13.5, color: "#214f42", fontWeight: 600, textDecoration: "none" };
const h2: React.CSSProperties = { margin: "26px 0 8px", fontSize: 20, fontFamily: "var(--font-display, serif)" };
