"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import {
  majorProjectNotesHi,
  translateDistrict,
  translatePrecision,
  translateRoadType,
  translateStage,
  translateState,
  translations,
  type Language,
  type GeoNames,
  type NameLanguage,
  AVAILABLE_REGIONAL_LOCALES,
} from "./i18n";
import { stateRegionalLanguage, languageAutonyms } from "./state-languages";
import { majorProjects, type ProjectStage } from "./major-projects";

type StateSummary = {
  id: number;
  name: string;
  districtCount: number;
};

type DistrictSummary = {
  code: number;
  name: string;
  center: [number, number];
  inventoryCount: number;
  activeProjectCount: number;
  stageCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
};

type InventoryRoad = {
  id: string;
  name: string;
  code: string;
  category: string;
  owner: string;
  blockCode: number;
  bounds: [number, number, number, number];
  route: [number, number][] | null;
};

type RuralProject = {
  id: string;
  name: string;
  code: string;
  category: string;
  stage: "In progress" | "Pending / not started";
  block: string;
  scheme: string;
  batch: string;
  year: string;
  package: string;
  workType: string;
  length: number | null;
  completedLength: number | null;
  progress: number | null;
  sanctionDate: string;
  agreementDate: string;
  contractor: string;
  company: string;
  locationPrecision: string;
  bounds: [number, number, number, number] | null;
  route: [number, number][] | null;
  sourceUrl: string;
};

type DistrictDataset = {
  district: { code: number; name: string; center: [number, number] };
  inventory: InventoryRoad[];
  ruralProjects: RuralProject[];
};

type DisplayProject = {
  id: string;
  name: string;
  road: string;
  category: string;
  stage: ProjectStage;
  area: string;
  detailOneLabel: string;
  detailOne: string;
  detailTwoLabel: string;
  detailTwo: string;
  statusNote: string;
  sourceName: string;
  sourceDate: string;
  sourceUrl: string;
  locationPrecision: string;
  route: [number, number][] | null;
  bounds: [number, number, number, number] | null;
};

type MapFeature = {
  id: string;
  name: string;
  stage?: ProjectStage;
  route: [number, number][] | null;
  bounds: [number, number, number, number] | null;
  locationPrecision: string;
};

const DEFAULT_STATE = 20;
const DEFAULT_STATE_NAME = "Madhya Pradesh";
const DEFAULT_DISTRICT = 76;
const PAGE_SIZE = 100;
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const projectStages: (ProjectStage | "All stages")[] = [
  "All stages",
  "In progress",
  "Pending / not started",
  "Approved",
  "Bids / appraisal",
  "DPR / proposed",
];
const inventoryTypes = [
  "All road types",
  "National highway",
  "State highway",
  "Major district road",
  "Other district road",
  "Village road",
  "Rural track",
  "Other road",
];
const projectTypes = [
  "All road types",
  "National highway",
  "State highway",
  "Expressway / bypass",
  "Village / rural project",
];
const stageColors: Record<ProjectStage, string> = {
  "In progress": "#297864",
  "Pending / not started": "#d77a37",
  Approved: "#2875a6",
  "Bids / appraisal": "#b28a2f",
  "DPR / proposed": "#687685",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatLength(value: number | null, language: Language) {
  const t = translations[language];
  if (value === null) return t.notStated;
  if (value === 0) return t.bridgeWork;
  return `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${language === "hi" ? "किमी" : "km"}`;
}

function ruralProjectToDisplay(project: RuralProject, language: Language): DisplayProject {
  const t = translations[language];
  const progress = project.progress === null ? t.notReported : `${project.progress}%`;
  const workType = language === "hi"
    ? project.workType === "Bridge" ? t.bridge : t.road
    : project.workType;
  const sanctionDate = project.sanctionDate ? ` ${t.onDate} ${project.sanctionDate}` : "";
  const precision = translatePrecision(project.locationPrecision, language);
  return {
    id: project.id,
    name: project.name,
    road: `${project.scheme}${project.package ? ` · ${project.package}` : ""}`,
    category: project.category,
    stage: project.stage,
    area: `${project.block} ${language === "hi" ? "ब्लॉक" : "block"}`,
    detailOneLabel: t.lengthWork,
    detailOne: project.workType === "Bridge" ? `${workType} · ${formatLength(project.length, language)}` : formatLength(project.length, language),
    detailTwoLabel: t.reportedProgress,
    detailTwo: progress,
    statusNote: language === "hi"
      ? `${workType} ${t.sanctionedRecord}${sanctionDate}। ${precision}।`
      : `${workType} ${t.sanctionedRecord}${sanctionDate}. ${precision}.`,
    sourceName: "PMGSY · OMMAS Sanction Award Progress",
    sourceDate: project.year || "Live report",
    sourceUrl: project.sourceUrl,
    locationPrecision: project.locationPrecision,
    route: project.route,
    bounds: project.bounds,
  };
}

function districtMajorProjects(districtName: string, language: Language, nameLanguage: NameLanguage, geo: GeoNames | null): DisplayProject[] {
  const t = translations[language];
  return majorProjects
    .filter((project) => project.districts.includes(districtName))
    .map((project) => ({
      id: project.id,
      name: project.name,
      road: project.road,
      category: project.category,
      stage: project.stage,
      area: project.districts.map((district) => translateDistrict(district, nameLanguage, geo)).join(" · "),
      detailOneLabel: t.length,
      detailOne: project.length,
      detailTwoLabel: t.investmentMode,
      detailTwo: project.investment,
      statusNote: language === "hi" ? majorProjectNotesHi[project.id] ?? project.statusNote : project.statusNote,
      sourceName: project.sourceName,
      sourceDate: project.sourceDate,
      sourceUrl: project.sourceUrl,
      locationPrecision: t.indicativeAnchors,
      route: project.route,
      bounds: null,
    }));
}

type AuctionPin = { id: string; lat: number; lng: number; label: string; url: string };

function RoadMap({
  features,
  selectedFeature,
  districtCenter,
  mode,
  language,
  onSelect,
  auctions,
}: {
  features: MapFeature[];
  selectedFeature: MapFeature | undefined;
  districtCenter: [number, number];
  mode: "projects" | "inventory";
  language: Language;
  onSelect: (id: string) => void;
  auctions: AuctionPin[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: districtCenter,
        zoom: 9,
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
  }, [districtCenter]);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      const map = mapRef.current;
      if (!map || cancelled) return;
      layerRef.current?.remove();
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;

      // Fit selected features into the VISIBLE map area (above the mobile sheet
      // / right of the desktop side panel), not behind them.
      const mobile = typeof window !== "undefined" && window.innerWidth < 861;
      const padTL: [number, number] = mobile ? [16, 104] : [416, 20];
      const padBR: [number, number] = mobile ? [16, Math.round((typeof window !== "undefined" ? window.innerHeight : 700) * 0.5)] : [24, 24];
      const fitOpts = (maxZoom: number) => ({ paddingTopLeft: padTL, paddingBottomRight: padBR, maxZoom });
      const centerPoint = (pt: [number, number], maxZoom: number) =>
        map.fitBounds(L.latLng(pt[0], pt[1]).toBounds(1600), fitOpts(maxZoom));

      if (mode === "projects") {
        features.forEach((feature) => {
          if (!feature.route || !feature.stage) return;
          const selected = selectedFeature?.id === feature.id;
          const line = L.polyline(feature.route, {
            color: stageColors[feature.stage],
            weight: selected ? 7 : 4,
            opacity: selectedFeature && !selected ? 0.27 : 0.82,
            lineCap: "round",
          }).addTo(layer);
          line.bindTooltip(feature.name, { sticky: true, direction: "top" });
          line.on("click", () => onSelect(feature.id));
        });
      }

      if (selectedFeature?.route) {
        if (mode === "inventory") {
          L.polyline(selectedFeature.route, {
            color: "#d96f38",
            weight: 6,
            opacity: 0.92,
            lineCap: "round",
          }).addTo(layer).bindTooltip(selectedFeature.name, { sticky: true, direction: "top" });
        }
        selectedFeature.route.forEach((point, index) => {
          if (index !== 0 && index !== selectedFeature.route!.length - 1) return;
          L.circleMarker(point, {
            radius: 6,
            color: "#fffdf7",
            weight: 2,
            fillColor: selectedFeature.stage ? stageColors[selectedFeature.stage] : "#214f42",
            fillOpacity: 1,
          }).addTo(layer);
        });
        map.fitBounds(L.latLngBounds(selectedFeature.route), fitOpts(14));
      } else if (selectedFeature?.bounds) {
        const bounds = L.latLngBounds(
          [selectedFeature.bounds[0], selectedFeature.bounds[1]],
          [selectedFeature.bounds[2], selectedFeature.bounds[3]],
        );
        L.rectangle(bounds, {
          color: "#d96f38",
          weight: 4,
          fillColor: "#d96f38",
          fillOpacity: 0.12,
        }).addTo(layer).bindTooltip(selectedFeature.name);
        map.fitBounds(bounds, fitOpts(15));
      } else if (selectedFeature) {
        L.circleMarker(districtCenter, {
          radius: 10,
          color: "#fffdf7",
          weight: 3,
          fillColor: selectedFeature.stage ? stageColors[selectedFeature.stage] : "#214f42",
          fillOpacity: 0.92,
        }).addTo(layer).bindTooltip(`${selectedFeature.name} · ${translations[language].districtAnchor}`);
        centerPoint(districtCenter, 12);
      } else {
        const routed = features.filter((feature) => feature.route).flatMap((feature) => feature.route!);
        if (routed.length) {
          map.fitBounds(L.latLngBounds(routed), fitOpts(11));
        } else {
          map.setView(districtCenter, 9);
        }
      }

      // Auction overlay (unified map): distressed properties on top of roads.
      auctions.forEach((pin) => {
        const marker = L.circleMarker([pin.lat, pin.lng], {
          radius: 8,
          color: "#fffdf7",
          weight: 2,
          fillColor: "#d96f38",
          fillOpacity: 0.95,
        }).addTo(layer);
        marker.bindTooltip(pin.label, { direction: "top" });
        marker.on("click", () => window.open(pin.url, "_blank", "noopener"));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [districtCenter, features, language, mode, onSelect, selectedFeature, auctions]);

  function resetToIndia() {
    mapRef.current?.fitBounds([[6.5, 68.0], [37.5, 97.5]], { padding: [10, 10] });
  }

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map-canvas" aria-label={translations[language].mapLabel} />
      <button type="button" className="map-reset" onClick={resetToIndia} aria-label={language === "hi" ? "पूरा भारत देखें" : "Reset to India"}>⤢</button>
    </div>
  );
}

type ComboItem = { kind: "state" | "district"; id: number; stateId: number; label: string; sub: string };

type GlobalDistrict = { code: number; name: string; stateId: number; stateName: string };

function CompactSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: number | string;
  onChange: (value: string) => void;
  options: { value: number | string; label: string }[];
}) {
  return (
    <label className="cselect">
      <span className="cselect-label">{label}</span>
      <span className="cselect-shell">
        <select className="cselect-input" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="cselect-caret" aria-hidden="true">▾</span>
      </span>
    </label>
  );
}

function SearchCombobox({
  allDistricts,
  states,
  currentLabel,
  nameLanguage,
  geoNames,
  onJumpDistrict,
  onPickState,
  placeholder,
}: {
  allDistricts: GlobalDistrict[];
  states: StateSummary[];
  currentLabel: string;
  nameLanguage: NameLanguage;
  geoNames: GeoNames | null;
  onJumpDistrict: (stateId: number, code: number) => void;
  onPickState: (id: number) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const items = useMemo<ComboItem[]>(() => {
    const q = query.trim().toLowerCase();
    // Global: every district in the country, plus every state/UT.
    const districtItems: ComboItem[] = allDistricts.map((d) => ({
      kind: "district",
      id: d.code,
      stateId: d.stateId,
      label: translateDistrict(d.name, nameLanguage, geoNames),
      sub: translateState(d.stateName, nameLanguage, geoNames),
    }));
    const stateItems: ComboItem[] = states.map((sState) => ({
      kind: "state",
      id: sState.id,
      stateId: sState.id,
      label: translateState(sState.name, nameLanguage, geoNames),
      sub: "State / UT",
    }));
    if (!q) return districtItems.slice(0, 30);
    const all = [...districtItems, ...stateItems];
    return all
      .filter((it) => it.label.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q))
      .slice(0, 40);
  }, [query, allDistricts, states, nameLanguage, geoNames]);

  function pick(item: ComboItem) {
    if (item.kind === "state") onPickState(item.id);
    else onJumpDistrict(item.stateId, item.id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="combo" ref={wrapRef}>
      <span className="combo-icon" aria-hidden="true">⌕</span>
      <input
        className="combo-input"
        value={query}
        placeholder={open ? placeholder : currentLabel}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" && items[0]) pick(items[0]); if (e.key === "Escape") setOpen(false); }}
        aria-label={placeholder}
        aria-expanded={open}
        role="combobox"
        aria-controls="combo-listbox"
      />
      {open && items.length > 0 && (
        <ul className="combo-list" id="combo-listbox" role="listbox">
          {items.map((item) => (
            <li key={`${item.kind}-${item.stateId}-${item.id}`} role="option" aria-selected={false}>
              <button type="button" onClick={() => pick(item)}>
                <span className={item.kind === "state" ? "combo-tag combo-tag-state" : "combo-tag"}>
                  {item.kind === "state" ? "◆" : "◉"}
                </span>
                <span className="combo-label">{item.label}</span>
                <span className="combo-sub">{item.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RoadWatch() {
  // "regional" resolves to the selected state's own language when a locale
  // file for it has shipped; otherwise names fall back to English.
  const [langChoice, setLangChoice] = useState<"en" | "hi" | "regional">(() => {
    if (typeof window === "undefined") return "en";
    const saved = window.localStorage.getItem("mrw-lang");
    return saved === "en" || saved === "hi" || saved === "regional" ? saved : "en";
  });
  const [geoCache, setGeoCache] = useState<Record<string, GeoNames>>({});
  const [states, setStates] = useState<StateSummary[]>([]);
  const [allDistricts, setAllDistricts] = useState<GlobalDistrict[]>([]);
  const desiredDistrictRef = useRef<number | null>(
    typeof window !== "undefined" && Number(new URLSearchParams(window.location.search).get("district"))
      ? Number(new URLSearchParams(window.location.search).get("district"))
      : null,
  );
  const [stateId, setStateId] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const sid = Number(new URLSearchParams(window.location.search).get("state"));
      if (sid) return sid;
    }
    return DEFAULT_STATE;
  });
  const [districts, setDistricts] = useState<DistrictSummary[]>([]);
  const [districtCode, setDistrictCode] = useState(DEFAULT_DISTRICT);
  const [dataset, setDataset] = useState<DistrictDataset | null>(null);
  const [mode, setMode] = useState<"projects" | "inventory">("inventory");
  const [stage, setStage] = useState<ProjectStage | "All stages">("All stages");
  const [roadType, setRoadType] = useState("All road types");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [allAuctions, setAllAuctions] = useState<AuctionPin[]>([]);
  const [sheetPx, setSheetPx] = useState<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [dataCheckedAt, setDataCheckedAt] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const lastLoadedDistrict = useRef<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const regionalCode = stateRegionalLanguage[stateId] ?? null;
  const regionalAvailable =
    regionalCode !== null && regionalCode !== "hi" && AVAILABLE_REGIONAL_LOCALES.includes(regionalCode);
  const nameLanguage: NameLanguage =
    langChoice === "regional" ? (regionalAvailable ? regionalCode : "en") : langChoice;
  const language: Language = langChoice === "hi" ? "hi" : "en";
  const geoNames: GeoNames | null = nameLanguage === "en" ? null : geoCache[nameLanguage] ?? null;
  const t = translations[language];

  useEffect(() => {
    if (nameLanguage === "en" || geoCache[nameLanguage]) return;
    let cancelled = false;
    fetch(`${PUBLIC_BASE_PATH}/locales/${nameLanguage}/geo.json`, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("locale unavailable");
        return response.json() as Promise<GeoNames>;
      })
      .then((geo) => {
        if (!cancelled) setGeoCache((cache) => ({ ...cache, [nameLanguage]: geo }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nameLanguage, geoCache]);


  useEffect(() => {
    fetch(`${PUBLIC_BASE_PATH}/data/roads/districts-index.json`, { cache: "force-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<GlobalDistrict[]>) : Promise.reject(new Error("no index"))))
      .then(setAllDistricts)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setRefreshTick((tick) => tick + 1);
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    fetch(`${PUBLIC_BASE_PATH}/data/roads/meta.json`, { cache: "no-cache" })
      .then((response) => response.ok ? (response.json() as Promise<{ dataCheckedAt: string }>) : null)
      .then((meta) => { if (meta?.dataCheckedAt) setDataCheckedAt(meta.dataCheckedAt); })
      .catch(() => {});
  }, [refreshTick]);

  useEffect(() => {
    fetch(`${PUBLIC_BASE_PATH}/data/roads/states.json`, { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("State index unavailable");
        return response.json() as Promise<StateSummary[]>;
      })
      .then(setStates)
      .catch(() => {});
  }, [refreshTick]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${PUBLIC_BASE_PATH}/data/roads/${stateId}/districts.json`, { signal: controller.signal, cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("District index unavailable");
        return response.json() as Promise<DistrictSummary[]>;
      })
      .then((registry) => {
        setDistricts(registry);
        const desired = desiredDistrictRef.current;
        if (desired != null && registry.some((item) => item.code === desired)) {
          desiredDistrictRef.current = null;
          setDistrictCode(desired);
          setSelectedId(null);
        } else {
          // After a state switch the previous district code may not exist here.
          setDistrictCode((current) =>
            registry.some((item) => item.code === current) ? current : registry[0]?.code ?? current,
          );
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [stateId, refreshTick]);

  useEffect(() => {
    const loadKey = `${stateId}/${districtCode}`;
    const districtChanged = lastLoadedDistrict.current !== loadKey;
    const controller = new AbortController();
    fetch(`${PUBLIC_BASE_PATH}/data/roads/${loadKey}.json`, { signal: controller.signal, cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("District data unavailable");
        return response.json() as Promise<DistrictDataset>;
      })
      .then((data) => {
        lastLoadedDistrict.current = loadKey;
        setDataset(data);
        if (districtChanged) {
          setSelectedId(null);
          setVisibleLimit(PAGE_SIZE);
        }
      })
      .catch((error: Error) => {
        // Background refresh failures keep the last good data on screen.
        if (error.name !== "AbortError" && districtChanged) setDataset(null);
      });
    return () => controller.abort();
  }, [stateId, districtCode, refreshTick]);

  useEffect(() => {
    let cancelled = false;
    type Row = { id: string; lat: number | null; lng: number | null; title: string; reservePrice: number; noticeUrl: string };
    fetch(`${PUBLIC_BASE_PATH}/data/auctions/index.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<{ states: { id: number }[] }>) : Promise.reject(new Error("none"))))
      .then((idx) =>
        Promise.all(
          idx.states.map((st) =>
            fetch(`${PUBLIC_BASE_PATH}/data/auctions/${st.id}/listings.json`, { cache: "no-cache" })
              .then((r) => (r.ok ? (r.json() as Promise<Row[]>) : []))
              .catch(() => [] as Row[]),
          ),
        ),
      )
      .then((lists) => {
        if (cancelled) return;
        const pins: AuctionPin[] = (lists.flat() as Row[])
          .filter((r) => r.lat != null && r.lng != null)
          .map((r) => ({
            id: r.id,
            lat: r.lat as number,
            lng: r.lng as number,
            label: `${r.title} · ₹${(r.reservePrice / 100000).toFixed(1)}L`,
            url: r.noticeUrl,
          }));
        setAllAuctions(pins);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const districtSummary = districts.find((item) => item.code === districtCode);
  const currentDataset = dataset?.district.code === districtCode ? dataset : null;
  const districtName = currentDataset?.district.name ?? districtSummary?.name ?? "Bhopal";
  const displayDistrictName = translateDistrict(districtName, nameLanguage, geoNames);
  const allProjects = currentDataset
    ? [
        ...currentDataset.ruralProjects.map((project) => ruralProjectToDisplay(project, language)),
        ...districtMajorProjects(districtName, language, nameLanguage, geoNames),
      ]
    : [];
  const filteredProjects = allProjects.filter((project) => {
    const stageMatch = stage === "All stages" || project.stage === stage;
    const typeMatch = roadType === "All road types" || project.category === roadType;
    const haystack = `${project.name} ${project.road} ${project.area} ${project.stage}`.toLowerCase();
    return stageMatch && typeMatch && (!deferredSearch || haystack.includes(deferredSearch));
  });
  const filteredInventory = (currentDataset?.inventory ?? []).filter((road) => {
    const typeMatch = roadType === "All road types" || road.category === roadType;
    const haystack = `${road.name} ${road.code} ${road.category} ${road.owner}`.toLowerCase();
    return typeMatch && (!deferredSearch || haystack.includes(deferredSearch));
  });
  const visibleInventory = filteredInventory.slice(0, visibleLimit);
  const selectedProject = filteredProjects.find((project) => project.id === selectedId) ?? filteredProjects[0];
  const selectedRoad = filteredInventory.find((road) => road.id === selectedId) ?? filteredInventory[0];
  const projectFeatures: MapFeature[] = filteredProjects.map((project) => ({
    id: project.id,
    name: project.name,
    stage: project.stage,
    route: project.route,
    bounds: project.bounds,
    locationPrecision: project.locationPrecision,
  }));
  const selectedFeature = mode === "projects"
    ? selectedProject
      ? projectFeatures.find((feature) => feature.id === selectedProject.id)
      : undefined
    : selectedRoad
      ? {
          id: selectedRoad.id,
          name: selectedRoad.name,
          route: selectedRoad.route,
          bounds: selectedRoad.bounds,
          locationPrecision: selectedRoad.route ? t.officialGisRoadLine : t.officialGisRoadBounds,
        }
      : undefined;
  const activeSelectedId = mode === "projects" ? selectedProject?.id : selectedRoad?.id;
  const districtCenter = currentDataset?.district.center ?? districtSummary?.center ?? [23.2599, 77.4126];
  const modeCount = mode === "projects" ? filteredProjects.length : filteredInventory.length;
  const hasFilters = stage !== "All stages" || roadType !== "All road types" || search.length > 0;
  const loading = !currentDataset;
  const checkedDate = dataCheckedAt ? new Date(dataCheckedAt) : null;
  const checkedLabel = checkedDate && !Number.isNaN(checkedDate.getTime())
    ? checkedDate.toDateString() === new Date().toDateString()
      ? t.today
      : new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" }).format(checkedDate)
    : null;

  function snapSheet(px: number) {
    const vh = window.innerHeight;
    const snaps = [vh * 0.18, vh * 0.44, vh * 0.66];
    return snaps.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a));
  }
  function onGripDown(e: React.PointerEvent) {
    if (window.innerWidth >= 861) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const h = sheetRef.current?.getBoundingClientRect().height ?? window.innerHeight * 0.54;
    dragRef.current = { startY: e.clientY, startH: h };
  }
  function onGripMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    const h = Math.max(120, Math.min(window.innerHeight * 0.66, dragRef.current.startH + dy));
    setSheetPx(h);
  }
  function onGripUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setSheetPx((cur) => snapSheet(cur ?? window.innerHeight * 0.54));
  }

  function changeState(nextStateId: number) {
    setStateId(nextStateId);
    setSelectedId(null);
    setVisibleLimit(PAGE_SIZE);
  }

  function jumpToDistrict(nextStateId: number, code: number) {
    if (nextStateId !== stateId) {
      desiredDistrictRef.current = code;
      changeState(nextStateId);
    } else {
      setDistrictCode(code);
      setSelectedId(null);
      setVisibleLimit(PAGE_SIZE);
    }
  }

  function changeMode(nextMode: "projects" | "inventory") {
    setMode(nextMode);
    setRoadType("All road types");
    setStage("All stages");
    setSearch("");
    setSelectedId(null);
    setVisibleLimit(PAGE_SIZE);
  }

  function clearFilters() {
    setStage("All stages");
    setRoadType("All road types");
    setSearch("");
    setSelectedId(null);
  }

  function changeLanguage(next: "en" | "hi" | "regional") {
    setLangChoice(next);
    try {
      window.localStorage.setItem("mrw-lang", next);
    } catch {
      /* private mode */
    }
    document.documentElement.lang = next === "regional" ? (regionalAvailable && regionalCode ? regionalCode : "en") : next;
  }

  return (
    <main className="app" data-language={language}>
      <div className="app-map">
        <RoadMap
          features={mode === "projects" ? projectFeatures : []}
          selectedFeature={selectedFeature}
          districtCenter={districtCenter}
          mode={mode}
          language={language}
          onSelect={setSelectedId}
          auctions={allAuctions}
        />
      </div>

      <header className="app-top" id="top">
        <div className="app-top-row">
          <button type="button" className="nav-btn" aria-label={language === "hi" ? "मेनू" : "Menu"} onClick={() => setDrawerOpen(true)}>☰</button>
          <div className="app-search">
            <SearchCombobox
              allDistricts={allDistricts}
              states={states}
              currentLabel={`${displayDistrictName} · ${translateState(states.find((x) => x.id === stateId)?.name ?? DEFAULT_STATE_NAME, nameLanguage, geoNames)}`}
              nameLanguage={nameLanguage}
              geoNames={geoNames}
              onJumpDistrict={jumpToDistrict}
              onPickState={changeState}
              placeholder={t.chooseDistrict}
            />
          </div>
        </div>
      </header>

      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <nav className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Menu">
            <div className="drawer-head">
              <span className="brand-mark" aria-hidden="true"><i /><i /></span>
              <strong>MP Road Watch</strong>
              <button type="button" className="drawer-close" aria-label={language === "hi" ? "बंद करें" : "Close"} onClick={() => setDrawerOpen(false)}>✕</button>
            </div>
            <a className="drawer-link drawer-cta" href={`${PUBLIC_BASE_PATH}/due-diligence`}>{language === "hi" ? "प्लॉट सत्यापित करें" : "Verify a plot"}</a>
            <a className="drawer-link" href={`${PUBLIC_BASE_PATH}/auctions`}>{language === "hi" ? "बैंक नीलामी" : "Bank auctions"}</a>
            <a className="drawer-link" href={`${PUBLIC_BASE_PATH}/`}>{language === "hi" ? "सड़क मानचित्र" : "Road map"}</a>
            <div className="drawer-lang">
              <span className="drawer-lang-label">{t.languageLabel}</span>
              <div className="language-toggle" role="group" aria-label={t.languageLabel}>
                <button type="button" className={langChoice === "en" ? "active" : ""} aria-pressed={langChoice === "en"} onClick={() => changeLanguage("en")}>EN</button>
                <button type="button" className={langChoice === "hi" ? "active" : ""} aria-pressed={langChoice === "hi"} onClick={() => changeLanguage("hi")}>हिंदी</button>
                {regionalAvailable && regionalCode && (
                  <button type="button" className={langChoice === "regional" ? "active" : ""} aria-pressed={langChoice === "regional"} onClick={() => changeLanguage("regional")}>{languageAutonyms[regionalCode] ?? regionalCode}</button>
                )}
              </div>
            </div>
          </nav>
        </div>
      )}

      <aside className="app-sheet" aria-label={t.roadDataView} ref={sheetRef} style={sheetPx ? { height: `${sheetPx}px` } : undefined}>
        <div
          className="sheet-grip-zone"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          role="separator"
          aria-label={language === "hi" ? "सूची खींचें" : "Drag list"}
        >
          <div className="sheet-grip" aria-hidden="true" />
        </div>
        <div className="sheet-chips">
          <label className="chip">
            <span className="chip-k">{language === "hi" ? "राज्य" : "State"}</span>
            <select value={stateId} onChange={(e) => changeState(Number(e.target.value))} aria-label={t.chooseState}>
              {states.map((item) => <option key={item.id} value={item.id}>{translateState(item.name, nameLanguage, geoNames)}</option>)}
            </select>
            <span className="chip-caret" aria-hidden="true">▾</span>
          </label>
          <label className="chip">
            <span className="chip-k">{language === "hi" ? "ज़िला" : "District"}</span>
            <select value={districtCode} onChange={(e) => { setDistrictCode(Number(e.target.value)); setSelectedId(null); }} aria-label={t.chooseDistrict}>
              {districts.map((item) => <option key={item.code} value={item.code}>{translateDistrict(item.name, nameLanguage, geoNames)}</option>)}
            </select>
            <span className="chip-caret" aria-hidden="true">▾</span>
          </label>
          <label className="chip">
            <span className="chip-k">{language === "hi" ? "प्रकार" : "Type"}</span>
            <select value={roadType} onChange={(e) => setRoadType(e.target.value)} aria-label={t.roadType}>
              {inventoryTypes.map((item) => <option key={item} value={item}>{translateRoadType(item, language)}</option>)}
            </select>
            <span className="chip-caret" aria-hidden="true">▾</span>
          </label>
        </div>
        <div className="result-count">
          <span>{loading ? t.loadingDistrictData : `${formatNumber(modeCount)} ${t.roadRecords}`}</span>
          <span>{t.clickRow}</span>
        </div>
        <div className="project-list">
          {!loading && visibleInventory.map((road, index) => {
            const selected = road.id === activeSelectedId;
            return (
              <article key={road.id} className={selected ? "project-card project-card-active" : "project-card"}>
                <button type="button" className="project-select" onClick={() => setSelectedId(road.id)} aria-pressed={selected}>
                  <span className="project-number">{String(index + 1).padStart(3, "0")}</span>
                  <span className="project-main">
                    <span className="project-meta inventory-meta"><span>{translateRoadType(road.category, language)}</span><span>{road.code || t.noRoadCode}</span></span>
                    <strong>{road.name}</strong>
                    <span className="road-name">{t.ownerInGis}: {road.owner}</span>
                  </span>
                  <span className="locate-arrow" aria-hidden="true">↗</span>
                </button>
                {selected && (
                  <div className="project-detail inventory-detail">
                    <p>{t.inventoryMembership}</p>
                    <div className="precision-line"><i /> {road.route ? t.officialGisRoadLine : t.officialGisRoadBoundsFallback}</div>
                    <a href="https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=1808291&lang=2&reg=48" target="_blank" rel="noreferrer">{t.aboutGisRelease} <span>↗</span></a>
                  </div>
                )}
              </article>
            );
          })}
          {!loading && modeCount === 0 && (
            <div className="empty-state">
              <strong>{t.noMatchingRoads}</strong>
              <p>{t.tryBroader}</p>
              <button type="button" onClick={clearFilters}>{t.clearFilters}</button>
            </div>
          )}
          {loading && <div className="loading-state"><i /><span>{t.loadingRoads}: {displayDistrictName}</span></div>}
          {visibleInventory.length < filteredInventory.length && (
            <button className="load-more" type="button" onClick={() => setVisibleLimit((value) => value + PAGE_SIZE)}>
              {t.loadMore} <span>{formatNumber(filteredInventory.length - visibleInventory.length)} {t.remaining}</span>
            </button>
          )}
        </div>
      </aside>
    </main>
  );
}
