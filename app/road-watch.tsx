"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

type Stage = "Approved" | "Under implementation" | "Bids / appraisal" | "DPR / proposed";

type RoadProject = {
  id: string;
  name: string;
  road: string;
  stage: Stage;
  districts: string[];
  length: string;
  investment: string;
  statusNote: string;
  sourceName: string;
  sourceDate: string;
  sourceUrl: string;
  route: [number, number][];
};

const stageColors: Record<Stage, string> = {
  Approved: "#de6f3a",
  "Under implementation": "#297864",
  "Bids / appraisal": "#c4922f",
  "DPR / proposed": "#6f7b8b",
};

const projects: RoadProject[] = [
  {
    id: "betul-khandwa-vadodara",
    name: "Hiwarkhedi–Roshni–Ashapur–Rudhy & Deshgaon–Julwaniya",
    road: "NH-347B · Betul–Khandwa–Vadodara corridor",
    stage: "Approved",
    districts: ["Betul", "Khandwa", "Khargone", "Barwani"],
    length: "233.65 km",
    investment: "₹4,415.60 cr",
    statusNote: "Cabinet approval on HAM; includes a 16.2 km greenfield Khargone bypass.",
    sourceName: "PIB · Cabinet Committee on Economic Affairs",
    sourceDate: "03 Jun 2026",
    sourceUrl: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2268359&lang=1&reg=3",
    route: [[21.9, 77.9], [22.18, 76.93], [21.83, 76.35], [21.83, 75.62], [21.86, 75.1]],
  },
  {
    id: "badnawar-timarwani",
    name: "Badnawar–Petlawad–Thandla–Timarwani",
    road: "NH-752D · Delhi–Mumbai Expressway connector",
    stage: "Approved",
    districts: ["Dhar", "Jhabua"],
    length: "80.45 km",
    investment: "₹3,839.42 cr",
    statusNote: "Cabinet-approved four-lane greenfield and brownfield corridor on HAM.",
    sourceName: "PIB · Cabinet Committee on Economic Affairs",
    sourceDate: "10 Mar 2026",
    sourceUrl: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2237568&lang=1&reg=3",
    route: [[23.02, 75.23], [23.0, 74.8], [23.0, 74.58], [22.84, 74.43]],
  },
  {
    id: "boregaon-shahpur",
    name: "Boregaon Buzurg–Shahpur",
    road: "NH-753L · MP–Maharashtra economic corridor",
    stage: "Under implementation",
    districts: ["Khandwa", "Burhanpur"],
    length: "~47 km",
    investment: "₹944 cr",
    statusNote: "MoRTH reported approximately 85% construction complete in May 2026.",
    sourceName: "PIB · Ministry of Road Transport & Highways",
    sourceDate: "30 May 2026",
    sourceUrl: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2266946&lang=2&reg=48",
    route: [[21.82, 76.45], [21.57, 76.32], [21.31, 76.23]],
  },
  {
    id: "agra-gwalior",
    name: "Agra–Gwalior Greenfield Expressway",
    road: "NH-719D · Six-lane access-controlled corridor",
    stage: "Under implementation",
    districts: ["Morena", "Gwalior"],
    length: "88 km",
    investment: "₹4,613 cr",
    statusNote: "Concession agreement signed by NHAI for BOT (Toll) implementation.",
    sourceName: "PIB · National Highways Authority of India",
    sourceDate: "30 Apr 2025",
    sourceUrl: "https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2125590&lang=2&reg=48",
    route: [[27.08, 78.0], [26.49, 77.99], [26.24, 78.12]],
  },
  {
    id: "indore-eastern-bypass",
    name: "Indore Eastern Bypass",
    road: "Six-lane bypass · km 64–116",
    stage: "Bids / appraisal",
    districts: ["Indore"],
    length: "62 km",
    investment: "₹2,971 cr",
    statusNote: "Two HAM packages had bids invited; proposals were submitted for CCEA appraisal.",
    sourceName: "NHAI · Bids & clearance dashboard",
    sourceDate: "14 Nov 2025",
    sourceUrl: "https://nhai.gov.in/nhai/sites/default/files/mix_file/Status_of_Projects_where_Bids.pdf",
    route: [[22.62, 75.95], [22.71, 76.02], [22.83, 75.95]],
  },
  {
    id: "ujjain-jhalawar",
    name: "Ujjain–Jhalawar Package 1",
    road: "NH-552G · Four-lane HAM package",
    stage: "Bids / appraisal",
    districts: ["Ujjain", "Agar Malwa"],
    length: "44 km",
    investment: "₹1,345 cr",
    statusNote: "Bid-stage project with proposal submitted for CCEA appraisal.",
    sourceName: "NHAI · Bids & clearance dashboard",
    sourceDate: "14 Nov 2025",
    sourceUrl: "https://nhai.gov.in/nhai/sites/default/files/mix_file/Status_of_Projects_where_Bids.pdf",
    route: [[23.18, 75.78], [23.71, 76.01], [23.95, 76.09], [24.27, 76.15]],
  },
  {
    id: "rewa-sidhi",
    name: "Rewa–Churhat–Sidhi widening",
    road: "NH-39 · Four-lane paved-shoulder packages",
    stage: "DPR / proposed",
    districts: ["Rewa", "Sidhi"],
    length: "59.1 km",
    investment: "HAM packages",
    statusNote: "Rewa–Churhat and Churhat–Sidhi sections listed in NHAI's balance-for-award register.",
    sourceName: "NHAI · Balance for Award",
    sourceDate: "01 Apr 2025",
    sourceUrl: "https://nhai.gov.in/nhai/sites/default/files/mix_file/Balance_for_award_04-25.pdf",
    route: [[24.54, 81.3], [24.43, 81.66], [24.39, 81.88]],
  },
  {
    id: "damoh-jabalpur",
    name: "Damoh–Jabalpur widening",
    road: "NH-34 · Two/four-lane paved-shoulder corridor",
    stage: "DPR / proposed",
    districts: ["Damoh", "Jabalpur"],
    length: "~100 km",
    investment: "EPC packages",
    statusNote: "DPR and first 43.5 km construction package listed for award by NHAI.",
    sourceName: "NHAI · Balance for Award",
    sourceDate: "01 Apr 2025",
    sourceUrl: "https://nhai.gov.in/nhai/sites/default/files/mix_file/Balance_for_award_04-25.pdf",
    route: [[23.84, 79.44], [23.58, 79.75], [23.18, 79.99]],
  },
  {
    id: "indore-western-bypass",
    name: "Indore Western Bypass · Package 1",
    road: "Six-lane greenfield bypass",
    stage: "Approved",
    districts: ["Indore"],
    length: "34 km",
    investment: "₹1,534.70 cr",
    statusNote: "Package 1 approved on Hybrid Annuity Mode by MoRTH.",
    sourceName: "PIB · Ministry of Road Transport & Highways",
    sourceDate: "29 Feb 2024",
    sourceUrl: "https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=2010054&lang=2&reg=48",
    route: [[22.63, 75.77], [22.72, 75.68], [22.86, 75.73]],
  },
  {
    id: "bhopal-ayodhya-bypass",
    name: "Bhopal Ayodhya Bypass service roads",
    road: "NH-46 to NH-146 · Six-lane urban corridor",
    stage: "Approved",
    districts: ["Bhopal"],
    length: "Urban section",
    investment: "₹1,238.59 cr",
    statusNote: "Six-lane service roads approved from Asharam Tiraha to Ratnagiri Tiraha.",
    sourceName: "PIB · Ministry of Road Transport & Highways",
    sourceDate: "29 Feb 2024",
    sourceUrl: "https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=2010054&lang=2&reg=48",
    route: [[23.25, 77.49], [23.28, 77.5], [23.31, 77.48]],
  },
  {
    id: "shahganj-badi",
    name: "Shahganj Bypass–Badi",
    road: "NH-146B · Four-lane Package IV",
    stage: "Approved",
    districts: ["Sehore", "Raisen"],
    length: "41 km",
    investment: "₹776.19 cr",
    statusNote: "Four-laning approved on Hybrid Annuity Mode.",
    sourceName: "PIB · Ministry of Road Transport & Highways",
    sourceDate: "29 Feb 2024",
    sourceUrl: "https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=2010054&lang=2&reg=48",
    route: [[22.84, 77.8], [22.98, 77.99], [23.1, 78.22]],
  },
  {
    id: "chambal-expressway",
    name: "Greenfield Chambal Expressway",
    road: "Interstate four-lane greenfield corridor",
    stage: "DPR / proposed",
    districts: ["Sheopur", "Morena", "Bhind"],
    length: "404 km total",
    investment: "DPR stage",
    statusNote: "Consolidated DPR consultancy listed across Madhya Pradesh, Uttar Pradesh and Rajasthan.",
    sourceName: "NHAI · Balance for Award",
    sourceDate: "01 Apr 2025",
    sourceUrl: "https://nhai.gov.in/nhai/sites/default/files/mix_file/Balance_for_award_04-25.pdf",
    route: [[25.66, 76.7], [26.06, 77.14], [26.49, 77.99], [26.57, 78.78]],
  },
];

const districts = Array.from(new Set(projects.flatMap((project) => project.districts))).sort();
const stages: Stage[] = ["Approved", "Under implementation", "Bids / appraisal", "DPR / proposed"];

function CorridorMap({
  visibleProjects,
  selectedProject,
  onSelect,
}: {
  visibleProjects: RoadProject[];
  selectedProject: RoadProject | undefined;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [23.55, 78.2],
        zoom: 6,
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

      routeLayerRef.current?.remove();
      const routeLayer = L.layerGroup().addTo(map);
      routeLayerRef.current = routeLayer;

      visibleProjects.forEach((project) => {
        const isSelected = selectedProject?.id === project.id;
        const line = L.polyline(project.route, {
          color: stageColors[project.stage],
          weight: isSelected ? 7 : 4,
          opacity: selectedProject && !isSelected ? 0.28 : 0.82,
          lineCap: "round",
        }).addTo(routeLayer);

        line.bindTooltip(project.name, { sticky: true, direction: "top" });
        line.on("click", () => onSelect(project.id));

        if (isSelected) {
          project.route.forEach((point, index) => {
            L.circleMarker(point, {
              radius: index === 0 || index === project.route.length - 1 ? 6 : 3,
              color: "#fffdf7",
              weight: 2,
              fillColor: stageColors[project.stage],
              fillOpacity: 1,
            }).addTo(routeLayer);
          });
        }
      });

      if (selectedProject) {
        map.fitBounds(L.latLngBounds(selectedProject.route), { padding: [54, 54], maxZoom: 10 });
      } else if (visibleProjects.length > 0) {
        map.fitBounds(L.latLngBounds(visibleProjects.flatMap((project) => project.route)), {
          padding: [40, 40],
          maxZoom: 7,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [visibleProjects, selectedProject, onSelect]);

  return <div ref={containerRef} className="map-canvas" aria-label="Map of selected road corridors" />;
}

export function RoadWatch() {
  const [district, setDistrict] = useState("All districts");
  const [stage, setStage] = useState<Stage | "All stages">("All stages");
  const [selectedId, setSelectedId] = useState(projects[0].id);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const visibleProjects = projects.filter((project) => {
    const districtMatches = district === "All districts" || project.districts.includes(district);
    const stageMatches = stage === "All stages" || project.stage === stage;
    return districtMatches && stageMatches;
  });

  const selectedProject = visibleProjects.find((project) => project.id === selectedId);

  const selectDistrict = (value: string) => {
    setDistrict(value);
    const firstMatch = projects.find((project) =>
      value === "All districts" ? true : project.districts.includes(value),
    );
    if (firstMatch) setSelectedId(firstMatch.id);
  };

  const resetFilters = () => {
    setDistrict("All districts");
    setStage("All stages");
    setSelectedId(projects[0].id);
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Madhya Pradesh Road Watch home">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>MP Road Watch</span>
        </a>
        <a className="header-link" href="#methodology">Verification method <span>↗</span></a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Madhya Pradesh · Infrastructure intelligence</p>
          <h1>See where the next<br />road will <em>move value.</em></h1>
          <p className="hero-intro">
            A district-wise view of proposed, approved and under-construction highways,
            grounded in official NHAI, MoRTH and government releases.
          </p>
        </div>
        <div className="hero-stats" aria-label="Dataset summary">
          <div><strong>{projects.length}</strong><span>tracked corridors</span></div>
          <div><strong>{districts.length}</strong><span>districts covered</span></div>
          <div><strong>2026</strong><span>latest source</span></div>
        </div>
      </section>

      <section className="tracker" aria-labelledby="tracker-title">
        <div className="tracker-toolbar">
          <div>
            <p className="section-kicker">Corridor tracker</p>
            <h2 id="tracker-title">Official projects, mapped</h2>
          </div>
          <button className="filter-toggle" type="button" onClick={() => setFiltersOpen((value) => !value)}>
            Filters <span>{district !== "All districts" || stage !== "All stages" ? "●" : "+"}</span>
          </button>
        </div>

        <div className={`filter-panel ${filtersOpen ? "filter-panel-open" : ""}`}>
          <div className="filter-row">
            <span className="filter-label">District</span>
            <div className="filter-scroll">
              {["All districts", ...districts].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={district === item ? "chip chip-active" : "chip"}
                  onClick={() => selectDistrict(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-row">
            <span className="filter-label">Project stage</span>
            <div className="filter-scroll">
              {["All stages", ...stages].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={stage === item ? "chip chip-active" : "chip"}
                  onClick={() => {
                    setStage(item as Stage | "All stages");
                    const firstMatch = projects.find((project) => item === "All stages" || project.stage === item);
                    if (firstMatch) setSelectedId(firstMatch.id);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="workspace">
          <div className="project-column">
            <div className="result-count">
              <span>{visibleProjects.length} corridor{visibleProjects.length === 1 ? "" : "s"}</span>
              <span>Click to locate</span>
            </div>

            <div className="project-list">
              {visibleProjects.map((project, index) => {
                const selected = project.id === selectedProject?.id;
                return (
                  <article key={project.id} className={selected ? "project-card project-card-active" : "project-card"}>
                    <button type="button" className="project-select" onClick={() => setSelectedId(project.id)} aria-pressed={selected}>
                      <span className="project-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="project-main">
                        <span className="project-meta">
                          <span className="stage" style={{ "--stage-color": stageColors[project.stage] } as React.CSSProperties}>
                            {project.stage}
                          </span>
                          <span>{project.sourceDate}</span>
                        </span>
                        <strong>{project.name}</strong>
                        <span className="road-name">{project.road}</span>
                        <span className="district-line">{project.districts.join(" · ")}</span>
                      </span>
                      <span className="locate-arrow" aria-hidden="true">↗</span>
                    </button>

                    {selected && (
                      <div className="project-detail">
                        <div className="detail-grid">
                          <span><small>Length</small>{project.length}</span>
                          <span><small>Investment / mode</small>{project.investment}</span>
                        </div>
                        <p>{project.statusNote}</p>
                        <a href={project.sourceUrl} target="_blank" rel="noreferrer">
                          Open official source <span>↗</span>
                        </a>
                      </div>
                    )}
                  </article>
                );
              })}

              {visibleProjects.length === 0 && (
                <div className="empty-state">
                  <strong>No matching corridor</strong>
                  <p>Try another district or project stage.</p>
                  <button type="button" onClick={resetFilters}>Clear filters</button>
                </div>
              )}
            </div>
          </div>

          <div className="map-column">
            <CorridorMap visibleProjects={visibleProjects} selectedProject={selectedProject} onSelect={setSelectedId} />
            <div className="map-overlay map-title">
              <span>Selected corridor</span>
              <strong>{selectedProject?.name ?? "Filtered Madhya Pradesh view"}</strong>
            </div>
            <div className="map-overlay map-note">
              <span className="pulse" /> Approximate corridor anchors
            </div>
            <div className="map-legend">
              {stages.map((item) => <span key={item}><i style={{ background: stageColors[item] }} />{item}</span>)}
            </div>
          </div>
        </div>
      </section>

      <section className="methodology" id="methodology">
        <div>
          <p className="section-kicker">Before you evaluate land</p>
          <h2>Signal, not a survey.</h2>
        </div>
        <div className="method-cards">
          <article>
            <span>01</span>
            <h3>Source first</h3>
            <p>Every entry links to an official NHAI or Government of India record and keeps its publication date visible.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Stage matters</h3>
            <p>Approved, bid-stage and DPR-stage projects carry different execution risk. Treat the labels as distinct signals.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Verify the parcel</h3>
            <p>Map lines are approximate town-level anchors, not notified alignments. Check gazette notices, khasra maps, zoning and title locally before buying.</p>
          </article>
        </div>
      </section>

      <footer>
        <div className="brand footer-brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>MP Road Watch</span>
        </div>
        <p>Curated for early-stage corridor research · Sources checked through 14 Jul 2026</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
