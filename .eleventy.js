module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addFilter("json", (value) => JSON.stringify(value));
  return {
    dir: { input: ".", output: "_site" },
  };
};
