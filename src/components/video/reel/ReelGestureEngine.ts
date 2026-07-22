/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { MotionValue } from 'motion/react';

interface ReelGestureEngineProps {
  y: MotionValue<number>;
  isControlsLocked: boolean;
  currentIndex: number;
  totalItems: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onNavigateNext: () => void;
  onNavigatePrevious: () => void;
  onCancelNavigation: () => void;
}

export function useReelGestureEngine({
  y,
  isControlsLocked,
  currentIndex,
  totalItems,
  containerRef,
  onNavigateNext,
  onNavigatePrevious,
  onCancelNavigation,
}: ReelGestureEngineProps) {
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ y: 0, time: 0, valueY: 0 });
  const containerHeightRef = useRef<number>(window.innerHeight);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isControlsLocked) return;

    // Prevent capturing gestures on sliders, buttons, or controls
    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('input') ||
      (e.target as HTMLElement).closest('[role="menu"]') ||
      (e.target as HTMLElement).closest('#volume-slider') ||
      (e.target as HTMLElement).closest('#btn-player-playpause') ||
      (e.target as HTMLElement).closest('#btn-player-mute')
    ) {
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    const H = rect ? rect.height : window.innerHeight;
    containerHeightRef.current = H;

    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragStartRef.current = {
      y: e.clientY,
      time: Date.now(),
      valueY: y.get(),
    };

    if ('vibrate' in navigator) navigator.vibrate(5);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;

    const deltaY = e.clientY - dragStartRef.current.y;
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < totalItems - 1;

    let adjustedDeltaY = deltaY;
    if (!hasPrev && deltaY > 0) {
      // Add rubber resistance for boundary
      adjustedDeltaY = deltaY * 0.35;
    } else if (!hasNext && deltaY < 0) {
      // Add rubber resistance for boundary
      adjustedDeltaY = deltaY * 0.35;
    }

    y.set(adjustedDeltaY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);

    const deltaY = e.clientY - dragStartRef.current.y;
    const deltaTime = Date.now() - dragStartRef.current.time;
    const velocityY = deltaY / Math.max(1, deltaTime); // px/ms

    const H = containerHeightRef.current || window.innerHeight;
    const thresholdDist = H / 5; // 20% height
    const thresholdVel = 0.45; // swift flick

    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < totalItems - 1;

    if (deltaY < -thresholdDist || velocityY < -thresholdVel) {
      if (hasNext) {
        onNavigateNext();
      } else {
        onCancelNavigation();
      }
    } else if (deltaY > thresholdDist || velocityY > thresholdVel) {
      if (hasPrev) {
        onNavigatePrevious();
      } else {
        onCancelNavigation();
      }
    } else {
      onCancelNavigation();
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onCancelNavigation();
  };

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    isDragging: isDraggingRef.current,
  };
}
