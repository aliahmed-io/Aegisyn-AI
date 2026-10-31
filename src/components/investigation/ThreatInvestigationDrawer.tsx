'use client';

import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Cpu, CheckCircle2 } from 'lucide-react';
import { SonarEvent, IncidentStatus } from '@/types/threat';
import { getSeverityColor } from '@/tokens';
import { Modal } from '@/components/ui/Modal';
import { fetchIncidents, updateIncidentStatus } from '@/services/api';

interface ThreatInvestigationDrawerProps {
  event: SonarEvent | null;
  onClose: () => void;
}

export const ThreatInvestigationDrawer: React.FC<ThreatInvestigationDrawerProps> = ({
  event,
  onClose,
}) => {
  const [status, setStatus] = useState<IncidentStatus>('Investigating');
  const [analystNotes, setAnalystNotes] = useState<string>(
    ''
  );
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    if (!event?.predictedMalicious) return;
    let active = true;
    fetchIncidents().then(rows => { const incident = rows.find(i => i.id === `INC-${event.id}` || i.id === event.id); if (active && incident) {setStatus(incident.status);setAnalystNotes(incident.analystNotes);} });
    return () => {active=false;};
  }, [event?.id, event?.predictedMalicious]);

  if (!event) return null;

  const sevColor = getSeverityColor(event.severity);

  const handleSaveNotes = async () => {
    setSaveError('');
    const saved = await updateIncidentStatus(event.id.startsWith('INC-') ? event.id : `INC-${event.id}`, status, analystNotes);
    if (!saved) { setSaveError('Notes could not be saved. Check the analysis service and try again.'); return; }
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <Modal onClose={onClose} label="Observation investigation" className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-[#071013]/95 border-l border-[rgba(88,213,177,0.25)] shadow-2xl backdrop-blur-xl z-50 flex flex-col font-mono text-xs select-none">
      {/* Header */}
      <div className="p-4 border-b border-[rgba(88,213,177,0.15)] bg-[#0D2023] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="p-2 rounded bg-[#142B2D] border"
            style={{ borderColor: sevColor, color: sevColor }}
          >
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#EAF4F0] font-heading uppercase">
                {event.attackCategory}
              </h3>
              <span
                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                style={{
                  backgroundColor: `${sevColor}22`,
                  color: sevColor,
                  border: `1px solid ${sevColor}55`,
                }}
              >
                {event.severity}
              </span>
            </div>
            <p className="text-[11px] text-[#8EA5A3]">Record ID: {event.id}</p>
          </div>
        </div>

        <button
          aria-label="Close investigation"
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-[#142B2D] text-[#8EA5A3] hover:text-[#EAF4F0] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {event.detectionSource==='suricata'&&<section className="workspace-panel sensor-evidence"><h2>Suricata sensor finding</h2><p>{event.eventType==='alert'?'Signature-based alert, not an ML prediction.':'Observed flow. No alert does not establish that a flow is benign.'}</p><dl className="report-details"><dt>Signature</dt><dd>{event.attackCategory}</dd><dt>Category</dt><dd>{event.sensorCategory||'Not provided'}</dd><dt>Sensor priority</dt><dd>{event.sensorPriority??'Not provided'}</dd><dt>Flow ID</dt><dd>{event.flowId||'Not provided'}</dd></dl></section>}
        {/* Probability & Model Confidence */}
        {event.maliciousProbability!==null&&(
        <div className="p-4 rounded-lg bg-[#0D2023] border border-[rgba(88,213,177,0.15)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#8EA5A3] flex items-center gap-1.5 font-semibold">
              <Cpu className="w-4 h-4 text-[#58D5B1]" />
              Malicious probability
            </span>
            <span
              className="text-base font-bold"
              style={{ color: sevColor }}
            >
              {(event.maliciousProbability * 100).toFixed(1)}%
            </span>
          </div>

          <div className="w-full h-2.5 bg-[#142B2D] rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${event.maliciousProbability * 100}%`,
                backgroundColor: sevColor,
              }}
            />
          </div>

          <p className="text-[11px] text-[#8EA5A3]">
            Model output for this observation. Severity describes a probability band, not operational impact.
          </p>
        </div>

        )}
        {/* Network Flow Attributes Grid */}
        <div className="p-4 rounded-lg bg-[#0D2023] border border-[rgba(88,213,177,0.15)] space-y-2.5">
          <h4 className="text-xs font-bold text-[#EAF4F0] uppercase tracking-wider pb-1.5 border-b border-[rgba(88,213,177,0.1)]">
            Network Flow Telemetry
          </h4>

          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <span className="text-[#8EA5A3]">Source IP:</span>
              <p className="font-semibold text-[#EAF4F0]">{event.sourceIp || 'Not available'}</p>
            </div>
            <div>
              <span className="text-[#8EA5A3]">Target IP:</span>
              <p className="font-semibold text-[#EAF4F0]">{event.destinationIp || 'Not available'}</p>
            </div>
            <div>
              <span className="text-[#8EA5A3]">Protocol / Port:</span>
              <p className="font-semibold text-[#EAF4F0]">{event.protocol} : {event.port || 'Not available'}</p>
            </div>
            <div>
              <span className="text-[#8EA5A3]">Flow Duration:</span>
              <p className="font-semibold text-[#EAF4F0]">{event.flowDuration===null?'Not available':event.flowDuration+' sec'}</p>
            </div>
            <div>
              <span className="text-[#8EA5A3]">Source Bytes:</span>
              <p className="font-semibold text-[#EAF4F0]">{event.sourceBytes===null?'Not available':event.sourceBytes.toLocaleString()+' B'}</p>
            </div>
            <div>
              <span className="text-[#8EA5A3]">Target Bytes:</span>
              <p className="font-semibold text-[#EAF4F0]">{event.destinationBytes===null?'Not available':event.destinationBytes.toLocaleString()+' B'}</p>
            </div>
            <div>
              <span className="text-[#8EA5A3]">Packets Transferred:</span>
              <p className="font-semibold text-[#EAF4F0]">{event.totalPackets??'Not available'}</p>
            </div>
            <div>
              <span className="text-[#8EA5A3]">Origin Country:</span>
              <p className="font-semibold text-[#EAF4F0]">{event.country || 'Not available'}</p>
            </div>
          </div>
        </div>

        {/* Workflow Status Management */}
        {event.predictedMalicious && (
        <div className="p-4 rounded-lg bg-[#0D2023] border border-[rgba(88,213,177,0.15)] space-y-3">
          <h4 className="text-xs font-bold text-[#EAF4F0] uppercase tracking-wider pb-1.5 border-b border-[rgba(88,213,177,0.1)]">
            Analyst Investigation Workflow
          </h4>

          <div>
            <label className="text-[11px] text-[#8EA5A3] block mb-1.5">Incident State:</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['New', 'Investigating', 'Reviewed', 'Dismissed'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`py-1 text-[11px] rounded border transition-colors ${
                    status === s
                      ? 'bg-[#58D5B1] text-[#071013] font-bold border-[#58D5B1]'
                      : 'bg-[#142B2D] border-[rgba(88,213,177,0.15)] text-[#8EA5A3] hover:text-[#EAF4F0]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="drawer-notes" className="text-[11px] text-[#8EA5A3] block mb-1.5">SOC Analyst Notes:</label>
            <textarea
              id="drawer-notes"
              aria-label="Analyst notes"
              name="analystNotes"
              value={analystNotes}
              onChange={(e) => setAnalystNotes(e.target.value)}
              rows={3}
              className="w-full p-2.5 bg-[#071013] border border-[rgba(88,213,177,0.2)] rounded text-[#EAF4F0] text-xs focus:outline-none focus:border-[#58D5B1]"
              placeholder="Enter investigative findings, IP block status, or containment steps…"
            />
          </div>

          {saveError && <p role="alert" className="text-[#F45B69]">{saveError}</p>}
          <button
            onClick={handleSaveNotes}
            className="w-full py-2 bg-[#142B2D] hover:bg-[#58D5B1]/20 text-[#58D5B1] border border-[#58D5B1]/40 rounded font-bold tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSaved ? 'Notes saved' : 'Save Analyst Notes'}</span>
          </button>
        </div>)}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-[rgba(88,213,177,0.15)] bg-[#0D2023] flex items-center gap-3">
        <p className="flex-1 text-[#8EA5A3] text-[10px]">Analysis workspace. Network containment must be performed in your security tools.</p>

        <button
          onClick={onClose}
          className="px-4 py-2 rounded bg-[#142B2D] text-[#8EA5A3] hover:text-[#EAF4F0] border border-[rgba(88,213,177,0.15)] transition-colors"
        >
          Dismiss
        </button>
      </div>
    </Modal>
  );
};
