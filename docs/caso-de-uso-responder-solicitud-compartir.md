CASO DE USO: RESPONDER SOLICITUD DE COMPARTIR
Precondición: usuario autenticado con una notificación SHARING_REQUEST_RECEIVED en su centro de notificaciones; la notificación es el único punto de entrada a la solicitud y no existe una lista de solicitudes recibidas.
Flujo básico:
1. El receptor abre el centro de notificaciones y toca la notificación de solicitud recibida.
2. El sistema abre el modal flotante "Solicitud de compartir" con los datos limitados: marca, modelo, año y nombre del emisor; si el emisor no tiene nombre, muestra "Un usuario de AutoStory".
3. El sistema comprueba que la solicitud pertenezca al receptor y esté en estado PENDING; no se muestran la patente, el VIN, la foto ni el historial del vehículo.
4. El receptor elige "Aceptar" o "Rechazar".
5. Si acepta, el sistema pasa la solicitud de PENDING a ACCEPTED y crea en la misma transacción la fila INVITADO en USUARIO_VEHICULO, con lo que el receptor gana acceso al vehículo y a su historial.
6. Si rechaza, el sistema pasa la solicitud de PENDING a REJECTED.
7. El sistema crea la notificación SHARING_REQUEST_ACCEPTED o SHARING_REQUEST_REJECTED para el emisor y cierra el modal.
Flujo alternativo:
- Solicitud ajena: el sistema responde 404 y no muestra ningún dato del vehículo; las solicitudes no se pueden buscar ni listar fuera de la notificación.
- Solicitud ya respondida: responderla es un conflicto (409) y el sistema informa "Ya respondiste esta solicitud.". Solicitud cancelada: el conflicto (409) informa "Esta solicitud ya no está disponible.".
- Emisor sin nombre: el modal muestra "Un usuario de AutoStory" en lugar del nombre.
- Cancelación del modal: el sistema lo cierra sin aceptar ni rechazar y la solicitud sigue PENDING.
Poscondición: la solicitud queda ACCEPTED con la membresía INVITADO creada, o REJECTED, y el emisor recibe la notificación correspondiente.
Formulario: Marca, Modelo, Año, Emisor (o "Un usuario de AutoStory"). Botones "Aceptar" y "Rechazar".
