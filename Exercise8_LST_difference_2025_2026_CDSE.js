//VERSION=3
// ================================================================
// Exercise 8 - Two summers compared
// Hottest Land Surface Temperature of summer B minus summer A,
// Landsat 8-9 (CDSE)
// ESTP: From strategies to practical use of EO data for official statistics
// Session 18 (Day 3)
// ================================================================
// Copernicus Browser: collection Landsat 8-9 L1, TIME RANGE that covers
// both summers (e.g. 2025-06-01 to 2026-08-31), Custom script > paste the
// WHOLE script > Apply. Change only the SETTINGS block.
// Only the passes of the summer months are used; the others are skipped.
//
// Based on "Land Surface Temperature (LST) Mapping" and
// "Land Surface Temperature Comparison" by Mohor Gartner,
// Sentinel Hub custom scripts (custom-scripts.sentinel-hub.com), CC BY-SA 4.0.
// ================================================================

// ---- SETTINGS: change only these lines -------------------------
var YEAR_A = 2025;     // first summer
var YEAR_B = 2026;     // second summer: the map shows B minus A
var FIRST_MONTH = 6;   // June
var LAST_MONTH = 8;    // August
var RANGE = 10;        // colour scale: from -RANGE (blue) to +RANGE (red), degrees C
var NDVI_SOIL = 0.2;   // below: bare soil, roofs, roads
var NDVI_VEG = 0.5;    // above: full vegetation
// -----------------------------------------------------------------

var E_WATER = 0.991, E_SOIL = 0.966, E_VEG = 0.973, C = 0.009;
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
    mosaicking: "ORBIT"
  };
}

// Keep only the passes of the summer months of the two years
function inSummer(dateString) {
  var d = new Date(dateString);
  var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  return (y === YEAR_A || y === YEAR_B) && m >= FIRST_MONTH && m <= LAST_MONTH;
}

function preProcessScenes(collections) {
  collections.scenes.orbits = collections.scenes.orbits.filter(function (o) {
    return inSummer(o.dateFrom);
  });
  return collections;
}

function emissivity(ndvi) {
  if (ndvi < 0) return E_WATER;
  if (ndvi < NDVI_SOIL) return E_SOIL;
  if (ndvi > NDVI_VEG) return E_VEG;
  var pv = Math.pow((ndvi - NDVI_SOIL) / (NDVI_VEG - NDVI_SOIL), 2);
  return E_VEG * pv + E_SOIL * (1 - pv) + C;
}

// Blue = cooler in YEAR_B, white = no change, red = hotter in YEAR_B
var viz = new ColorRampVisualizer([
  [-RANGE, 0x2166ac], [-RANGE / 2, 0x92c5de], [0, 0xf7f7f7],
  [RANGE / 2, 0xf4a582], [RANGE, 0xb2182b]
]);

function evaluatePixel(samples, scenes) {
  var maxA = -999, maxB = -999;

  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    if (!s.dataMask || s.B10 < 173) continue;

    // Clouds out
    var qa = decodeL8C2Qa(s.BQA);
    if (qa.cloud || qa.dilatedCloud || qa.cirrus || qa.cloudShadow) continue;

    // Surface temperature, degrees C
    var ndvi = (s.B05 - s.B04) / (s.B05 + s.B04);
    var bt = s.B10;
    var lst = bt / (1 + (LAMBDA * bt / RHO) * Math.log(emissivity(ndvi))) - 273.15;

    // Hottest value of each summer
    var year = new Date(scenes[i].date).getUTCFullYear();
    if (year === YEAR_A && lst > maxA) maxA = lst;
    if (year === YEAR_B && lst > maxB) maxB = lst;
  }

  // A clear value is needed in both summers
  if (maxA === -999 || maxB === -999) {
    return { default: [0, 0, 0, 0], index: [NaN], eobrowserStats: [NaN], dataMask: [0] };
  }
  var diff = maxB - maxA;
  var rgb = viz.process(diff);
  return {
    default: [rgb[0], rgb[1], rgb[2], 1],
    index: [diff],
    eobrowserStats: [diff],
    dataMask: [1]
  };
}
