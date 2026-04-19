export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCronSync } = await import("./lib/cron");
    startCronSync();
    // Seed default admin (ignacio/5659) if users table is empty / admin missing.
    const { ensureDefaultAdmin } = await import("./lib/auth");
    await ensureDefaultAdmin();
  }
}
