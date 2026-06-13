export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDebateWorker } = await import("./lib/debate-engine");
    startDebateWorker();
  }
}
