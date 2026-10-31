'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Radar,
  AlertOctagon,
  LineChart,
  FlaskConical,
  Database,
  FileText,
  Settings,
} from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Overview', href: '/overview', icon: LayoutDashboard },
  { name: 'Threat Sonar', href: '/threat-map', icon: Radar },
  { name: 'Incidents', href: '/incidents', icon: AlertOctagon },
  { name: 'Traffic Analytics', href: '/traffic-analytics', icon: LineChart },
  { name: 'Model Laboratory', href: '/model-laboratory', icon: FlaskConical },
  { name: 'Datasets', href: '/datasets', icon: Database },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();

  return (
    <aside className="w-64 h-screen bg-[#071013] border-r border-[rgba(88,213,177,0.12)] flex flex-col justify-between shrink-0 select-none z-30">
      {/* Brand Header */}
      <div>
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[rgba(88,213,177,0.1)]">
          <Link href="/" aria-label="Aegisyn home"><Image src="/brand-mark.png" width={38} height={40} alt="Aegisyn logo" className="brand-logo" priority /></Link>
          <div>
            <p className="text-base font-bold tracking-wider text-[#EAF4F0] font-heading flex items-center gap-1.5">
              AEGISYN <span className="text-[#58D5B1] font-mono text-xs">AI</span>
            </p>
            <p className="text-[10px] tracking-widest text-[#8EA5A3] uppercase font-mono">
              Sonar Threat Platform
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav aria-label="Workspace navigation" className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.name}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-mono transition-all duration-150 ${
                  isActive
                    ? 'bg-[#142B2D] text-[#58D5B1] font-semibold border-l-2 border-[#58D5B1] shadow-[0_0_10px_rgba(88,213,177,0.1)]'
                    : 'text-[#8EA5A3] hover:text-[#EAF4F0] hover:bg-[#0D2023]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#58D5B1]' : 'text-[#8EA5A3]'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

    </aside>
  );
};
