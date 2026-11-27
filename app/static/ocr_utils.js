/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Julian Digital Products
 *
 * BlackMyData - High-Precision OCR & Image Processing Utilities (v1.5.0)
 * Core algorithms: Sauvola Binarization, Contrast Stretching, Projection-Profile Deskew,
 * Box-Rotation & Coordinate Transform, Levenshtein Distance & Fuzzy Matching, IoU.
 */

(function (global) {
  "use strict";

  // ==========================================================================
  // 1. STRING NORMALIZATION & FUZZY MATCHING (Levenshtein)
  // ==========================================================================

  /**
   * Fast Levenshtein distance with O(min(m, n)) space complexity.
   */
  function levenshteinDistance(s1, s2) {
    if (s1 === s2) return 0;
    if (!s1 || s1.length === 0) return (s2 || "").length;
    if (!s2 || s2.length === 0) return s1.length;

    let str1 = s1;
    let str2 = s2;
    if (str1.length > str2.length) {
      str1 = s2;
      str2 = s1;
    }

    const len1 = str1.length;
    const len2 = str2.length;
    let prevRow = new Int32Array(len1 + 1);
    let currRow = new Int32Array(len1 + 1);

    for (let i = 0; i <= len1; i++) {
      prevRow[i] = i;
    }

    for (let j = 1; j <= len2; j++) {
      currRow[0] = j;
      const code2 = str2.charCodeAt(j - 1);
      for (let i = 1; i <= len1; i++) {
        const cost = str1.charCodeAt(i - 1) === code2 ? 0 : 1;
        currRow[i] = Math.min(
          prevRow[i] + 1,       // deletion
          currRow[i - 1] + 1,   // insertion
          prevRow[i - 1] + cost // substitution
        );
      }
      const tmp = prevRow;
      prevRow = currRow;
      currRow = tmp;
    }

    return prevRow[len1];
  }

  /**
   * Normalize text for OCR string comparison (remove edge punctuation, normalize spaces & casing).
   */
  function cleanOcrToken(tok) {
    if (!tok) return "";
    return tok
      .replace(/^[.,;:!?"'()[\]{}<>«»„“”\s]+|[.,;:!?"'()[\]{}<>«»„“”\s]+$/g, "")
      .toLowerCase();
  }

  /**
   * Common OCR character confusion normalization (0 -> o, 1 -> l/i, etc.)
   */
  function canonicalizeOcrConfusions(str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[0o]/g, "o")
      .replace(/[1li|]/g, "l")
      .replace(/rn/g, "m");
  }

  /**
   * Determine whether a candidate OCR token matches a target token fuzzy or strictly.
   */
  function isFuzzyTokenMatch(targetTok, candidateTok, category = "name") {
    const tClean = cleanOcrToken(targetTok);
    const cClean = cleanOcrToken(candidateTok);
    if (!tClean || !cClean) return false;

    // Exact match
    if (tClean === cClean) return true;

    // Strict categories: DO NOT fuzzy match to avoid false positives
    const STRICT_CATS = new Set(["email", "emails", "iban", "ibans", "phone", "phones", "id", "ids", "tax_id"]);
    if (STRICT_CATS.has(category.toLowerCase())) {
      return false;
    }

    // Very short tokens must match exactly
    if (tClean.length <= 4) {
      return false;
    }

    // Direct inclusion check if needle is long enough (e.g. compound words)
    if (tClean.length >= 5 && cClean.includes(tClean)) {
      return true;
    }

    // Levenshtein threshold
    const maxDist = tClean.length <= 8 ? 1 : 2;
    const dist = levenshteinDistance(tClean, cClean);
    if (dist <= maxDist) {
      return true;
    }

    // Check with canonical character confusion (e.g. '0' vs 'o', 'rn' vs 'm')
    const canonT = canonicalizeOcrConfusions(tClean);
    const canonC = canonicalizeOcrConfusions(cClean);
    if (canonT === canonC) {
      return true;
    }
    if (canonT.length >= 6 && levenshteinDistance(canonT, canonC) <= 1) {
      return true;
    }

    return false;
  }

  // ==========================================================================
  // 2. BOUNDING BOX GEOMETRY, IOU & ROTATION (Deskew Inverse Mapping)
  // ==========================================================================

  /**
   * Compute Intersection over Union (IoU) of two bounding boxes [x0, y0, x1, y1].
   */
  function calculateIoU(rectA, rectB) {
    if (!rectA || !rectB) return 0;
    const x0 = Math.max(rectA[0], rectB[0]);
    const y0 = Math.max(rectA[1], rectB[1]);
    const x1 = Math.min(rectA[2], rectB[2]);
    const y1 = Math.min(rectA[3], rectB[3]);

    const interW = Math.max(0, x1 - x0);
    const interH = Math.max(0, y1 - y0);
    const interArea = interW * interH;
    if (interArea <= 0) return 0;

    const areaA = Math.max(0, rectA[2] - rectA[0]) * Math.max(0, rectA[3] - rectA[1]);
    const areaB = Math.max(0, rectB[2] - rectB[0]) * Math.max(0, rectB[3] - rectB[1]);
    const unionArea = areaA + areaB - interArea;
    if (unionArea <= 0) return 0;

    return interArea / unionArea;
  }

  /**
   * Check if two rects are nearly identical (< 3px deviation).
   */
  function isSameRect(r1, r2, tol = 3) {
    return (
      Math.abs(r1[0] - r2[0]) < tol &&
      Math.abs(r1[1] - r2[1]) < tol &&
      Math.abs(r1[2] - r2[2]) < tol &&
      Math.abs(r1[3] - r2[3]) < tol
    );
  }

  /**
   * Group word bounding boxes line by line and compute an enclosing rect for each line.
   * Prevents creating a single giant bounding box over multiple lines.
   */
  function groupRectsByLine(rects) {
    if (!Array.isArray(rects) || rects.length === 0) return [];
    if (rects.length === 1) return [[...rects[0]]];

    const lineGroups = [];
    let currentGroup = [rects[0]];

    for (let i = 1; i < rects.length; i++) {
      const r = rects[i];
      const prev = currentGroup[currentGroup.length - 1];
      const prevH = Math.max(1, prev[3] - prev[1]);
      const rH = Math.max(1, r[3] - r[1]);
      const vOverlap = Math.max(0, Math.min(prev[3], r[3]) - Math.max(prev[1], r[1]));
      const isSameLine =
        vOverlap >= 0.45 * Math.min(prevH, rH) &&
        Math.abs((prev[1] + prev[3]) / 2 - (r[1] + r[3]) / 2) < Math.max(prevH, rH) * 0.7;

      if (isSameLine) {
        currentGroup.push(r);
      } else {
        lineGroups.push(currentGroup);
        currentGroup = [r];
      }
    }
    lineGroups.push(currentGroup);

    return lineGroups.map((group) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const r of group) {
        minX = Math.min(minX, r[0]);
        minY = Math.min(minY, r[1]);
        maxX = Math.max(maxX, r[2]);
        maxY = Math.max(maxY, r[3]);
      }
      return [minX, minY, maxX, maxY];
    });
  }

  /**
   * Rotate a 2D point [x, y] around origin [cx, cy] by angle in radians.
   */
  function rotatePoint(x, y, angleRad, cx, cy) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = x - cx;
    const dy = y - cy;
    return [
      cx + dx * cos - dy * sin,
      cy + dx * sin + dy * cos
    ];
  }

  /**
   * Transform an axis-aligned box [x0, y0, x1, y1] on a rotated image back to
   * the original image's unrotated axis-aligned coordinate system.
   * Rotates all 4 corners and computes their enclosing bounding box.
   */
  function rotateBoxToAABB(box, angleRad, cx, cy, clampW = Infinity, clampH = Infinity) {
    if (!angleRad || Math.abs(angleRad) < 1e-4) {
      return [
        Math.max(0, box[0]),
        Math.max(0, box[1]),
        Math.min(clampW, box[2]),
        Math.min(clampH, box[3])
      ];
    }

    const [x0, y0, x1, y1] = box;
    const corners = [
      rotatePoint(x0, y0, angleRad, cx, cy),
      rotatePoint(x1, y0, angleRad, cx, cy),
      rotatePoint(x1, y1, angleRad, cx, cy),
      rotatePoint(x0, y1, angleRad, cx, cy)
    ];

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < 4; i++) {
      const [px, py] = corners[i];
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }

    return [
      Math.max(0, Math.round(minX * 100) / 100),
      Math.max(0, Math.round(minY * 100) / 100),
      Math.min(clampW, Math.round(maxX * 100) / 100),
      Math.min(clampH, Math.round(maxY * 100) / 100)
    ];
  }

  // ==========================================================================
  // 3. IMAGE PREPROCESSING (Contrast Stretch, Sauvola Adaptive Binarization)
  // ==========================================================================

  /**
   * Convert RGBA ImageData to single-channel 8-bit grayscale array using Rec.601 luma.
   */
  function rgbaToGrayscale(data, width, height) {
    const totalPixels = width * height;
    const gray = new Uint8Array(totalPixels);
    let p = 0;
    for (let i = 0; i < totalPixels; i++) {
      // 0.299*R + 0.587*G + 0.114*B
      gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
      p += 4;
    }
    return gray;
  }

  /**
   * Contrast stretching on grayscale image using 1st and 99th percentiles.
   */
  function contrastStretchGrayscale(gray, width, height) {
    const totalPixels = width * height;
    const hist = new Int32Array(256);
    for (let i = 0; i < totalPixels; i++) {
      hist[gray[i]]++;
    }

    const pLowCount = Math.floor(totalPixels * 0.01);
    const pHighCount = Math.floor(totalPixels * 0.99);

    let lowVal = 0;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= pLowCount) {
        lowVal = i;
        break;
      }
    }

    let highVal = 255;
    acc = 0;
    for (let i = 255; i >= 0; i--) {
      acc += hist[i];
      if (acc >= totalPixels - pHighCount) {
        highVal = i;
        break;
      }
    }

    if (highVal <= lowVal) return gray;

    const scale = 255 / (highVal - lowVal);
    const stretched = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      const v = gray[i];
      if (v <= lowVal) stretched[i] = 0;
      else if (v >= highVal) stretched[i] = 255;
      else stretched[i] = Math.min(255, Math.max(0, Math.round((v - lowVal) * scale)));
    }
    return stretched;
  }

  /**
   * Fast Sauvola Adaptive Binarization using 2D Integral Images (Sum and Sum-of-Squares).
   * Threshold = mean * (1 + k * (std / R - 1))
   * Ideal for scanned & photographed documents with non-uniform illumination / shadows.
   */
  function sauvolaBinarize(gray, width, height, windowSize = 31, k = 0.32, R = 128) {
    const totalPixels = width * height;
    const radius = Math.floor(windowSize / 2);

    // Compute integral image and integral image of squares
    // Using Float64Array to prevent overflow on large images (e.g. 3500x2500)
    const intW = width + 1;
    const intH = height + 1;
    const intSum = new Float64Array(intW * intH);
    const intSqSum = new Float64Array(intW * intH);

    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      let rowSqSum = 0;
      const srcRowOffset = y * width;
      const intRowOffset = (y + 1) * intW;
      const prevIntRowOffset = y * intW;

      for (let x = 0; x < width; x++) {
        const val = gray[srcRowOffset + x];
        rowSum += val;
        rowSqSum += val * val;

        const idx = intRowOffset + (x + 1);
        const prevIdx = prevIntRowOffset + (x + 1);
        intSum[idx] = intSum[prevIdx] + rowSum;
        intSqSum[idx] = intSqSum[prevIdx] + rowSqSum;
      }
    }

    const binary = new Uint8Array(totalPixels);

    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      const rowOffset = y * width;

      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(width - 1, x + radius);

        const area = (x1 - x0 + 1) * (y1 - y0 + 1);

        // Rect sum from integral image: D - B - C + A
        const A_idx = y0 * intW + x0;
        const B_idx = y0 * intW + (x1 + 1);
        const C_idx = (y1 + 1) * intW + x0;
        const D_idx = (y1 + 1) * intW + (x1 + 1);

        const sum = intSum[D_idx] - intSum[B_idx] - intSum[C_idx] + intSum[A_idx];
        const sqSum = intSqSum[D_idx] - intSqSum[B_idx] - intSqSum[C_idx] + intSqSum[A_idx];

        const mean = sum / area;
        const variance = Math.max(0, (sqSum / area) - (mean * mean));
        const std = Math.sqrt(variance);

        const threshold = mean * (1 + k * ((std / R) - 1));
        const pixelVal = gray[rowOffset + x];

        // 0 = black (text), 255 = white (background)
        binary[rowOffset + x] = pixelVal <= threshold ? 0 : 255;
      }
    }

    return binary;
  }

  // ==========================================================================
  // 4. PROJECTION-PROFILE DESKEW ANGLE ESTIMATION
  // ==========================================================================

  /**
   * Estimate skew angle in degrees using horizontal projection profile variance.
   * Samples a downscaled or centered crop of the document for speed.
   */
  function estimateDeskewAngle(binary, width, height, maxAngleDeg = 4.5, stepDeg = 0.25) {
    if (!binary || width < 100 || height < 100) return 0;

    // We evaluate variance of horizontal row sums at rotated angles.
    // When text lines are horizontal, rows containing text have high density
    // and inter-line spaces have 0 density, resulting in maximum variance.
    const cx = width / 2;
    const cy = height / 2;

    let bestAngle = 0;
    let maxVariance = -1;

    // Use a vertical sampling step for efficiency
    const sampleYStep = Math.max(1, Math.floor(height / 400));
    const sampleXStep = Math.max(1, Math.floor(width / 300));

    const numAngles = Math.floor((maxAngleDeg * 2) / stepDeg) + 1;

    for (let a = 0; a < numAngles; a++) {
      const angleDeg = -maxAngleDeg + a * stepDeg;
      const angleRad = (angleDeg * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);

      const numBins = Math.floor(height / (sampleYStep * 2));
      const bins = new Float32Array(numBins);

      let totalPoints = 0;
      let sumDensity = 0;

      for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.9); y += sampleYStep) {
        const dy = y - cy;
        const rowOffset = y * width;
        for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.9); x += sampleXStep) {
          // Check if pixel is dark (text)
          if (binary[rowOffset + x] < 128) {
            const dx = x - cx;
            // Projected Y
            const rotY = cy - dx * sin + dy * cos;
            const binIdx = Math.floor((rotY / height) * numBins);
            if (binIdx >= 0 && binIdx < numBins) {
              bins[binIdx]++;
              totalPoints++;
              sumDensity++;
            }
          }
        }
      }

      if (totalPoints < 100) continue;

      const mean = sumDensity / numBins;
      let variance = 0;
      for (let b = 0; b < numBins; b++) {
        const diff = bins[b] - mean;
        variance += diff * diff;
      }

      if (variance > maxVariance) {
        maxVariance = variance;
        bestAngle = angleDeg;
      }
    }

    // Ignore tiny angles (< 0.35 deg) to prevent unnecessary resampling blur
    if (Math.abs(bestAngle) < 0.35) {
      return 0;
    }

    return Math.round(bestAngle * 100) / 100;
  }

  // ==========================================================================
  // 5. DOCUMENT CROP FOR PHOTOGRAPHED PAGES
  // ==========================================================================

  /**
   * Finds the sheet of paper in a photo (e.g. an invoice lying on a carpet).
   * The background is textured and darker than the paper; OCR on it produces
   * pages of garbage and costs time. Works on a ~240 px block-mean grid:
   * Otsu threshold on brightness, largest bright 4-connected region, its
   * bounding box plus a small margin. Returns null when no clear sheet is found
   * or it already fills the page (normal scans and digital PDFs).
   */
  function findDocumentBounds(rgba, width, height) {
    if (!rgba || width < 200 || height < 200) return null;
    const block = Math.max(2, Math.ceil(Math.max(width, height) / 240));
    const gw = Math.floor(width / block);
    const gh = Math.floor(height / block);
    const lum = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let sum = 0;
        let n = 0;
        for (let y = gy * block; y < (gy + 1) * block; y += 2) {
          let p = (y * width + gx * block) * 4;
          for (let x = 0; x < block; x += 2, p += 8) {
            sum += (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
            n++;
          }
        }
        lum[gy * gw + gx] = sum / n;
      }
    }

    // Otsu threshold on the block means.
    const hist = new Float64Array(256);
    for (let i = 0; i < lum.length; i++) hist[Math.min(255, Math.round(lum[i]))]++;
    let sumAll = 0;
    for (let i = 0; i < 256; i++) sumAll += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let best = 0;
    let threshold = 200;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = lum.length - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) {
        best = between;
        threshold = t;
      }
    }

    // Largest bright region; text inside the sheet is mostly averaged away by the blocks.
    const seen = new Uint8Array(lum.length);
    const queue = new Int32Array(lum.length);
    let bestBox = null;
    let bestCount = 0;
    for (let start = 0; start < lum.length; start++) {
      if (seen[start] || lum[start] <= threshold) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      seen[start] = 1;
      let x0 = gw, y0 = gh, x1 = 0, y1 = 0, count = 0;
      while (head < tail) {
        const i = queue[head++];
        const x = i % gw;
        const y = (i / gw) | 0;
        count++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        const nb = [x > 0 ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, y > 0 ? i - gw : -1, y < gh - 1 ? i + gw : -1];
        for (const j of nb) {
          if (j >= 0 && !seen[j] && lum[j] > threshold) {
            seen[j] = 1;
            queue[tail++] = j;
          }
        }
      }
      if (count > bestCount) {
        bestCount = count;
        bestBox = [x0, y0, x1, y1];
      }
    }
    if (!bestBox) return null;

    const boxArea = (bestBox[2] - bestBox[0] + 1) * (bestBox[3] - bestBox[1] + 1);
    const share = boxArea / (gw * gh);
    // A sheet must be large, compact and clearly smaller than the page.
    if (share < 0.15 || share > 0.88 || bestCount / boxArea < 0.55) return null;

    const margin = 2;
    return {
      x0: Math.max(0, (bestBox[0] - margin) * block),
      y0: Math.max(0, (bestBox[1] - margin) * block),
      x1: Math.min(width, (bestBox[2] + 1 + margin) * block),
      y1: Math.min(height, (bestBox[3] + 1 + margin) * block)
    };
  }

  /**
   * Picks row positions near the requested cut lines that run through the
   * whitespace between text lines, so parallel OCR stripes never cut a line
   * of text in half. Searches ±searchPx around each target for the row band
   * with the fewest dark pixels. `dark` holds one dark-pixel count per row.
   */
  function findTextGapRows(dark, targets, searchPx, band = 5) {
    const h = dark.length;
    const prefix = new Float64Array(h + 1);
    for (let y = 0; y < h; y++) prefix[y + 1] = prefix[y] + dark[y];
    const bandSum = (y) => prefix[Math.min(h, y + band + 1)] - prefix[Math.max(0, y - band)];
    return targets.map((t) => {
      let bestY = t;
      let bestVal = Infinity;
      for (let y = Math.max(1, t - searchPx); y <= Math.min(h - 2, t + searchPx); y++) {
        const v = bandSum(y) + Math.abs(y - t) * 0.001; // tie-break: closest to the target
        if (v < bestVal) {
          bestVal = v;
          bestY = y;
        }
      }
      return bestY;
    });
  }

  // ==========================================================================
  // EXPORTS
  // ==========================================================================

  const BlackMyDataOCRUtils = {
    levenshteinDistance,
    cleanOcrToken,
    canonicalizeOcrConfusions,
    isFuzzyTokenMatch,
    calculateIoU,
    isSameRect,
    groupRectsByLine,
    rotatePoint,
    rotateBoxToAABB,
    rgbaToGrayscale,
    contrastStretchGrayscale,
    sauvolaBinarize,
    estimateDeskewAngle,
    findDocumentBounds,
    findTextGapRows
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = BlackMyDataOCRUtils;
  }
  if (typeof global !== "undefined") {
    global.BlackMyDataOCRUtils = BlackMyDataOCRUtils;
  }
})(typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : this);
