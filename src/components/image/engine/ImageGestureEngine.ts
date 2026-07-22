/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { ZoomController } from './ZoomController';
import { PanController, Offset2D } from './PanController';
import { SwipeController } from './SwipeController';

interface ImageGestureEngineProps {
  scale: number;
  setScale: (scale: number) => void;
  offset: Offset2D;
  setOffset: (offset: Offset2D) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  imgRef: React.RefObject<HTMLImageElement | null>;
  onSingleTap: () => void;
}

export function useImageGestureEngine({
  scale,
  setScale,
  offset,
  setOffset,
  onNext,
  onPrev,
  onClose,
  hasPrev,
  hasNext,
  containerRef,
  imgRef,
  onSingleTap,
}: ImageGestureEngineProps) {
  const isDraggingRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const baseOffsetRef = useRef<Offset2D>({ x: 0, y: 0 });
  const baseScaleRef = useRef(1);
  const initialPinchDistanceRef = useRef(0);
  const gestureTypeRef = useRef<'none' | 'swipe-x' | 'swipe-down' | 'pan' | 'pinch'>('none');
  const lastTapRef = useRef({ x: 0, y: 0, time: 0 });
  const initialFocalPointRef = useRef<Offset2D>({ x: 0, y: 0 });

  const getContainerDimensions = () => {
    if (!containerRef.current) return { width: window.innerWidth, height: window.innerHeight };
    const rect = containerRef.current.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  const getImageDimensions = () => {
    if (!imgRef.current) return { width: 1, height: 1 };
    return {
      width: imgRef.current.naturalWidth || imgRef.current.clientWidth || 800,
      height: imgRef.current.naturalHeight || imgRef.current.clientHeight || 600,
    };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touches = (Array.from(e.touches) as React.Touch[]).map((t) => ({
      x: t.clientX,
      y: t.clientY,
      time: Date.now(),
    }));

    touchStartRef.current = touches;
    baseOffsetRef.current = { ...offset };
    baseScaleRef.current = scale;

    // PINCH: Multiple Touches
    if (touches.length === 2) {
      e.preventDefault();
      initialPinchDistanceRef.current = Math.hypot(
        touches[0].x - touches[1].x,
        touches[0].y - touches[1].y
      );
      gestureTypeRef.current = 'pinch';

      const midpointX = (touches[0].x + touches[1].x) / 2;
      const midpointY = (touches[0].y + touches[1].y) / 2;

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const cCenterX = rect.left + rect.width / 2;
        const cCenterY = rect.top + rect.height / 2;
        initialFocalPointRef.current = {
          x: midpointX - cCenterX,
          y: midpointY - cCenterY,
        };
      } else {
        initialFocalPointRef.current = { x: 0, y: 0 };
      }
    } else if (touches.length === 1) {
      isDraggingRef.current = true;
      gestureTypeRef.current = 'none';

      const now = Date.now();
      lastTapRef.current = { x: touches[0].x, y: touches[0].y, time: now };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartRef.current.length === 0) return;

    const touches = (Array.from(e.touches) as React.Touch[]).map((t) => ({ x: t.clientX, y: t.clientY }));

    // 1. PINCH GESTURE
    if (e.touches.length === 2 && gestureTypeRef.current === 'pinch') {
      e.preventDefault();
      const dist = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
      const ratio = dist / (initialPinchDistanceRef.current || 1);
      
      const newScale = ZoomController.calculatePinchScale(baseScaleRef.current, ratio);
      
      // Calculate current midpoint relative to container center
      const midpointX = (touches[0].x + touches[1].x) / 2;
      const midpointY = (touches[0].y + touches[1].y) / 2;
      
      const container = containerRef.current;
      let currentF = { x: 0, y: 0 };
      if (container) {
        const rect = container.getBoundingClientRect();
        const cCenterX = rect.left + rect.width / 2;
        const cCenterY = rect.top + rect.height / 2;
        currentF = {
          x: midpointX - cCenterX,
          y: midpointY - cCenterY,
        };
      }
      
      const startF = initialFocalPointRef.current;
      const startOffset = baseOffsetRef.current;
      const startScale = baseScaleRef.current;
      
      const newX = currentF.x - (startF.x - startOffset.x) * (newScale / startScale);
      const newY = currentF.y - (startF.y - startOffset.y) * (newScale / startScale);
      
      setScale(newScale);
      setOffset({ x: newX, y: newY });
      return;
    }

    // 2. SINGLE TOUCH GESTURES
    if (e.touches.length === 1 && touchStartRef.current.length === 1 && isDraggingRef.current) {
      const start = touchStartRef.current[0];
      const current = touches[0];
      const deltaX = current.x - start.x;
      const deltaY = current.y - start.y;

      if (gestureTypeRef.current === 'none') {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (scale > 1.01) {
          gestureTypeRef.current = 'pan';
        } else {
          if (absY > absX && absY > 10) {
            gestureTypeRef.current = 'swipe-down';
          } else if (absX > absY && absX > 10) {
            gestureTypeRef.current = 'swipe-x';
          }
        }
      }

      const type = gestureTypeRef.current;

      if (type === 'pan') {
        e.preventDefault();
        const { width: cW, height: cH } = getContainerDimensions();
        const { width: iW, height: iH } = getImageDimensions();
        const { maxX, maxY } = PanController.getBoundaries(cW, cH, iW, iH, scale);

        const newX = baseOffsetRef.current.x + deltaX;
        const newY = baseOffsetRef.current.y + deltaY;

        setOffset({
          x: PanController.applyRubberBand(newX, maxX),
          y: PanController.applyRubberBand(newY, maxY),
        });
      } else if (type === 'swipe-down') {
        e.preventDefault();
        setOffset({ x: 0, y: Math.max(0, deltaY) });
      } else if (type === 'swipe-x') {
        e.preventDefault();
        setOffset({ x: deltaX, y: 0 });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    isDraggingRef.current = false;
    const gesture = gestureTypeRef.current;
    gestureTypeRef.current = 'none';

    const touchList = touchStartRef.current;
    touchStartRef.current = [];

    if (gesture === 'pinch') {
      const finalScale = ZoomController.clampOnRelease(scale);
      setScale(finalScale);
      if (finalScale <= 1.01) {
        setScale(1);
        setOffset({ x: 0, y: 0 });
      } else {
        const { width: cW, height: cH } = getContainerDimensions();
        const { width: iW, height: iH } = getImageDimensions();
        const { maxX, maxY } = PanController.getBoundaries(cW, cH, iW, iH, finalScale);
        setOffset(PanController.clampOnRelease(offset, maxX, maxY));
      }
      return;
    }

    if (touchList.length === 1) {
      const start = touchList[0];
      const deltaX = e.changedTouches[0].clientX - start.x;
      const deltaY = e.changedTouches[0].clientY - start.y;
      const deltaTime = Date.now() - start.time;

      if (gesture === 'pan') {
        const { width: cW, height: cH } = getContainerDimensions();
        const { width: iW, height: iH } = getImageDimensions();
        const { maxX, maxY } = PanController.getBoundaries(cW, cH, iW, iH, scale);
        setOffset(PanController.clampOnRelease(offset, maxX, maxY));
      } else if (gesture === 'swipe-down') {
        const action = SwipeController.evaluateSwipeY(deltaY, deltaTime);
        if (action === 'close') {
          onClose();
        } else {
          setOffset({ x: 0, y: 0 });
        }
      } else if (gesture === 'swipe-x') {
        const action = SwipeController.evaluateSwipeX(deltaX, deltaTime, hasPrev, hasNext);
        if (action === 'prev') {
          onPrev();
        } else if (action === 'next') {
          onNext();
        } else {
          setOffset({ x: 0, y: 0 });
        }
      } else if (gesture === 'none') {
        if (deltaTime < 250) {
          onSingleTap();
        }
      }
    }
  };

  // DESKTOP: Pointer Events (supporting Mouse Drag & Swipe & Double Tap)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;

    const clickData = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
    };
    touchStartRef.current = [clickData];
    baseOffsetRef.current = { ...offset };
    baseScaleRef.current = scale;
    gestureTypeRef.current = 'none';

    // Desktop Double Click / Double Tap
    const now = Date.now();
    lastTapRef.current = { x: e.clientX, y: e.clientY, time: now };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || touchStartRef.current.length === 0) return;

    const start = touchStartRef.current[0];
    const deltaX = e.clientX - start.x;
    const deltaY = e.clientY - start.y;

    if (gestureTypeRef.current === 'none') {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (scale > 1.01) {
        gestureTypeRef.current = 'pan';
      } else {
        if (absY > absX && absY > 10) {
          gestureTypeRef.current = 'swipe-down';
        } else if (absX > absY && absX > 10) {
          gestureTypeRef.current = 'swipe-x';
        }
      }
    }

    const type = gestureTypeRef.current;

    if (type === 'pan') {
      const { width: cW, height: cH } = getContainerDimensions();
      const { width: iW, height: iH } = getImageDimensions();
      const { maxX, maxY } = PanController.getBoundaries(cW, cH, iW, iH, scale);

      const newX = baseOffsetRef.current.x + deltaX;
      const newY = baseOffsetRef.current.y + deltaY;

      setOffset({
        x: PanController.applyRubberBand(newX, maxX),
        y: PanController.applyRubberBand(newY, maxY),
      });
    } else if (type === 'swipe-down') {
      setOffset({ x: 0, y: Math.max(0, deltaY) });
    } else if (type === 'swipe-x') {
      setOffset({ x: deltaX, y: 0 });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);

    const gesture = gestureTypeRef.current;
    gestureTypeRef.current = 'none';

    const startList = touchStartRef.current;
    touchStartRef.current = [];

    if (startList.length === 1) {
      const start = startList[0];
      const deltaX = e.clientX - start.x;
      const deltaY = e.clientY - start.y;
      const deltaTime = Date.now() - start.time;

      if (gesture === 'pan') {
        const { width: cW, height: cH } = getContainerDimensions();
        const { width: iW, height: iH } = getImageDimensions();
        const { maxX, maxY } = PanController.getBoundaries(cW, cH, iW, iH, scale);
        setOffset(PanController.clampOnRelease(offset, maxX, maxY));
      } else if (gesture === 'swipe-down') {
        const action = SwipeController.evaluateSwipeY(deltaY, deltaTime);
        if (action === 'close') {
          onClose();
        } else {
          setOffset({ x: 0, y: 0 });
        }
      } else if (gesture === 'swipe-x') {
        const action = SwipeController.evaluateSwipeX(deltaX, deltaTime, hasPrev, hasNext);
        if (action === 'prev') {
          onPrev();
        } else if (action === 'next') {
          onNext();
        } else {
          setOffset({ x: 0, y: 0 });
        }
      } else if (gesture === 'none') {
        if (deltaTime < 250) {
          onSingleTap();
        }
      }
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    touchStartRef.current = [];
    gestureTypeRef.current = 'none';
    setOffset({ x: 0, y: 0 });
  };

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    gestureType: gestureTypeRef.current,
  };
}
