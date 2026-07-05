export function shouldLoadDebugPanel(search: string, isDev: boolean): boolean {
  return isDev && new URLSearchParams(search).get("debug") === "1";
}
