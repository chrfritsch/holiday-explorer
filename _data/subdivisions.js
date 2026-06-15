const EleventyFetch = require("@11ty/eleventy-fetch");

const EUROPEAN_ISO = [
  "AD", "AL", "AT", "BE", "BG", "BY", "CH", "CZ", "DE",
  "EE", "ES", "FR", "HR", "HU", "IE", "IT", "LI", "LT", "LU", "LV",
  "MC", "MD", "MT", "NL", "PL", "PT", "RO", "RS", "SE", "SI", "SK", "SM", "VA",
];

module.exports = async function () {
  const result = {};
  for (const iso of EUROPEAN_ISO) {
    try {
      const data = await EleventyFetch(
        `https://openholidaysapi.org/Subdivisions?countryIsoCode=${iso}`,
        { duration: "7d", type: "json" }
      );
      if (data.length > 0) {
        result[iso] = data.map((s) => ({
          code: s.code,
          shortName: s.shortName ?? s.code.split("-").pop(),
          name: (s.name || []).find((n) => n.language === "EN")?.text
              ?? (s.name || [])[0]?.text
              ?? s.code,
          // All name variants for multilingual search (e.g. "Bayern" finds Bavaria)
          allNames: (s.name || []).map((n) => n.text),
        }));
      }
    } catch (e) {
      console.warn(`[subdivisions] No data for ${iso}: ${e.message}`);
    }
  }
  return result;
};
