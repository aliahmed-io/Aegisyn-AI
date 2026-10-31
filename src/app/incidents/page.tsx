'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useSourceRefresh } from '@/services/dataSource';
import { Sidebar } from '@/components/navigation/Sidebar';
import { Header } from '@/components/navigation/Header';
import { fetchIncidents, updateIncidentStatus } from '@/services/api';
import { IncidentRecord, IncidentStatus } from '@/types/threat';
import { getSeverityColor } from '@/tokens';
import { AlertOctagon, Filter, Edit3, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [page, setPage] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeEditingIncident, setActiveEditingIncident] = useState<IncidentRecord | null>(null);
  const [saveError, setSaveError] = useState('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editStatus, setEditStatus] = useState<IncidentStatus>('Investigating');

  useSourceRefresh(()=>{void fetchIncidents().then(setIncidents);});
  useEffect(() => {
    fetchIncidents().then(setIncidents);
  }, []);

  const filteredIncidents = incidents.filter((inc) => {
    if (filterStatus !== 'ALL' && inc.status !== filterStatus) return false;
    if (filterSeverity !== 'ALL' && inc.severity !== filterSeverity) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        inc.id.toLowerCase().includes(q) ||
        inc.attackType.toLowerCase().includes(q) ||
        inc.sourceIp.includes(q) ||
        inc.destinationIp.includes(q);
      if (!match) return false;
    }
    return true;
  });

  const pageSize = 25;
  const safePage = Math.min(page, Math.max(0, Math.ceil(filteredIncidents.length / pageSize) - 1));
  const visibleIncidents = filteredIncidents.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const handleOpenEdit = (inc: IncidentRecord) => {
    setActiveEditingIncident(inc);
    setEditNotes(inc.analystNotes);
    setEditStatus(inc.status);
  };

  const handleSaveIncident = async () => {
    if (!activeEditingIncident) return;
    setSaveError('');
    const saved = await updateIncidentStatus(activeEditingIncident.id, editStatus, editNotes);
    if (!saved) { setSaveError('Changes could not be saved. Check the analysis service and try again.'); return; }
    setIncidents((prev) =>
      prev.map((item) =>
        item.id === activeEditingIncident.id
          ? { ...item, status: editStatus, analystNotes: editNotes }
          : item
      )
    );
    setActiveEditingIncident(null);
  };

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="app-content">
        <Header onSearch={query=>{setSearchQuery(query);setPage(0);}} />

        {saveError && <p role="alert" className="px-6 py-3 text-sm text-[#F45B69]">{saveError}</p>}
        <main id="main-content" tabIndex={-1} className="flex-1 p-6 flex flex-col gap-5 overflow-y-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[rgba(88,213,177,0.12)] shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-[#F45B69]" />
                <h1 className="text-xl font-bold font-heading text-[#EAF4F0]">
                  Incidents
                </h1>
              </div>
              <p className="text-xs font-mono text-[#8EA5A3] mt-0.5">
                Review flagged records, update investigation status, and save your findings.
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
              <div className="flex items-center gap-1.5 bg-[#0D2023] px-3 py-1.5 rounded border border-[rgba(88,213,177,0.2)]">
                <Filter className="w-3.5 h-3.5 text-[#58D5B1]" />
                <span className="text-[#8EA5A3]">Status:</span>
                <select
                  aria-label="Filter by status"
                  value={filterStatus}
                  onChange={(e) => {setFilterStatus(e.target.value);setPage(0);}}
                  className="bg-transparent text-[#EAF4F0] focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="New">New</option>
                  <option value="Investigating">Investigating</option>
                  <option value="Reviewed">Reviewed</option>
                  <option value="Dismissed">Dismissed</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-[#0D2023] px-3 py-1.5 rounded border border-[rgba(88,213,177,0.2)]">
                <span className="text-[#8EA5A3]">Severity:</span>
                <select
                  aria-label="Filter by severity"
                  value={filterSeverity}
                  onChange={(e) => {setFilterSeverity(e.target.value);setPage(0);}}
                  className="bg-transparent text-[#EAF4F0] focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
          </div>

          <nav className="incident-pagination" aria-label="Incident pages"><span aria-live="polite">{filteredIncidents.length ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, filteredIncidents.length)} of ${filteredIncidents.length.toLocaleString()} records` : '0 records'}</span><button disabled={safePage===0} onClick={()=>setPage(safePage-1)}>Previous</button><button disabled={(safePage+1)*pageSize>=filteredIncidents.length} onClick={()=>setPage(safePage+1)}>Next</button></nav>
          {/* Incidents Table */}
          <div className="bg-[#0D2023] border border-[rgba(88,213,177,0.15)] rounded-lg shadow-md overflow-hidden flex-1 flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-[#142B2D] border-b border-[rgba(88,213,177,0.2)] text-[#8EA5A3]">
                    <th className="py-3 px-4 font-semibold">Record</th>
                    <th className="py-3 px-4 font-semibold">Classification</th>
                    <th className="py-3 px-4 font-semibold">Source IP</th>
                    <th className="py-3 px-4 font-semibold">Target IP</th>
                    <th className="py-3 px-4 font-semibold">Proto/Port</th>
                    <th className="py-3 px-4 font-semibold">Model score / source</th>
                    <th className="py-3 px-4 font-semibold">Severity</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Timestamp</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(88,213,177,0.08)]">
                  {!filteredIncidents.length&&<tr><td colSpan={10} className="table-empty">No incidents match this view. Analyze a dataset to see flagged records, or clear the filters.</td></tr>}
                  {visibleIncidents.map((inc) => {
                    const sevColor = getSeverityColor(inc.severity);

                    return (
                      <tr
                        key={inc.id}
                        className="hover:bg-[#142B2D]/40 transition-colors group"
                      >
                        <td title={inc.id} className="py-3 px-4 text-[#58D5B1] font-bold">#{inc.id.split(":").at(-1)}</td>
                        <td className="py-3 px-4 text-[#EAF4F0] font-semibold">{inc.attackType}</td>
                        <td className="py-3 px-4 text-[#EAF4F0]">{inc.sourceIp || 'Not available'}</td>
                        <td className="py-3 px-4 text-[#8EA5A3]">{inc.destinationIp || 'Not available'}</td>
                        <td className="py-3 px-4 text-[#8EA5A3]">{inc.protocol} : {inc.port || 'Not available'}</td>
                        <td className="py-3 px-4">
                          <span className="font-bold" style={{ color: sevColor }}>
                            {inc.probability===null?'Sensor alert':(inc.probability * 100).toFixed(1)+'%'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                            style={{
                              backgroundColor: `${sevColor}22`,
                              color: sevColor,
                              border: `1px solid ${sevColor}44`,
                            }}
                          >
                            {inc.severity}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              inc.status === 'New'
                                ? 'bg-[#F45B69]/15 text-[#FF8590] border border-[#F45B69]/30'
                                : inc.status === 'Investigating'
                                ? 'bg-[#EAB65B]/15 text-[#EAB65B] border border-[#EAB65B]/30'
                                : inc.status === 'Reviewed'
                                ? 'bg-[#58D5B1]/15 text-[#58D5B1] border border-[#58D5B1]/30'
                                : 'bg-[#8EA5A3]/15 text-[#8EA5A3] border border-[#8EA5A3]/30'
                            }`}
                          >
                            {inc.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#8EA5A3]">{inc.timestamp || 'Not available'}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleOpenEdit(inc)}
                            className="px-2.5 py-1 rounded bg-[#142B2D] hover:bg-[#58D5B1]/20 text-[#58D5B1] border border-[rgba(88,213,177,0.2)] transition-colors flex items-center gap-1.5 ml-auto"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Triage</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Modal for Triaging Incident */}
      {activeEditingIncident && (
        <Modal label="Triage incident" onClose={()=>setActiveEditingIncident(null)} className="incident-modal">
          <div className="w-full max-w-lg bg-[#071013] border border-[rgba(88,213,177,0.3)] rounded-lg shadow-2xl p-6 font-mono text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(88,213,177,0.15)]">
              <h3 className="text-sm font-bold text-[#EAF4F0] font-heading flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#F45B69]" />
                Triage Incident: {activeEditingIncident.id}
              </h3>
              <button
                aria-label="Close incident editor"
                onClick={() => setActiveEditingIncident(null)}
                className="text-[#8EA5A3] hover:text-[#EAF4F0]"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[#8EA5A3] block mb-1">Investigation State:</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['New', 'Investigating', 'Reviewed', 'Dismissed'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setEditStatus(s)}
                      className={`py-1.5 rounded border transition-colors ${
                        editStatus === s
                          ? 'bg-[#58D5B1] text-[#071013] font-bold border-[#58D5B1]'
                          : 'bg-[#142B2D] border-[rgba(88,213,177,0.2)] text-[#8EA5A3]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="incident-notes" className="text-[#8EA5A3] block mb-1">Analyst Notes & Findings:</label>
                <textarea
                  id="incident-notes"
                  name="analystNotes"
                  aria-label="Analyst notes and findings"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={4}
                  className="w-full p-3 bg-[#0D2023] border border-[rgba(88,213,177,0.2)] rounded text-[#EAF4F0] focus:outline-none focus:border-[#58D5B1]"
                  placeholder="Record containment actions, firewall updates, or anomaly explanations..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[rgba(88,213,177,0.15)]">
              <button
                onClick={() => setActiveEditingIncident(null)}
                className="px-4 py-2 rounded bg-[#142B2D] text-[#8EA5A3] hover:text-[#EAF4F0]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveIncident}
                className="px-4 py-2 rounded bg-[#58D5B1] text-[#071013] font-bold hover:bg-[#A4E8D5] flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Incident State</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
