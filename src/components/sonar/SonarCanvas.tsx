'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Eye, EyeOff, Layers, AlertTriangle } from 'lucide-react';
import { SonarEvent } from '@/types/threat';
import { polarToCartesian, polarToIsometric, hashString } from '@/utils/sonarCoordinates';
import { selectSonarEvents } from '@/utils/selectSonarEvents';
import { getSeverityColor, SeverityLevel } from '@/tokens';

interface SonarCanvasProps {
  events: SonarEvent[];
  selectedEvent: SonarEvent | null;
  onSelectEvent: (event: SonarEvent | null) => void;
  className?: string;
}

export const SonarCanvas: React.FC<SonarCanvasProps> = ({
  events,
  selectedEvent,
  onSelectEvent,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // The observation field is a snapshot, not a staged playback.
  const [animateScan, setAnimateScan] = useState(true);
  const [viewMode, setViewMode] = useState<'isometric' | 'tactical'>('isometric');
  const sampledEvents = useMemo(() => selectSonarEvents(events, 40), [events]);
  const sensorMode=events.some(e=>e.detectionSource==='suricata');
  const [showBenign, setShowBenign] = useState<boolean>(true);
  const [severityFilter, setSeverityFilter] = useState<SeverityLevel | 'ALL'>('ALL');
  const [protocolFilter, setProtocolFilter] = useState<string>('ALL');

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem('aegisyn-sonar') || localStorage.getItem('aegisyn-replay') || '{}');
      queueMicrotask(() => { if (p.animate === false) setAnimateScan(false); if (p.view === 'tactical') setViewMode('tactical'); if (p.benign === false) setShowBenign(false); });
    } catch { /* Ignore unavailable browser storage. */ }
  }, []);

  // Hover & Tooltip State
  const [hoveredEvent, setHoveredEvent] = useState<SonarEvent | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Internal animation state ref to avoid React rerender jitter at 60fps
  const animStateRef = useRef({
    currentAngle: 0, // In degrees [0, 360)
    lastTime: 0,
    ripples: [] as { x: number; y: number; radius: number; maxRadius: number; color: string; alpha: number }[],
  });

  // Filtered Events
  const filteredEvents = useMemo(() => {
    // Reference-ring layout: stable record hashes spread signals across the field.
    // Probability controls color and elevation; radius does not indicate geography or risk.
    return sampledEvents.map(ev => ({...ev, angle: (hashString(ev.id + '-bearing') >>> 0) % 36000 / 100, radius: .18 + Math.sqrt((hashString(ev.id + '-layout') >>> 0) / 4294967295) * .75})).filter((ev) => {
      if (!showBenign && !ev.predictedMalicious) return false;
      if (severityFilter !== 'ALL' && ev.severity !== severityFilter) return false;
      if (protocolFilter !== 'ALL' && ev.protocol !== protocolFilter) return false;
      return true;
    });
  }, [sampledEvents, showBenign, severityFilter, protocolFilter]);

  const spotlight = hoveredEvent || filteredEvents.filter(e => e.predictedMalicious).at(-1);

  // Main 60 FPS Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animFrameId = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const render = (time: number) => {
      if (animStateRef.current.lastTime === 0) {
        animStateRef.current.lastTime = time;
      }
      const dt = (time - animStateRef.current.lastTime) / 1000;
      animStateRef.current.lastTime = time;

      // Scan motion is decorative and never determines which observations exist.
      if (!reducedMotion && animateScan) {
        const sweepSpeedDegPerSec = 360 / 6.5;
        animStateRef.current.currentAngle =
          (animStateRef.current.currentAngle + sweepSpeedDegPerSec * dt) % 360;
      }

      // Handle canvas high-DPI sizing
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const cx = width / 2;
      const cy = height * .57;
      const maxRadius = viewMode === "isometric" ? Math.min(width * .49, height * 1.1) : Math.min(width, height) * .44;

      ctx.clearRect(0, 0, width, height);

      const isIso = viewMode === 'isometric';
      const tiltFactor = isIso ? 0.52 : 1.0;

      const field = ctx.createRadialGradient(cx, cy, 5, cx, cy, maxRadius);
      field.addColorStop(0, 'rgba(33,116,121,.16)'); field.addColorStop(.5, 'rgba(4,44,59,.16)'); field.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=field;ctx.fillRect(0,0,width,height);
      // 1. Draw Concentric Grid Rings (Canvas fallback/embellishment)
      const ringSteps = Array.from({length: 16}, (_, i) => (i + 1) / 16);
      ringSteps.forEach((step, idx) => {
        ctx.beginPath();
        const rx = maxRadius * step;
        const ry = rx * tiltFactor;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = idx % 4 === 3 ? 'rgba(88, 213, 177, 0.28)' : 'rgba(88, 213, 177, 0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      for (let i = 0; i < 48; i++) {
        const a = i * Math.PI / 24;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * maxRadius, cy + Math.sin(a) * maxRadius * tiltFactor);
        ctx.strokeStyle = i % 4 === 0 ? 'rgba(80,160,166,.19)' : 'rgba(80,160,166,.07)'; ctx.stroke();
      }
      // 2. Draw Sonar Sweep Beam with Trailing Phosphor Fade
      const sweepAngle = animStateRef.current.currentAngle;
      const sweepRad = ((sweepAngle - 90) * Math.PI) / 180;
      const tailAngleDeg = 45; // 45 degree trailing fade
      const tailRad = (tailAngleDeg * Math.PI) / 180;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);

      // Trailing fan sector
      const startAngle = sweepRad - tailRad;
      const steps = 30;

      for (let i = 0; i <= steps; i++) {
        const angle = startAngle + (i / steps) * tailRad;
        const x = cx + maxRadius * Math.cos(angle);
        const y = cy + maxRadius * Math.sin(angle) * tiltFactor;
        ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Create gradient matching the Midnight Sonar palette
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius);
      sweepGrad.addColorStop(0, 'rgba(88, 213, 177, 0.28)');
      sweepGrad.addColorStop(0.7, 'rgba(88, 213, 177, 0.12)');
      sweepGrad.addColorStop(1, 'rgba(88, 213, 177, 0.00)');
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      // Sweep leading edge line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + maxRadius * Math.cos(sweepRad),
        cy + maxRadius * Math.sin(sweepRad) * tiltFactor
      );
      ctx.strokeStyle = 'rgba(164, 232, 213, 0.75)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();

      for (let i=0;i<120;i++) {
        const a=i*Math.PI/60;
        ctx.beginPath(); ctx.moveTo(cx+Math.cos(a)*maxRadius,cy+Math.sin(a)*maxRadius*tiltFactor);
        ctx.lineTo(cx+Math.cos(a)*(maxRadius-(i%5===0?8:3)),cy+Math.sin(a)*(maxRadius-(i%5===0?8:3))*tiltFactor);
        ctx.strokeStyle='rgba(80,160,166,.3)';ctx.stroke();
      }
      // 3. Draw Connecting Attack Arcs (Curved Bezier Lines to center node)
      filteredEvents.forEach((ev) => {
        if (ev.severity === 'critical' || ev.severity === 'high') {
          const pt = isIso
            ? polarToIsometric(ev.angle, ev.radius, ev.elevation, cx, cy, maxRadius, tiltFactor)
            : polarToCartesian(ev.angle, ev.radius, cx, cy, maxRadius);

          const midX = (pt.x + cx) / 2 + Math.sin(ev.angle) * 20;
          const midY = Math.min(pt.y,cy) - (isIso ? 65 : 0);

          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.quadraticCurveTo(midX, midY, cx, cy);
          ctx.strokeStyle =
            ev.severity === 'critical' ? 'rgba(244, 91, 105, 0.58)' : 'rgba(234, 182, 91, 0.52)';
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });

      // 4. Draw Threat Markers and 3D Vertical Pillars
      filteredEvents.forEach((ev) => {
        const isSelected = selectedEvent?.id === ev.id;
        const isHovered = hoveredEvent?.id === ev.id;
        const color = getSeverityColor(ev.severity);

        let pt: { x: number; y: number; baseScreenY?: number; pillarHeight?: number };
        if (isIso) {
          pt = polarToIsometric(ev.angle, ev.radius, ev.elevation, cx, cy, maxRadius, tiltFactor);
        } else {
          pt = polarToCartesian(ev.angle, ev.radius, cx, cy, maxRadius);
        }

        // 3D Vertical Pillar in Isometric Mode for elevated threats
        if (isIso && pt.pillarHeight && pt.pillarHeight > 4) {
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.baseScreenY ?? pt.y);
          ctx.lineTo(pt.x, pt.y);
          ctx.strokeStyle = color;
          ctx.lineWidth = ev.severity === 'critical' ? 2.5 : 1.5;
          ctx.stroke();

          const groundY = pt.baseScreenY ?? pt.y;
          const groundGlow = ctx.createRadialGradient(pt.x,groundY,0,pt.x,groundY,ev.predictedMalicious?22:9);
          groundGlow.addColorStop(0,color+'88'); groundGlow.addColorStop(1,color+'00');
          ctx.save();ctx.translate(pt.x,groundY);ctx.scale(1,tiltFactor);ctx.fillStyle=groundGlow;
          ctx.translate(-pt.x,-groundY);ctx.fillRect(pt.x-25,groundY-25,50,50);ctx.restore();
          for (const ring of [1,2,3]) {ctx.beginPath();ctx.ellipse(pt.x,groundY,(ev.predictedMalicious?6:3)*ring,(ev.predictedMalicious?6:3)*ring*tiltFactor,0,0,Math.PI*2);ctx.strokeStyle=color;ctx.globalAlpha=.6/ring;ctx.lineWidth=.8;ctx.stroke();}ctx.globalAlpha=1;
          // Base ground footprint marker
          ctx.beginPath();
          ctx.ellipse(pt.x, pt.baseScreenY ?? pt.y, 4, 4 * tiltFactor, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(88, 213, 177, 0.2)';
          ctx.fill();
        }

        // Marker Halo / Pulse
        let radiusSize = 3;
        if (ev.severity === 'medium') radiusSize = 4.5;
        if (ev.severity === 'high') radiusSize = 6;
        if (ev.severity === 'critical') radiusSize = 5.5;

        // Outer glow
        if (ev.severity === 'critical' || isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, radiusSize * 2.2, 0, Math.PI * 2);
          ctx.fillStyle =
            ev.severity === 'critical' ? 'rgba(244, 91, 105, 0.28)' : 'rgba(88, 213, 177, 0.25)';
          ctx.fill();
        }

        // Core marker node
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radiusSize, 0, Math.PI * 2);
        ctx.shadowColor = color; ctx.shadowBlur = ev.predictedMalicious ? 13 : 4;
        ctx.fillStyle = color;
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#071013';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Selected indicator ring
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, radiusSize * 3.0, 0, Math.PI * 2);
          ctx.strokeStyle = '#58D5B1';
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });

      // 5. Draw Central Protected Network Node
      ctx.beginPath();
      const centerPulse = 35 + (animateScan && !reducedMotion ? Math.sin(time / 600) * 1.5 : 0);
      ctx.ellipse(cx, cy, centerPulse, centerPulse * tiltFactor, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(88, 213, 177, 0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(88, 213, 177, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      for (const radius of [43,51,64]) {ctx.beginPath();ctx.ellipse(cx,cy,radius,radius*tiltFactor,0,0,Math.PI*2);ctx.strokeStyle='rgba(88,213,177,'+(radius===51?.5:.2)+')';ctx.lineWidth=1;ctx.stroke();}
      ctx.save();ctx.translate(cx,cy-2);ctx.shadowColor='#58d5b1';ctx.shadowBlur=18;
      ctx.fillStyle='#061a21';ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(7,-6);ctx.lineTo(6,2);ctx.quadraticCurveTo(4,7,0,9);ctx.quadraticCurveTo(-4,7,-6,2);ctx.lineTo(-7,-6);ctx.closePath();ctx.strokeStyle='#a4e8d5';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.moveTo(0,-3);ctx.lineTo(0,3);ctx.stroke();ctx.restore();

      if (animateScan && !reducedMotion) animFrameId = requestAnimationFrame(render);
    };

    animFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameId);
  }, [animateScan, viewMode, filteredEvents, selectedEvent, hoveredEvent]);

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  // Hit testing for hover & click
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const cx = rect.width / 2;
      const cy = rect.height * .57;
      const maxRadius = viewMode === "isometric" ? Math.min(rect.width * .49, rect.height * 1.1) : Math.min(rect.width, rect.height) * .44;
      const isIso = viewMode === 'isometric';
      const tiltFactor = isIso ? 0.52 : 1.0;

      let found: SonarEvent | null = null;
      let minDistance = 14;

      for (const ev of filteredEvents) {
        const pt = isIso
          ? polarToIsometric(ev.angle, ev.radius, ev.elevation, cx, cy, maxRadius, tiltFactor)
          : polarToCartesian(ev.angle, ev.radius, cx, cy, maxRadius);

        const dist = Math.hypot(pt.x - mouseX, pt.y - mouseY);
        if (dist < minDistance) {
          minDistance = dist;
          found = ev;
        }
      }

      setHoveredEvent(found);
      if (found) {
        const clampedX = Math.min(mouseX + 16, rect.width - 240);
        const clampedY = Math.max(10, Math.min(mouseY - 20, rect.height - 180));
        setTooltipPos({ x: clampedX, y: clampedY });
      } else {
        setTooltipPos(null);
      }
    },
    [filteredEvents, viewMode]
  );

  const handleClick = useCallback(() => {
    if (hoveredEvent) {
      onSelectEvent(hoveredEvent);
    } else {
      onSelectEvent(null);
    }
  }, [hoveredEvent, onSelectEvent]);

  return (
    <div
      ref={containerRef}
      className={`sonar-panel relative w-full h-full min-h-[480px] bg-[#071013] rounded-lg border border-[rgba(88,213,177,0.15)] overflow-hidden flex flex-col ${className}`}
    >
      {/* Top Telemetry & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-[rgba(88,213,177,0.12)] bg-[#0D2023]/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#58D5B1] animate-pulse" />
            <h2 className="text-sm font-semibold tracking-wide text-[#EAF4F0] uppercase font-mono">
              Threat activity
            </h2>
          </div>
          <span className="px-2 py-0.5 text-[11px] font-mono tracking-wider text-[#A4E8D5] bg-[#142B2D] border border-[rgba(88,213,177,0.25)] rounded">
            {filteredEvents.length} signals
          </span>
        </div>

        {/* All four model-probability bands are shown independently of classification. */}
        <div className="sonar-severity-legend flex items-center gap-4 text-xs font-mono" aria-label="Visible signals by severity">
          {(['low','medium','high','critical'] as const).map(level=><div key={level} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background:getSeverityColor(level)}}/><span className="text-[#8EA5A3] capitalize">{level}</span><span className="text-[#EAF4F0] font-semibold">{filteredEvents.filter(e=>e.severity===level).length}</span></div>)}
        </div>

        {/* Filters & Perspective View Toggles */}
        <div className="flex items-center gap-2">
          {/* Protocol Filter */}
          <select
            aria-label="Filter sonar by protocol"
            value={protocolFilter}
            onChange={(e) => setProtocolFilter(e.target.value)}
            className="px-2.5 py-1 text-xs font-mono bg-[#142B2D] text-[#EAF4F0] border border-[rgba(88,213,177,0.2)] rounded cursor-pointer focus:outline-none focus:border-[#58D5B1]"
          >
            <option value="ALL">All Protocols</option>
            <option value="TCP">TCP Only</option>
            <option value="UDP">UDP Only</option>
            <option value="ICMP">ICMP Only</option>
          </select>

          {/* Perspective Toggle */}
          <button
            onClick={() => setViewMode(viewMode === 'isometric' ? 'tactical' : 'isometric')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono border rounded transition-colors ${
              viewMode === 'isometric'
                ? 'bg-[#58D5B1]/15 border-[#58D5B1] text-[#58D5B1]'
                : 'bg-[#142B2D] border-[rgba(88,213,177,0.2)] text-[#8EA5A3] hover:text-[#EAF4F0]'
            }`}
            title="Toggle 2.5D Isometric / 2D Tactical View"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{viewMode === 'isometric' ? 'Perspective' : 'Tactical'}</span>
          </button>

          {/* Benign Traffic Visibility */}
          <button
            onClick={() => setShowBenign(!showBenign)}
            className={`p-1.5 border rounded transition-colors ${
              showBenign
                ? 'bg-[#142B2D] border-[rgba(88,213,177,0.2)] text-[#58D5B1]'
                : 'bg-[#142B2D] border-[rgba(88,213,177,0.1)] text-[#8EA5A3]'
            }`}
            aria-label={showBenign ? (sensorMode?'Hide unalerted flows':'Hide benign flows') : (sensorMode?'Show unalerted flows':'Show benign flows')}
            aria-pressed={showBenign}
            title={showBenign ? (sensorMode?'Hide unalerted flows':'Hide Benign Flows') : (sensorMode?'Show unalerted flows':'Show Benign Flows')}
          >
            {showBenign ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {events.length === 0 && <div className="sonar-empty-state"><strong>No observations in this view</strong><span>Choose a dataset or clear your search to begin.</span></div>}
      <label className="sonar-accessible-picker">Inspect a visible observation
        <select value={selectedEvent?.id || ''} onChange={e => onSelectEvent(filteredEvents.find(ev => ev.id === e.target.value) || null)}>
          <option value="">Choose observation</option>
          {filteredEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.id}: {ev.severity}, {ev.protocol}, {ev.sourceIp}</option>)}
        </select>
      </label>
      {/* Center Sonar Area with SVG Compass / Range Rings & Canvas */}
      <div className="sonar-stage relative flex-1 w-full min-h-0 overflow-hidden flex items-center justify-center">
        {/* Background Radial Rings SVG Grid */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40">
          <defs>
            <radialGradient id="sonarCenterGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#58D5B1" stopOpacity="0.15" />
              <stop offset="60%" stopColor="#58D5B1" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#071013" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#sonarCenterGlow)" />
        </svg>

        {/* 60 FPS HTML5 Canvas */}
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {setHoveredEvent(null); setTooltipPos(null);}}
          onClick={handleClick}
          className="absolute inset-0 w-full h-full cursor-crosshair z-10"
        />

        {/* Floating Threat Intelligence Hover Card */}
        {hoveredEvent && tooltipPos && (
          <div
            style={{
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
            }}
            className="absolute z-30 pointer-events-none w-56 p-3 bg-[#0D2023]/95 border border-[rgba(88,213,177,0.35)] rounded-md shadow-2xl backdrop-blur-md text-xs font-mono"
          >
            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[rgba(88,213,177,0.15)]">
              <span className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-[#EAF4F0]">
                <AlertTriangle
                  className="w-3.5 h-3.5"
                  style={{ color: getSeverityColor(hoveredEvent.severity) }}
                />
                {hoveredEvent.detectionSource==='suricata'?(hoveredEvent.eventType==='alert'?'SENSOR ALERT':'OBSERVED FLOW'):hoveredEvent.severity.toUpperCase()+' OBSERVATION'}
              </span>
              <span
                className="px-1.5 py-0.2 rounded text-[10px] font-bold"
                style={{
                  backgroundColor: `${getSeverityColor(hoveredEvent.severity)}22`,
                  color: getSeverityColor(hoveredEvent.severity),
                }}
              >
                {hoveredEvent.maliciousProbability===null?(hoveredEvent.sensorPriority===null?'Unclassified':`Priority ${hoveredEvent.sensorPriority}`):(hoveredEvent.maliciousProbability * 100).toFixed(1)+'%'}
              </span>
            </div>

            <div className="space-y-1 text-[#8EA5A3]">
              <div className="flex justify-between">
                <span>Type:</span>
                <span className="text-[#EAF4F0]">{hoveredEvent.attackCategory}</span>
              </div>
              <div className="flex justify-between">
                <span>Source:</span>
                <span className="text-[#EAF4F0]">{hoveredEvent.sourceIp || 'Not available'}</span>
              </div>
              <div className="flex justify-between">
                <span>Target:</span>
                <span className="text-[#EAF4F0]">{hoveredEvent.destinationIp || 'Not available'}</span>
              </div>
              <div className="flex justify-between">
                <span>Protocol:</span>
                <span className="text-[#EAF4F0]">{hoveredEvent.protocol} : {hoveredEvent.port || 'Not available'}</span>
              </div>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span className="text-[#EAF4F0]">{hoveredEvent.flowDuration===null?'Not available':hoveredEvent.flowDuration+'s'}</span>
              </div>
            </div>

            <div className="mt-2.5 pt-1.5 border-t border-[rgba(88,213,177,0.15)] text-[10px] text-[#58D5B1] font-semibold text-center">
              Click marker to inspect telemetry &rarr;
            </div>
          </div>
        )}
      </div>

      {spotlight && !hoveredEvent && <div className="sonar-preview"><h3><span style={{background:getSeverityColor(spotlight.severity)}}/> {spotlight.attackCategory}</h3><dl><dt>Source IP</dt><dd>{spotlight.sourceIp || 'Not available'}</dd><dt>Destination IP</dt><dd>{spotlight.destinationIp || 'Not available'}</dd><dt>Protocol</dt><dd>{spotlight.protocol}</dd><dt>{spotlight.detectionSource==='suricata'?'Sensor priority':'Malicious probability'}</dt><dd style={{color:getSeverityColor(spotlight.severity)}}>{spotlight.maliciousProbability===null?(spotlight.sensorPriority??'Not provided'):(spotlight.maliciousProbability*100).toFixed(1)+'%'}</dd></dl><button onClick={()=>onSelectEvent(spotlight)}>Inspect observation <span>↗</span></button></div>}
      <p className="sonar-layout-note">Up to 40 representative signals · abstract reference rings</p>
      {/* Observation filters */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-[#0D2023]/80 border-t border-[rgba(88,213,177,0.12)] text-xs font-mono z-20">
        <span className="sonar-snapshot-context">{sampledEvents.length} of {events.length} loaded observations</span>

        {/* Severity Filter Pills */}
        <div className="flex items-center gap-1">
          <span className="text-[#8EA5A3] mr-1">Severity:</span>
          {(['ALL', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-2 py-0.5 text-[11px] uppercase rounded border transition-colors ${
                severityFilter === sev
                  ? 'bg-[#58D5B1] text-[#071013] font-bold border-[#58D5B1]'
                  : 'bg-[#142B2D] border-[rgba(88,213,177,0.15)] text-[#8EA5A3] hover:text-[#EAF4F0]'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
