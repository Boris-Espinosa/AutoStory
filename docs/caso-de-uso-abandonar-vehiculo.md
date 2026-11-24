CASO DE USO: ABANDONAR VEHÍCULO
Precondición: usuario autenticado con membresía INVITADO en el vehículo.
Flujo básico:
1. El invitado abre el menú "⋮" del vehículo y elige "Abandonar vehículo".
2. El sistema pide confirmación con el mensaje "¿Abandonar vehículo?".
3. El invitado confirma.
4. El sistema elimina su fila INVITADO de USUARIO_VEHICULO y el vehículo desaparece de su lista.
5. Las mantenciones, repuestos y citas registradas por el invitado permanecen en el historial del vehículo.
Flujo alternativo:
- Cancelación de la confirmación: el sistema conserva la membresía y vuelve al menú del vehículo.
- Intento del dueño: la opción "Abandonar vehículo" no está disponible para el DUEÑO, que no puede salir ni ser revocado (R2).
- Nueva invitación: después de abandonar, el dueño puede enviar otra solicitud; el ex invitado volverá a ser INVITADO solo si la acepta.
Poscondición: la membresía INVITADO queda eliminada, el historial del vehículo se conserva y el dueño puede volver a invitar al usuario.
Formulario: Confirmación "¿Abandonar vehículo?". Botones "Abandonar vehículo" y "Cancelar".
