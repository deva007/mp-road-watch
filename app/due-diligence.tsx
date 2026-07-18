"use client";

import { useEffect, useMemo, useState } from "react";
import { type Language } from "./i18n";

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const CONTACT_EMAIL = "devashish111997@gmail.com";

type Listing = {
  id: string; bank: string; branch: string; propertyType: string; title: string;
  address: string; district: string; pincode?: string; stateId: number;
  reservePrice: number; emd: number | null; auctionDate: string; noticeUrl: string;
  lat: number | null; lng: number | null; coordConfidence: string; sample: boolean;
};
type PortalLink = { label: string; url: string };
type StatePortal = Partial<Record<"landRecords" | "cadastral" | "registration" | "rera", PortalLink>>;
type Portals = { national: Record<string, PortalLink>; states: Record<string, StatePortal> };
type StateSummary = { id: number; name: string };
type DistrictRef = { code: number; name: string; stateId: number };

const PRECISE = new Set(["rooftop", "street", "locality"]);

const STRINGS = {
  en: {
    title: "Land due-diligence",
    subtitle:
      "Verify any plot before you buy or lease. Enter a khasra / survey number and get every official check in one place — ownership, cadastral map, litigation, circle rate, and road connectivity. Red-flag screening from government sources; not a title guarantee or legal opinion (India uses presumptive titling). Always confirm with a local lawyer.",
    lookupTitle: "Check a plot",
    stateLabel: "State", districtLabel: "District (optional)", any: "Select…",
    khasraLabel: "Khasra / survey / plot number", khasraPh: "e.g. 142/2",
    ownerLabel: "Owner / seller name (optional)", ownerPh: "As on documents",
    subject: "Verifying", plot: "Plot", owner: "Owner / seller", inState: "in",
    sources: "Run these official checks",
    sourcesIntro:
      "Free and authoritative. Search each portal using the khasra/survey number and owner name above.",
    ownership: "1 · Ownership record", ownershipWhy: "Confirm who the government records show as owner (Bhulekh / RoR / 7-12).",
    cadastral: "2 · Cadastral boundary", cadastralWhy: "See the plot's mapped boundary and neighbours on Bhu-Naksha; match it to what's on the ground.",
    litigation: "3 · Litigation", litigationWhy: "Search the owner and plot in court records — pending suits transfer risk to you.",
    charges: "4 · Loans / charges (CERSAI)", chargesWhy: "Check whether any lender holds a mortgage/charge on this plot.",
    registration: "5 · Circle rate & registry", registrationWhy: "Compare the government value to the asking price; get the encumbrance certificate.",
    rera: "6 · RERA (flats/projects)", reraWhy: "If it's in a registered project, check status and complaints.",
    connectivity: "7 · Road connectivity", connectivityWhy: "Existing and sanctioned roads near the plot — the strongest public signal of land-value direction.",
    exploreRoads: "Open road map for this area",
    lease: "Leasing this land?",
    leaseWhy: "Agri-land lease deals stay informal because nobody verifies the lessor actually owns the plot. The ownership + cadastral checks above are exactly what makes a lease safe — no rental marketplace needed.",
    paidTitle: "Get a verified report",
    paidPrice: "₹499",
    paidDesc: "We pull the ownership extract, cadastral map, litigation search, CERSAI charge check, circle rate and connectivity for this exact plot, and send a single verified PDF — usually within 48 hours.",
    paidCta: "Request verified report",
    checklist: "Before you commit — checklist",
    checklistItems: [
      "Match the owner name on the record with the seller/lessor you're dealing with.",
      "Pull the encumbrance certificate (13–30 years) from the sub-registrar.",
      "Confirm the cadastral boundary matches the physical plot; check for encroachment.",
      "Search litigation on both the owner and the survey number.",
      "Check CERSAI for existing mortgages before paying anything.",
      "For agri land, verify land-use and any tenancy/lease already recorded.",
      "Consult a local property lawyer before money changes hands.",
    ],
    disclaimer:
      "Information service, not a broker or legal advisor. Links go to official government portals; their data is authoritative, ours is a guide.",
    auctions: "Bank auctions", home: "Road watch",
    mapped: "Mapped location", approx: "Approximate area — exact plot not in the notice",
    reserve: "Reserve price", auctionOn: "Auction date", notice: "Official notice", directions: "Get directions",
  },
  hi: {
    title: "भूमि ड्यू-डिलिजेंस",
    subtitle:
      "खरीदने या पट्टे से पहले किसी भी प्लॉट का सत्यापन करें। खसरा/सर्वे नंबर डालें और सभी आधिकारिक जांच एक जगह पाएं — स्वामित्व, नक्शा, मुकदमे, सर्किल रेट और सड़क कनेक्टिविटी। यह सरकारी स्रोतों से रेड-फ्लैग जांच है; स्वामित्व की गारंटी नहीं। स्थानीय वकील से पुष्टि करें।",
    lookupTitle: "प्लॉट जांचें",
    stateLabel: "राज्य", districtLabel: "जिला (वैकल्पिक)", any: "चुनें…",
    khasraLabel: "खसरा / सर्वे / प्लॉट नंबर", khasraPh: "जैसे 142/2",
    ownerLabel: "मालिक / विक्रेता नाम (वैकल्पिक)", ownerPh: "दस्तावेज़ अनुसार",
    subject: "सत्यापन", plot: "प्लॉट", owner: "मालिक / विक्रेता", inState: "में",
    sources: "ये आधिकारिक जांच करें",
    sourcesIntro: "निःशुल्क और प्रामाणिक। ऊपर दिए खसरा/सर्वे नंबर और मालिक नाम से खोजें।",
    ownership: "1 · स्वामित्व अभिलेख", ownershipWhy: "सरकारी रिकॉर्ड में मालिक कौन है (भूलेख / RoR / 7-12) पुष्टि करें।",
    cadastral: "2 · नक्शा सीमा", cadastralWhy: "भू-नक्शा पर प्लॉट की सीमा और पड़ोसी देखें; ज़मीन से मिलाएं।",
    litigation: "3 · मुकदमेबाज़ी", litigationWhy: "अदालती रिकॉर्ड में मालिक और प्लॉट खोजें।",
    charges: "4 · ऋण / भार (CERSAI)", chargesWhy: "जांचें कि किसी बैंक का इस प्लॉट पर बंधक तो नहीं।",
    registration: "5 · सर्किल रेट और रजिस्ट्री", registrationWhy: "सरकारी मूल्य की तुलना करें; ऋणभार प्रमाणपत्र लें।",
    rera: "6 · RERA (फ्लैट/प्रोजेक्ट)", reraWhy: "पंजीकृत प्रोजेक्ट की स्थिति देखें।",
    connectivity: "7 · सड़क कनेक्टिविटी", connectivityWhy: "प्लॉट के पास मौजूदा और स्वीकृत सड़कें।",
    exploreRoads: "इस क्षेत्र का सड़क मानचित्र खोलें",
    lease: "इस ज़मीन को पट्टे पर दे रहे हैं?",
    leaseWhy: "कृषि-भूमि पट्टे अनौपचारिक रहते हैं क्योंकि कोई सत्यापित नहीं करता कि पट्टादाता वास्तव में मालिक है। ऊपर की स्वामित्व + नक्शा जांच ही पट्टे को सुरक्षित बनाती है।",
    paidTitle: "सत्यापित रिपोर्ट पाएं",
    paidPrice: "₹499",
    paidDesc: "हम इस प्लॉट का स्वामित्व, नक्शा, मुकदमे, CERSAI भार, सर्किल रेट और कनेक्टिविटी निकालकर एक सत्यापित PDF भेजते हैं — आमतौर पर 48 घंटे में।",
    paidCta: "सत्यापित रिपोर्ट का अनुरोध करें",
    checklist: "प्रतिबद्ध होने से पहले — चेकलिस्ट",
    checklistItems: [
      "रिकॉर्ड में मालिक नाम को विक्रेता/पट्टादाता से मिलाएं।",
      "सब-रजिस्ट्रार से ऋणभार प्रमाणपत्र (13–30 वर्ष) लें।",
      "नक्शा सीमा को भौतिक प्लॉट से मिलाएं; अतिक्रमण जांचें।",
      "मालिक और सर्वे नंबर दोनों पर मुकदमे खोजें।",
      "भुगतान से पहले CERSAI में बंधक जांचें।",
      "कृषि भूमि के लिए भू-उपयोग और दर्ज पट्टा जांचें।",
      "पैसा देने से पहले स्थानीय वकील से सलाह लें।",
    ],
    disclaimer: "यह सूचना सेवा है, दलाल या कानूनी सलाहकार नहीं। लिंक आधिकारिक सरकारी पोर्टलों पर जाते हैं।",
    auctions: "बैंक नीलामी", home: "रोड वॉच",
    mapped: "मानचित्रित स्थान", approx: "अनुमानित क्षेत्र — सटीक प्लॉट सूचना में नहीं",
    reserve: "आरक्षित मूल्य", auctionOn: "नीलामी तिथि", notice: "आधिकारिक सूचना", directions: "रास्ता पाएं",
  },
};

function formatINR(v: number): string {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export function DueDiligence() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    const s = window.localStorage.getItem("mrw-lang");
    return s === "hi" || s === "en" ? s : "en";
  });
  const params = useMemo(() => {
    if (typeof window === "undefined") return {} as Record<string, string | null>;
    const p = new URLSearchParams(window.location.search);
    return { id: p.get("id"), state: p.get("state"), khasra: p.get("khasra") };
  }, []);

  const [listing, setListing] = useState<Listing | null>(null);
  const [portals, setPortals] = useState<Portals | null>(null);
  const [states, setStates] = useState<StateSummary[]>([]);
  const [districtIndex, setDistrictIndex] = useState<DistrictRef[]>([]);

  // standalone form
  const [formState, setFormState] = useState<number | "">(params.state ? Number(params.state) : "");
  const [formDistrict, setFormDistrict] = useState<number | "">("");
  const [khasra, setKhasra] = useState<string>(params.khasra ?? "");
  const [owner, setOwner] = useState<string>("");

  const t = STRINGS[language];

  useEffect(() => {
    fetch(`${PUBLIC_BASE_PATH}/data/state-portals.json`, { cache: "force-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<Portals>) : Promise.reject(new Error("x"))))
      .then(setPortals).catch(() => {});
    fetch(`${PUBLIC_BASE_PATH}/data/roads/states.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<StateSummary[]>) : Promise.reject(new Error("x"))))
      .then(setStates).catch(() => {});
    fetch(`${PUBLIC_BASE_PATH}/data/roads/districts-index.json`, { cache: "force-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<DistrictRef[]>) : Promise.reject(new Error("x"))))
      .then(setDistrictIndex).catch(() => {});
  }, []);

  useEffect(() => {
    if (!params.id || !params.state) return;
    fetch(`${PUBLIC_BASE_PATH}/data/auctions/${params.state}/listings.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<Listing[]>) : Promise.reject(new Error("x"))))
      .then((rows) => setListing(rows.find((l) => l.id === params.id) ?? null)).catch(() => {});
  }, [params]);

  const activeStateId: number | null = listing ? listing.stateId : (formState === "" ? null : formState);
  const districtName = listing
    ? listing.district
    : (formDistrict === "" ? "" : districtIndex.find((d) => d.code === formDistrict)?.name ?? "");
  const statePortals: StatePortal = portals && activeStateId ? portals.states[String(activeStateId)] ?? {} : {};
  const stateName = states.find((s) => s.id === activeStateId)?.name ?? "";
  const precise = listing ? PRECISE.has(listing.coordConfidence) : false;
  const stateDistricts = useMemo(
    () => districtIndex.filter((d) => d.stateId === formState).sort((a, b) => a.name.localeCompare(b.name)),
    [districtIndex, formState],
  );

  function toggleLanguage() {
    const next: Language = language === "en" ? "hi" : "en";
    setLanguage(next);
    try { window.localStorage.setItem("mrw-lang", next); } catch { /* private */ }
  }

  const directions = listing && listing.lat != null && listing.lng != null && precise
    ? `https://www.google.com/maps/dir/?api=1&destination=${listing.lat},${listing.lng}`
    : listing ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(listing.address || listing.district)}` : "#";

  const roadsHref = activeStateId
    ? `${PUBLIC_BASE_PATH}/?state=${activeStateId}${formDistrict !== "" ? `&district=${formDistrict}` : ""}`
    : `${PUBLIC_BASE_PATH}/`;

  const reportSubject = encodeURIComponent(
    `Due-diligence report request${khasra ? ` — plot ${khasra}` : ""}${districtName ? `, ${districtName}` : ""}${stateName ? `, ${stateName}` : ""}`,
  );
  const reportBody = encodeURIComponent(
    `Plot / khasra: ${khasra || "(not given)"}\nDistrict: ${districtName || "(not given)"}\nState: ${stateName || "(not given)"}\nOwner/seller: ${owner || "(not given)"}\n${listing ? `Auction listing: ${listing.id}\n` : ""}\nPlease send the verified report.`,
  );
  const reportUrl = `mailto:${CONTACT_EMAIL}?subject=${reportSubject}&body=${reportBody}`;

  const sections = portals && activeStateId ? [
    { key: "own", title: t.ownership, why: t.ownershipWhy, links: [statePortals.landRecords].filter(Boolean) as PortalLink[] },
    { key: "cad", title: t.cadastral, why: t.cadastralWhy, links: [statePortals.cadastral].filter(Boolean) as PortalLink[] },
    { key: "lit", title: t.litigation, why: t.litigationWhy, links: [portals.national.ecourts, portals.national.njdg] },
    { key: "chg", title: t.charges, why: t.chargesWhy, links: [portals.national.cersai] },
    { key: "reg", title: t.registration, why: t.registrationWhy, links: [statePortals.registration].filter(Boolean) as PortalLink[] },
    { key: "rera", title: t.rera, why: t.reraWhy, links: [statePortals.rera].filter(Boolean) as PortalLink[] },
  ] : [];

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px 60px" }} data-language={language}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 8px", fontSize: 30, fontFamily: "var(--font-display, serif)" }}>{t.title}</h1>
          <p style={{ margin: 0, color: "#4a5750", lineHeight: 1.55, fontSize: 14.5, maxWidth: 640 }}>{t.subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href={`${PUBLIC_BASE_PATH}/`} style={btn}>← {t.home}</a>
          <button type="button" onClick={toggleLanguage} style={btn}>{language === "en" ? "हिंदी" : "English"}</button>
        </div>
      </header>

      {listing ? (
        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <strong style={{ fontSize: 19 }}>{listing.title}</strong>
              <div style={{ fontSize: 13.5, color: "#4a5750", marginTop: 4 }}>{listing.bank}{listing.branch ? ` · ${listing.branch}` : ""} · {listing.propertyType}</div>
              <div style={{ fontSize: 13.5, color: "#4a5750" }}>{listing.address}</div>
              <div style={{ fontSize: 12.5, marginTop: 6, color: precise ? "#2f7d5b" : "#a06a12" }}>{precise ? `◍ ${t.mapped}` : `◌ ${t.approx}`}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "#6a746e" }}>{t.reserve}</div>
              <strong style={{ fontSize: 22 }}>{formatINR(listing.reservePrice)}</strong>
              <div style={{ fontSize: 13, color: "#4a5750", marginTop: 4 }}>{t.auctionOn}: {new Date(listing.auctionDate).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN")}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
            <a href={listing.noticeUrl} target="_blank" rel="noopener noreferrer" style={link}>{t.notice} ↗</a>
            <a href={directions} target="_blank" rel="noopener noreferrer" style={link}>{t.directions} ↗</a>
          </div>
        </section>
      ) : (
        <section style={card}>
          <strong style={{ fontSize: 16, display: "block", marginBottom: 12 }}>{t.lookupTitle}</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label style={field}><span style={flabel}>{t.stateLabel}</span>
              <select style={input} value={formState} onChange={(e) => { setFormState(e.target.value === "" ? "" : Number(e.target.value)); setFormDistrict(""); }}>
                <option value="">{t.any}</option>
                {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label style={field}><span style={flabel}>{t.districtLabel}</span>
              <select style={input} value={formDistrict} onChange={(e) => setFormDistrict(e.target.value === "" ? "" : Number(e.target.value))} disabled={formState === ""}>
                <option value="">{t.any}</option>
                {stateDistricts.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              </select>
            </label>
            <label style={field}><span style={flabel}>{t.khasraLabel}</span>
              <input style={input} value={khasra} onChange={(e) => setKhasra(e.target.value)} placeholder={t.khasraPh} />
            </label>
            <label style={field}><span style={flabel}>{t.ownerLabel}</span>
              <input style={input} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={t.ownerPh} />
            </label>
          </div>
          {activeStateId && (
            <div style={{ marginTop: 14, fontSize: 14, color: "#33403a" }}>
              {t.subject}: {khasra ? <><b>{t.plot} {khasra}</b>{" "}</> : null}
              {districtName ? <>{districtName}, </> : null}{stateName} {owner ? <>· {t.owner}: {owner}</> : null}
            </div>
          )}
        </section>
      )}

      {activeStateId ? (
        <>
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
                {s.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={link}>{l.label} ↗</a>)}
              </div>
            </section>
          ))}
          <section style={row}>
            <div style={{ flex: "1 1 300px" }}>
              <strong style={{ fontSize: 15 }}>{t.connectivity}</strong>
              <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "#4a5750", lineHeight: 1.5 }}>{t.connectivityWhy}</p>
            </div>
            <a href={roadsHref} style={link}>{t.exploreRoads} →</a>
          </section>

          <section style={{ ...card, borderLeftColor: "#d96f38", background: "#fffdf9" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 320px" }}>
                <strong style={{ fontSize: 17 }}>{t.paidTitle} · <span style={{ color: "#d96f38" }}>{t.paidPrice}</span></strong>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "#4a5750", lineHeight: 1.5 }}>{t.paidDesc}</p>
              </div>
              <a href={reportUrl} style={{ ...link, border: "1px solid #d96f38", borderRadius: 9, padding: "9px 16px", color: "#b5541f", whiteSpace: "nowrap" }}>{t.paidCta} →</a>
            </div>
          </section>

          <section style={{ ...row, background: "#f4f8f4", borderColor: "#d8e4dc" }}>
            <div>
              <strong style={{ fontSize: 15 }}>{t.lease}</strong>
              <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "#4a5750", lineHeight: 1.5 }}>{t.leaseWhy}</p>
            </div>
          </section>

          <h2 style={h2}>{t.checklist}</h2>
          <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
            {t.checklistItems.map((item, i) => <li key={i} style={{ fontSize: 14, color: "#33403a", lineHeight: 1.5 }}>{item}</li>)}
          </ol>
        </>
      ) : null}

      <footer style={{ marginTop: 30, paddingTop: 14, borderTop: "1px solid #e2e6e2", color: "#6a746e", fontSize: 12.5, lineHeight: 1.6 }}>
        {t.disclaimer} · <a href={`${PUBLIC_BASE_PATH}/auctions`} style={link}>{t.auctions} ↗</a>
      </footer>
    </main>
  );
}

const btn: React.CSSProperties = { border: "1px solid #cdd4ce", background: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", textDecoration: "none", color: "#214f42", fontFamily: "inherit" };
const card: React.CSSProperties = { border: "1px solid #e2e6e2", borderLeft: "5px solid #214f42", borderRadius: 12, padding: "16px 18px", margin: "22px 0", background: "#fff" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", border: "1px solid #e2e6e2", borderRadius: 12, padding: "14px 16px", marginBottom: 10, background: "#fff" };
const link: React.CSSProperties = { fontSize: 13.5, color: "#214f42", fontWeight: 600, textDecoration: "none" };
const h2: React.CSSProperties = { margin: "26px 0 8px", fontSize: 20, fontFamily: "var(--font-display, serif)" };
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const flabel: React.CSSProperties = { fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#6a746e" };
const input: React.CSSProperties = { height: 40, padding: "0 11px", border: "1px solid #cdd4ce", borderRadius: 9, background: "#fff", fontSize: 14, color: "#1f2a24", fontFamily: "inherit" };
