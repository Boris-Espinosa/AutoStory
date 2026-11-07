CASO DE USO: REGISTRAR VEHÍCULO PROPIO
Precondición: el usuario debe estar autenticado.
Flujo básico:

1. El usuario selecciona la opción "Registrar nuevo vehículo".
2. El sistema despliega un formulario solicitando la información del vehículo (VIN opcional, marca, modelo, año, patente, kilometraje actual y fotografía opcional). Si el usuario ingresa el VIN, el sistema intenta completar marca, modelo y año automáticamente.
3. El usuario revisa y corrige los datos autocompletados, o los completa a mano si no se encontraron. Marca, modelo, año, patente y kilometraje actual son obligatorios; la foto es opcional.
4. El usuario presiona "Guardar Vehículo".
5. El sistema valida los datos y los guarda de forma persistente. El usuario queda asociado al vehículo como DUEÑO.
6. El sistema redirige al tablero/sección "Vehículos", mostrando la tarjeta del automóvil registrado.
   Flujo alternativo:

- Ya registrado por el mismo usuario: si el usuario autenticado ya es dueño de un vehículo con la misma patente, o con el mismo VIN cuando lo ingresó, el sistema no crea el registro y avisa "Ya tienes este vehículo registrado". Si otra persona registró esa patente o VIN, el sistema no lo informa y permite el registro.
- Datos no encontrados: si el decodificador de VIN no responde o no reconoce el VIN, el usuario ingresa marca, modelo y año a mano.
- VIN inválido: si el VIN tiene formato incorrecto o un dígito verificador incorrecto (VIN norteamericano), el sistema muestra "El VIN ingresado no es válido" y no permite guardar.
- Patente inválida: si no cumple un formato chileno, el sistema muestra el error y no permite guardar.
  Poscondición: cada registro tiene un id único y un único dueño. Varios usuarios pueden tener registros distintos del mismo vehículo; los registros no se enlazan ni se fusionan entre sí por coincidencia de patente o VIN.
  Formulario: VIN (opcional), Marca, Modelo, Año, Patente, Kilometraje Actual, Subir Foto del Vehículo (opcional), botones "Guardar Vehículo" y "Cancelar".
