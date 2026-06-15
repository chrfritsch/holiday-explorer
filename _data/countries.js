const EleventyFetch = require("@11ty/eleventy-fetch");

const EUROPEAN_ISO = new Set([
  "AD", "AL", "AT", "BE", "BG", "BY", "CH", "CZ", "DE",
  "EE", "ES", "FR", "HR", "HU", "IE", "IT", "LI", "LT", "LU", "LV",
  "MC", "MD", "MT", "NL", "PL", "PT", "RO", "RS", "SE", "SI", "SK", "SM", "VA",
]);

module.exports = async function () {
  const all = await EleventyFetch("https://openholidaysapi.org/Countries", {
    duration: "7d",
    type: "json",
  });
  return all
    .filter((c) => EUROPEAN_ISO.has(c.isoCode))
    .map((c) => ({
      isoCode: c.isoCode,
      name: (c.name || []).find((n) => n.language === "EN")?.text ?? c.isoCode,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
