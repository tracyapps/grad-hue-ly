/**
 * After `expo export -p web`: bake the things crawlers and first paint need
 * into dist/index.html — title, description, social cards, theme color,
 * icons, and the Google Sans Flex stylesheet (no fallback-font flash).
 */
import fs from "node:fs";

const file = new URL("../dist/index.html", import.meta.url);
let html = fs.readFileSync(file, "utf8");

const SITE = "https://gradhuely.com";
const TITLE = "grad[hue]ly — endless gradient puzzles";
const DESC =
  "Put the rainbow back in order. A calm color-gradient puzzle with endless boards, any size you like, and boards made by the community. No timers, no ads.";
const FONT =
  "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,slnt,wdth,wght,GRAD,ROND@6..144,-10..0,25..151,1..1000,0..100,0..100&display=swap";

const head = `
    <meta name="description" content="${DESC}" />
    <meta name="theme-color" content="#141118" />
    <meta name="color-scheme" content="dark" />
    <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="grad[hue]ly" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESC}" />
    <meta property="og:url" content="${SITE}" />
    <meta property="og:image" content="${SITE}/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${SITE}/og-image.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link id="gh-font" rel="stylesheet" href="${FONT}" />
`;

html = html.replace(/<title>.*?<\/title>/s, `<title>${TITLE}</title>`);
if (!html.includes('id="gh-font"')) html = html.replace("</head>", `${head}</head>`);
fs.writeFileSync(file, html);
console.log("web-postbuild: head tags written");
