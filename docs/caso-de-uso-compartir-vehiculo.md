CASO DE USO: ENVIAR SOLICITUD DE COMPARTIR VEHÍCULO
Precondición: usuario autenticado con acceso al vehículo como DUEÑO.
Flujo básico:
1. El dueño abre el menú "⋮" del vehículo y elige "Compartir vehículo".
2. El sistema abre el modal flotante "Compartir vehículo" con el campo Correo electrónico, la lista de solicitudes pendientes y la lista de invitados.
3. El dueño escribe el correo del receptor y envía la solicitud.
4. El sistema busca un usuario existente de AutoStory con ese email, sin distinguir mayúsculas ni espacios de borde. Si no hay exactamente una coincidencia, no crea nada y responde 400 con "No encontramos una cuenta de AutoStory con ese correo. Pídele que se registre y vuelve a enviar la solicitud."
5. El sistema comprueba que el receptor no sea el propio dueño, que no sea ya miembro del vehículo, que no tenga otra solicitud PENDING para ese vehículo, que el vehículo tenga menos de 10 solicitudes pendientes y que el dueño haya hecho menos de 10 envíos en el último minuto.
6. Si todo es válido, el sistema guarda la solicitud en estado PENDING, crea la notificación SHARING_REQUEST_RECEIVED para el receptor y muestra al dueño "Solicitud enviada."
7. La nueva solicitud aparece en la lista de solicitudes pendientes del modal.
Flujo alternativo:
- Correo vacío o con formato inválido: el sistema detiene el envío y pide completar el campo.
- Correo sin cuenta en AutoStory: si el correo no coincide con exactamente un usuario (0 o más de 1 por mayúsculas), no se crea ninguna solicitud ni notificación; el sistema responde 400 con "No encontramos una cuenta de AutoStory con ese correo. Pídele que se registre y vuelve a enviar la solicitud." y el modal lo muestra como error.
- Envío a uno mismo: el sistema rechaza la solicitud e informa que no puede compartirse con uno mismo.
- Receptor ya miembro: el sistema rechaza la solicitud e informa que ya tiene acceso al vehículo.
- Solicitud pendiente previa: el sistema rechaza el reenvío e informa que ya existe una solicitud pendiente para ese vehículo y receptor.
- Límite de pendientes: con 10 solicitudes pendientes en el vehículo, el sistema rechaza el envío e informa el límite.
- Límite de envíos: con 10 envíos en el último minuto, el sistema rechaza el envío e informa que debe esperar.
- Cancelación del modal: el sistema descarta lo escrito y vuelve a la pantalla anterior.
Poscondición: la solicitud queda registrada como PENDING y el receptor recibe la notificación SHARING_REQUEST_RECEIVED, o no se crea nada y se responde 400 con el mensaje de cuenta no encontrada.
Formulario: Correo electrónico. Botones "Enviar solicitud" y "Cancelar".

CASO DE USO: CANCELAR SOLICITUD PENDIENTE DE COMPARTIR
Precondición: usuario autenticado con acceso al vehículo como DUEÑO y con al menos una solicitud PENDING.
Flujo básico:
1. El dueño abre el menú "⋮" del vehículo y elige "Compartir vehículo".
2. En la lista de solicitudes pendientes del modal, elige la solicitud que quiere cancelar y toca "Cancelar solicitud".
3. El sistema cambia el estado de la solicitud de PENDING a CANCELLED y la quita de la lista de pendientes.
Flujo alternativo:
- Solicitud ya respondida o cancelada: el sistema informa que ya no está pendiente y no la modifica.
- Solicitud de otro vehículo o de otro dueño: el sistema no la muestra en la lista.
- Cancelación del modal: el sistema cierra el modal sin cambiar ninguna solicitud.
Poscondición: la solicitud queda en estado CANCELLED y puede volver a enviarse al mismo receptor.
Formulario: Lista de solicitudes pendientes con correo del receptor y fecha de envío. Botones "Cancelar solicitud" y "Cerrar".

CASO DE USO: REVOCAR INVITADO
Precondición: usuario autenticado con acceso al vehículo como DUEÑO y con al menos un INVITADO.
Flujo básico:
1. El dueño abre el menú "⋮" del vehículo y elige "Compartir vehículo".
2. En la lista de invitados del modal, elige al invitado que quiere revocar y toca "Revocar acceso".
3. El sistema pide confirmación y, al confirmar, elimina la fila INVITADO de USUARIO_VEHICULO.
4. El invitado deja de ver el vehículo en su lista, pero sus mantenciones, repuestos y citas se conservan en el historial del vehículo.
Flujo alternativo:
- Cancelación de la confirmación: el sistema mantiene el acceso del invitado y cierra la confirmación.
- Intento de revocar al dueño: la opción no existe, porque el dueño no puede salir ni ser revocado (R2).
- Reenvío posterior: el dueño puede volver a enviar una solicitud al ex invitado, que deberá aceptarla para volver a ser INVITADO.
- Cancelación del modal: el sistema cierra el modal sin revocar a nadie.
Poscondición: la membresía INVITADO queda eliminada, el historial del vehículo se conserva y el ex invitado puede recibir una nueva solicitud.
Formulario: Lista de invitados con correo y fecha de asignación. Botones "Revocar acceso" y "Cerrar".
