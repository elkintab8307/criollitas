import { describe, expect, it, vi } from "vitest";
import { conTimeout, ErrorTimeout, marcarRedDegradadaPorTimeout } from "@/lib/offline/conTimeout";
import { useConectividadStore } from "@/lib/offline/conectividadStore";

describe("conTimeout", () => {
  it("resuelve con el valor real si la promesa termina antes del límite", async () => {
    vi.useFakeTimers();
    const promesa = new Promise((resolve) => setTimeout(() => resolve("ok"), 100));
    const resultado = conTimeout(promesa, 5000);
    await vi.advanceTimersByTimeAsync(100);
    await expect(resultado).resolves.toBe("ok");
    vi.useRealTimers();
  });

  it("rechaza con ErrorTimeout si la promesa no termina dentro del límite", async () => {
    vi.useFakeTimers();
    const promesaColgada = new Promise(() => {}); // nunca resuelve
    const resultado = conTimeout(promesaColgada, 5000);
    const expectativa = expect(resultado).rejects.toThrow(ErrorTimeout);
    await vi.advanceTimersByTimeAsync(5000);
    await expectativa;
    vi.useRealTimers();
  });

  it("propaga el rechazo real de la promesa si falla antes del límite", async () => {
    vi.useFakeTimers();
    const promesaQueFalla = new Promise((_, reject) => setTimeout(() => reject(new Error("fallo real")), 100));
    const resultado = conTimeout(promesaQueFalla, 5000);
    const expectativa = expect(resultado).rejects.toThrow("fallo real");
    await vi.advanceTimersByTimeAsync(100);
    await expectativa;
    vi.useRealTimers();
  });
});

describe("marcarRedDegradadaPorTimeout", () => {
  it("fuerza el estado de conectividad a offline como si el último ping hubiera fallado", () => {
    useConectividadStore.setState({ estado: "online", ultimoPing: null, navegadorOnline: true });
    marcarRedDegradadaPorTimeout();
    expect(useConectividadStore.getState().estado).toBe("offline");
    expect(useConectividadStore.getState().ultimoPing?.exito).toBe(false);
  });
});
