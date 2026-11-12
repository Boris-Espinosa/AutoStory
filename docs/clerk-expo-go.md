# Inicio de sesión con Clerk en un development build

Este documento explica cómo probar el inicio de sesión social con Clerk fuera de
Expo Go. La app usa `@clerk/expo` con `useSSO().startSSOFlow` y
`expo-dev-client`.

## Por qué ya no se usa Expo Go para iniciar sesión

En Expo Go (Android), tras elegir la cuenta de Google, el navegador se queda en
la pantalla "Estás volviendo a acceder a Clerk" y la app nunca recupera el
control. Expo Go solo puede registrar el esquema `exp`, así que la redirección
sale como `exp://<IP>:<puerto>/--/sso-callback` y el retorno al flujo de la app
no es fiable.

Un **development build** es una app nativa propia que:

- Registra el esquema `autostory`, por lo que la redirección real es
  `autostory://sso-callback`.
- Incluye `expo-dev-client`, que conecta la app con el servidor de Metro igual
  que Expo Go.
- Incluye los módulos nativos de Clerk y permite probar también Apple (en iOS).

Por eso el inicio de sesión se prueba con el development build. Expo Go queda
solo para pantallas que no requieren iniciar sesión.

## Configuración del proyecto

- `frontend/app.json` define `"scheme": "autostory"`, el package de Android
  `com.autostory.app` y el bundle ID de iOS `com.autostory.app`.
- El plugin `@clerk/expo` está en `plugins`; registra el callback nativo de Clerk
  en Android y el entitlement de Apple en iOS.
- `frontend/eas.json` define el perfil `development` con `developmentClient:
  true`, `distribution: "internal"` y APK para Android.

## URL de redirección

El código genera la URL con:

```ts
AuthSession.makeRedirectUri({ scheme: 'autostory', path: 'sso-callback' })
```

| Entorno | URL generada |
| --- | --- |
| Development build / app instalada | `autostory://sso-callback` |
| Web local | `http://localhost:8081/sso-callback` |
| Expo Go (solo pantallas sin login) | `exp://<IP-del-equipo>:<puerto>/--/sso-callback` |

En un build nativo la URL es siempre `autostory://sso-callback`. La app imprime
la URL exacta y el entorno al abrir la pantalla de inicio de sesión, solo en
desarrollo:

```
[auth] redirectUrl: autostory://sso-callback entorno: bare
```

## Configuración en el panel de Clerk

1. Entra al panel de Clerk de la instancia de desarrollo.
2. Abre **Native applications** y habilita la Native API.
3. Registra la aplicación Android con el package name `com.autostory.app` (y la
   de iOS con el Bundle ID `com.autostory.app` y el App ID Prefix si
   corresponde).
4. En **Allowlist for mobile SSO redirect**, agrega la URL de redirección:
   - Development build: `autostory://sso-callback`
   - Producción: `<esquema>://sso-callback` con el esquema final de la app.
5. Para el flujo web, agrega también el origen y la ruta en **Redirect URLs** de
   la instancia (`http://localhost:8081/sso-callback` en desarrollo y el dominio
   de producción cuando exista).

Sin la URL exacta en la lista permitida, Clerk no completa el flujo y el navegador
termina en un error de conexión.

## Crear el development build con EAS

No hace falta Android Studio ni un emulador local. EAS compila en la nube y
entrega un APK instalable.

Primero inicia sesión en EAS (una sola vez por equipo):

```bash
cd frontend
npx eas-cli@latest login
```

Lanza el build de Android con el perfil `development`:

```bash
npx eas-cli@latest build --profile development --platform android
```

La primera vez EAS pide crear o vincular el proyecto y escribe el `projectId` en
`app.json`. Al terminar, la consola muestra una URL y un QR para descargar el
APK.

## Instalar el APK en el celular

1. Abre la URL del build en el celular o escanea el QR que muestra EAS.
2. Descarga el archivo `.apk`.
3. Si Android lo pide, permite instalar apps de origen desconocido para el
   navegador o el explorador de archivos.
4. Abre la app **AutoStory** instalada. Si el APK se descargó en el PC, también
   puedes instalarlo por USB con `adb install <archivo>.apk`; no necesitas
   Android Studio.

## Arrancar el servidor de desarrollo

Con el APK instalado, arranca Metro en modo development build:

```bash
cd frontend
npx expo start --dev-client
```

Abre la app instalada y conéctala al servidor con el QR o la URL que muestra la
consola. En el celular y el PC deben estar en la misma red Wi-Fi (o usa
`--tunnel` si la red lo bloquea).

## Apple

Apple no está disponible en Expo Go: requiere un development build y, en iOS, la
configuración de Apple en Clerk. En Expo Go solo se prueba Google.
