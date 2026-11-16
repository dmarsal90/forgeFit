# Motor de planificación — ForgeFit V6

## Entrada
Perfil independiente, objetivo principal/secundarios, experiencia, familiaridad técnica, historial y preferencias, grupos musculares prioritarios, días y tiempo por sesión, descanso, entorno activo e inventario exacto, restricciones declaradas y datos corporales opcionales con consentimiento. Sin valores por defecto de perfil.

## Modos
- Local: algoritmo determinista con catálogo, plantillas verificables y justificación.
- IA: proveedor externo seleccionado por usuario; respuesta siempre validada localmente; consentimiento específico y coste estimado si aplica.
- Híbrido: motor local filtra y construye espacio de soluciones; IA solo elige y explica dentro del conjunto permitido; verificación final local.

## Pipeline
1. Validar datos y consentimiento; identificar información insuficiente y preguntar solo lo necesario.
2. Resolver entorno activo, estados disponibles confirmados, accesorios y configuraciones.
3. Construir conjunto de variantes elegibles con reglas allOf/anyOf y exclusiones.
4. Seleccionar división semanal adecuada según disponibilidad, experiencia, objetivo y recuperación; evitar volumen excesivo.
5. Generar sesiones equilibradas con patrones de empuje, tracción, sentadilla, bisagra, core y movilidad según contexto; individualizar.
6. Ajustar volumen, repeticiones, esfuerzo, descansos y duración de forma conservadora, sin máximos obligatorios.
7. Ejecutar validador independiente (material, seguridad, tiempo, frecuencia, restricciones, IDs existentes).
8. Mostrar explicación, alternativas y aprobación; guardar versión y trazabilidad.
9. Adaptar posteriormente según sesiones realizadas y feedback sin modificaciones bruscas.

## Estructura de respuesta
`schemaVersion`, `mode`, `profileId`, `environmentId`, `summary`, `weeklySchedule`, `sessions[]`, `blocks[]`, `exerciseVariantId`, `sets`, `repRange`, `restSeconds`, `effortGuidance`, `equipmentIds`, `rationale`, `substitutions[]`, `warnings[]`, `validation`. Ningún ID inventado, ninguna carga obligatoria, ni cifras de composición corporal generadas.

## Casos de prueba
Casa sin equipo; gimnasio con pec deck pero sin crossover; una sola polea; press barra sin soportes; máquina de extensión unilateral; mancuerna sin banco; ausencia de días; dos perfiles mismo entorno; cambio temporal de entorno; descanso fin de semana; IA no disponible; respuesta adversarial o fuera de esquema.
