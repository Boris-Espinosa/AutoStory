/** Registro mínimo a stdout/stderr; nunca recibe tokens, cabeceras ni datos personales. */
function line(message: string, detail?: string): string {
  return detail ? `${message} ${detail}` : message;
}

export function info(message: string): void {
  console.log(line(message));
}

export function warn(message: string, detail?: string): void {
  console.warn(line(message, detail));
}

export function error(message: string, detail?: string): void {
  console.error(line(message, detail));
}
