CASO DE USO: AUTENTICACIÓN CON CLERK (INICIAR SESIÓN CON GOOGLE O APPLE)
Precondición: el usuario tiene una cuenta de Google o de Apple y conexión a internet.
Flujo básico:
1. El usuario abre la aplicación sin sesión y ve "Iniciar sesión" con "Continuar con Google" y "Continuar con Apple".
2. El usuario elige un proveedor.
3. Se abre el acceso seguro del proveedor, donde el usuario ingresa sus credenciales y autoriza.
4. Clerk valida la identidad y crea la sesión (y la cuenta si es la primera vez).
5. La sesión se guarda de forma segura en el dispositivo y el usuario va a "Mis vehículos".
6. La primera solicitud autenticada crea su perfil local (nombre, correo y foto si el proveedor los entrega), que se mantiene actualizado.
7. En las siguientes aperturas la sesión se restaura sin pedir credenciales.
8. "Cerrar sesión" en Cuenta cierra la sesión, borra los datos del dispositivo y vuelve a "Iniciar sesión".
Flujos alternativos:
- Cancelación del inicio de sesión: vuelve sin error.
- Sin conexión o servicio no disponible: se informa y se permite reintentar.
- Acceso denegado o error del proveedor: mensaje claro, reintentar o usar el otro proveedor.
- Sesión expirada o revocada: se intenta renovar; si no, se cierra localmente y se informa "Tu sesión expiró".
- Acceso a una pantalla protegida sin sesión: se muestra Iniciar sesión y luego se lleva a la pantalla pedida.
- Correo o nombre no entregados: se continúa con el nombre "Usuario".
Poscondición: el usuario queda autenticado con sesión persistente y un perfil local asociado a su identidad de Clerk; todas las solicitudes se hacen en su nombre y solo accede a lo que tiene permiso.
