import { beforeEach, describe, expect, it } from "vitest";
import { useConectividadStore } from "@/lib/offline/conectividadStore";

describe("useConectividadStore", () => {
  beforeEach(() => {
    useConectividadStore.setState({ estado: "online", ultimoPing: null });
  });

  it("arranca en online sin ping todavía", () => {
    expect(useConectividadStore.getState().estado).toBe("online");
  });

  it("registrar navegador offline pone el estado en offline", () => {
    useConectividadStore.getState().registrarNavegador(false);
    expect(useConectividadStore.getState().estado).toBe("offline");
  });

  it("un ping fallido con navegador online pone el estado en offline", () => {
    useConectividadStore.getState().registrarNavegador(true);
    useConectividadStore.getState().registrarPing({ exito: false, enMs: 3000 });
    expect(useConectividadStore.getState().estado).toBe("offline");
  });

  it("un ping exitoso después de uno fallido vuelve a online", () => {
    useConectividadStore.getState().registrarNavegador(true);
    useConectividadStore.getState().registrarPing({ exito: false, enMs: 3000 });
    useConectividadStore.getState().registrarPing({ exito: true, enMs: 60 });
    expect(useConectividadStore.getState().estado).toBe("online");
  });
});
