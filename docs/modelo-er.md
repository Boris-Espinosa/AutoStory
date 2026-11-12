USUARIO: ID_Usuario (PK, texto; es el id de Clerk, con formato user_...), Nombre (opcional, máximo 120), Email (opcional, único si existe), Foto (imageUrl, opcional), Telefono_Contacto (opcional), Direccion (opcional), Fecha_Registro, Fecha_Sincronizacion_Perfil (opcional). La autenticación la gestiona Clerk: no se guardan contraseñas ni tokens. No existe jerarquía de usuarios.
VEHICULO: ID_Vehiculo (PK), VIN (opcional, no único; solo puede fijarse cuando está vacío y después no cambia; formato en "Reglas de formato de VEHICULO"), Patente (obligatoria, informativa, no única; formato en "Reglas de formato de VEHICULO"), Marca, Modelo, Año, Kilometraje_Actual. Se agregan: Foto (photoUrl, opcional).
USUARIO_VEHICULO (entidad asociativa): PK compuesta (ID_Usuario, ID_Vehiculo), Rol (DUEÑO | INVITADO; en el código OWNER | GUEST), Fecha_Asignacion. Relaciones: USUARIO 1 a N USUARIO_VEHICULO N a 1 VEHICULO.
SOLICITUD_COMPARTIR: ID_Solicitud (PK), FK ID_Vehiculo, FK ID_Usuario_Emisor, FK ID_Usuario_Receptor, Estado, Fecha_Envio, Fecha_Respuesta. Cuando el receptor acepta, se crea una fila INVITADO en USUARIO_VEHICULO.
MANTENCION_REPARACION (entidad débil de VEHICULO): PK compuesta (ID_Vehiculo, ID_Servicio). Campos: Fecha, Kilometraje_Servicio, Descripcion, Diagnostico (opcional), Costo_ManoObra (entero CLP, por defecto 0), FK Taller (opcional), FK Usuario_Registra, FK Vehiculo (obligatoria, ON DELETE CASCADE), FK Cita (opcional, ON DELETE SET NULL; única cuando no es nula). Una cita origina como máximo una mantención. Nota: en la implementación la clave primaria es un id uuid con la FK al vehículo, en lugar de la clave compuesta del MER lógico; la dependencia de existencia se mantiene con NOT NULL y la cascada.
TALLER: ID_Taller (uuid, PK), Nombre_Taller (obligatorio), Direccion (opcional), Telefono (opcional), Rating (opcional, 1 a 5; valoración personal), FK Usuario_Creador (ON DELETE CASCADE). Los talleres son personales: cada usuario solo ve y usa los suyos. Nombre único por usuario sin distinguir mayúsculas.
REPUESTO: ID_Repuesto (PK), Nombre_Repuesto, Categoria, Costo_Unidad, Cantidad, Fecha_Compra, FK Vehiculo, FK Servicio (opcional). La FK a MANTENCION es opcional con ON DELETE SET NULL, y solo puede apuntar a una mantención del mismo vehículo.
CITA_TALLER: ID_Cita (uuid, PK), FK Vehiculo (obligatoria, ON DELETE CASCADE), FK Taller (opcional, ON DELETE SET NULL), FK Usuario_Programa (opcional, ON DELETE SET NULL), Fecha_Hora_Programada (instante UTC), Zona_Horaria (IANA, por defecto America/Santiago), Motivo (3 a 200), Observaciones (opcional, máximo 1000), Estado_Cita (SCHEDULED | COMPLETED | CANCELLED), Fecha_Completada (opcional), Fecha_Cancelada (opcional), Fecha_Creacion y Fecha_Actualizacion. Una cita origina como máximo una mantención.
RECORDATORIO_CITA: ID_Recordatorio (uuid, PK), FK Cita (ON DELETE CASCADE), Minutos_Antes (10080, 1440, 120 o 30), Fecha_Recordatorio (instante UTC), Fecha_Procesado (opcional). Único (Cita, Minutos_Antes).
NOTIFICACION: ID_Notificacion (uuid, PK), FK Usuario (ON DELETE CASCADE), Tipo (APPOINTMENT_REMINDER | APPOINTMENT_CREATED | APPOINTMENT_RESCHEDULED | APPOINTMENT_CANCELLED), Titulo (máximo 120), Cuerpo (máximo 300), FK Vehiculo (opcional, ON DELETE CASCADE), FK Cita (opcional, ON DELETE CASCADE), FK Recordatorio (opcional, ON DELETE SET NULL), Fecha_Leida (opcional), Fecha_Creacion. Único parcial (Usuario, Recordatorio) donde el recordatorio no es nulo.

Reglas de formato de VEHICULO:
- VIN: 17 caracteres [A-HJ-NPR-Z0-9] (sin I, O, Q). Si el primer carácter es 1 a 5 (vehículos norteamericanos), el dígito verificador de la posición 9 debe ser correcto (ISO 3779: letras transliteradas, pesos 8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2, resto 10 = "X"). En otros mercados no se exige. El VIN es opcional.
- Patente: se normaliza (mayúsculas, se quitan solo espacios, puntos, guiones y el punto medio) y debe cumplir alguno de estos formatos chilenos: autos actuales 4 consonantes y 2 dígitos (letras B,C,D,F,G,H,J,K,L,P,R,S,T,V,W,X,Y,Z; el primer dígito no es 0), autos antiguos 2 letras y 4 dígitos (el primero no es 0), motos 3 letras y 2 dígitos, y los formatos anunciados: motos 4 letras y 1 dígito (desde 2027) y autos 5 letras y 1 dígito (desde 2029). No se admiten patentes especiales (remolques, diplomáticas, bomberos, provisorias). Cualquier otro carácter se rechaza, no se elimina en silencio. Solo se valida el formato, no que la patente exista.
- Decodificador de VIN, estados: full, partial, unrecognized (la API responde pero no se puede confiar en el VIN; no se autocompleta y no bloquea el guardado) y unavailable (sin servicio).

Reglas de negocio:
R1. Cada registro de vehículo tiene exactamente un DUEÑO: se garantiza con un índice único parcial en PostgreSQL sobre USUARIO_VEHICULO(ID_Vehiculo) donde Rol = DUEÑO, más validación en el servicio al dar de alta.
R2. El dueño no puede ser eliminado ni degradado de USUARIO_VEHICULO sin transferir antes la propiedad (la transferencia no está implementada: mientras tanto, esas operaciones se rechazan).
R3. El borrado de un vehículo es físico (DELETE real) y solo lo hace el dueño. Se eliminan en cascada, a nivel de base de datos, sus filas en USUARIO_VEHICULO, SOLICITUD_COMPARTIR, REPUESTO, MANTENCION_REPARACION y CITA_TALLER, y también su foto del disco. La patente no se reserva globalmente: cada registro es independiente y borrar uno no afecta los registros de otros usuarios.
R4. Registrar un vehículo es posible para cualquier usuario autenticado y crea automáticamente su fila DUEÑO.
R5. Aceptar o rechazar una solicitud de compartir es posible para cualquier usuario que la reciba.
R6. Cada registro de vehículo es independiente: tiene id propio y un solo dueño; no se enlaza ni se fusiona con los de otros usuarios por coincidencia de patente o VIN. No existe verificación de propiedad: el historial es declarativo.
R7. Un usuario no puede ser DUEÑO de dos vehículos con la misma patente, ni con el mismo VIN cuando lo tengan.
R8. Toda mantención pertenece a un vehículo y a quien la registró. Pueden registrar mantenciones el DUEÑO y el INVITADO.
R9. La fecha de la mantención no puede ser posterior a hoy (zona horaria America/Santiago).
R10. Un repuesto pertenece como máximo a una mantención, y debe ser del mismo vehículo.
R11. Al registrar una mantención con kilometraje mayor al actual del vehículo, se actualiza el kilometraje actual. Nunca se reduce.
R12. El costo total de una mantención es mano de obra más repuestos asociados. El gasto del vehículo suma todas las mantenciones y los repuestos sueltos.
R13. El DUEÑO puede editar y eliminar cualquier mantención; el INVITADO solo las que registró. Al eliminar una mantención, sus repuestos quedan sin asignar.
R14. Sin membresía en el vehículo, 404; con membresía pero sin el rol necesario, 403.
R15. Toda cita pertenece a un vehículo y a quien la programó. Pueden programar citas el DUEÑO y el INVITADO.
R16. La fecha y hora de la cita no puede ser pasada al crear ni al reprogramar, y admite como máximo 730 días hacia adelante.
R17. Los estados de la cita son SCHEDULED, COMPLETED y CANCELLED. Solo una cita SCHEDULED se puede editar; desde SCHEDULED se pasa a COMPLETED o CANCELLED.
R18. El DUEÑO puede editar, cancelar o completar cualquier cita del vehículo; el INVITADO solo las que programó.
R19. Los recordatorios permitidos son 10080, 1440, 120 y 30 minutos antes (por defecto 1440 y 120). Los que ya vencieron al guardar no se crean y el sistema informa cuáles sí quedaron programados.
R20. Al reprogramar una cita se recalculan todos sus recordatorios; al cancelarla o completarla se descartan los pendientes.
R21. Una mantención creada desde una cita la pasa a COMPLETED; debe ser del mismo vehículo, la cita debe estar SCHEDULED y no tener ya una mantención asociada.
R22. Los destinatarios de una notificación son el dueño y quien programó la cita si sigue siendo miembro del vehículo, sin duplicados. En los avisos de cambio no se notifica a quien hizo el cambio.
R23. Cada recordatorio genera como máximo una notificación por destinatario.
R24. Un recordatorio atrasado se entrega mientras la cita no haya comenzado; si ya comenzó, se descarta sin notificar.
R25. Cada usuario solo ve y modifica sus propias notificaciones.
R26. Retención: las notificaciones se conservan 90 días y los recordatorios procesados 30 días.
R27. El centro de notificaciones es el canal base (web y móvil); los avisos del teléfono (locales o push) son opcionales y no lo sustituyen.
R28. La identidad del usuario sale solo del token verificado; nunca del cuerpo, la query ni las cabeceras del cliente.
R29. El usuario local se crea la primera vez que llega una petición autenticada (alta perezosa) y su perfil se refresca desde Clerk como máximo cada 24 horas.
R30. Ninguna ruta del API es pública salvo GET /health (y /uploads).
R31. El modo de autenticación "dev-header" (cabecera x-user-id) solo existe fuera de producción y en los tests.
R32. Si Clerk no responde al sincronizar el perfil, la petición continúa con el usuario mínimo y se reintenta después.

- Búsquedas por patente o VIN: toda búsqueda de vehículos por patente o VIN se limita a los vehículos donde el usuario autenticado tiene membresía.
- Autocompletado: marca, modelo y año pueden autocompletarse desde un decodificador de VIN (NHTSA vPIC), pero siguen siendo editables y obligatorios. La cobertura es parcial para vehículos no vendidos en EE. UU.
- VIN: solo puede fijarse cuando está vacío; una vez fijado no cambia.

Matriz de permisos sobre un vehículo concreto:

- Ver vehículo, repuestos e historial: DUEÑO e INVITADO.
- Añadir repuestos y registrar mantenciones: DUEÑO e INVITADO.
- Subir o cambiar foto, editar datos, eliminar y compartir el vehículo: solo DUEÑO.
- Eliminar vehículo: solo DUEÑO (borrado físico).
  Aclaración: un usuario con membresía en un vehículo pero sin el rol necesario recibe 403; un usuario sin membresía en ese vehículo recibe 404.

Nota: marca, modelo y año pueden autocompletarse desde un decodificador de VIN (NHTSA vPIC), pero siguen siendo editables y obligatorios. La cobertura es parcial para vehículos no vendidos en EE. UU. No existe verificación de propiedad: el historial es declarativo.
Módulos futuros (repuestos, mantenciones, citas, solicitudes de compartir): toda FK hacia VEHICULO usa ON DELETE CASCADE.
