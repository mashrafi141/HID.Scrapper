/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from 'react';

export interface GestureControllerProps {
  children: React.ReactNode;
  onSingleTap: () => void;
  onLongPressStart: () => void;
  onLongPressEnd: () => void;
  onSwipeStart?: (clientX: number, clientY: number, isLeftHalf: boolean) => void;
  onSwipeProgress?: (deltaX: number, deltaY: number) => void;
  onSwipeEnd?: () => void;
  onHorizontalPageSwipe?: (direction: 'left' | 'right') => void;
  onVerticalDragProgress?: (deltaY: number) => void;
  onVerticalDragEnd?: (deltaY: number, velocityY: number) => void;
  isLocked?: boolean;
  className?: string;
}

export type GestureState = 'IDLE' | 'TOUCH_START' | 'WAITING_FOR_LONG_PRESS' | 'LONG_PRESS_ACTIVE' | 'TOUCH_END';

export const GestureController: React.FC<GestureControllerProps> = ({
  children,
  onSingleTap,
  onLongPressStart,
  onLongPressEnd,
  onSwipeStart,
  onSwipeProgress,
  onSwipeEnd,
  onHorizontalPageSwipe,
  onVerticalDragProgress,
  onVerticalDragEnd,
  isLocked = false,
  className = "relative w-full h-full",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Explicit State Machine Ref
  const gestureStateRef = useRef<GestureState>('IDLE');
  
  // Interaction Tracking Refs
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const hasMovedRef = useRef(false);
  const isSwipingRef = useRef(false);
  const isVerticalDraggingRef = useRef(false);
  
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Force safety: Ensure clean state on unmount
  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
      if (gestureStateRef.current === 'LONG_PRESS_ACTIVE') {
        console.log('[GestureController] Unmount: PlaybackRate -> 1');
        onLongPressEnd();
      }
      gestureStateRef.current = 'IDLE';
    };
  }, [onLongPressEnd]);

  const cancelLongPressTimer = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only capture background gestures on the viewer background, not on buttons/inputs/controls
    if ((e.target as HTMLElement).closest('button') || 
        (e.target as HTMLElement).closest('input') || 
        (e.target as HTMLElement).closest('[role="menu"]') || 
        (e.target as HTMLElement).closest('a') ||
        (e.target as HTMLElement).closest('#volume-slider') ||
        (e.target as HTMLElement).closest('#btn-player-playpause') ||
        (e.target as HTMLElement).closest('#btn-player-mute')) {
      return;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // Safe fallback if pointer capture fails
    }
    
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = Date.now();

    // Ignore if another finger touches the screen (Multi-touch cancels long press and tap)
    if (activePointersRef.current.size > 1) {
      cancelLongPressTimer();
      if (gestureStateRef.current === 'LONG_PRESS_ACTIVE') {
        onLongPressEnd();
      }
      gestureStateRef.current = 'IDLE';
      isVerticalDraggingRef.current = false;
      isSwipingRef.current = false;
      return;
    }

    if (activePointersRef.current.size === 1) {
      touchStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        time: now,
      };
      hasMovedRef.current = false;
      isSwipingRef.current = false;
      isVerticalDraggingRef.current = false;

      // Gesture State Machine Transitions
      gestureStateRef.current = 'WAITING_FOR_LONG_PRESS';

      cancelLongPressTimer();
      
      if (!isLocked) {
        longPressTimeoutRef.current = setTimeout(() => {
          if (gestureStateRef.current === 'WAITING_FOR_LONG_PRESS' && activePointersRef.current.size === 1 && !hasMovedRef.current) {
            gestureStateRef.current = 'LONG_PRESS_ACTIVE';
            onLongPressStart();
          }
        }, 500); // 500ms long press duration
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (isLocked) return;

    if (activePointersRef.current.size === 1) {
      const deltaX = e.clientX - touchStartRef.current.x;
      const deltaY = e.clientY - touchStartRef.current.y;
      const distance = Math.hypot(deltaX, deltaY);

      // Cancel long press immediately if finger moves beyond movement threshold (10px)
      if (distance > 10) {
        if (gestureStateRef.current === 'WAITING_FOR_LONG_PRESS') {
          cancelLongPressTimer();
          gestureStateRef.current = 'IDLE';
        }
        
        if (!hasMovedRef.current) {
          hasMovedRef.current = true;
          
          if (Math.abs(deltaY) > Math.abs(deltaX) && onVerticalDragProgress) {
            isVerticalDraggingRef.current = true;
          } else if (containerRef.current && gestureStateRef.current !== 'LONG_PRESS_ACTIVE') {
            const rect = containerRef.current.getBoundingClientRect();
            const isLeftHalf = touchStartRef.current.x < rect.left + rect.width / 2;
            isSwipingRef.current = true;
            if (onSwipeStart) {
              onSwipeStart(touchStartRef.current.x, touchStartRef.current.y, isLeftHalf);
            }
          }
        }
      }

      if (isVerticalDraggingRef.current && onVerticalDragProgress) {
        onVerticalDragProgress(deltaY);
      } else if (isSwipingRef.current && gestureStateRef.current !== 'LONG_PRESS_ACTIVE') {
        if (onSwipeProgress) {
          onSwipeProgress(deltaX, deltaY);
        }
      }
    } else if (activePointersRef.current.size > 1) {
      // Pinch / multi-touch gesture started, cancel long press
      if (gestureStateRef.current === 'WAITING_FOR_LONG_PRESS' || gestureStateRef.current === 'LONG_PRESS_ACTIVE') {
        cancelLongPressTimer();
        if (gestureStateRef.current === 'LONG_PRESS_ACTIVE') {
          onLongPressEnd();
        }
        gestureStateRef.current = 'IDLE';
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Safe fallback
    }

    cancelLongPressTimer();

    const currentState = gestureStateRef.current;
    gestureStateRef.current = 'TOUCH_END';

    if (currentState === 'LONG_PRESS_ACTIVE') {
      onLongPressEnd();
      gestureStateRef.current = 'IDLE';
      return;
    }

    if (isVerticalDraggingRef.current) {
      isVerticalDraggingRef.current = false;
      const deltaY = e.clientY - touchStartRef.current.y;
      const deltaTime = Date.now() - touchStartRef.current.time;
      const velocityY = deltaY / Math.max(1, deltaTime);
      if (onVerticalDragEnd) {
        onVerticalDragEnd(deltaY, velocityY);
      }
      gestureStateRef.current = 'IDLE';
      return;
    }

    if (currentState === 'WAITING_FOR_LONG_PRESS') {
      const deltaX = e.clientX - touchStartRef.current.x;
      const deltaY = e.clientY - touchStartRef.current.y;
      const distance = Math.hypot(deltaX, deltaY);
      const deltaTime = Date.now() - touchStartRef.current.time;

      // Tap Logic (Only if touch held for < 500ms and user did not move)
      if (!hasMovedRef.current && distance <= 10 && deltaTime < 500) {
        onSingleTap();
      }
    }

    if (isSwipingRef.current) {
      isSwipingRef.current = false;
      if (onSwipeEnd) {
        onSwipeEnd();
      }

      const deltaX = e.clientX - touchStartRef.current.x;
      const deltaY = e.clientY - touchStartRef.current.y;

      // Check for Quick Swipe to change items (Horizontal Page Navigation)
      if (!isLocked && Math.abs(deltaX) > 110 && Math.abs(deltaY) < 60 && onHorizontalPageSwipe) {
        if (deltaX > 0) {
          onHorizontalPageSwipe('left');
        } else {
          onHorizontalPageSwipe('right');
        }
      }
    }

    gestureStateRef.current = 'IDLE';
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    cancelLongPressTimer();
    
    console.log('[GestureController] TouchCancel / PointerCancel');
    gestureStateRef.current = 'TOUCH_END';
    console.log('[GestureController] TouchEnd');
    
    if (gestureStateRef.current === 'LONG_PRESS_ACTIVE') {
      onLongPressEnd();
    }
    
    if (isSwipingRef.current) {
      isSwipingRef.current = false;
      if (onSwipeEnd) {
        onSwipeEnd();
      }
    }

    gestureStateRef.current = 'IDLE';
    console.log('[GestureController] Cleanup Complete');
  };

  const handleLostPointerCapture = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    cancelLongPressTimer();
    
    console.log('[GestureController] LostPointerCapture');
    gestureStateRef.current = 'TOUCH_END';
    console.log('[GestureController] TouchEnd');
    
    if (gestureStateRef.current === 'LONG_PRESS_ACTIVE') {
      onLongPressEnd();
    }
    
    if (isSwipingRef.current) {
      isSwipingRef.current = false;
      if (onSwipeEnd) {
        onSwipeEnd();
      }
    }

    gestureStateRef.current = 'IDLE';
    console.log('[GestureController] Cleanup Complete');
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostPointerCapture}
      className={className}
    >
      {children}
    </div>
  );
};

export default GestureController;
