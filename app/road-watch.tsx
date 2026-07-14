"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
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

const districtDisplayNames: Record<string, string> = {
  Agar: "Agar Malwa (Agar in source)",
  Hoshangabad: "Narmadapuram (Hoshangabad in source)",
  Mandsour: "Mandsaur (Mandsour in source)",
};

function districtLabel(name: string) {
  return districtDisplayNames[name] ?? name;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatLength(value: number | null) {
  if (value === null) return "Not stated";
  if (value === 0) return "Bridge work";
  return `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })} km`;
}

function ruralProjectToDisplay(project: RuralProject): DisplayProject {
  const progress = project.progress === null ? "Not reported" : `${project.progress}%`;
  return {
    id: project.id,
    name: project.name,
    road: `${project.scheme}${project.package ? ` · ${project.package}` : ""}`,
    category: project.category,
    stage: project.stage,
    area: `${project.block} block`,
    detailOneLabel: "Length / work",
    detailOne: project.workType === "Bridge" ? `Bridge · ${formatLength(project.length)}` : formatLength(project.length),
    detailTwoLabel: "Reported progress",
    detailTwo: progress,
    statusNote: `${project.workType} record sanctioned${project.sanctionDate ? ` on ${project.sanctionDate}` : ""}. ${project.locationPrecision}.`,
    sourceName: "PMGSY · OMMAS Sanction Award Progress",
    sourceDate: project.year || "Live report",
    sourceUrl: project.sourceUrl,
    locationPrecision: project.locationPrecision,
    route: project.route,
    bounds: project.bounds,
  };
}

function districtMajorProjects(districtName: string): DisplayProject[] {
  return majorProjects
    .filter((project) => project.districts.includes(districtName))
    .map((project) => ({
      id: project.id,
      name: project.name,
      road: project.road,
      category: project.category,
      stage: project.stage,
      area: project.districts.join(" · "),
      detailOneLabel: "Length",
      detailOne: project.length,
      detailTwoLabel: "Investment / mode",
      detailTwo: project.investment,
      statusNote: project.statusNote,
      sourceName: project.sourceName,
      sourceDate: project.sourceDate,
      sourceUrl: project.sourceUrl,
      locationPrecision: "Indicative corridor anchors",
      route: project.route,
      bounds: null,
    }));
}

function RoadMap({
  features,
  selectedFeature,
  districtCenter,
  mode,
  onSelect,
}: {
  features: MapFeature[];
  selectedFeature: MapFeature | undefined;
  districtCenter: [number, number];
  mode: "projects" | "inventory";
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
        }).addTo(layer).bindTooltip(`${selectedFeature.name} · district/block anchor`);
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
  }, [districtCenter, features, mode, onSelect, selectedFeature]);

  return <div ref={containerRef} className="map-canvas" aria-label="Map of roads and projects in the selected district" />;
}

export function RoadWatch() {
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

  useEffect(() => {
    fetch("/data/roads/districts.json")
      .then((response) => {
        if (!response.ok) throw new Error("District index unavailable");
        return response.json() as Promise<DistrictSummary[]>;
      })
      .then(setDistricts)
      .catch(() => setDistricts([]));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/data/roads/${districtCode}.json`, { signal: controller.signal })
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
  const displayDistrictName = districtLabel(districtName);
  const allProjects = currentDataset
    ? [...currentDataset.ruralProjects.map(ruralProjectToDisplay), ...districtMajorProjects(districtName)]
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
          route: null,
          bounds: selectedRoad.bounds,
          locationPrecision: "Official GIS road bounds",
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

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Madhya Pradesh Road Watch home">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>MP Road Watch</span>
        </a>
        <div className="header-actions">
          <span className="update-stamp"><i /> Data checked 14 Jul 2026</span>
          <a className="header-link" href="#methodology">Sources & cautions <span>↗</span></a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Madhya Pradesh · Road intelligence</p>
          <h1>Find the roads<br /><em>before value moves.</em></h1>
          <p className="hero-intro">
            Select any MP district to inspect active road projects by stage, then switch to the complete
            official PMGSY GIS inventory of national, state, district and village roads.
          </p>
        </div>
        <div className="hero-stats" aria-label="Dataset summary">
          <div><strong>41,016</strong><span>mapped road records</span></div>
          <div><strong>2,108</strong><span>active PMGSY works</span></div>
          <div><strong>55</strong><span>district reports</span></div>
        </div>
      </section>

      <section className="district-ribbon" aria-label="District selection">
        <div>
          <span className="district-step">01</span>
          <label htmlFor="district-select">Choose district</label>
        </div>
        <div className="district-select-wrap">
          <select id="district-select" value={districtCode} onChange={(event) => setDistrictCode(Number(event.target.value))}>
            {districts.length === 0 && <option value={DEFAULT_DISTRICT}>Bhopal</option>}
            {districts.map((item) => <option key={item.code} value={item.code}>{districtLabel(item.name)}</option>)}
          </select>
          <span aria-hidden="true">↓</span>
        </div>
        <div className="district-snapshot">
          <span><strong>{formatNumber(districtSummary?.activeProjectCount ?? currentDataset?.ruralProjects.length ?? 0)}</strong> active rural works</span>
          <span><strong>{formatNumber(districtSummary?.inventoryCount ?? currentDataset?.inventory.length ?? 0)}</strong> roads in inventory</span>
        </div>
      </section>

      <section className="tracker" aria-labelledby="tracker-title">
        <div className="tracker-heading">
          <div>
            <p className="section-kicker">{displayDistrictName} district</p>
            <h2 id="tracker-title">Road project explorer</h2>
          </div>
          <div className="mode-switch" role="tablist" aria-label="Road data view">
            <button type="button" role="tab" aria-selected={mode === "projects"} className={mode === "projects" ? "active" : ""} onClick={() => changeMode("projects")}>
              Active projects <span>{formatNumber(allProjects.length)}</span>
            </button>
            <button type="button" role="tab" aria-selected={mode === "inventory"} className={mode === "inventory" ? "active" : ""} onClick={() => changeMode("inventory")}>
              All road inventory <span>{formatNumber(currentDataset?.inventory.length ?? 0)}</span>
            </button>
          </div>
        </div>

        <div className="coverage-note">
          <strong>{mode === "projects" ? "Investment signal" : "Network context"}</strong>
          <span>
            {mode === "projects"
              ? "PMGSY pending/in-progress works plus selected major corridors verified from MoRTH, NHAI, PIB and MP government records."
              : "All roads present in the official PMGSY open GIS layer. Inventory inclusion does not mean a road has a proposed or active project."}
          </span>
        </div>

        {!loading && currentDataset.inventory.length === 0 && (
          <div className="source-gap-note">
            <strong>Legacy GIS boundary gap</strong>
            <span>This newer district has active PMGSY records, but the public GIS inventory has not been split from its former parent district. A zero here does not mean there are no roads.</span>
          </div>
        )}

        <div className="filter-panel">
          <label className="search-field">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={mode === "projects" ? "Road, package or block" : "Road name or code"} />
          </label>
          {mode === "projects" && (
            <label className="select-field">
              <span>Project stage</span>
              <select value={stage} onChange={(event) => setStage(event.target.value as ProjectStage | "All stages")}>
                {projectStages.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          )}
          <label className="select-field">
            <span>Road type</span>
            <select value={roadType} onChange={(event) => setRoadType(event.target.value)}>
              {(mode === "projects" ? projectTypes : inventoryTypes).map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          {hasFilters && <button type="button" className="clear-button" onClick={clearFilters}>Clear</button>}
        </div>

        <div className="workspace">
          <div className="project-column">
            <div className="result-count">
              <span>{loading ? "Loading district data…" : `${formatNumber(modeCount)} ${mode === "projects" ? "project records" : "road records"}`}</span>
              <span>Click a row to locate</span>
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
                          <span className="stage" style={{ "--stage-color": stageColors[project.stage] } as React.CSSProperties}>{project.stage}</span>
                          <span>{project.category}</span>
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
                        <div className="precision-line"><i /> {project.locationPrecision}</div>
                        <a href={project.sourceUrl} target="_blank" rel="noreferrer">Open official source <span>↗</span></a>
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
                        <span className="project-meta inventory-meta"><span>{road.category}</span><span>{road.code || "No road code"}</span></span>
                        <strong>{road.name}</strong>
                        <span className="road-name">Owner in GIS: {road.owner}</span>
                      </span>
                      <span className="locate-arrow" aria-hidden="true">↗</span>
                    </button>
                    {selected && (
                      <div className="project-detail inventory-detail">
                        <p>This road appears in PMGSY&apos;s official open GIS network layer. No construction stage is inferred from inventory membership.</p>
                        <div className="precision-line"><i /> Official GIS road bounds</div>
                        <a href="https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=1808291&lang=2&reg=48" target="_blank" rel="noreferrer">About the official GIS release <span>↗</span></a>
                      </div>
                    )}
                  </article>
                );
              })}

              {!loading && modeCount === 0 && (
                <div className="empty-state">
                  <strong>No matching roads</strong>
                  <p>Try a broader stage, type or search.</p>
                  <button type="button" onClick={clearFilters}>Clear filters</button>
                </div>
              )}
              {loading && <div className="loading-state"><i /><span>Loading {displayDistrictName} roads</span></div>}
              {mode === "inventory" && visibleInventory.length < filteredInventory.length && (
                <button className="load-more" type="button" onClick={() => setVisibleLimit((value) => value + PAGE_SIZE)}>
                  Load 100 more <span>{formatNumber(filteredInventory.length - visibleInventory.length)} remaining</span>
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
              onSelect={setSelectedId}
            />
            <div className="map-overlay map-title">
              <span>{mode === "projects" ? "Selected project" : "Selected inventory road"}</span>
              <strong>{mode === "projects" ? selectedProject?.name ?? `${displayDistrictName} district` : selectedRoad?.name ?? `${displayDistrictName} district`}</strong>
            </div>
            <div className="map-overlay map-note"><span className="pulse" /> {selectedFeature?.locationPrecision ?? "Select a road to locate"}</div>
            {mode === "projects" && (
              <div className="map-legend">
                {projectStages.slice(1).map((item) => <span key={item}><i style={{ background: stageColors[item as ProjectStage] }} />{item}</span>)}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="road-breakdown" aria-labelledby="breakdown-title">
        <div className="breakdown-heading">
          <p className="section-kicker">District inventory</p>
          <h2 id="breakdown-title">What is mapped in {displayDistrictName}</h2>
          <p>Counts below come from the PMGSY open GIS road network, not from a construction-project register.</p>
        </div>
        <div className="breakdown-grid">
          {inventoryTypes.slice(1).map((type) => (
            <button key={type} type="button" onClick={() => { changeMode("inventory"); setRoadType(type); document.querySelector(".tracker")?.scrollIntoView({ behavior: "smooth" }); }}>
              <span>{type}</span>
              <strong>{formatNumber(districtSummary?.categoryCounts[type] ?? 0)}</strong>
              <i style={{ width: `${Math.max(4, ((districtSummary?.categoryCounts[type] ?? 0) / Math.max(1, districtSummary?.inventoryCount ?? 1)) * 100)}%` }} />
            </button>
          ))}
        </div>
      </section>

      <section className="methodology" id="methodology">
        <div className="method-intro">
          <p className="section-kicker">Before you evaluate land</p>
          <h2>Evidence first.<br />Parcel check next.</h2>
          <p>This is a screening tool, not a land-acquisition recommendation or notified alignment survey.</p>
        </div>
        <div className="method-cards">
          <article><span>01</span><h3>Project status</h3><p>Village-road stages come from the official PMGSY OMMAS Sanction Award Progress report. Major corridors link to their NHAI, MoRTH, PIB or MP government record.</p></article>
          <article><span>02</span><h3>Road inventory</h3><p>NH, SH, district and village-road inventory comes from PMGSY&apos;s public GIS release. It gives network context but does not itself indicate a future project.</p></article>
          <article><span>03</span><h3>Location precision</h3><p>Matched PMGSY routes use official GIS geometry. Unmatched works use a district/block anchor. Major corridors are indicative unless a notified alignment is linked.</p></article>
          <article><span>04</span><h3>Due diligence</h3><p>Before buying, verify current gazette notices, khasra maps, land-use zoning, title, access control, acquisition boundaries and local authority plans.</p></article>
        </div>
      </section>

      <footer>
        <div className="brand footer-brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>MP Road Watch</span></div>
        <p>41,016 official GIS road records · 2,108 active PMGSY works · Sources checked through 14 Jul 2026</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
