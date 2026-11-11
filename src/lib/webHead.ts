/**
 * Web-only head setup: the Google Sans Flex variable font, the [hue] text
 * gradient + hue-cycle animation, and visible keyboard focus rings.
 * (The production build also bakes the font link into index.html — see
 * scripts/web-postbuild.mjs — so text never flashes in a fallback font.)
 */

import { Platform } from "react-native";

export const FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,slnt,wdth,wght,GRAD,ROND@6..144,-10..0,25..151,1..1000,0..100,0..100&display=swap";

const CSS = `
.gh-hue-text{display:inline-block;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
@keyframes gh-hue{to{filter:hue-rotate(360deg)}}
.gh-hue-spin{animation:gh-hue 60s linear infinite}
@media (prefers-reduced-motion: reduce){.gh-hue-spin{animation:none}}
[role="button"]:focus-visible,[role="link"]:focus-visible,[role="radio"]:focus-visible,[role="tab"]:focus-visible,[role="switch"]:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid #FF7A8C;outline-offset:3px;border-radius:12px}
body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-optical-sizing:auto}
`;

export function installWebHead() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (!document.getElementById("gh-font")) {
    for (const href of ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]) {
      const l = document.createElement("link");
      l.rel = "preconnect";
      l.href = href;
      if (href.includes("gstatic")) l.crossOrigin = "anonymous";
      document.head.appendChild(l);
    }
    const link = document.createElement("link");
    link.id = "gh-font";
    link.rel = "stylesheet";
    link.href = FONT_CSS;
    document.head.appendChild(link);
  }
  if (!document.getElementById("gh-style")) {
    const style = document.createElement("style");
    style.id = "gh-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
