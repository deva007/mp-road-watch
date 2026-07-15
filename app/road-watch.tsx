"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import {
  majorProjectNotesHi,
  translateDistrict,
  translatePrecision,
  translateRoadType,
  translateStage,
  translations,
  type Language,
} from "./i18n";
import { majorProjects, type ProjectStage } from "./major-projects";

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

function districtMajorProjects(districtName: string, language: Language): DisplayProject[] {
  const t = translations[language];
  return majorProjects
    .filter((project) => project.districts.includes(districtName))
    .map((project) => ({
      id: project.id,
      name: project.name,
      road: project.road,
      category: project.category,
      stage: project.stage,
      area: project.districts.map((district) => translateDistrict(district, language)).join(" · "),
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

function RoadMap({
  features,
  selectedFeature,
  districtCenter,
  mode,
  language,
  onSelect,
}: {
  features: MapFeature[];
  selectedFeature: MapFeature | undefined;
  districtCenter: [number, number];
  mode: "projects" | "inventory";
  language: Language;
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
        map.fitBounds(L.latLngBounds(selectedFeature.route), { padding: [62, 62], maxZoom: 13 });
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
        map.fitBounds(bounds, { padding: [72, 72], maxZoom: 14 });
      } else if (selectedFeature) {
        L.circleMarker(districtCenter, {
          radius: 10,
          color: "#fffdf7",
          weight: 3,
          fillColor: selectedFeature.stage ? stageColors[selectedFeature.stage] : "#214f42",
          fillOpacity: 0.92,
        }).addTo(layer).bindTooltip(`${selectedFeature.name} · ${translations[language].districtAnchor}`);
        map.setView(districtCenter, 10);
      } else {
        const routed = features.filter((feature) => feature.route).flatMap((feature) => feature.route!);
        if (routed.length) {
          map.fitBounds(L.latLngBounds(routed), { padding: [50, 50], maxZoom: 10 });
        } else {
          map.setView(districtCenter, 9);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [districtCenter, features, language, mode, onSelect, selectedFeature]);

  return <div ref={containerRef} className="map-canvas" aria-label={translations[language].mapLabel} />;
}

export function RoadWatch() {
  const [language, setLanguage] = useState<Language>("en");
  const [districts, setDistricts] = useState<DistrictSummary[]>([]);
  const [districtCode, setDistrictCode] = useState(DEFAULT_DISTRICT);
  const [dataset, setDataset] = useState<DistrictDataset | null>(null);
  const [mode, setMode] = useState<"projects" | "inventory">("projects");
  const [stage, setStage] = useState<ProjectStage | "All stages">("All stages");
  const [roadType, setRoadType] = useState("All road types");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const t = translations[language];

  useEffect(() => {
    fetch(`${PUBLIC_BASE_PATH}/data/roads/districts.json`)
      .then((response) => {
        if (!response.ok) throw new Error("District index unavailable");
        return response.json() as Promise<DistrictSummary[]>;
      })
      .then(setDistricts)
      .catch(() => setDistricts([]));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${PUBLIC_BASE_PATH}/data/roads/${districtCode}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("District data unavailable");
        return response.json() as Promise<DistrictDataset>;
      })
      .then((data) => {
        setDataset(data);
        setSelectedId(null);
        setVisibleLimit(PAGE_SIZE);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setDataset(null);
      });
    return () => controller.abort();
  }, [districtCode]);

  const districtSummary = districts.find((item) => item.code === districtCode);
  const currentDataset = dataset?.district.code === districtCode ? dataset : null;
  const districtName = currentDataset?.district.name ?? districtSummary?.name ?? "Bhopal";
  const displayDistrictName = translateDistrict(districtName, language);
  const allProjects = currentDataset
    ? [
        ...currentDataset.ruralProjects.map((project) => ruralProjectToDisplay(project, language)),
        ...districtMajorProjects(districtName, language),
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

  function changeLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    document.documentElement.lang = nextLanguage;
  }

  return (
    <main data-language={language}>
      <header className="site-header">
        <a className="brand" href="#top" aria-label={t.homeLabel}>
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>MP Road Watch</span>
        </a>
        <div className="header-actions">
          <div className="language-toggle" role="group" aria-label={t.languageLabel}>
            <button type="button" className={language === "en" ? "active" : ""} aria-pressed={language === "en"} aria-label={t.english} onClick={() => changeLanguage("en")}>EN</button>
            <button type="button" className={language === "hi" ? "active" : ""} aria-pressed={language === "hi"} aria-label={t.hindi} onClick={() => changeLanguage("hi")}>हिंदी</button>
          </div>
          <span className="update-stamp"><i /> {t.dataChecked}</span>
          <a className="header-link" href="#methodology">{t.sourcesCautions} <span>↗</span></a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> {t.eyebrow}</p>
          <h1>{t.headlineLead}<br /><em>{t.headlineAccent}</em></h1>
          <p className="hero-intro">{t.heroIntro}</p>
        </div>
        <div className="hero-stats" aria-label={t.datasetSummary}>
          <div><strong>41,016</strong><span>{t.mappedRoadRecords}</span></div>
          <div><strong>2,108</strong><span>{t.activePmgsWorks}</span></div>
          <div><strong>55</strong><span>{t.districtReports}</span></div>
        </div>
      </section>

      <section className="district-ribbon" aria-label={t.districtSelection}>
        <div>
          <span className="district-step">01</span>
          <label htmlFor="district-select">{t.chooseDistrict}</label>
        </div>
        <div className="district-select-wrap">
          <select id="district-select" value={districtCode} onChange={(event) => setDistrictCode(Number(event.target.value))}>
            {districts.length === 0 && <option value={DEFAULT_DISTRICT}>{translateDistrict("Bhopal", language)}</option>}
            {districts.map((item) => <option key={item.code} value={item.code}>{translateDistrict(item.name, language)}</option>)}
          </select>
          <span aria-hidden="true">↓</span>
        </div>
        <div className="district-snapshot">
          <span><strong>{formatNumber(districtSummary?.activeProjectCount ?? currentDataset?.ruralProjects.length ?? 0)}</strong> {t.activeRuralWorks}</span>
          <span><strong>{formatNumber(districtSummary?.inventoryCount ?? currentDataset?.inventory.length ?? 0)}</strong> {t.roadsInInventory}</span>
        </div>
      </section>

      <section className="tracker" aria-labelledby="tracker-title">
        <div className="tracker-heading">
          <div>
            <p className="section-kicker">{displayDistrictName} {t.district}</p>
            <h2 id="tracker-title">{t.roadProjectExplorer}</h2>
          </div>
          <div className="mode-switch" role="tablist" aria-label={t.roadDataView}>
            <button type="button" role="tab" aria-selected={mode === "projects"} className={mode === "projects" ? "active" : ""} onClick={() => changeMode("projects")}>
              {t.activeProjects} <span>{formatNumber(allProjects.length)}</span>
            </button>
            <button type="button" role="tab" aria-selected={mode === "inventory"} className={mode === "inventory" ? "active" : ""} onClick={() => changeMode("inventory")}>
              {t.allRoadInventory} <span>{formatNumber(currentDataset?.inventory.length ?? 0)}</span>
            </button>
          </div>
        </div>

        <div className="coverage-note">
          <strong>{mode === "projects" ? t.investmentSignal : t.networkContext}</strong>
          <span>
            {mode === "projects"
              ? t.projectCoverage
              : t.inventoryCoverage}
          </span>
        </div>

        {!loading && currentDataset.inventory.length === 0 && (
          <div className="source-gap-note">
            <strong>{t.legacyGap}</strong>
            <span>{t.legacyGapDetail}</span>
          </div>
        )}

        <div className="filter-panel">
          <label className="search-field">
            <span>{t.search}</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={mode === "projects" ? t.projectPlaceholder : t.inventoryPlaceholder} />
          </label>
          {mode === "projects" && (
            <label className="select-field">
              <span>{t.projectStage}</span>
              <select value={stage} onChange={(event) => setStage(event.target.value as ProjectStage | "All stages")}>
                {projectStages.map((item) => <option key={item} value={item}>{translateStage(item, language)}</option>)}
              </select>
            </label>
          )}
          <label className="select-field">
            <span>{t.roadType}</span>
            <select value={roadType} onChange={(event) => setRoadType(event.target.value)}>
              {(mode === "projects" ? projectTypes : inventoryTypes).map((item) => <option key={item} value={item}>{translateRoadType(item, language)}</option>)}
            </select>
          </label>
          {hasFilters && <button type="button" className="clear-button" onClick={clearFilters}>{t.clear}</button>}
        </div>

        <div className="workspace">
          <div className="project-column">
            <div className="result-count">
              <span>{loading ? t.loadingDistrictData : `${formatNumber(modeCount)} ${mode === "projects" ? t.projectRecords : t.roadRecords}`}</span>
              <span>{t.clickRow}</span>
            </div>
            <div className="project-list">
              {!loading && mode === "projects" && filteredProjects.map((project, index) => {
                const selected = project.id === activeSelectedId;
                return (
                  <article key={project.id} className={selected ? "project-card project-card-active" : "project-card"}>
                    <button type="button" className="project-select" onClick={() => setSelectedId(project.id)} aria-pressed={selected}>
                      <span className="project-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="project-main">
                        <span className="project-meta">
                          <span className="stage" style={{ "--stage-color": stageColors[project.stage] } as React.CSSProperties}>{translateStage(project.stage, language)}</span>
                          <span>{translateRoadType(project.category, language)}</span>
                        </span>
                        <strong>{project.name}</strong>
                        <span className="road-name">{project.road}</span>
                        <span className="district-line">{project.area}</span>
                      </span>
                      <span className="locate-arrow" aria-hidden="true">↗</span>
                    </button>
                    {selected && (
                      <div className="project-detail">
                        <div className="detail-grid">
                          <span><small>{project.detailOneLabel}</small>{project.detailOne}</span>
                          <span><small>{project.detailTwoLabel}</small>{project.detailTwo}</span>
                        </div>
                        <p>{project.statusNote}</p>
                        <div className="precision-line"><i /> {translatePrecision(project.locationPrecision, language)}</div>
                        <a href={project.sourceUrl} target="_blank" rel="noreferrer">{t.openOfficialSource} <span>↗</span></a>
                      </div>
                    )}
                  </article>
                );
              })}

              {!loading && mode === "inventory" && visibleInventory.map((road, index) => {
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
              {mode === "inventory" && visibleInventory.length < filteredInventory.length && (
                <button className="load-more" type="button" onClick={() => setVisibleLimit((value) => value + PAGE_SIZE)}>
                  {t.loadMore} <span>{formatNumber(filteredInventory.length - visibleInventory.length)} {t.remaining}</span>
                </button>
              )}
            </div>
          </div>

          <div className="map-column">
            <RoadMap
              features={mode === "projects" ? projectFeatures : []}
              selectedFeature={selectedFeature}
              districtCenter={districtCenter}
              mode={mode}
              language={language}
              onSelect={setSelectedId}
            />
            <div className="map-overlay map-title">
              <span>{mode === "projects" ? t.selectedProject : t.selectedInventoryRoad}</span>
              <strong>{mode === "projects" ? selectedProject?.name ?? `${displayDistrictName} ${t.district}` : selectedRoad?.name ?? `${displayDistrictName} ${t.district}`}</strong>
            </div>
            <div className="map-overlay map-note"><span className="pulse" /> {selectedFeature?.locationPrecision ? translatePrecision(selectedFeature.locationPrecision, language) : t.selectRoad}</div>
            {mode === "projects" && (
              <div className="map-legend">
                {projectStages.slice(1).map((item) => <span key={item}><i style={{ background: stageColors[item as ProjectStage] }} />{translateStage(item, language)}</span>)}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="road-breakdown" aria-labelledby="breakdown-title">
        <div className="breakdown-heading">
          <p className="section-kicker">{t.districtInventory}</p>
          <h2 id="breakdown-title">{t.whatMapped} {displayDistrictName}</h2>
          <p>{t.breakdownDetail}</p>
        </div>
        <div className="breakdown-grid">
          {inventoryTypes.slice(1).map((type) => (
            <button key={type} type="button" onClick={() => { changeMode("inventory"); setRoadType(type); document.querySelector(".tracker")?.scrollIntoView({ behavior: "smooth" }); }}>
              <span>{translateRoadType(type, language)}</span>
              <strong>{formatNumber(districtSummary?.categoryCounts[type] ?? 0)}</strong>
              <i style={{ width: `${Math.max(4, ((districtSummary?.categoryCounts[type] ?? 0) / Math.max(1, districtSummary?.inventoryCount ?? 1)) * 100)}%` }} />
            </button>
          ))}
        </div>
      </section>

      <section className="methodology" id="methodology">
        <div className="method-intro">
          <p className="section-kicker">{t.beforeLand}</p>
          <h2>{t.evidenceFirst}<br />{t.parcelNext}</h2>
          <p>{t.screeningTool}</p>
        </div>
        <div className="method-cards">
          <article><span>01</span><h3>{t.projectStatus}</h3><p>{t.projectStatusDetail}</p></article>
          <article><span>02</span><h3>{t.roadInventory}</h3><p>{t.roadInventoryDetail}</p></article>
          <article><span>03</span><h3>{t.locationPrecision}</h3><p>{t.locationPrecisionDetail}</p></article>
          <article><span>04</span><h3>{t.dueDiligence}</h3><p>{t.dueDiligenceDetail}</p></article>
        </div>
      </section>

      <footer>
        <div className="brand footer-brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>MP Road Watch</span></div>
        <p>{t.footerSources}</p>
        <a href="#top">{t.backToTop} ↑</a>
      </footer>
    </main>
  );
}
