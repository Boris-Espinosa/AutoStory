CASO DE USO: AÑADIR REPUESTOS
Precondición: el usuario debe estar autenticado y tener al menos un vehículo registrado.
Flujo básico:
1. El caso de uso se inicia de forma independiente o durante el flujo de registro de una mantención.
2. El sistema solicita al usuario los detalles de la pieza reemplazada.
3. El usuario completa los datos requeridos y envía el formulario.
4. El sistema almacena la información, integrándola al historial del vehículo.
5. El sistema actualiza visualmente el tablero de control y el historial de mantenciones del automóvil.
Flujo alternativo:
- Datos incompletos: si el usuario omite información obligatoria (nombre del repuesto o costo), el sistema detiene el proceso y muestra un mensaje solicitando completar los campos.
- Cancelación: si el usuario cancela antes de guardar, el sistema descarta los datos y vuelve a la pantalla anterior.
Poscondición: el repuesto queda registrado de forma persistente, figura en la lista "Repuestos Comprados" y se contabiliza en los gastos del vehículo.

Campos del formulario: Seleccionar Vehículo, Nombre del Repuesto, Categoría/Tipo (ej: Encendido), Costo ($), Fecha de Compra, Asignar a Cita/Mantención (por defecto "No Asignar"). Botones: "Guardar Repuesto" y "Cancelar".
