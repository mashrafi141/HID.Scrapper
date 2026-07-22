/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Home, ChevronRight } from 'lucide-react';

interface BreadcrumbsProps {
  currentPath: string; // e.g. "Folder/Sub/SubSub" or ""
  onNavigate: (index: number) => void; // -1 means root, others represent index in path
}

export default function Breadcrumbs({ currentPath, onNavigate }: BreadcrumbsProps) {
  const segments = currentPath ? currentPath.split('/') : [];

  return (
    <div className="w-full flex items-center gap-1.5 overflow-x-auto py-3 px-1 no-scrollbar select-none">
      {/* Root Node */}
      <button
        id="breadcrumb-root"
        onClick={() => onNavigate(-1)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-sans font-medium transition-colors cursor-pointer shrink-0
          ${segments.length === 0 
            ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20' 
            : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }
        `}
      >
        <Home className="h-4 w-4" />
        <span>Vault Root</span>
      </button>

      {/* Path segments */}
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        // Clean leading dots for aesthetic elegance, e.g. ".mal" -> "mal"
        const displayName = segment.startsWith('.') ? segment.slice(1) : segment;

        return (
          <React.Fragment key={index}>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />
            <button
              id={`breadcrumb-${segment}`}
              onClick={() => onNavigate(index)}
              disabled={isLast}
              className={`px-2.5 py-1.5 rounded-lg text-sm font-sans font-medium transition-colors shrink-0
                ${isLast 
                  ? 'text-white bg-slate-900 border border-slate-800 font-semibold' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer'
                }
              `}
            >
              <span>{displayName}</span>
              {segment.startsWith('.') && (
                <span className="ml-1 text-[10px] font-mono font-normal text-amber-500">(hidden)</span>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
