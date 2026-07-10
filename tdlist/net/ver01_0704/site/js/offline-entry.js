import { bootstrap } from "./bootstrap.js";

function boot(pageId) {
  return bootstrap(pageId || "home");
}

if (typeof window !== "undefined") {
  window.VokaBoot = { boot };
}
