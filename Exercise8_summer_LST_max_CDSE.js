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
// Changes: cloud mask from the BQA band, Planck correction in Kelvin,
// float output to read and download the values in degrees C.
// ================================================================

// ---- SETTINGS: change only these lines -------------------------
var MIN_C = 25;        // colour scale: blue at or below this value (degrees C)
var MAX_C = 55;        // colour scale: dark red at or above this value
var NDVI_SOIL = 0.2;   // below: bare soil, roofs, roads
var NDVI_VEG = 0.5;    // above: full vegetation
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

// Colour ramp, blue (cool) to dark red (hot)
var step = (MAX_C - MIN_C) / 6;
var viz = new ColorRampVisualizer([
  [MIN_C, 0x313695], [MIN_C + step, 0x4575b4], [MIN_C + 2 * step, 0x74add1],
  [MIN_C + 3 * step, 0xffffbf], [MIN_C + 4 * step, 0xfdae61],
  [MIN_C + 5 * step, 0xf46d43], [MAX_C, 0xa50026]
]);

function evaluatePixel(samples) {
  var lstMax = -999;

  // 2. Loop over every Landsat pass in the time range
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    if (!s.dataMask || s.B10 < 173) continue;

    // 3. Clouds out: BQA flags clouds, cirrus and shadows
    var qa = decodeL8C2Qa(s.BQA);
    if (qa.cloud || qa.dilatedCloud || qa.cirrus || qa.cloudShadow) continue;

    // 4. Brightness temperature (Kelvin) to surface temperature (degrees C)
    var ndvi = (s.B05 - s.B04) / (s.B05 + s.B04);
    var bt = s.B10;
    var lst = bt / (1 + (LAMBDA * bt / RHO) * Math.log(emissivity(ndvi))) - 273.15;

    // 5. Keep the hottest value of the period
    if (lst > lstMax) lstMax = lst;
  }

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
