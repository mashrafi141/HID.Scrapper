/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { animate, MotionValue } from 'motion/react';

export const ReelAnimationController = {
  /**
   * Helper to perform spring-based snap animations for sliding transitions.
   */
  animateTo(
    y: MotionValue<number>,
    targetY: number,
    onComplete?: () => void
  ) {
    animate(y, targetY, {
      type: 'spring',
      stiffness: 240,
      damping: 26,
      mass: 0.9,
      onComplete,
    });
  }
};
