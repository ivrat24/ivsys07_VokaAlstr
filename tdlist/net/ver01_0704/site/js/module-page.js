import { bootstrap } from "./bootstrap.js";

export async function initModulePage(moduleId) {
  try {
    await bootstrap(moduleId);
  } catch (error) {
    console.error("[Voka] 页面初始化失败:", error);
  }
}
