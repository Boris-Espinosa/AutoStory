CASO DE USO: ASIGNAR MANTENCIÓN A VEHÍCULO
Precondición: el usuario debe estar autenticado y tener acceso (como dueño o invitado) a al menos un vehículo.
Flujo básico:
1. El usuario selecciona un vehículo y la opción "Registrar mantención". El caso de uso se inicia desde la ficha del vehículo.
2. El sistema despliega un formulario solicitando fecha, kilometraje del servicio, descripción, diagnóstico (opcional), taller (opcional), costo de mano de obra y los repuestos utilizados (opcional).
3. El usuario completa los datos requeridos, selecciona los repuestos ya registrados del vehículo que se usaron y presiona "Guardar Mantención".
4. El sistema valida los datos y guarda la información de forma persistente, asociada al vehículo y al usuario que la registra. Los repuestos seleccionados quedan vinculados a la mantención.
5. Si el kilometraje del servicio es mayor al kilometraje actual del vehículo, el sistema actualiza este último.
6. El sistema redirige al historial de mantenciones del vehículo, mostrando la mantención registrada con su costo total (mano de obra más repuestos).
Flujo alternativo:
- Datos incompletos: si falta fecha, kilometraje o descripción, el sistema detiene el proceso y solicita completar los campos.
- Fecha inválida: si la fecha es posterior a hoy, el sistema rechaza el registro e informa el motivo.
- Taller no registrado: el usuario puede crear el taller en ese momento (nombre obligatorio) y queda seleccionado.
- Repuesto no registrado: el usuario puede añadir un repuesto nuevo desde el mismo flujo; al volver aparece en la lista para seleccionarlo.
- Repuesto ya asignado: un repuesto vinculado a otra mantención no se puede volver a asignar.
- Cancelación: el sistema descarta los datos ingresados y vuelve a la pantalla anterior.
Poscondición: la mantención queda registrada de forma persistente en el historial del vehículo, indicando quién la registró. Los repuestos asociados quedan vinculados y el costo total se contabiliza en los gastos del vehículo.
Formulario: Fecha, Kilometraje del servicio, Descripción, Diagnóstico (opcional), Taller (opcional, con opción de crear uno nuevo), Costo de mano de obra ($), Repuestos utilizados (lista de repuestos del vehículo sin mantención asignada, con opción "Añadir repuesto nuevo"). Botones "Guardar Mantención" y "Cancelar".
