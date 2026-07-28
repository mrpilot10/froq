export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Vercel reserves the TZ env var (cannot set in project settings). Force IST
    // at Node startup so local-Date analytics match Asia/Kolkata. Locally,
    // package.json scripts also set TZ before process start.
    process.env.TZ = "Asia/Kolkata";
  }
}
