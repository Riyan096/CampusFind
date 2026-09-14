process.env.ESLINT_USE_FLAT_CONFIG = "false";

const { ESLint } = require("eslint");

(async () => {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(["."]);
  const formatter = await eslint.loadFormatter("stylish");
  const output = formatter.format(results);

  if (output) {
    console.log(output);
  }

  const hasErrors = results.some((result) => result.errorCount > 0);

  if (hasErrors) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});