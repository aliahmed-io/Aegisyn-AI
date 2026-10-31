'use client';

import React, { useState, useEffect } from 'react';
import { useSourceRefresh } from '@/services/dataSource';
import { Sidebar } from '@/components/navigation/Sidebar';
import { Header } from '@/components/navigation/Header';
import { SonarCanvas } from '@/components/sonar/SonarCanvas';
import { ThreatInvestigationDrawer } from '@/components/investigation/ThreatInvestigationDrawer';
import { fetchSonarEvents } from '@/services/api';
import { SonarEvent } from '@/types/threat';
import { Radar, Cpu } from 'lucide-react';

export default function ThreatMapPage() {
  const [sonarEvents, setSonarEvents] = useState<SonarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SonarEvent | null>(null);

  useSourceRefresh(()=>{void fetchSonarEvents().then(setSonarEvents);});
  useEffect(() => {
    fetchSonarEvents().then(setSonarEvents);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="app-content">
        <Header />

        <main id="main-content" tabIndex={-1} className="flex-1 p-6 flex flex-col gap-4 overflow-hidden">
          {/* Header Title with Telemetry Stats */}
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(88,213,177,0.12)] shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <Radar className="w-5 h-5 text-[#58D5B1]" />
                <h1 className="text-xl font-bold font-heading text-[#EAF4F0]">
                  Sonar Intelligence Command Room
                </h1>
              </div>
              <p className="text-xs font-mono text-[#8EA5A3] mt-0.5">
                Inspect recorded model predictions from your latest completed analysis.
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#0D2023] border border-[rgba(88,213,177,0.2)]">
                <Cpu className="w-3.5 h-3.5 text-[#58D5B1]" />
                <span className="text-[#8EA5A3]">Visible signals:</span>
                <span className="text-[#EAF4F0] font-bold">{Math.min(sonarEvents.length,40)}</span>
              </div>
            </div>
          </div>

          {/* Fullscreen Sonar Canvas Area */}
          <div className="flex-1 w-full h-full min-h-0 relative">
            <SonarCanvas
              events={sonarEvents}
              selectedEvent={selectedEvent}
              onSelectEvent={setSelectedEvent}
              className="h-full"
            />
          </div>
        </main>
      </div>

      {selectedEvent && (
        <ThreatInvestigationDrawer
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
