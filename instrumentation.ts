export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { iniciarHealthCheck } = await import("@/lib/conectividad/healthCheck");
    const { detectarModoVerificacion } = await import("@/lib/auth/jwtLocal");
    iniciarHealthCheck();
    void detectarModoVerificacion();
  }
}
