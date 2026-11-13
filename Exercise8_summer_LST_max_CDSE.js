//VERSION=3
// ================================================================
// Exercise 8 - A summer surface temperature map
// Hottest Land Surface Temperature of a period, Landsat 8-9 (CDSE)
// ESTP: From strategies to practical use of EO data for official statistics
// Session 18 (Day 3)
// ================================================================
// Copernicus Browser: collection Landsat 8-9 L1, choose a TIME RANGE
// (e.g. 2025-06-01 to 2025-08-31), Custom script > paste the WHOLE
// script > Apply. Change only the SETTINGS block.
//
// Based on "Land Surface Temperature (LST) Mapping" and
// "Land Surface Temperature Comparison" by Mohor Gartner,
// Sentinel Hub custom scripts (custom-scripts.sentinel-hub.com), CC BY-SA 4.0.
// Changes: optional cloud mask from the BQA band, Planck correction in Kelvin,
// float output to read and download the values in degrees C.
// ================================================================

// ---- SETTINGS: change only these lines -------------------------
var MIN_C = 30;        // colour scale: pale at or below this value (degrees C)
var MAX_C = 50;        // colour scale: dark brick red at or above this value
var NDVI_SOIL = 0.2;   // below: bare soil, roofs, roads
var NDVI_VEG = 0.5;    // above: full vegetation
var CLOUD_MASK = false; // true: skip passes flagged as cloud in BQA.
                        // Off by default: bright roofs are often flagged as
                        // cloud, and clouds are cold, so they never win the maximum.
var SHOW_PASSES = false; // true: show how many passes were used for each pixel (check)
// -----------------------------------------------------------------

// Emissivity of the main surfaces
var E_WATER = 0.991;
var E_SOIL = 0.966;
var E_VEG = 0.973;
var C = 0.009;              // surface roughness term for mixed pixels

var LAMBDA = 10.895e-6;     // centre of band 10, metres
var RHO = 0.01438;          // h*c/k, metres * Kelvin

function setup() {
  return {
    input: [{ bands: ["B04", "B05", "B10", "BQA", "dataMask"] }],
    output: [
      { id: "default", bands: 4 },
      { id: "index", bands: 1, sampleType: "FLOAT32" },
      { id: "eobrowserStats", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ],
    mosaicking: "ORBIT"     // every pass in the time range, not one mosaic
  };
}

// 1. Emissivity from NDVI: water, soil, vegetation, or a mix
function emissivity(ndvi) {
  if (ndvi < 0) return E_WATER;
  if (ndvi < NDVI_SOIL) return E_SOIL;
  if (ndvi > NDVI_VEG) return E_VEG;
  var pv = Math.pow((ndvi - NDVI_SOIL) / (NDVI_VEG - NDVI_SOIL), 2);
  return E_VEG * pv + E_SOIL * (1 - pv) + C;
}

// Colour ramp: pale (cool) to dark brick red (hot)
var step = (MAX_C - MIN_C) / 6;
var viz = new ColorRampVisualizer([
  [MIN_C, 0xfff5eb], [MIN_C + step, 0xfdd0a2], [MIN_C + 2 * step, 0xfdae6b],
  [MIN_C + 3 * step, 0xf16913], [MIN_C + 4 * step, 0xd94801],
  [MIN_C + 5 * step, 0xa63603], [MAX_C, 0x7f2704]
]);

// Check mode: number of passes used, 0 (black) to 20 (white)
var vizPasses = new ColorRampVisualizer([[0, 0x000000], [20, 0xffffff]]);
function passesOutput(n) {
  var g = vizPasses.process(n);
  return { default: [g[0], g[1], g[2], 1], index: [n], eobrowserStats: [n], dataMask: [1] };
}

function evaluatePixel(samples) {
  var lstMax = -999, nPasses = 0;

  // 2. Loop over every Landsat pass in the time range
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    if (!s.dataMask || s.B10 < 173) continue;

    // 3. Clouds: optional mask from BQA (see SETTINGS)
    if (CLOUD_MASK) {
      var qa = decodeL8C2Qa(s.BQA);
      if (qa.cloud || qa.cirrus || qa.cloudShadow) continue;
    }
    nPasses++;

    // 4. Brightness temperature (Kelvin) to surface temperature (degrees C)
    var ndvi = (s.B05 - s.B04) / (s.B05 + s.B04);
    var bt = s.B10;
    var lst = bt / (1 + (LAMBDA * bt / RHO) * Math.log(emissivity(ndvi))) - 273.15;

    // 5. Keep the hottest value of the period
    if (lst > lstMax) lstMax = lst;
  }

  if (SHOW_PASSES) return passesOutput(nPasses);

  if (lstMax === -999) {
    return { default: [0, 0, 0, 0], index: [NaN], eobrowserStats: [NaN], dataMask: [0] };
  }
  var rgb = viz.process(lstMax);
  return {
    default: [rgb[0], rgb[1], rgb[2], 1],
    index: [lstMax],
    eobrowserStats: [lstMax],
    dataMask: [1]
  };
}
