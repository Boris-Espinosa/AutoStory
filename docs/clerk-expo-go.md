# Inicio de sesión con Clerk en Expo Go

Este documento explica cómo probar el inicio de sesión social desde Expo Go y qué
configurar en el panel de Clerk. La app usa `@clerk/expo` con `useSSO().startSSOFlow`.

## URL de redirección

El código genera la URL con:

```ts
AuthSession.makeRedirectUri({ scheme: 'autostory', path: 'sso-callback' })
```

El resultado depende del entorno de ejecución:

| Entorno | URL generada |
| --- | --- |
| Expo Go (Android/iOS) | `exp://<IP-del-equipo>:<puerto>/--/sso-callback` |
| Development build / app instalada | `autostory://sso-callback` |
| Web local | `http://localhost:8081/sso-callback` |

En Expo Go el esquema `autostory` se ignora a propósito: Expo Go solo puede
registrar el esquema `exp`. Por eso la URL real cambia con la IP y el puerto del
servidor de Metro.

Con el servidor actual en la red Wi-Fi `192.168.1.20` y el puerto por defecto
`8081`, la URL es:

```
exp://192.168.1.20:8081/--/sso-callback
```

La app imprime la URL exacta y el entorno al abrir la pantalla de inicio de sesión,
solo en desarrollo:

```
[sign-in] redirectUrl: exp://192.168.1.20:8081/--/sso-callback entorno: storeClient
```

Usa ese valor tal cual. Si cambia la IP, el puerto o el modo de conexión (LAN,
túnel o localhost), cambia la URL.

## Configuración en el panel de Clerk

1. Entra al panel de Clerk de la instancia de desarrollo.
2. Abre **Native applications** y habilita la Native API.
3. Registra la aplicación Android con su package name (y la de iOS con Bundle ID
   y App ID Prefix si corresponde).
4. En **Allowlist for mobile SSO redirect**, agrega la URL de redirección:
   - Expo Go: `exp://192.168.1.20:8081/--/sso-callback`
   - Development build: `autostory://sso-callback`
   - Producción: `<esquema>://sso-callback` con el esquema final de la app.
5. Para el flujo web, agrega también el origen y la ruta en **Redirect URLs** de la
   instancia (`http://localhost:8081/sso-callback` en desarrollo y el dominio de
   producción cuando exista).

Sin la URL exacta en la lista permitida, Clerk no completa el flujo y el navegador
termina en un error de conexión.

## Limitación de Apple en Expo Go

Apple no está disponible en Expo Go: el inicio de sesión con Apple requiere un
development build (y, en iOS, la configuración de Apple en Clerk). Por eso el botón
"Continuar con Apple" sigue visible, pero al pulsarlo en Expo Go muestra:

> Apple no está disponible en Expo Go. Usa Google o una versión instalada de la app

En Expo Go solo se prueba Google.

## Crear un development build

Con Android Studio y un emulador o dispositivo conectado:

```bash
cd frontend
npx expo run:android
```

Con EAS (sin Android Studio local):

```bash
cd frontend
npx eas-cli@latest build --profile development --platform android
```

Luego instala el build en el dispositivo y arranca el servidor para el cliente de
desarrollo:

```bash
npx expo start --dev-client
```

En un development build la redirección pasa a ser `autostory://sso-callback`
(definida por `expo.scheme` en `frontend/app.json`), así que esa URL también debe
estar en la lista permitida de Clerk.
