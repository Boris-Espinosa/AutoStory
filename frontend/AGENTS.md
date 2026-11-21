# Frontend

## Stack
- Expo ~58 (React Native + web) con Expo Router ~58 y TypeScript estricto (`tsconfig` con `strict: true`). Auth: Clerk (`@clerk/expo`).

## Comandos
- Desarrollo: `npx expo start` (o `npm run start`) · Lint: `npm run lint` · Tipos: `npx tsc --noEmit`

## Convenciones
- Componentes funcionales con hooks; componentes en `src/components/` y `src/components/ui/` (un componente por archivo).
- Rutas en `app/` (Expo Router). No metas lógica de datos dentro de las pantallas: usa hooks o servicios (`src/hooks/`, `src/api/`, `src/features/`).
- Todo debe funcionar en móvil y en web; no uses APIs exclusivas de una plataforma sin comprobarlo.
- La URL de la API sale de `EXPO_PUBLIC_API_URL` (cliente en `src/api/client.ts`); no la dejes fija en el código.
- No cambies el diseño ni la paleta existentes sin que te lo pida (`docs/ui-design.md`, `src/theme.ts`).

## Cuidado
- Las variables `EXPO_PUBLIC_*` son públicas: nunca pongas secretos ahí.

## Estructura después del refactor

`app/` contiene solo rutas delgadas (re-exports de una línea), salvo los dos `_layout.tsx`, que se quedan con navegación y proveedores. No crear helpers, `index.ts` ni carpetas nuevas dentro de `app/`: Expo Router los trata como rutas. No renombrar archivos, carpetas, `(grupos)` ni `[params]`: cambiarían las URLs.

```
frontend/
├── app/
│   ├── _layout.tsx                 # se queda (navegación/proveedores)
│   ├── (auth)/                     # sign-in, sso-callback → re-exports
│   ├── (tabs)/                     # _layout.tsx se queda; index, account, appointments,
│   │                               # notifications → re-exports
│   ├── account/delete.tsx          # re-export
│   ├── appointments/               # new, [appointmentId], [appointmentId]/edit → re-exports
│   └── vehicles/                   # new, [vehicleId]/{index,edit}; parts/{index,new};
│                                   # maintenances/{index,new,[maintenanceId]}, [maintenanceId]/edit
├── src/
│   ├── api/                        # compartido: client, vehicles, parts, maintenances,
│                                   # appointments, workshops, notifications
│   ├── components/                 # compartido: ui/ + MessageBanner, SelectField,
│                                   # TextField, CreateWorkshopModal
│   ├── hooks/                      # compartido: useBreakpoint, useFormScroll
│   ├── utils/                      # helpers puros compartidos
│   ├── notifications/              # infraestructura de recordatorios locales (local.ts, setup.ts)
│   ├── theme.ts                    # único tema
│   └── features/
│       ├── account/                # api/me.ts + screens/{AccountScreen, DeleteAccountScreen}
│       ├── auth/                   # AuthBridge.tsx + screens/{SignInScreen, SsoCallbackScreen}
│       ├── appointments/           # components/AppointmentsList + screens/{AppointmentsScreen,
│       │                           # AppointmentDetailScreen, AppointmentFormScreen}
│       ├── vehicles/               # screens/{VehiclesListScreen, VehicleDetailScreen, VehicleFormScreen}
│       ├── parts/                  # components/PartsTab + screens/AddPartScreen
│       ├── maintenances/           # components/MaintenancesTab + screens/{MaintenanceFormScreen,
│       │                           # MaintenanceDetailScreen}
│       └── notifications/          # screens/NotificationsScreen
└── docs/                           # documentación; no forma parte de src/
```

## Dependencias entre features

- `features/vehicles` puede importar de `features/appointments`, `features/parts` y `features/maintenances` (componentes de pestañas). Nunca al revés.
- Cualquier feature puede importar `src/api/*`, `src/components/*`, `src/hooks/*`, `src/utils/*`, `src/theme.ts` y `src/notifications/*`.
- Lo compartido (`src/api`, `components`, `hooks`, `utils`, `notifications`) no importa desde ningún feature.

## Profundidad de imports

`tsconfig.json` no define `paths`: todos los imports son relativos (no agregar alias).

- Archivo en `src/features/<f>/{screens,components,api}/`: `src/<X>` → `../../../<X>`; `assets/<X>` → `../../../../assets/<X>` (4 niveles, no 3).
- Dentro del mismo feature: `../api/...`, `../components/...`.
- Ruta en `app/`: un `../` por cada carpeta bajo `app/` más uno. Ejemplos: `app/(tabs)/index.tsx` → `../../src/...`; `app/vehicles/[vehicleId]/index.tsx` → `../../../src/...`; `app/vehicles/[vehicleId]/maintenances/[maintenanceId].tsx` → `../../../../src/...`.

## Verificación

Además de `npx tsc --noEmit` y `npm run lint`, correr `expo export`: `tsc` no valida rutas de imágenes (`assets.d.ts` declara `*.png`), así que una ruta de assets mal calculada solo aparece al empaquetar.

```
$out = Join-Path $env:TEMP 'autostory-web-export'
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
npx expo export --platform web --output-dir $out
Remove-Item -Recurse -Force $out
```

El lint tiene 5 errores y 8 warnings preexistentes: comparar por total y regla, no por ruta ni línea.

## Dos carpetas `notifications`

- `src/notifications/`: infraestructura de recordatorios locales (`local.ts`, `setup.ts`). La usan `app/_layout.tsx`, `AuthBridge`, `api/appointments.ts` y las pantallas de cuenta.
- `src/features/notifications/`: solo la pantalla `screens/NotificationsScreen.tsx`.
