/**
 * Devuelve una ruta interna a la que volver tras iniciar sesión.
 * Cualquier otra cosa (ruta relativa, externa o el propio /sign-in) vuelve a "/".
 */
export function safeRedirect(path: string | null | undefined): string {
  if (!path || !path.startsWith('/')) {
    return '/';
  }

  if (path.startsWith('//') || path.includes('://')) {
    return '/';
  }

  if (path === '/sign-in' || path.startsWith('/sign-in?')) {
    return '/';
  }

  return path;
}
