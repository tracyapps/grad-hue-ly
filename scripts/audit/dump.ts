import { generateLevel, generateZen, chapterName } from "../../src/engine";
const levels = process.argv.slice(2).map(Number);
const out = levels.map((n) => {
  const p = n > 0 ? generateLevel(n) : generateZen(-n, { size: "grand", subtlety: "ethereal" });
  return { n, name: n > 0 ? chapterName(n) : "zen", cols: p.cols, rows: p.rows, colors: p.colors, step: p.params.step };
});
console.log(JSON.stringify(out));
