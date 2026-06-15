const EleventyFetch = require("@11ty/eleventy-fetch");

const EUROPEAN_ISO = new Set([
  "AD", "AL", "AT", "BE", "BG", "BY", "CH", "CZ", "DE",
  "EE", "ES", "FR", "HR", "HU", "IE", "IT", "LI", "LT", "LU", "LV",
  "MC", "MD", "MT", "NL", "PL", "PT", "RO", "RS", "SE", "SI", "SK", "SM", "VA",
]);

async function fetchBatch(tasks, batchSize = 6) {
  const results = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((t) => t()));
    results.push(...batchResults);
  }
  return results;
}

module.exports = async function () {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];
  const types = [
    { key: "public", endpoint: "PublicHolidays" },
    { key: "school", endpoint: "SchoolHolidays" },
  ];

  const allCountries = await EleventyFetch("https://openholidaysapi.org/Countries", {
    duration: "7d",
    type: "json",
  });
  const isoCodes = allCountries
    .filter((c) => EUROPEAN_ISO.has(c.isoCode))
    .map((c) => c.isoCode);

  const tasks = [];
  for (const isoCode of isoCodes) {
    for (const { key, endpoint } of types) {
      for (const year of years) {
        const cacheKey = `${isoCode}-${key}-${year}`;
        tasks.push(async () => {
          const url = `https://openholidaysapi.org/${endpoint}?countryIsoCode=${isoCode}&validFrom=${year}-01-01&validTo=${year}-12-31&languageIsoCode=EN`;
          try {
            const data = await EleventyFetch(url, { duration: "1d", type: "json" });
            return {
              cacheKey,
              data: data.map((h) => ({
                id: h.id,
                startDate: h.startDate,
                endDate: h.endDate,
                name: (h.name || []).find((n) => n.language === "EN")?.text ?? "",
                type: key,
                nationwide: h.nationwide ?? true,
                subdivisions: (h.subdivisions || []).map((s) => ({ code: s.code ?? "", name: s.shortName ?? "" })),
              })),
            };
          } catch (e) {
            console.warn(`[holidays] Failed ${cacheKey}: ${e.message}`);
            return { cacheKey, data: [] };
          }
        });
      }
    }
  }

  console.log(`[holidays] Fetching ${tasks.length} holiday datasets (batches of 6)…`);
  const fetched = await fetchBatch(tasks, 6);

  const result = {};
  for (const { cacheKey, data } of fetched) {
    result[cacheKey] = data;
  }
  console.log(`[holidays] Done.`);
  return result;
};
