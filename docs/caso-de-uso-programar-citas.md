CASO DE USO: PROGRAMAR Y RECIBIR NOTIFICACIONES DE PRÓXIMAS CITAS
Precondición: usuario autenticado con acceso (dueño o invitado) a al menos un vehículo.
Flujo básico:
1. El usuario elige "Programar cita" desde la sección Citas o la ficha del vehículo.
2. El formulario pide vehículo, motivo, fecha y hora, taller (opcional), observaciones (opcional) y recordatorios (1 semana, 1 día, 2 horas o 30 minutos antes).
3. El usuario completa los datos y guarda.
4. El sistema valida, guarda la cita asociada al vehículo y a quien la programa, y programa los recordatorios; si la programó un invitado, avisa al dueño.
5. La cita aparece en "Próximas" y en el resumen del vehículo.
6. Al llegar la hora de cada recordatorio el sistema genera una notificación para quien programó la cita y para el dueño, visible en el centro de notificaciones con contador de no leídas y, si el usuario lo habilitó, como aviso en su teléfono.
7. Al abrir la notificación se llega al detalle de la cita.
8. Tras la visita, el usuario marca la cita como completada o registra la mantención con los datos precargados.
Flujos alternativos:
- Datos incompletos: si falta el vehículo, el motivo, la fecha o la hora, el sistema detiene el proceso y solicita completar los campos.
- Fecha y hora pasadas: el sistema rechaza el registro e informa el motivo.
- Recordatorio ya vencido: el sistema no lo programa e informa cuáles recordatorios sí quedaron programados.
- Taller no registrado: el usuario puede crear el taller en ese momento (nombre obligatorio) y queda seleccionado.
- Reprogramación: el sistema recalcula los recordatorios y avisa a los demás destinatarios.
- Cancelación de la cita: el sistema descarta los recordatorios pendientes y avisa a los demás destinatarios.
- Cambios hechos por otra persona: el sistema notifica el cambio a los demás destinatarios.
- Avisos del teléfono no habilitados: todo sigue visible en el centro de notificaciones.
- Cancelación del formulario: el sistema descarta los datos ingresados y vuelve a la pantalla anterior.
Poscondición: la cita queda registrada con sus recordatorios; las notificaciones permanecen hasta que el usuario las lea; al completarse puede quedar vinculada a una mantención.
Formulario: Vehículo, Motivo, Fecha, Hora, Taller (opcional), Observaciones (opcional), Recordatorios. Botones "Guardar cita" y "Cancelar".
Limitaciones de los avisos en el teléfono:
- Los avisos locales solo se actualizan cuando la app sincroniza (al abrirla, al volver al primer plano o tras un cambio propio de citas). Si otra persona cambia o cancela una cita, el aviso del teléfono puede quedar desactualizado hasta abrir la app; el centro de notificaciones es la fuente confiable.
- Los avisos solo llegan a quien tenga la app instalada; quien no la tenga solo ve las notificaciones en el centro de notificaciones.
- En Android la hora del aviso puede variar unos minutos por el ahorro de batería del sistema.
