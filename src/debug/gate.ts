export function shouldLoadDebugPanel(search: string, isDev: boolean): boolean {
  // 试运行期(产品拍板 2026-07-05):dev 构建默认自动调出调参台,仅 ?debug=0 显式关闭。
  return isDev && new URLSearchParams(search).get("debug") !== "0";
}

export function shouldShowStyleboard(search: string, isDev: boolean): boolean {
  return isDev && new URLSearchParams(search).get("styleboard") === "1";
}
