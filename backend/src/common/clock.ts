/**
 * Reloj del backend. La lógica de citas nunca llama a `new Date()`: recibe este
 * reloj para que los tests puedan fijar el instante.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
