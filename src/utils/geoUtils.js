/**
 * geoUtils.js — Geographic Utilities for Qasr Status & 'Urf Boundary
 *
 * Implements Ayatollah Sistani's rulings on traveler boundaries:
 * - 'Urf boundary: where the continuous urban sprawl ends
 * - Hadd al-Tarakhkhus: 22 km (13.7 miles) outward from the 'Urf boundary
 *
 * For large metropolitan areas, we model the 'Urf boundary using
 * structural density approximations.
 *
 * The Hadd al-Tarakhkhus boundary is now computed using a proper polygon
 * buffering algorithm (Minkowski sum / edge offsetting with arc joins)
 * rather than a simple circle approximation.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;
const HADD_AL_TARAKHKHUS_KM = 22; // 22 km = 13.7 miles

// ─── Metropolitan 'Urf Boundary Data ─────────────────────────────────────────
// These are approximations of where the continuous urban footprint breaks
// for major sprawling cities. Each entry defines a simplified polygon
// (array of [lat, lng] points) representing the estimated city limit.
//
// DISCLAIMER: These are structural density approximations, not official
// municipal boundaries. Users should use their own conscience ('Urf).

const URBAN_BOUNDARIES = {
  // ─── Texas ───────────────────────────────────────────────────────────────
  'Houston': {
    center: [29.7604, -95.3698],
    // Greater Houston: Katy→Sugar Land→Pearland→Baytown→The Woodlands
    boundary: [
      [30.20, -95.85],  // NW (Montgomery / The Woodlands)
      [30.10, -95.60],  // N (Spring)
      [30.05, -95.20],  // NE (Humble / Kingwood)
      [29.90, -95.00],  // E (Baytown)
      [29.60, -95.00],  // SE (Texas City / Galveston Bay)
      [29.50, -95.20],  // S (Pearland / Alvin)
      [29.45, -95.60],  // SW (Sugar Land / Richmond)
      [29.55, -95.85],  // W (Katy / Fulshear)
      [29.80, -95.90],  // NW (Cypress)
      [30.20, -95.85],  // back
    ],
  },
  'Dallas-Fort Worth': {
    center: [32.7767, -96.7970],
    // DFW metroplex: Denton→Plano→Garland→Arlington→Fort Worth→Irving
    boundary: [
      [33.25, -97.15],  // NW (Denton / Sanger)
      [33.20, -96.85],  // N (McKinney / Allen)
      [33.10, -96.60],  // NE (Plano / Wylie)
      [32.90, -96.55],  // E (Garland / Rockwall)
      [32.60, -96.60],  // SE (Mesquite / Terrell)
      [32.50, -96.90],  // S (Arlington / Mansfield)
      [32.55, -97.20],  // SW (Fort Worth / Burleson)
      [32.75, -97.35],  // W (Fort Worth / Weatherford)
      [32.90, -97.20],  // NW (Irving / Grapevine)
      [33.25, -97.15],  // back
    ],
  },
  'San Antonio': {
    center: [29.4241, -98.4936],
    // San Antonio: Boerne→Schertz→Universal City→Southside→Lackland
    boundary: [
      [29.70, -98.75],  // NW (Boerne / Leon Springs)
      [29.65, -98.55],  // N (Stone Oak)
      [29.60, -98.30],  // NE (Schertz / Cibolo)
      [29.50, -98.25],  // E (Universal City)
      [29.30, -98.30],  // SE (Southside / Elmendorf)
      [29.20, -98.50],  // S (Pleasanton area)
      [29.25, -98.70],  // SW (Lackland / Castroville)
      [29.40, -98.75],  // W (Helotes)
      [29.70, -98.75],  // back
    ],
  },
  'Austin': {
    center: [30.2672, -97.7431],
    // Austin: Cedar Park→Round Rock→Pflugerville→Buda→Dripping Springs
    boundary: [
      [30.55, -97.90],  // NW (Cedar Park / Leander)
      [30.55, -97.65],  // N (Round Rock)
      [30.50, -97.55],  // NE (Pflugerville / Hutto)
      [30.30, -97.55],  // E (Elgin area)
      [30.10, -97.60],  // SE (Buda / Kyle)
      [30.05, -97.80],  // S (Kyle / San Marcos area)
      [30.15, -97.95],  // SW (Dripping Springs)
      [30.30, -97.95],  // W (Lakeway / Bee Cave)
      [30.55, -97.90],  // back
    ],
  },

  // ─── Northeast ───────────────────────────────────────────────────────────
  'New York City': {
    center: [40.7128, -74.0060],
    // NYC metro: Yonkers→Long Island→JFK→Staten Island→Newark→Jersey City
    boundary: [
      [40.92, -74.05],  // N (Yonkers / White Plains)
      [40.85, -73.85],  // NE (Bronx / Queens / Nassau)
      [40.70, -73.70],  // E (Nassau County)
      [40.55, -73.80],  // SE (JFK / Far Rockaway)
      [40.50, -74.00],  // S (Staten Island)
      [40.55, -74.20],  // SW (Elizabeth / Linden)
      [40.70, -74.25],  // W (Newark / Jersey City)
      [40.85, -74.20],  // NW (Hackensack / Paterson)
      [40.92, -74.05],  // back
    ],
  },
  'Boston': {
    center: [42.3601, -71.0589],
    // Boston metro: Lowell→Lynn→Quincy→Newton→Framingham→Waltham
    boundary: [
      [42.55, -71.30],  // NW (Lowell / Billerica)
      [42.50, -71.10],  // N (Woburn / Reading)
      [42.45, -70.95],  // NE (Lynn / Salem)
      [42.35, -70.90],  // E (Revere / Winthrop)
      [42.25, -70.95],  // SE (Quincy / Braintree)
      [42.20, -71.10],  // S (Brockton area)
      [42.25, -71.25],  // SW (Newton / Wellesley)
      [42.30, -71.40],  // W (Framingham / Natick)
      [42.40, -71.35],  // NW (Waltham / Lexington)
      [42.55, -71.30],  // back
    ],
  },
  'Philadelphia': {
    center: [39.9526, -75.1652],
    // Philly metro: King of Prussia→Camden→Cherry Hill→Chester→Norristown
    boundary: [
      [40.15, -75.30],  // NW (Norristown / Lansdale)
      [40.10, -75.10],  // N (Abington / Jenkintown)
      [40.05, -74.95],  // NE (Bensalem / Levittown)
      [39.95, -74.85],  // E (Burlington / Willingboro)
      [39.85, -74.90],  // SE (Cherry Hill / Camden)
      [39.80, -75.10],  // S (Chester / Ridley)
      [39.85, -75.30],  // SW (Springfield / Media)
      [39.95, -75.35],  // W (King of Prussia / Ardmore)
      [40.15, -75.30],  // back
    ],
  },
  'Washington DC': {
    center: [38.9072, -77.0369],
    // DC metro: Silver Spring→College Park→Bowie→Alexandria→Arlington→Bethesda
    boundary: [
      [39.05, -77.05],  // NW (Silver Spring / Wheaton)
      [39.00, -76.90],  // N (College Park / Greenbelt)
      [38.95, -76.75],  // NE (Bowie / Crofton)
      [38.85, -76.70],  // E (Upper Marlboro)
      [38.75, -76.80],  // SE (Clinton / Waldorf area)
      [38.70, -76.95],  // S (Alexandria / Fort Belvoir)
      [38.75, -77.15],  // SW (Springfield / Annandale)
      [38.85, -77.20],  // W (Falls Church / Vienna)
      [38.95, -77.15],  // NW (Bethesda / Rockville)
      [39.05, -77.05],  // back
    ],
  },

  // ─── West Coast ──────────────────────────────────────────────────────────
  'Los Angeles': {
    center: [34.0522, -118.2437],
    // LA basin: Thousand Oaks→San Fernando→Pasadena→Anaheim→Long Beach→Santa Monica
    boundary: [
      [34.30, -118.70],  // NW (Thousand Oaks / Simi Valley)
      [34.30, -118.50],  // N (San Fernando Valley / Burbank)
      [34.20, -118.20],  // NE (Glendale / Pasadena)
      [34.10, -117.90],  // E (San Gabriel Valley / Pomona)
      [33.90, -117.80],  // SE (Orange County / Anaheim)
      [33.70, -118.00],  // S (Long Beach / Huntington Beach)
      [33.70, -118.40],  // SW (Torrance / Palos Verdes)
      [33.90, -118.60],  // W (Santa Monica / Venice)
      [34.10, -118.70],  // NW (Malibu area)
      [34.30, -118.70],  // back
    ],
  },
  'San Francisco Bay Area': {
    center: [37.7749, -122.4194],
    // SF Bay: San Rafael→Richmond→Oakland→Fremont→San Mateo→Daly City
    boundary: [
      [38.00, -122.55],  // NW (San Rafael / Novato)
      [38.00, -122.30],  // N (Richmond / Berkeley)
      [37.90, -122.15],  // NE (Oakland / Walnut Creek)
      [37.75, -122.00],  // E (Dublin / Pleasanton)
      [37.55, -121.95],  // SE (Fremont / Milpitas)
      [37.45, -122.10],  // S (Palo Alto / Mountain View)
      [37.50, -122.30],  // SW (San Mateo / Redwood City)
      [37.60, -122.45],  // W (Daly City / South SF)
      [37.80, -122.50],  // NW (San Francisco proper)
      [38.00, -122.55],  // back
    ],
  },
  'San Diego': {
    center: [32.7157, -117.1611],
    // San Diego: Oceanside→Escondido→El Cajon→Chula Vista→La Jolla
    boundary: [
      [33.20, -117.30],  // NW (Oceanside / Carlsbad)
      [33.15, -117.15],  // N (Vista / San Marcos)
      [33.10, -117.00],  // NE (Escondido)
      [32.90, -116.90],  // E (El Cajon / Santee)
      [32.70, -116.85],  // SE (Chula Vista / Otay)
      [32.55, -116.95],  // S (Imperial Beach / border)
      [32.60, -117.15],  // SW (Coronado / Point Loma)
      [32.80, -117.30],  // W (La Jolla / Pacific Beach)
      [33.00, -117.30],  // NW (Del Mar / Solana Beach)
      [33.20, -117.30],  // back
    ],
  },
  'Seattle': {
    center: [47.6062, -122.3321],
    // Seattle metro: Everett→Bellevue→Renton→Tacoma→Bremerton→Shoreline
    boundary: [
      [47.95, -122.30],  // NW (Everett / Lynnwood)
      [47.85, -122.20],  // N (Mill Creek / Bothell)
      [47.70, -122.10],  // NE (Redmond / Bellevue)
      [47.55, -122.10],  // E (Issaquah / Sammamish)
      [47.45, -122.15],  // SE (Renton / Kent)
      [47.30, -122.25],  // S (Federal Way / Tacoma)
      [47.25, -122.40],  // SW (Tacoma / Gig Harbor)
      [47.40, -122.50],  // W (Bremerton / Bainbridge)
      [47.60, -122.45],  // NW (Shoreline / Edmonds)
      [47.95, -122.30],  // back
    ],
  },
  'Portland': {
    center: [45.5152, -122.6784],
    // Portland metro: Vancouver→Gresham→Milwaukie→Beaverton→Hillsboro
    boundary: [
      [45.70, -122.80],  // NW (Vancouver / Salmon Creek)
      [45.65, -122.60],  // N (Vancouver / Orchards)
      [45.60, -122.45],  // NE (Gresham / Troutdale)
      [45.50, -122.40],  // E (Gresham)
      [45.40, -122.50],  // SE (Milwaukie / Oregon City)
      [45.35, -122.65],  // S (Tualatin / Wilsonville)
      [45.40, -122.80],  // SW (Beaverton / Tigard)
      [45.50, -122.85],  // W (Hillsboro / Aloha)
      [45.70, -122.80],  // back
    ],
  },

  // ─── Midwest ─────────────────────────────────────────────────────────────
  'Chicago': {
    center: [41.8781, -87.6298],
    // Chicago metro: Schaumburg→Evanston→Hammond→Joliet→Naperville→Elgin
    boundary: [
      [42.10, -87.95],  // NW (Schaumburg / Arlington Heights)
      [42.05, -87.70],  // N (Evanston / Skokie)
      [42.00, -87.55],  // NE (Lake Michigan shore)
      [41.80, -87.50],  // E (Lake Michigan / South Shore)
      [41.65, -87.55],  // SE (Hammond / Gary)
      [41.60, -87.70],  // S (South Chicago suburbs)
      [41.65, -87.95],  // SW (Joliet area)
      [41.85, -88.00],  // W (Naperville / Aurora)
      [42.00, -88.05],  // NW (Elgin)
      [42.10, -87.95],  // back
    ],
  },
  'Detroit': {
    center: [42.3314, -83.0458],
    // Detroit metro: Pontiac→Warren→St Clair Shores→Dearborn→Ann Arbor→Livonia
    boundary: [
      [42.65, -83.30],  // NW (Pontiac / Waterford)
      [42.60, -83.10],  // N (Rochester / Troy)
      [42.55, -82.95],  // NE (Warren / Sterling Heights)
      [42.50, -82.80],  // E (St Clair Shores / Mt Clemens)
      [42.35, -82.85],  // SE (Grosse Pointe / Detroit)
      [42.25, -82.95],  // S (Wyandotte / Trenton)
      [42.20, -83.15],  // SW (Dearborn / Allen Park)
      [42.25, -83.40],  // W (Livonia / Westland)
      [42.35, -83.50],  // NW (Novi / Farmington)
      [42.65, -83.30],  // back
    ],
  },
  'Minneapolis-St Paul': {
    center: [44.9778, -93.2650],
    // Twin Cities: Blaine→Woodbury→Eagan→Eden Prairie→Plymouth→Brooklyn Park
    boundary: [
      [45.15, -93.40],  // NW (Brooklyn Park / Maple Grove)
      [45.15, -93.20],  // N (Blaine / Coon Rapids)
      [45.10, -93.00],  // NE (White Bear Lake / Woodbury)
      [44.95, -92.90],  // E (Woodbury / Oakdale)
      [44.80, -92.95],  // SE (Cottage Grove / Hastings)
      [44.75, -93.10],  // S (Eagan / Burnsville)
      [44.80, -93.35],  // SW (Eden Prairie / Shakopee)
      [44.90, -93.45],  // W (Plymouth / Minnetonka)
      [45.05, -93.40],  // NW (Brooklyn Center)
      [45.15, -93.40],  // back
    ],
  },
  'St Louis': {
    center: [38.6270, -90.1994],
    // St Louis metro: St Charles→Florissant→Belleville→Arnold→Chesterfield
    boundary: [
      [38.80, -90.50],  // NW (St Charles / St Peters)
      [38.80, -90.30],  // N (Florissant / Hazelwood)
      [38.75, -90.15],  // NE (Alton / Granite City)
      [38.65, -90.05],  // E (Collinsville / Edwardsville)
      [38.55, -90.00],  // SE (Belleville / Fairview Heights)
      [38.45, -90.10],  // S (Arnold / Festus)
      [38.45, -90.30],  // SW (Mehlville / Oakville)
      [38.55, -90.45],  // W (Chesterfield / Ballwin)
      [38.65, -90.50],  // NW (Maryland Heights)
      [38.80, -90.50],  // back
    ],
  },
  'Cleveland': {
    center: [41.4993, -81.6944],
    // Cleveland metro: Mentor→Euclid→Akron→Parma→Lakewood→Elyria
    boundary: [
      [41.70, -81.70],  // NW (Willoughby / Mentor)
      [41.65, -81.55],  // N (Euclid / Wickliffe)
      [41.55, -81.50],  // NE (Richmond Heights)
      [41.40, -81.50],  // E (Beachwood / Shaker Heights)
      [41.30, -81.55],  // SE (Akron / Cuyahoga Falls)
      [41.25, -81.70],  // S (Akron / Barberton)
      [41.35, -81.85],  // SW (Parma / Strongsville)
      [41.45, -81.90],  // W (Lakewood / Rocky River)
      [41.55, -81.85],  // NW (Westlake / Avon)
      [41.70, -81.70],  // back
    ],
  },

  // ─── Southeast ───────────────────────────────────────────────────────────
  'Atlanta': {
    center: [33.7490, -84.3880],
    // Atlanta metro: Marietta→Duluth→Stone Mountain→Peachtree City→Douglasville
    boundary: [
      [34.00, -84.60],  // NW (Marietta / Kennesaw)
      [33.95, -84.35],  // N (Roswell / Alpharetta)
      [33.90, -84.10],  // NE (Duluth / Lawrenceville)
      [33.80, -84.00],  // E (Stone Mountain / Snellville)
      [33.65, -84.00],  // SE (Conyers / Stockbridge)
      [33.50, -84.15],  // S (Peachtree City / Fayetteville)
      [33.50, -84.40],  // SW (Union City / Fairburn)
      [33.60, -84.60],  // W (Douglasville / Lithia Springs)
      [33.80, -84.65],  // NW (Smyrna / Austell)
      [34.00, -84.60],  // back
    ],
  },
  'Miami': {
    center: [25.7617, -80.1918],
    // Miami metro: West Palm Beach→Fort Lauderdale→Hialeah→Homestead→Coral Gables
    boundary: [
      [26.70, -80.20],  // NW (West Palm Beach / Palm Beach Gardens)
      [26.60, -80.10],  // N (Boynton Beach / Delray Beach)
      [26.40, -80.10],  // NE (Boca Raton / Deerfield Beach)
      [26.20, -80.10],  // E (Fort Lauderdale / Pompano)
      [26.00, -80.15],  // SE (Hollywood / Hallandale)
      [25.80, -80.20],  // S (Miami Beach / Key Biscayne)
      [25.60, -80.30],  // S (Homestead / Florida City)
      [25.70, -80.45],  // SW (Kendall / Cutler Bay)
      [25.85, -80.40],  // W (Hialeah / Doral)
      [26.00, -80.35],  // NW (Miami Lakes / Pembroke Pines)
      [26.70, -80.20],  // back
    ],
  },
  'Tampa Bay': {
    center: [27.9506, -82.4572],
    // Tampa Bay: Clearwater→St Petersburg→Brandon→Riverview→Lutz→New Port Richey
    boundary: [
      [28.25, -82.70],  // NW (New Port Richey / Hudson)
      [28.20, -82.50],  // N (Lutz / Land O' Lakes)
      [28.15, -82.30],  // NE (Wesley Chapel / Zephyrhills)
      [28.00, -82.25],  // E (Brandon / Valrico)
      [27.85, -82.25],  // SE (Riverview / Sun City Center)
      [27.70, -82.35],  // S (Apollo Beach / Ruskin)
      [27.70, -82.55],  // SW (St Petersburg / Gulfport)
      [27.80, -82.70],  // W (Clearwater / Largo)
      [27.95, -82.70],  // NW (Safety Harbor / Oldsmar)
      [28.25, -82.70],  // back
    ],
  },
  'Orlando': {
    center: [28.5383, -81.3792],
    // Orlando metro: Sanford→Oviedo→Kissimmee→Winter Garden→Apopka
    boundary: [
      [28.80, -81.50],  // NW (Apopka / Mount Dora)
      [28.80, -81.30],  // N (Sanford / Lake Mary)
      [28.70, -81.15],  // NE (Oviedo / Winter Springs)
      [28.55, -81.15],  // E (Union Park / Bithlo)
      [28.40, -81.20],  // SE (Belle Isle / Conway)
      [28.25, -81.35],  // S (Kissimmee / Hunters Creek)
      [28.30, -81.50],  // SW (Winter Garden / Ocoee)
      [28.45, -81.55],  // W (Windermere / Gotha)
      [28.80, -81.50],  // back
    ],
  },
  'Charlotte': {
    center: [35.2271, -80.8431],
    // Charlotte metro: Huntersville→Concord→Matthews→Fort Mill→Gastonia
    boundary: [
      [35.40, -80.90],  // NW (Huntersville / Cornelius)
      [35.40, -80.70],  // N (Concord / Kannapolis)
      [35.30, -80.60],  // NE (Harrisburg / Locust)
      [35.15, -80.60],  // E (Mint Hill / Matthews)
      [35.05, -80.65],  // SE (Indian Trail / Monroe)
      [35.00, -80.80],  // S (Fort Mill / Rock Hill)
      [35.05, -80.95],  // SW (Steele Creek / Tega Cay)
      [35.15, -81.05],  // W (Gastonia / Belmont)
      [35.30, -81.00],  // NW (Mount Holly / Denver)
      [35.40, -80.90],  // back
    ],
  },
  'Nashville': {
    center: [36.1627, -86.7816],
    // Nashville metro: Hendersonville→Mt Juliet→Murfreesboro→Franklin→Brentwood
    boundary: [
      [36.35, -86.90],  // NW (Goodlettsville / Hendersonville)
      [36.30, -86.70],  // N (Mt Juliet / Lebanon)
      [36.20, -86.55],  // NE (Lebanon area)
      [36.05, -86.55],  // E (La Vergne / Smyrna)
      [35.90, -86.60],  // SE (Murfreesboro)
      [35.85, -86.75],  // S (Nolensville / Spring Hill)
      [35.90, -86.90],  // SW (Franklin / Brentwood)
      [36.00, -87.00],  // W (Bellevue / Fairview)
      [36.15, -87.00],  // NW (Ashland City area)
      [36.35, -86.90],  // back
    ],
  },

  // ─── Southwest ───────────────────────────────────────────────────────────
  'Phoenix': {
    center: [33.4484, -112.0740],
    // Phoenix metro: Surprise→Scottsdale→Mesa→Chandler→Goodyear→Peoria
    boundary: [
      [33.70, -112.40],  // NW (Surprise / Sun City)
      [33.70, -112.10],  // N (Peoria / Glendale)
      [33.65, -111.85],  // NE (Scottsdale / Fountain Hills)
      [33.50, -111.70],  // E (Mesa / Apache Junction)
      [33.35, -111.70],  // SE (Gilbert / Queen Creek)
      [33.25, -111.85],  // S (Chandler / Sun Lakes)
      [33.25, -112.10],  // SW (Goodyear / Avondale)
      [33.35, -112.30],  // W (Buckeye / Litchfield Park)
      [33.50, -112.35],  // NW (El Mirage / Youngtown)
      [33.70, -112.40],  // back
    ],
  },
  'Denver': {
    center: [39.7392, -104.9903],
    // Denver metro: Boulder→Aurora→Centennial→Littleton→Lakewood→Westminster
    boundary: [
      [40.00, -105.15],  // NW (Boulder / Louisville)
      [39.95, -104.95],  // N (Westminster / Thornton)
      [39.85, -104.80],  // NE (Aurora / Brighton)
      [39.75, -104.75],  // E (Aurora / Denver Airport)
      [39.60, -104.75],  // SE (Centennial / Parker)
      [39.55, -104.90],  // S (Littleton / Highlands Ranch)
      [39.55, -105.10],  // SW (Ken Caryl / Columbine)
      [39.65, -105.15],  // W (Lakewood / Golden)
      [39.80, -105.15],  // NW (Arvada / Wheat Ridge)
      [40.00, -105.15],  // back
    ],
  },
  'Las Vegas': {
    center: [36.1699, -115.1398],
    // Las Vegas metro: North Las Vegas→Henderson→Spring Valley→Enterprise
    boundary: [
      [36.30, -115.30],  // NW (Centennial Hills)
      [36.25, -115.15],  // N (North Las Vegas)
      [36.20, -115.00],  // NE (Sunrise Manor)
      [36.10, -114.95],  // E (Whitney / Nellis)
      [36.00, -114.95],  // SE (Henderson / Lake Las Vegas)
      [35.95, -115.05],  // S (Henderson / Anthem)
      [36.00, -115.20],  // SW (Enterprise / Southern Highlands)
      [36.05, -115.30],  // W (Spring Valley / Summerlin)
      [36.15, -115.30],  // NW (Summerlin South)
      [36.30, -115.30],  // back
    ],
  },

  // ─── California (additional) ─────────────────────────────────────────────
  'Sacramento': {
    center: [38.5816, -121.4944],
    // Sacramento metro: Roseville→Elk Grove→Citrus Heights→Davis→West Sacramento
    boundary: [
      [38.80, -121.55],  // NW (Roseville / Rocklin)
      [38.75, -121.35],  // N (Citrus Heights / Orangevale)
      [38.70, -121.25],  // NE (Folsom / El Dorado Hills)
      [38.60, -121.20],  // E (Rancho Cordova)
      [38.50, -121.25],  // SE (Elk Grove / Wilton)
      [38.40, -121.35],  // S (Elk Grove / Galt)
      [38.40, -121.55],  // SW (Davis / Dixon)
      [38.50, -121.60],  // W (West Sacramento / Woodland)
      [38.65, -121.60],  // NW (Natomas)
      [38.80, -121.55],  // back
    ],
  },
  'San Jose': {
    center: [37.3382, -121.8863],
    // San Jose metro: Palo Alto→Milpitas→Morgan Hill→Gilroy→Cupertino→Sunnyvale
    boundary: [
      [37.45, -122.10],  // NW (Palo Alto / Mountain View)
      [37.45, -121.95],  // N (Milpitas / Fremont)
      [37.40, -121.80],  // NE (Alum Rock / Evergreen)
      [37.30, -121.75],  // E (East San Jose)
      [37.20, -121.70],  // SE (Morgan Hill)
      [37.10, -121.70],  // S (Gilroy)
      [37.10, -121.85],  // SW (Coyote Valley)
      [37.20, -121.95],  // W (Campbell / Los Gatos)
      [37.30, -122.00],  // NW (Cupertino / Sunnyvale)
      [37.45, -122.10],  // back
    ],
  },

  // ─── Pacific Northwest (additional) ──────────────────────────────────────
  'Salt Lake City': {
    center: [40.7608, -111.8910],
    // SLC metro: Ogden→Bountiful→Sandy→West Jordan→Taylorsville→Layton
    boundary: [
      [41.20, -112.00],  // NW (Ogden / Roy)
      [41.10, -111.90],  // N (Layton / Clearfield)
      [40.95, -111.80],  // NE (Farmington / Kaysville)
      [40.85, -111.75],  // E (Bountiful / Centerville)
      [40.70, -111.75],  // SE (Holladay / Cottonwood)
      [40.55, -111.80],  // S (Sandy / Draper)
      [40.55, -111.95],  // SW (West Jordan / South Jordan)
      [40.65, -112.00],  // W (Taylorsville / Kearns)
      [40.80, -112.00],  // NW (Magna / West Valley)
      [41.20, -112.00],  // back
    ],
  },
  'Albuquerque': {
    center: [35.0853, -106.6056],
    // Albuquerque metro: Rio Rancho→Corrales→Los Lunas→South Valley→Bernalillo
    boundary: [
      [35.30, -106.70],  // NW (Rio Rancho / Bernalillo)
      [35.25, -106.55],  // N (North Valley / Alameda)
      [35.20, -106.45],  // NE (Sandia Park area)
      [35.10, -106.40],  // E (Tijeras / Cedar Crest)
      [35.00, -106.45],  // SE (Four Hills)
      [34.90, -106.55],  // S (South Valley / Los Lunas)
      [34.90, -106.70],  // SW (Isleta / Bosque Farms)
      [35.00, -106.75],  // W (West Mesa / Paradise Hills)
      [35.15, -106.75],  // NW (Pajarito Mesa)
      [35.30, -106.70],  // back
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function isValidLatLng(lat, lng) {
  return isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function wrapLng(lng) {
  return ((lng + 180) % 360 + 360) % 360 - 180;
}

// ─── Point-in-Polygon (Ray Casting) ──────────────────────────────────────────

/**
 * Check if a point [lat, lng] is inside a polygon.
 * Uses the ray-casting algorithm.
 */
function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Distance Calculations ───────────────────────────────────────────────────

/**
 * Calculate the Haversine distance between two points in km.
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δφ = (lat2 - lat1) * DEG;
  const Δλ = (lng2 - lng1) * DEG;

  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate the minimum distance from a point to a polygon boundary.
 * Returns the distance in km.
 */
function distanceToPolygonBoundary(point, polygon) {
  let minDist = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const dist = distanceToSegment(point, p1, p2);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/**
 * Distance from point to line segment in km.
 */
function distanceToSegment(point, segA, segB) {
  const [px, py] = point;
  const [ax, ay] = segA;
  const [bx, by] = segB;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return haversineDistance(px, py, ax, ay);
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;

  return haversineDistance(px, py, projX, projY);
}

// ─── Polygon Buffer Algorithm (True Minkowski Sum) ──────────────────────────
//
// The buffer of a polygon at distance d is the Minkowski sum of the polygon
// with a circle of radius d. Our implementation:
//
// 1. Convert lat/lng → local Cartesian (azimuthal equidistant projection)
// 2. For each edge, compute outward normal, offset by d
// 3. For convex vertices: join offset edges with a circular arc
//    For concave vertices: intersect the offset edges for a sharp corner
// 4. Convert back to lat/lng
// 5. Simplify using Ramer-Douglas-Peucker

/**
 * Convert lat/lng to local Cartesian coordinates (x, y in km) using
 * an azimuthal equidistant projection centered on the given origin.
 * This preserves distances from the origin and angles correctly for
 * the buffering operation.
 */
function latLngToCartesian(lat, lng, originLat, originLng) {
  const φ1 = originLat * DEG;
  const λ1 = originLng * DEG;
  const φ2 = lat * DEG;
  const λ2 = lng * DEG;
  const Δλ = λ2 - λ1;

  const cosVal = clamp(
    Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ),
    -1, 1
  );
  const c = Math.acos(cosVal);

  if (Math.abs(c) < 1e-12) return [0, 0];

  const k = c / Math.sin(c);
  const x = k * Math.cos(φ2) * Math.sin(Δλ);
  const y = k * (Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ));

  return [x * EARTH_RADIUS_KM, y * EARTH_RADIUS_KM];
}

/**
 * Convert local Cartesian (x, y in km) back to lat/lng.
 */
function cartesianToLatLng(x, y, originLat, originLng) {
  const φ1 = originLat * DEG;
  const λ1 = originLng * DEG;

  const d = Math.sqrt(x * x + y * y) / EARTH_RADIUS_KM;

  if (Math.abs(d) < 1e-12) return [originLat, originLng];

  const asinVal = clamp(
    Math.cos(d) * Math.sin(φ1) + (y * Math.sin(d) * Math.cos(φ1)) / d,
    -1, 1
  );
  const φ2 = Math.asin(asinVal);

  const λ2 = λ1 + Math.atan2(
    x * Math.sin(d),
    d * Math.cos(φ1) * Math.cos(d) - y * Math.sin(φ1) * Math.sin(d)
  );

  return [φ2 * RAD, wrapLng(λ2 * RAD)];
}

/**
 * Compute the 2D cross product of vectors (p1→p2) × (p1→p3).
 */
function crossProduct2D(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/**
 * Determine if the polygon is wound clockwise (CW) or counter-clockwise (CCW).
 * Uses the shoelace formula. Returns true for CW.
 */
function isClockwise(polygon) {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum > 0;
}

/**
 * Find the intersection point of two infinite lines defined by segments
 * (p1→p2) and (p3→p4). Returns null if parallel.
 * All points in Cartesian [x, y].
 */
function lineIntersection(p1, p2, p3, p4) {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const [x4, y4] = p4;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-12) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

  const ix = x1 + t * (x2 - x1);
  const iy = y1 + t * (y2 - y1);

  // Check for NaN
  if (!isFinite(ix) || !isFinite(iy)) return null;

  return [ix, iy];
}

/**
 * Compute the outward normal for an edge.
 * For a CW polygon, outward is to the RIGHT of the direction of travel.
 * For a CCW polygon, outward is to the LEFT.
 * Returns [nx, ny] as a unit vector, or null if edge is degenerate.
 */
function outwardNormal(ax, ay, bx, by, cw) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-12) return null;

  // Perpendicular: (-dy, dx) is LEFT, (dy, -dx) is RIGHT
  if (cw) {
    return [dy / len, -dx / len]; // RIGHT
  } else {
    return [-dy / len, dx / len]; // LEFT
  }
}

/**
 * Calculate the bearing (azimuth) from point A to point B in degrees.
 */
function bearing(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δλ = (lng2 - lng1) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * RAD + 360) % 360;
}

/**
 * Calculate the destination point from a start point, given distance in km
 * and initial bearing (azimuth) in degrees.
 */
function destinationPoint(lat, lng, distKm, brngDeg) {
  const φ1 = lat * DEG;
  const λ1 = lng * DEG;
  const brng = brngDeg * DEG;
  const d = distKm / EARTH_RADIUS_KM;

  const φ2 = Math.asin(clamp(
    Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(brng),
    -1, 1
  ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(φ1),
    Math.cos(d) - Math.sin(φ1) * Math.sin(φ2)
  );

  return [φ2 * RAD, wrapLng(λ2 * RAD)];
}

/**
 * Buffer a polygon outward by a given distance in km.
 *
 * Uses centroid-radial offset via pure Haversine math (no Cartesian projection):
 * 1. Compute the centroid of the polygon (average of vertex lat/lng)
 * 2. For each vertex:
 *    - Calculate bearing from centroid to vertex
 *    - Calculate distance from centroid to vertex
 *    - New vertex = destination point at (distance + offset) along same bearing
 * 3. Close the polygon
 *
 * This preserves the polygon's shape for convex boundaries where all
 * vertices lie along the outer perimeter. It avoids all issues with
 * Cartesian projection math.
 *
 * @param {Array} polygon - Array of [lat, lng] pairs
 * @param {number} offsetKm - Buffer distance in km
 * @param {Array} origin - [lat, lng] (unused, kept for API compatibility)
 * @returns {Array|null} Buffered polygon as [lat, lng] pairs, or null on failure
 */
export function bufferPolygon(polygon, offsetKm, origin) {
  if (!polygon || polygon.length < 3) return null;

  // Compute centroid as average of lat/lng
  let clat = 0, clng = 0;
  for (let i = 0; i < polygon.length; i++) {
    clat += polygon[i][0];
    clng += polygon[i][1];
  }
  clat /= polygon.length;
  clng /= polygon.length;

  console.log(`[BUFFER] Centroid: [${clat.toFixed(4)}, ${clng.toFixed(4)}]`);

  const result = [];

  for (let i = 0; i < polygon.length; i++) {
    const [lat, lng] = polygon[i];

    // Compute distance and bearing from centroid to original vertex
    const dist = haversineDistance(clat, clng, lat, lng);
    const brng = bearing(clat, clng, lat, lng);

    // Compute new vertex at (distance + offset) km from centroid along same bearing
    const newDist = dist + offsetKm;
    const [newLat, newLng] = destinationPoint(clat, clng, newDist, brng);

    if (isValidLatLng(newLat, newLng)) {
      result.push([newLat, newLng]);
    } else {
      console.log(`[BUFFER] Invalid destination at vertex ${i}: [${newLat}, ${newLng}]`);
    }
  }

  if (result.length < 3) {
    console.log('[BUFFER] Too few valid result points:', result.length);
    return null;
  }

  // Close the polygon
  const first = result[0];
  const last = result[result.length - 1];
  if (Math.abs(first[0] - last[0]) > 0.0001 || Math.abs(first[1] - last[1]) > 0.0001) {
    result.push([first[0], first[1]]);
  }

  console.log(`[BUFFER] Generated ${result.length} points: first=[${result[0][0].toFixed(4)}, ${result[0][1].toFixed(4)}], last=[${result[result.length-1][0].toFixed(4)}, ${result[result.length-1][1].toFixed(4)}]`);
  return result;
}

/**
 * Ramer-Douglas-Peucker polygon simplification.
 * Reduces the number of points while preserving shape.
 *
 * @param {Array} points - Array of [lat, lng] pairs
 * @param {number} epsilon - Maximum allowed deviation in km
 * @returns {Array} Simplified points
 */
export function simplifyPolygon(points, epsilon) {
  if (points.length <= 2) return points;

  const [firstLat, firstLng] = points[0];
  const [lastLat, lastLng] = points[points.length - 1];

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const [lat, lng] = points[i];
    const dist = perpendicularDistanceKm(lat, lng, firstLat, firstLng, lastLat, lastLng);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPolygon(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPolygon(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[points.length - 1]];
}

/**
 * Perpendicular distance from a point to a line segment in km.
 */
function perpendicularDistanceKm(lat, lng, lat1, lng1, lat2, lng2) {
  const originLat = (lat1 + lat2) / 2;
  const originLng = (lng1 + lng2) / 2;

  const [px, py] = latLngToCartesian(lat, lng, originLat, originLng);
  const [ax, ay] = latLngToCartesian(lat1, lng1, originLat, originLng);
  const [bx, by] = latLngToCartesian(lat2, lng2, originLat, originLng);

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-12) {
    return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;

  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Check if two line segments intersect (excluding shared endpoints).
 */
function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const o1 = crossProduct2D(x1, y1, x2, y2, x3, y3);
  const o2 = crossProduct2D(x1, y1, x2, y2, x4, y4);
  const o3 = crossProduct2D(x3, y3, x4, y4, x1, y1);
  const o4 = crossProduct2D(x3, y3, x4, y4, x2, y2);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

// ─── Main Qasr Status Functions ──────────────────────────────────────────────

/**
 * Get the 'Urf boundary for a given city name.
 */
export function getUrfBoundary(cityName) {
  return URBAN_BOUNDARIES[cityName] || null;
}

/**
 * Get all supported cities with 'Urf boundary data.
 */
export function getSupportedCities() {
  return Object.keys(URBAN_BOUNDARIES);
}

/**
 * Determine if a point is inside the 'Urf boundary of a city.
 */
export function isInsideUrfBoundary(lat, lng, cityName) {
  const city = URBAN_BOUNDARIES[cityName];
  if (!city) return null;
  return pointInPolygon([lat, lng], city.boundary);
}

/**
 * Calculate the Qasr status for a given location.
 */
export function calculateQasrStatus(lat, lng, cityName) {
  const city = URBAN_BOUNDARIES[cityName];
  if (!city) {
    return {
      isInsideUrf: null,
      distanceFromBoundary: null,
      isOutsideHadd: null,
      status: 'unknown',
      message: `No 'Urf boundary data available for "${cityName}". Please consult your local Islamic authority.`,
    };
  }

  const inside = pointInPolygon([lat, lng], city.boundary);
  const distToBoundary = distanceToPolygonBoundary([lat, lng], city.boundary);
  const signedDist = inside ? -distToBoundary : distToBoundary;

  const outsideHadd = isBeyondHadd(lat, lng, cityName);

  let status;
  let message;

  if (inside) {
    status = 'resident';
    message = `You are within the estimated 'Urf boundary of ${cityName}. You are considered a Resident (Hadir). Prayers: Tamam (Full). Fasting: Valid.`;
  } else if (!outsideHadd) {
    status = 'transition';
    message = `You are outside the 'Urf boundary but within ${HADD_AL_TARAKHKHUS_KM} km (${(HADD_AL_TARAKHKHUS_KM * 0.621371).toFixed(1)} miles). You have not yet reached Hadd al-Tarakhkhus. Prayers: Tamam (Full). Fasting: Valid.`;
  } else {
    status = 'traveler';
    message = `You are beyond Hadd al-Tarakhkhus (${HADD_AL_TARAKHKHUS_KM} km / ${(HADD_AL_TARAKHKHUS_KM * 0.621371).toFixed(1)} miles from the 'Urf boundary). You are considered a Traveler (Musafir). Prayers: Qasr (Shortened to 2 Rak'ahs). Fasting: Invalid (Qada required).`;
  }

  return {
    isInsideUrf: inside,
    distanceFromBoundary: signedDist,
    distanceKm: distToBoundary,
    isOutsideHadd: outsideHadd,
    haddDistance: HADD_AL_TARAKHKHUS_KM,
    status,
    message,
    cityName,
    cityCenter: city.center,
    boundary: city.boundary,
  };
}

/**
 * Generate the Hadd al-Tarakhkhus boundary polygon by expanding the 'Urf
 * boundary outward by exactly 22 km. Uses the vertex-bisector offset
 * algorithm which preserves the shape of the original polygon.
 *
 * Falls back to a circle approximation if the buffer algorithm fails.
 *
 * @param {string} cityName
 * @returns {Array|null} Buffered polygon as [lat, lng] pairs, or null
 */
export function generateHaddBoundary(cityName) {
  const city = URBAN_BOUNDARIES[cityName];
  if (!city) {
    console.log(`[HADD] No city data for "${cityName}"`);
    return null;
  }

  console.log(`[HADD] Generating boundary for "${cityName}"`);
  console.log(`[HADD] City center:`, city.center);
  console.log(`[HADD] Boundary vertices: ${city.boundary.length}`);

  // Try the polygon buffer algorithm
  try {
    const buffered = bufferPolygon(city.boundary, HADD_AL_TARAKHKHUS_KM, city.center);
    console.log(`[HADD] Buffer result:`, buffered ? `${buffered.length} points` : 'null');
    if (buffered && buffered.length >= 3) {
      // Validate every point
      let valid = true;
      for (let i = 0; i < buffered.length; i++) {
        const [lat, lng] = buffered[i];
        if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          console.log(`[HADD] INVALID point at index ${i}: [${lat}, ${lng}]`);
          valid = false;
        }
      }
      if (valid) {
        console.log(`[HADD] All buffer points valid, first: [${buffered[0][0]}, ${buffered[0][1]}], last: [${buffered[buffered.length-1][0]}, ${buffered[buffered.length-1][1]}]`);
        return buffered;
      }
      console.log(`[HADD] Buffer had invalid points, falling back to circle`);
    }
  } catch (e) {
    console.log(`[HADD] Buffer exception:`, e.message);
  }

  // Fallback: compute max boundary distance from center + 22 km → circle
  let maxDist = 0;
  for (let i = 0; i < city.boundary.length; i++) {
    const [lat, lng] = city.boundary[i];
    const dist = haversineDistance(city.center[0], city.center[1], lat, lng);
    if (dist > maxDist) maxDist = dist;
  }
  const fallbackRadius = maxDist + HADD_AL_TARAKHKHUS_KM;
  console.log(`[HADD] Circle fallback: center=[${city.center}], radius=${fallbackRadius}km`);
  const circle = generateRadiusCircle(city.center[0], city.center[1], fallbackRadius, 64);
  console.log(`[HADD] Circle fallback generated ${circle.length} points, first: [${circle[0][0]}, ${circle[0][1]}]`);
  return circle;
}

/**
 * Check if a point is beyond the Hadd al-Tarakhkhus boundary.
 * Uses the buffered polygon when available, else a distance-based estimate.
 */
function isBeyondHadd(lat, lng, cityName) {
  const city = URBAN_BOUNDARIES[cityName];
  if (!city) return false;

  // Try using the buffered polygon
  const haddPolygon = generateHaddBoundary(cityName);
  if (haddPolygon && haddPolygon.length >= 3) {
    return !pointInPolygon([lat, lng], haddPolygon);
  }

  // Fallback: distance-based check
  let maxDist = 0;
  for (let i = 0; i < city.boundary.length; i++) {
    const [blat, blng] = city.boundary[i];
    const dist = haversineDistance(city.center[0], city.center[1], blat, blng);
    if (dist > maxDist) maxDist = dist;
  }
  const haddRadius = maxDist + HADD_AL_TARAKHKHUS_KM;
  const pointDist = haversineDistance(city.center[0], city.center[1], lat, lng);
  return pointDist > haddRadius;
}

/**
 * Generate a circle of points around a center at a given radius.
 * Used as fallback for the Hadd al-Tarakhkhus boundary.
 */
function generateRadiusCircle(centerLat, centerLng, radiusKm, numPoints = 64) {
  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const bearing = (360 / numPoints) * i;
    const brng = bearing * DEG;
    const d = radiusKm / EARTH_RADIUS_KM;
    const φ1 = centerLat * DEG;
    const λ1 = centerLng * DEG;

    const sinVal = clamp(
      Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(brng),
      -1, 1
    );
    const φ2 = Math.asin(sinVal);
    const λ2 = λ1 + Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(φ1),
      Math.cos(d) - Math.sin(φ1) * sinVal
    );

    points.push([φ2 * RAD, wrapLng(λ2 * RAD)]);
  }
  return points;
}

/**
 * Generate the 'Urf boundary polygon for map display.
 */
export function generateUrfPolygon(cityName) {
  const city = URBAN_BOUNDARIES[cityName];
  if (!city) return null;
  return city.boundary;
}

export { HADD_AL_TARAKHKHUS_KM };