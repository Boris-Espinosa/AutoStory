# Diseño de interfaz

## Principios
1. Una sola acción principal por pantalla: un único botón de color primario visible. Excepción: "Iniciar sesión" usa dos alternativas equivalentes (Google y Apple).
2. Las tarjetas y filas de lista son un único objetivo táctil y no contienen botones. Las acciones secundarias o destructivas van en un menú "⋯" dentro de la pantalla de detalle.
3. Navegación por niveles: secciones globales, ficha del vehículo y pestañas del vehículo.
4. Responsive en tres tamaños: compacto (menos de 720 px), medio (720 a 1099) y expandido (1100 o más).
5. Se conserva la paleta actual: solo se centraliza en src/theme.ts sin cambiar valores. Los iconos son Ionicons, no emojis.
6. Áreas táctiles de al menos 44×44 px y accessibilityLabel en iconos y botones.

## Navegación
- Nivel 1, secciones (arreglo configurable): Vehículos, Citas, Avisos y Cuenta. Avisos usa el título de pantalla "Notificaciones" y muestra el contador de no leídas. Compacto: barra inferior. Medio y expandido: barra lateral izquierda de 220 px con el nombre "AutoStory".
- Nivel 2, ficha del vehículo en /vehicles/[vehicleId], con pestañas Resumen, Mantenciones, Repuestos y Citas controladas por ?tab=summary|maintenances|parts|appointments (por defecto summary).
- Nivel 3, pantallas completas sin barra de secciones y con encabezado propio (volver y título): Nuevo vehículo, Registrar mantención, Detalle de mantención, Añadir repuesto, Programar cita, Editar cita y Detalle de cita.
- Las rutas /vehicles/[id]/parts y /vehicles/[id]/maintenances (listas) redirigen a la ficha con la pestaña correspondiente.

## Pantallas
- Iniciar sesión (fuera de las secciones, sin barra de navegación): tarjeta centrada de ancho máximo 420 con icono, nombre AutoStory, frase breve, botones "Continuar con Google" (fondo blanco, borde y logo de Google) y "Continuar con Apple" (fondo negro, texto blanco y logo de Apple), del mismo tamaño y de ancho completo de la tarjeta, y un texto legal breve. Es la excepción a "un solo botón primario": son dos alternativas equivalentes.
- Mis vehículos: rejilla de 1, 2 o 3 columnas, contenedor máximo 1100 px. Acción principal: botón "Registrar vehículo" arriba a la derecha (medio y expandido) o Fab "+" (compacto). Tarjeta: foto 72×72, patente en negrita, "Marca Modelo · Año", kilometraje; Badge "Invitado" si corresponde; sin VIN y sin botones.
- Ficha del vehículo (máximo 900 px): encabezado con volver, patente y menú "⋯" (solo dueño, con "Eliminar vehículo"); hero con foto, marca, modelo, año, kilometraje, VIN abreviado e insignia "Invitado"; pestañas.
- Resumen: tarjeta "Gasto total" con desglose, estadísticas, tarjeta "Próxima cita", acciones rápidas secundarias (Registrar mantención, Añadir repuesto) y las últimas 3 mantenciones. Sin Fab.
- Mantenciones y Repuestos: lista de filas y Fab "+" (extendido con etiqueta en expandido) como acción principal; EmptyState con botón primario cuando no hay datos.
- Citas: lista con "Próximas"; filas de un solo objetivo táctil y Fab "Programar cita" como único botón primario.
- Avisos: título "Notificaciones" con contador de no leídas; filas de un solo objetivo táctil; sin botón primario.
- Programar cita, Editar cita y Detalle de cita: formularios y detalle del flujo de citas; las acciones de reprogramar, completar y cancelar viven en el detalle.
- Formularios: ancho máximo 640, secciones con título, FormFooter fijo solo en compacto; en medio y expandido va al final del formulario con botones de ancho natural; confirmación al descartar cambios.
- Cuenta: foto o inicial, nombre, correo y "Cerrar sesión" (botón secundario con confirmación); versión de la app.
