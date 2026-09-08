const fs = require("fs");
let css = fs.readFileSync("client/src/index.css", "utf8");
// Root + per-theme tone vars ? RGB channel triplets (alpha-value format).
const map = [
  ["--tone-black: #141413;", "--tone-black: 20 20 19;"],
  ["--tone-white: #FAF9F5;", "--tone-white: 250 249 245;"],
  ["--tone-black: #10152A;", "--tone-black: 16 21 42;"],
  ["--tone-white: #E9ECF7;", "--tone-white: 233 236 247;"],
  ["--tone-black: #1F2925;", "--tone-black: 31 41 37;"],
  ["--tone-white: #FFFFFF;", "--tone-white: 255 255 255;"],
  ["--tone-black: #221B12;", "--tone-black: 34 27 18;"],
  ["--tone-white: #FBF6E9;", "--tone-white: 251 246 233;"],
  ["--tone-black: #1B1526;", "--tone-black: 27 21 38;"],
  ["--tone-white: #F2EBD9;", "--tone-white: 242 235 217;"],
];
for (const [from, to] of map) css = css.split(from).join(to);
fs.writeFileSync("client/src/index.css", css);
console.log("tone vars converted to channel triplets");
