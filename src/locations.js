// Starting points. alt is metres above sea level; the aircraft is lifted to at least `agl` metres
// above the terrain if that is higher. heading is degrees from north.
export const LOCATIONS = [
  { id: 'grand-canyon', name: 'Grand Canyon', blurb: 'Down the canyon from the South Rim', lat: 36.03, lon: -112.3, heading: 60, alt: 2600, agl: 300 },
  { id: 'yosemite', name: 'Yosemite Valley', blurb: 'East past El Capitan to Half Dome', lat: 37.715, lon: -119.75, heading: 75, alt: 2300, agl: 300 },
  { id: 'new-york', name: 'New York City', blurb: 'Up the Hudson past the Manhattan skyline', lat: 40.672, lon: -74.04, heading: 15, alt: 450, agl: 300 },
  { id: 'golden-gate', name: 'San Francisco Bay', blurb: 'Over the Pacific toward the Golden Gate', lat: 37.72, lon: -122.62, heading: 40, alt: 500, agl: 300 },
  { id: 'matterhorn', name: 'Matterhorn', blurb: 'Through the Swiss Alps above Zermatt', lat: 46.06, lon: 7.8, heading: 220, alt: 4300, agl: 400 },
  { id: 'everest', name: 'Mount Everest', blurb: 'Up the Khumbu valley to the roof of the world', lat: 27.86, lon: 86.82, heading: 30, alt: 7600, agl: 500 },
  { id: 'fjords', name: 'Geirangerfjord', blurb: 'Along a Norwegian fjord', lat: 62.13, lon: 7.0, heading: 115, alt: 700, agl: 300 },
  { id: 'rio', name: 'Rio de Janeiro', blurb: 'Past Christ the Redeemer and Sugarloaf', lat: -22.93, lon: -43.32, heading: 90, alt: 800, agl: 300 },
  { id: 'hawaii', name: 'Na Pali Coast', blurb: 'Along the cliffs of Kauai', lat: 22.15, lon: -159.75, heading: 50, alt: 600, agl: 300 },
];
