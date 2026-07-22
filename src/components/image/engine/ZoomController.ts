/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const ZoomController = {
  MIN_SCALE: 1.0,
  MAX_SCALE: 10.0,
  DOUBLE_TAP_SCALE: 2.0,

  /**
   * Computes the new scale based on a pinch ratio relative to a baseline scale.
   * Employs slight elastic resistance beyond bounds before final spring-back.
   */
  calculatePinchScale(baseScale: number, ratio: number): number {
    let target = baseScale * ratio;
    
    // Slight elastic resistance beyond limits
    if (target < this.MIN_SCALE) {
      target = this.MIN_SCALE - Math.log(1 + (this.MIN_SCALE - target)) * 0.15;
    } else if (target > this.MAX_SCALE) {
      target = this.MAX_SCALE + Math.log(1 + (target - this.MAX_SCALE)) * 0.35;
    }

    return target;
  },

  /**
   * Determines the next scale and centered translation offset for a double tap gesture.
   */
  getDoubleTapState(
    currentScale: number,
    tapX: number,
    tapY: number,
    containerWidth: number,
    containerHeight: number
  ) {
    if (currentScale > 1.05) {
      // Zoom back out to fit
      return {
        scale: this.MIN_SCALE,
        offset: { x: 0, y: 0 },
      };
    } else {
      // Zoom in to tap target
      const targetScale = this.DOUBLE_TAP_SCALE;
      
      // Calculate how far tap is from center
      const centerX = containerWidth / 2;
      const centerY = containerHeight / 2;
      
      const dx = tapX - centerX;
      const dy = tapY - centerY;

      // Calculate shift to center the tap point at the target scale
      return {
        scale: targetScale,
        offset: {
          x: -dx * (targetScale - 1),
          y: -dy * (targetScale - 1),
        },
      };
    }
  },

  /**
   * Clamps and returns a final scale when a pinch gesture is completed.
   */
  clampOnRelease(scale: number): number {
    return Math.max(this.MIN_SCALE, Math.min(this.MAX_SCALE, scale));
  }
};
