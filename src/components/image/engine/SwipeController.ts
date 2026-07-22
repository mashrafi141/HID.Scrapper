/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SwipeController = {
  SWIPE_THRESHOLD_X: 80,
  SWIPE_THRESHOLD_Y: 120,
  SWIPE_VELOCITY_THRESHOLD: 0.45,

  /**
   * Analyzes a finished swipe-x gesture and decides if a page transition is justified.
   */
  evaluateSwipeX(
    deltaX: number,
    durationMs: number,
    hasPrev: boolean,
    hasNext: boolean
  ): 'prev' | 'next' | 'snap-back' {
    const velocityX = Math.abs(deltaX) / Math.max(1, durationMs); // px/ms

    if (Math.abs(deltaX) > this.SWIPE_THRESHOLD_X || velocityX > this.SWIPE_VELOCITY_THRESHOLD) {
      if (deltaX > 0 && hasPrev) {
        return 'prev';
      } else if (deltaX < 0 && hasNext) {
        return 'next';
      }
    }
    return 'snap-back';
  },

  /**
   * Analyzes a vertical pull-down swipe to trigger closing/dismissal.
   */
  evaluateSwipeY(deltaY: number, durationMs: number): 'close' | 'snap-back' {
    const velocityY = deltaY / Math.max(1, durationMs); // px/ms

    if (deltaY > this.SWIPE_THRESHOLD_Y || velocityY > this.SWIPE_VELOCITY_THRESHOLD) {
      return 'close';
    }
    return 'snap-back';
  }
};
