/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { VaultMedia } from '../types/vault';
import MediaCard from './MediaCard';

interface VirtualGridProps {
  mediaList: VaultMedia[];
  selectedMedia: Record<string, VaultMedia>;
  isInSelectionMode: boolean;
  onSelect: (media: VaultMedia) => void;
  onOpen: (media: VaultMedia) => void;
}

const CHUNK_SIZE = 12;

interface VirtualBlockProps {
  items: VaultMedia[];
  startIndex: number;
  selectedMedia: Record<string, VaultMedia>;
  isInSelectionMode: boolean;
  onSelect: (media: VaultMedia) => void;
  onOpen: (media: VaultMedia) => void;
}

function VirtualBlock({
  items,
  selectedMedia,
  isInSelectionMode,
  onSelect,
  onOpen,
}: VirtualBlockProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '800px 0px', threshold: 0.01 } // Generous 800px margin for zero-blank scrolling
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        contentVisibility: 'auto' as any,
        containIntrinsicSize: 'auto 960px' as any,
      }}
      className="w-full min-h-[900px] sm:min-h-[600px] md:min-h-[450px] lg:min-h-[320px] transition-all duration-150"
    >
      {isVisible ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pb-3">
          {items.map((media) => (
            <MediaCard
              key={media.path}
              media={media}
              isSelected={!!selectedMedia[media.path]}
              isInSelectionMode={isInSelectionMode}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <div className="w-full h-full bg-transparent" />
      )}
    </div>
  );
}

const VirtualBlockMemo = React.memo(VirtualBlock);

export default function VirtualGrid({
  mediaList,
  selectedMedia,
  isInSelectionMode,
  onSelect,
  onOpen,
}: VirtualGridProps) {
  // Memoize chunks to completely eliminate recalculations and GC thrashing on scroll
  const chunks = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < mediaList.length; i += CHUNK_SIZE) {
      arr.push({
        items: mediaList.slice(i, i + CHUNK_SIZE),
        startIndex: i,
      });
    }
    return arr;
  }, [mediaList]);

  return (
    <div className="w-full space-y-0">
      {chunks.map((chunk) => (
        <VirtualBlockMemo
          key={chunk.startIndex}
          items={chunk.items}
          startIndex={chunk.startIndex}
          selectedMedia={selectedMedia}
          isInSelectionMode={isInSelectionMode}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
