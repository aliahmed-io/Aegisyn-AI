'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, ShieldAlert, Bug, Terminal, Wifi } from 'lucide-react';
import { IncidentRecord } from '@/types/threat';
import { getSeverityColor } from '@/tokens';

interface RecentIncidentsProps {
  incidents: IncidentRecord[];
  onSelectIncident?: (incident: IncidentRecord) => void;
  selectedIncidentId?: string | null;
}

export const RecentIncidents: React.FC<RecentIncidentsProps> = ({
  incidents,
  onSelectIncident,
  selectedIncidentId,
}) => {
  const getAttackIcon = (type: string) => {
    if (type.includes('DDoS')) return ShieldAlert;
    if (type.includes('Brute')) return Terminal;
    if (type.includes('Malware') || type.includes('C2')) return Bug;
    if (type.includes('Port')) return Wifi;
    return AlertCircle;
  };

  const formatTime = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat(undefined, {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date); };

  return (
    <div className="p-4 bg-[#0D2023] border border-[rgba(88,213,177,0.15)] rounded-lg flex flex-col h-full shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[rgba(88,213,177,0.12)]">
        <h3 className="text-sm font-semibold tracking-wide text-[#EAF4F0] font-heading">
          Recent Incidents
        </h3>
        <Link
          href="/incidents"
          className="text-xs font-mono text-[#58D5B1] hover:text-[#A4E8D5] flex items-center gap-1 transition-colors"
        >
          <span>View all</span>
          <span>&rarr;</span>
        </Link>
      </div>

      {/* Incidents List */}
      <div className="space-y-2.5 overflow-y-auto max-h-[360px] pr-1">
        {!incidents.length&&<p className="panel-empty">No flagged records to review. Your results will appear here after analysis.</p>}
        {incidents.slice(0, 5).map((inc) => {
          const Icon = getAttackIcon(inc.attackType);
          const sevColor = getSeverityColor(inc.severity);
          const isSelected = selectedIncidentId === inc.id;

          return (
            <button
              type="button"
              aria-label={`Inspect incident ${inc.id}`}
              key={inc.id}
              onClick={() => onSelectIncident?.(inc)}
              className={`p-2.5 rounded-md border transition-all cursor-pointer flex items-center justify-between w-full text-left ${
                isSelected
                  ? 'bg-[#142B2D] border-[#58D5B1] shadow-[0_0_10px_rgba(88,213,177,0.15)]'
                  : 'bg-[#071013]/60 border-[rgba(88,213,177,0.1)] hover:border-[rgba(88,213,177,0.3)] hover:bg-[#142B2D]/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded bg-[#0D2023] border border-[rgba(88,213,177,0.15)]"
                  style={{ color: sevColor }}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-[#EAF4F0] font-heading">
                    {inc.attackType}
                  </h4>
                  <p className="text-[11px] font-mono text-[#8EA5A3]">
                    {inc.sourceIp} &rarr; {inc.country || 'Target'}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
                  style={{
                    backgroundColor: `${sevColor}22`,
                    color: sevColor,
                    border: `1px solid ${sevColor}44`,
                  }}
                >
                  {inc.severity}
                </span>
                <p title={inc.timestamp || "Timestamp unavailable"} className="recent-time text-[10px] font-mono text-[#8EA5A3] mt-1">
                  {formatTime(inc.timestamp)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
