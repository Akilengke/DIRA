/* Reference list of active armed conflicts and violence hotspots (as of mid-2026), shared by server and browser.
 * It is a starting point, not a live source: Scavenge measures current intensity from news reports (GDELT) near each
 * zone, and the dashboard links to ACLED and Crisis Group for verification. Wording is deliberately neutral. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScavengeConflicts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // [id, name, country, lat, lon, radius km, level (war|high|elevated), summary, since]
  const Z = [
    ['sudan-khartoum', 'Khartoum & Gezira', 'Sudan', 15.4, 32.8, 300, 'war', 'War between the Sudanese Armed Forces (SAF) and the Rapid Support Forces (RSF).', 2023],
    ['sudan-darfur', 'Darfur', 'Sudan', 13.5, 24.5, 550, 'war', 'SAF–RSF war; sieges and attacks on civilians in North Darfur and El Fasher.', 2023],
    ['sudan-kordofan', 'Kordofan', 'Sudan', 12.3, 29.8, 350, 'war', 'Front line of the SAF–RSF war.', 2023],
    ['ukraine', 'Eastern & southern Ukraine', 'Ukraine', 48.0, 37.0, 420, 'war', 'Russia–Ukraine war; front line from Kharkiv to Kherson, long-range strikes across both countries.', 2022],
    ['gaza', 'Gaza', 'Palestine', 31.4, 34.35, 40, 'war', 'Israel–Hamas war; ceasefire arrangements are fragile, check current status.', 2023],
    ['drc-kivu', 'North & South Kivu', 'Dem. Rep. Congo', -1.6, 28.9, 260, 'war', 'Fighting between the M23/AFC rebellion, the Congolese army and allied armed groups.', 2021],
    ['drc-ituri', 'Ituri', 'Dem. Rep. Congo', 1.6, 30.0, 180, 'high', 'Armed-group attacks on civilians (CODECO, ADF).', 2017],
    ['sahel', 'Central Sahel', 'Mali · Burkina Faso · Niger', 14.0, -1.0, 750, 'war', 'Insurgencies by JNIM and Islamic State Sahel against national forces.', 2012],
    ['somalia', 'Southern & central Somalia', 'Somalia', 2.8, 44.5, 420, 'high', 'Al-Shabaab insurgency against the federal government and African Union forces.', 2006],
    ['myanmar', 'Myanmar', 'Myanmar', 21.0, 96.0, 520, 'war', 'Civil war between the military government and resistance and ethnic armed organisations.', 2021],
    ['ethiopia-amhara', 'Amhara', 'Ethiopia', 11.6, 38.0, 300, 'high', 'Conflict between federal forces and Fano militias.', 2023],
    ['ethiopia-oromia', 'Western Oromia', 'Ethiopia', 9.0, 36.3, 260, 'elevated', 'Insurgency by the Oromo Liberation Army.', 2018],
    ['haiti', 'Port-au-Prince', 'Haiti', 18.55, -72.3, 70, 'high', 'Gang coalitions control much of the capital; humanitarian crisis.', 2021],
    ['nigeria-ne', 'Lake Chad basin', 'Nigeria · Niger · Chad · Cameroon', 12.2, 13.8, 360, 'high', 'Boko Haram and Islamic State West Africa Province attacks.', 2009],
    ['nigeria-nw', 'North-west Nigeria', 'Nigeria', 12.4, 6.4, 300, 'high', 'Armed banditry and kidnappings.', 2011],
    ['yemen', 'Yemen & southern Red Sea', 'Yemen', 15.4, 44.2, 450, 'high', 'Conflict between the Houthi movement and government-aligned forces; attacks on Red Sea shipping.', 2014],
    ['syria', 'Syria', 'Syria', 35.0, 38.5, 360, 'elevated', 'Post-2024 transition with intermittent clashes and security incidents.', 2011],
    ['mozambique', 'Cabo Delgado', 'Mozambique', -12.5, 40.0, 200, 'elevated', 'Islamic State-linked insurgency.', 2017],
    ['south-sudan', 'South Sudan', 'South Sudan', 7.5, 31.0, 380, 'elevated', 'Localised armed conflict and political tensions.', 2013],
    ['pakistan-kp', 'Khyber Pakhtunkhwa', 'Pakistan', 33.5, 71.0, 260, 'high', 'Militant attacks, including by the Pakistani Taliban (TTP).', 2007],
    ['pakistan-bal', 'Balochistan', 'Pakistan', 28.5, 65.5, 380, 'elevated', 'Separatist insurgency.', 2004],
    ['colombia', 'Catatumbo & Cauca', 'Colombia', 7.0, -74.5, 380, 'elevated', 'Clashes between ELN, FARC dissident factions and other armed groups.', 1964],
    ['cameroon', 'Anglophone regions', 'Cameroon', 5.9, 10.0, 160, 'elevated', 'Separatist conflict in the North-West and South-West regions.', 2017],
    ['mexico', 'Sinaloa & neighbouring states', 'Mexico', 24.8, -107.4, 300, 'elevated', 'Organised-crime violence between cartel factions.', 2006],
    ['lebanon', 'Southern Lebanon', 'Lebanon', 33.25, 35.4, 70, 'elevated', 'Israel–Hezbollah hostilities; ceasefire violations reported.', 2023]
  ].map(([id, name, country, lat, lon, km, level, summary, since]) => ({ id, name, country, lat, lon, km, level, summary, since }));
  const LEVEL = { war: { label: 'Armed conflict', color: '#ff3b3b', rank: 0 }, high: { label: 'High violence', color: '#ff8a3d', rank: 1 }, elevated: { label: 'Elevated violence', color: '#e6c84e', rank: 2 } };
  const QUERY = '(airstrike OR shelling OR "armed clashes" OR militants OR insurgents OR "drone strike" OR "killed in fighting" OR offensive OR militia)';
  return { ZONES: Z, LEVEL, QUERY, asOf: 'mid-2026' };
});
