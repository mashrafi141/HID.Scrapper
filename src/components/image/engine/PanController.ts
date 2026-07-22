/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Offset2D {
  x: number;
  y: number;
}

export const PanController = {
  /**
   * Calculates maximum permissible pan offsets based on containers and images
   */
  getBoundaries(
    containerWidth: number,
    containerHeight: number,
    imgWidth: number,
    imgHeight: number,
    scale: number
  ) {
    if (scale <= 1) {
      return { maxX: 0, maxY: 0 };
    }

    // Determine the fitting size of the image inside the container
    const containerRatio = containerWidth / containerHeight;
    const imgRatio = imgWidth / imgHeight;

    let displayedWidth = containerWidth;
    let displayedHeight = containerHeight;

    if (imgRatio > containerRatio) {
      // Fit to width
      displayedHeight = containerWidth / imgRatio;
    } else {
      // Fit to height
      displayedWidth = containerHeight * imgRatio;
    }

    const scaledWidth = displayedWidth * scale;
    const scaledHeight = displayedHeight * scale;

    const maxX = Math.max(0, (scaledWidth - containerWidth) / 2);
    const maxY = Math.max(0, (scaledHeight - containerHeight) / 2);

    return { maxX, maxY };
  },

  /**
   * Applies elastic rubber band drag math when panning exceeds the boundaries.
   */
  applyRubberBand(value: number, max: number): number {
    const absVal = Math.abs(value);
    if (absVal <= max) return value;

    const over = absVal - max;
    const sign = Math.sign(value);
    
    // Logarithmic resistance
    const rubber = max + Math.log(1 + over) * 15;
    return sign * rubber;
  },

  /**
   * Restores/snaps coordinates back into boundaries on touch release.
   */
  clampOnRelease(offset: Offset2D, maxX: number, maxY: number): Offset2D {
    return {
      x: Math.max(-maxX, Math.min(maxX, offset.x)),
      y: Math.max(-maxY, Math.min(maxY, offset.y)),
    };
  }
};
