export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCronSync } = await import("./lib/cron");
    startCronSync();
  }
}
