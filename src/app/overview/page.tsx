'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/navigation/Sidebar';
import { Header } from '@/components/navigation/Header';
import { MetricCards } from '@/components/dashboard/MetricCards';
import { SonarCanvas } from '@/components/sonar/SonarCanvas';
import { RecentIncidents } from '@/components/dashboard/RecentIncidents';
import { ObservationAnalytics } from '@/components/dashboard/ObservationAnalytics';
import { ThreatInvestigationDrawer } from '@/components/investigation/ThreatInvestigationDrawer';
import {
  fetchOverviewMetrics,
  fetchSonarEvents,
  fetchIncidents,
  DEFAULT_OVERVIEW_METRICS,
  DEFAULT_INCIDENTS,
} from '@/services/api';
import { SonarEvent, IncidentRecord, ThreatOverviewMetrics } from '@/types/threat';

export default function OverviewPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<ThreatOverviewMetrics>(DEFAULT_OVERVIEW_METRICS);
  const [sonarEvents, setSonarEvents] = useState<SonarEvent[]>([]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>(DEFAULT_INCIDENTS);
  const [selectedEvent, setSelectedEvent] = useState<SonarEvent | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [dataSource, setDataSource] = useState('Connecting to analysis service…');
  const visibleEvents = sonarEvents.filter(e => `${e.sourceIp} ${e.destinationIp} ${e.attackCategory} ${e.protocol} ${e.id}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    let generation=0;
    async function loadData() {
      const current=++generation;
      const [m, evts, incs] = await Promise.all([
        fetchOverviewMetrics(),
        fetchSonarEvents(),
        fetchIncidents(),
      ]);
      if(current!==generation)return;
      setMetrics(m);
      setSonarEvents(evts);
      setIncidents(incs);
      setDataSource(m.dataSource==='suricata'?'Suricata sensor · recorded EVE events':m.totalFlows ? (m.isDemo ? 'Generated demo data • model inference' : 'Uploaded data • model inference') : 'No analyzed data. Upload a CSV in Datasets to begin.');
    }
    loadData();
    const refresh=()=>{void loadData();};
    window.addEventListener('aegisyn-sensor-update',refresh);window.addEventListener('aegisyn-source-change',refresh);
    return()=>{window.removeEventListener('aegisyn-sensor-update',refresh);window.removeEventListener('aegisyn-source-change',refresh);};
  }, []);

  const handleSelectIncident = (inc: IncidentRecord) => {
    setSelectedIncidentId(inc.id);
    const matchingEvt = sonarEvents.find((e) => `INC-${e.id}` === inc.id || e.id === inc.id);
    if (!matchingEvt) { router.push('/incidents'); return; }
    setSelectedEvent(matchingEvt);
  };

  return (
    <div className="app-shell">
      {/* Left Navigation Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="app-content">
        {/* Top Header */}
        <Header onSearch={setQuery} />

        {/* Scrollable Dashboard Grid */}
        <main id="main-content" tabIndex={-1} className="overview-main flex-1 overflow-y-auto">
          {/* Top Title & Header Banner */}
          <div className="overview-banner">
            <div>
              <p className="text-[11px] font-mono tracking-widest text-[#58D5B1] uppercase font-bold">
                SECURITY OPERATIONS CENTER
              </p>
              <h1 className="text-2xl font-bold font-heading text-[#EAF4F0] tracking-tight">
                Network Threat Overview
              </h1>
              <p className="text-xs text-[#8EA5A3] mt-0.5 font-mono">
                Explore network activity, model predictions, and suspicious flows.
              </p>
              <p className="data-source">{dataSource}</p>
            </div>

            {/* Top Metric Cards */}
            <div className="overview-metrics">
              <MetricCards metrics={metrics} events={sonarEvents} />
            </div>
          </div>

          {metrics.totalFlows === 0 && metrics.dataSource!=='suricata' && !query && <section className="overview-onboarding"><div><strong>Your instrument is ready. Give it a signal.</strong><p>The compact demo includes 40 model-flagged flows across four severity levels. Select it to explore the workspace, or analyze your own flow CSV.</p></div><Link href="/datasets#demo" className="action-link">Try the demo</Link><Link href="/datasets">Upload a dataset</Link></section>}
          {metrics.dataSource==='suricata'&&metrics.totalFlows===0&&<section className="overview-onboarding"><div><strong>Waiting for sensor observations</strong><p>Import an EVE log or connect the watched file. Actual Suricata flows and alerts will appear automatically.</p></div><Link href="/datasets#suricata" className="action-link">Connect Suricata</Link></section>}
          {/* Central Sonar & Incidents Row */}
          <div className="overview-center">
            {/* Centerpiece: Aegisyn Sonar Canvas (~70% width on desktop) */}
            <div className="overview-sonar">
              <SonarCanvas
                events={visibleEvents}
                selectedEvent={selectedEvent}
                onSelectEvent={(evt) => {
                  setSelectedEvent(evt);
                  if (evt) setSelectedIncidentId(`INC-${evt.id}`);
                }}
              />
            </div>

            {/* Right Threat Intelligence Panels */}
            <div className="overview-intelligence">
              {/* Recent Incidents Feed */}
              <div className="flex-1 min-h-0">
                <RecentIncidents
                  incidents={incidents.filter(i => `${i.sourceIp} ${i.attackType} ${i.protocol}`.toLowerCase().includes(query.toLowerCase()))}
                  selectedIncidentId={selectedIncidentId}
                  onSelectIncident={handleSelectIncident}
                />
              </div>

              {/* Threat Distribution Donut */}
              <div className="shrink-0">
                <ObservationAnalytics events={visibleEvents} distribution />
              </div>
            </div>
          </div>

          {/* Lower Analytics Grid */}
          <ObservationAnalytics events={visibleEvents} />
        </main>
      </div>

      {/* Slide-out Threat Investigation Drawer */}
      {selectedEvent && (
        <ThreatInvestigationDrawer
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
