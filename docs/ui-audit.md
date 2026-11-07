# Auditoría de interfaz actual

Revisión de solo lectura de `frontend/` (rutas en `app/`, componentes en `src/components/`, estilos en `src/theme/styles.ts`). No se modificó código. Referencia de destino: `docs/ui-design.md`.

## (a) Mapa de rutas actuales

Enrutado con Expo Router (archivos bajo `frontend/app/`). El layout raíz monta un `Stack` con `headerShown: false`, `QueryClientProvider` y `SafeAreaProvider`; cada pantalla dibuja su propio `ScreenHeader`.

| Archivo | Ruta | Pantalla que muestra |
|---|---|---|
| `app/_layout.tsx` | — | Layout raíz: `Stack`, `SafeAreaProvider`, `QueryClientProvider`. Sin barra de navegación. |
| `app/index.tsx` | `/` | Mis Vehículos: lista de tarjetas, botón "Registrar nuevo vehículo", modal de eliminación. Acepta `?flash` y `?flashTone`. |
| `app/vehicles/new.tsx` | `/vehicles/new` | Nuevo Vehículo: formulario completo, selector de marca, decodificación de VIN, foto. |
| `app/vehicles/[vehicleId]/parts/index.tsx` | `/vehicles/[vehicleId]/parts` | Repuestos Comprados: total gastado + lista de repuestos + botón "Añadir repuesto" fijo al pie. |
| `app/vehicles/[vehicleId]/parts/new.tsx` | `/vehicles/[vehicleId]/parts/new` | Añadir Repuesto: formulario (vehículo, nombre, categoría, costo, fecha, mantención). |
| `app/vehicles/[vehicleId]/maintenances/index.tsx` | `/vehicles/[vehicleId]/maintenances` | Historial de Mantenciones: tarjeta de gasto total, botón "Registrar mantención", lista paginada. Acepta `?flash`. |
| `app/vehicles/[vehicleId]/maintenances/new.tsx` | `/vehicles/[vehicleId]/maintenances/new` | Registrar Mantención: formulario, repuestos por casilla, total, modal "Nuevo taller". |
| `app/vehicles/[vehicleId]/maintenances/[maintenanceId].tsx` | `/vehicles/[vehicleId]/maintenances/[maintenanceId]` | Detalle de Mantención: bloques de datos, desglose de costos, Editar y Eliminar, modal de confirmación. |
| `app/vehicles/[vehicleId]/maintenances/[maintenanceId]/edit.tsx` | `/vehicles/[vehicleId]/maintenances/[maintenanceId]/edit` | Editar Mantención: reexporta `../new` en modo edición. |

Rutas que el diseño nuevo pide y que **no existen hoy**: `/vehicles/[vehicleId]` (ficha con pestañas `?tab=`), `/account` (Cuenta), barra inferior o lateral de secciones, y redirecciones desde las listas sueltas de repuestos/mantenciones.

**Pendiente:** `app/dev-ui.tsx` (`/dev-ui`) es una pantalla temporal que muestra todos los componentes de `src/components/ui/`. Se elimina en el último prompt del rediseño.

## (b) Componentes compartidos existentes

| Componente | Archivo | Qué hace | Dónde se usa |
|---|---|---|---|
| `ScreenHeader` | `src/components/ScreenHeader.tsx` | Encabezado con volver opcional (`←` textual), título centrado y espaciador. | Todas las pantallas. |
| `TextField` | `src/components/TextField.tsx` | Campo de texto con etiqueta, error y sufijo opcional. | `vehicles/new`, `maintenances/new`, `maintenances/[maintenanceId]/edit`, `parts/new` y el modal de taller. |
| `SelectField` | `src/components/SelectField.tsx` | Selector con modal/hoja, opciones en lista, error y estado deshabilitado. | `vehicles/new` (marca), `maintenances/new` (taller), `parts/new` (vehículo, categoría, mantención). |
| `MessageBanner` | `src/components/MessageBanner.tsx` | Aviso de éxito o error con fondo y borde de color. | `app/index` (flash y error de borrado), `vehicles/new` (error general), `maintenances/index` (flash), `maintenances/new` (mensaje de formulario y error de taller), `maintenances/[maintenanceId]` (error de borrado). No se usa en `parts/new`. |
| `sharedStyles` y `colors` | `src/theme/styles.ts` | Tokens de color y estilos compartidos: safe area, header, contenido, botones primario/secundario, errores. | Importados en todas las pantallas y en `ScreenHeader`/`MessageBanner`. |

Patrones repetidos **sin extraer** (candidatos a componente al rediseñar, no obligatorio):

- Modal de confirmación destructiva: `app/index.tsx` (vehículo) y `maintenances/[maintenanceId].tsx` (mantención).
- Tarjeta con borde `#E5E7EB`, radio 12 y padding 16: vehículos, mantenciones, repuestos, detalle, totales y bloques.
- Estado vacío: solo `<Text>` gris centrado en vehículos, mantenciones y repuestos.
- Botón con spinner: `ActivityIndicator` con color `#FFFFFF` repetido en cada guardado/borrado.
- Insignias tipo pill (`borderRadius: 999`): "Invitado", usuario registrante y categoría de repuesto.

## (c) Tokens visuales usados hoy

### Colores por significado

| Significado | Valor exacto | Dónde |
|---|---|---|
| Fondo | `#F3F4F6` (`colors.background`) | `safeArea`, placeholder de foto, separador inferior de opciones del selector. |
| Tarjeta / superficie | `#FFFFFF` (`colors.surface`) | Tarjetas, modales, inputs, hoja del selector. |
| Borde | `#D1D5DB` (`colors.border`) | Inputs, `TextField`, `SelectField`, filas de repuestos. |
| Borde de tarjeta (duplicado) | `#E5E7EB` | Todas las tarjetas (`app/index`, mantenciones, repuestos, detalle, totales), separadores y cabecera del selector. **No es token.** |
| Seprador tenue | `#F3F4F6` | `borderTopColor` de repuestos en detalle de mantención; `borderBottomColor` de opciones del selector. |
| Texto principal | `#111827` (`colors.text`) | Títulos, montos, contenido. |
| Texto secundario | `#6B7280` (`colors.textMuted`) | Kilometraje, VIN, fechas, etiquetas, textos vacíos, sufijos. |
| Etiqueta de campo | `#374151` | `TextField`, `SelectField`, `photoLabel`, `sectionLabel`. |
| Placeholder | `#9CA3AF` | `TextField` y `SelectField`. |
| Primario | `#2563EB` (`colors.primary`) | Botón primario, enlace "Cerrar", borde del botón secundario, flecha `›`, fondo del checkbox. |
| Primario oscuro | `#1D4ED8` (`colors.primaryDark`) | Montos destacados, categoría, aviso de kilometraje, opción seleccionada, check. |
| Primario suave | `#EFF6FF` | Fondo de tarjeta presionada, fila de repuesto seleccionada, insignia de usuario/categoría. **No es token.** |
| Peligro | `#DC2626` (`colors.danger`) | Botón "Eliminar", borde de input con error, texto "Quitar foto". |
| Peligro oscuro | `#991B1B` (`colors.dangerDark`) | Texto de banner/insignia de error. |
| Peligro suave | `#FEE2E2` (`colors.dangerSoft`) | Fondo de banner de error e insignia "Invitado". |
| Peligro borde | `#FCA5A5` (`colors.dangerBorder`) | Borde de banner de error. |
| Peligro texto alterno | `#B91C1C` | `hintError` y `formMessage` en `src/theme/styles.ts`. **No es token.** |
| Éxito | `#15803D` (`colors.success`) | Avisos de autocompletado correcto. |
| Éxito oscuro | `#166534` (`colors.successDark`) | Texto de banner de éxito. |
| Éxito suave | `#DCFCE7` (`colors.successSoft`) | Fondo de banner de éxito. |
| Éxito borde | `#86EFAC` (`colors.successBorder`) | Borde de banner de éxito. |
| Aviso | `#B45309` | Mensaje de caracteres inválidos en VIN/patente (`noticeWarning`). **No es token.** |
| Aviso secundario | `#1D4ED8` | Aviso "Se actualizará el kilometraje…" y aviso de VIN. Usa el token primario oscuro. |
| Velo de modal | `rgba(17, 24, 39, 0.5)` | Fondo de modales de vehículo, mantención y taller. |
| Velo de selector | `rgba(17, 24, 39, 0.45)` | Fondo del modal de `SelectField`. |
| Texto sobre color | `#FFFFFF` | Texto de botones primario/peligro, spinner, check del checkbox. |

### Tamaños de letra

| Tamaño | Uso |
|---|---|
| 12 | Insignias ("Invitado", usuario, categoría), VIN abreviado, hint de formato de foto, categoría de repuesto. |
| 13 | Ayudas (`hint`), avisos, kilometraje de tarjeta de mantención, taller, metadatos del detalle, fecha de repuesto, errores de campo. |
| 14 | Etiquetas de campo, textos de banner, filas de resumen, textos vacíos del detalle, botones de acción de tarjeta, "Quitar foto". |
| 15 | Nombre de vehículo, descripción de mantención, nombres/costos de repuesto en formulario y detalle, textos de modal, opciones del selector, etiqueta del vehículo. |
| 16 | Fecha/costo de mantención, nombre/costo de repuesto en lista, texto de botones, títulos de hoja/selector, "Total" en detalle. |
| 18 | Título de modal. |
| 20 | Patente, título de pantalla, total en detalle de mantención. |
| 22 | Total en formulario de mantención. |
| 26 | Flecha de volver `←`. |
| 28 | Monto "Gasto total"/"Total gastado", icono de foto de vehículo, `›` de tarjeta. |

Pesos usados: `600`, `700`, `800`. No hay familia tipográfica personalizada.

### Radios

| Radio | Uso |
|---|---|
| 6 | Checkbox de repuestos. |
| 10 | Miniatura de foto de vehículo (72×72). |
| 12 | Tarjetas, botones, inputs, modales, banners, tarjetas de total y bloques. |
| 16 | Hoja del selector (`SelectField`). |
| 999 | Insignias tipo pill. |

### Espaciados y medidas

- Contenido de pantalla (`sharedStyles.content`): `gap: 18`, `paddingHorizontal: 16`, `paddingTop: 8`, `paddingBottom: 32`.
- Encabezado (`sharedStyles.header`): `paddingHorizontal: 16`, `paddingVertical: 12`; botón volver y espaciador de 40×40.
- Botones: `minHeight: 52`, `paddingHorizontal: 16`, radio 12. Botones de modal: `minHeight: 48`.
- Inputs/selector: `minHeight: 48`, `paddingHorizontal: 14`, `paddingVertical: 12`.
- Tarjetas: `padding: 16`, `gap` entre 4 y 12 según pantalla, borde de 1 px.
- Modales: `padding: 24` en el velo, tarjeta `maxWidth: 420`, `padding: 20`, `gap: 12`; selector con `maxWidth: 520`, `maxHeight: 70%` y `padding: 20` en el velo.
- Listas: `gap` entre ítems = 18 (viene de `content`); estado vacío con `paddingVertical: 32`.
- Foto: miniatura 72×72; vista previa de formulario `height: 180`; campo de subida con `paddingVertical: 24` y borde discontinuo.
- Checkbox: 22×22; punto de la casilla con `fontSize: 14`, `lineHeight: 16`.
- Archivos con `maxWidth` propio: solo la tarjeta de modal (420) y la hoja del selector (520). No hay contenedor máximo de página ni columnas.
- No hay sombras (`elevation`/`shadow*`) ni animaciones propias.

### Colores y medidas sueltas que el rediseño debe centralizar

- `#E5E7EB`, `#EFF6FF`, `#374151`, `#9CA3AF`, `#B91C1C`, `#B45309`.
- `#FFFFFF` escrito literal en botones, spinner y check.
- Velo `rgba(17, 24, 39, 0.5)` y `rgba(17, 24, 39, 0.45)`.
- No existe `src/theme.ts`: hoy los tokens viven en `src/theme/styles.ts`.

## (d) Emojis y glifos de texto usados como iconos

| Archivo | Línea | Glifo | Uso |
|---|---|---|---|
| `app/index.tsx` | 61 | `🚗` | Placeholder de foto de vehículo. **Emoji.** |
| `app/vehicles/new.tsx` | 610 | `📷` | Selector de foto. **Emoji.** |
| `src/components/ScreenHeader.tsx` | 19 | `←` | Botón volver. Glifo de texto. |
| `app/index.tsx` | 88 | `›` | Chevron de tarjeta de vehículo. Glifo de texto. |
| `src/components/SelectField.tsx` | 66 | `▾` | Chevron del selector. Glifo de texto. |
| `src/components/SelectField.tsx` | 119 | `✓` | Marca de opción seleccionada. Glifo de texto. |
| `app/vehicles/[vehicleId]/maintenances/new.tsx` | 610 | `✓` | Marca de repuesto seleccionado. Glifo de texto. |

No hay dependencia de `@expo/vector-icons` ni uso de Ionicons en `package.json` ni en el código. No existe menú "⋯".

## (e) Pantallas con varias acciones primarias o botones destructivos en tarjetas

1. **Mis Vehículos (`app/index.tsx`)** — la `VehicleCard` contiene dos botones ("Repuestos", "Mantenciones") y, para el dueño, un botón destructivo "Eliminar vehículo" dentro de la tarjeta, además del objetivo táctil principal de la tarjeta. La pantalla suma el botón primario "Registrar nuevo vehículo". Es el caso más alejado del principio 2.
2. **Detalle de Mantención (`maintenances/[maintenanceId].tsx`)** — muestra a la vez un botón primario "Editar" y un botón rojo "Eliminar" visibles sin menú. El borrado sí pide confirmación en modal.
3. **Historial de Mantenciones (`maintenances/index.tsx`)** — acción primaria "Registrar mantención" dentro de la cabecera de la lista, más "Cargar más" secundario y tarjetas que son objetivo táctil único (correcto).
4. **Registrar/Editar Mantención (`maintenances/new.tsx`)** — un primario "Guardar", un secundario "Cancelar", un secundario "Añadir repuesto nuevo" y un primario adicional "Guardar" dentro del modal de taller. Hay dos primarios posibles en la misma pantalla.
5. **Nuevo Vehículo (`vehicles/new.tsx`)** — primario "Guardar Vehículo", secundario "Cancelar" y acción destructiva textual "Quitar foto" (esta última dentro del bloque de foto, no de una tarjeta).
6. **Repuestos Comprados (`parts/index.tsx`)** — un solo primario "Añadir repuesto" fijo al pie; las tarjetas de repuesto no tienen acciones (correcto).
7. **Añadir Repuesto (`parts/new.tsx`)** — primario "Guardar Repuesto" y secundario "Cancelar" (correcto en cantidad de primarios).
8. **Modales de eliminación (`app/index.tsx`, `maintenances/[maintenanceId].tsx`)** — Cancelar + Eliminar rojo; patrón correcto, aunque hoy el destructivo vive también en la tarjeta del listado.

## (f) Hooks y funciones de API que no deben cambiar

El rediseño puede mover rutas y presentación, pero estas firmas y comportamientos deben quedar intactos.

**`src/api/client.ts`**
- `API_BASE_URL`, `CURRENT_USER_ID`, `ApiError`, `ApiErrorDetail`, `apiRequest<T>`.
- El envío de `x-user-id` solo en desarrollo y el manejo de `FormData`.

**`src/api/vehicles.ts`**
- Tipos `Vehicle`, `VehicleRole`, `CreateVehiclePayload`, `VinDecodeStatus`, `VinDecodeResult`, `LocalPhoto`.
- Claves `vehiclesQueryKey`, `brandsQueryKey`, `vinDecodeQueryKey`.
- `getVehicles`, `getBrands`, `createVehicle`, `deleteVehicle`, `decodeVin`, `uploadVehiclePhoto`.
- `useVehicles`, `useBrands`, `useDecodeVin`, `useCreateVehicle`, `useDeleteVehicle`.

**`src/api/maintenances.ts`**
- Tipos `Maintenance`, `MaintenancePart`, `MaintenanceList`, `ExpensesSummary`, `CreateMaintenancePayload`.
- `MAINTENANCE_PAGE_SIZE` y claves `maintenanceListQueryKey`, `maintenanceQueryKey`, `vehicleMaintenanceOptionsQueryKey`.
- `getVehicleMaintenances`, `getMaintenance`, `createMaintenance`, `updateMaintenance`, `deleteMaintenance`, `getExpensesSummary`.
- `useMaintenanceList` (paginación por offset), `useVehicleMaintenances`, `useMaintenance`, `useExpensesSummary`, `useCreateMaintenance`, `useUpdateMaintenance`, `useDeleteMaintenance`.

**`src/api/parts.ts`**
- `PART_CATEGORIES`, `PartCategory`, `Part`, `CreatePartPayload`, `VehicleParts`.
- Claves `partsQueryKey`, `unassignedPartsQueryKey`, `expensesSummaryQueryKey`.
- `createPart`, `getVehicleParts` (incluido `unassigned`), `useVehicleParts`, `useUnassignedVehicleParts`, `useCreatePart`.

**`src/api/workshops.ts`**
- Tipos `Workshop`, `CreateWorkshopPayload`, clave `workshopsQueryKey`.
- `getWorkshops`, `createWorkshop`, `useWorkshops`, `useCreateWorkshop`.

**Utilidades que tampoco cambian**
- `src/utils/format.ts`: `digitsOnly`, `formatChileanAmount`, `parseAmount`, `formatDateInput`, `todayDisplayDate`, `isValidDisplayDate`, `displayDateToIso`, `isoDateToDisplay`.
- `src/utils/license-plate.ts` y `src/utils/vin.ts`: reglas de normalización y validación (deben seguir sincronizadas con el backend).

## Lista de verificación (basada en `docs/ui-design.md`)

- [ ] Cada pantalla tiene una sola acción principal y un único botón de color primario visible.
- [ ] Ninguna tarjeta ni fila de lista contiene botones; son un único objetivo táctil.
- [ ] Las acciones secundarias y destructivas viven en el menú "⋯" de la pantalla de detalle.
- [ ] Existe navegación por niveles: secciones globales, ficha del vehículo y pestañas.
- [ ] En compacto (< 720 px) las secciones usan barra inferior.
- [ ] En medio y expandido (≥ 720 px) las secciones usan barra lateral izquierda de 220 px con "AutoStory".
- [ ] La ficha del vehículo vive en `/vehicles/[vehicleId]`.
- [ ] Las pestañas Resumen, Mantenciones y Repuestos se controlan con `?tab=summary|maintenances|parts` y `summary` es el valor por defecto.
- [ ] Nuevo vehículo, Registrar mantención, Detalle de mantención y Añadir repuesto son pantallas completas, sin barra de secciones y con encabezado propio.
- [ ] `/vehicles/[id]/parts` y `/vehicles/[id]/maintenances` redirigen a la ficha con la pestaña correspondiente.
- [ ] Mis vehículos usa rejilla de 1, 2 o 3 columnas con contenedor máximo de 1100 px.
- [ ] La acción "Registrar vehículo" está arriba a la derecha en medio/expandido y como Fab "+" en compacto.
- [ ] La tarjeta de vehículo muestra foto 72×72, patente en negrita, "Marca Modelo · Año", kilometraje e insignia "Invitado"; no muestra VIN ni botones.
- [ ] La ficha del vehículo tiene máximo 900 px, encabezado con volver, patente y menú "⋯" solo para el dueño con "Eliminar vehículo".
- [ ] La ficha tiene hero con foto, marca, modelo, año, kilometraje, VIN abreviado e insignia "Invitado".
- [ ] Resumen muestra "Gasto total" con desglose, estadísticas, acciones rápidas secundarias y las últimas 3 mantenciones, sin Fab.
- [ ] Mantenciones y Repuestos usan filas de lista y Fab "+" como acción principal, extendido con etiqueta en expandido.
- [ ] Mantenciones y Repuestos muestran un EmptyState con botón primario cuando no hay datos.
- [ ] Los formularios tienen ancho máximo 640, secciones con título y FormFooter fijo con Cancelar (1/3) y Guardar (2/3).
- [ ] Los formularios piden confirmación al descartar cambios.
- [ ] Cuenta muestra perfil mínimo, versión de la app y "Cerrar sesión" deshabilitado hasta integrar Clerk.
- [ ] La paleta se conserva sin cambiar valores y está centralizada en `src/theme.ts`.
- [ ] Las pantallas usan tokens de `src/theme.ts` y no colores ni tamaños sueltos.
- [ ] Todos los iconos son Ionicons; no quedan emojis ni glifos de texto usados como iconos.
- [ ] Toda área táctil mide al menos 44×44 px.
- [ ] Iconos y botones tienen `accessibilityLabel`.
