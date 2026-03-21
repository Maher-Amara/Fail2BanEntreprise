export async function register() {
  // Only run startup logic on the Node.js server (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs" || !process.env.NEXT_RUNTIME) {
    const { bootstrap } = await import("@/lib/startup");
    await bootstrap();
  }
}
