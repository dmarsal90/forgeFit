# Integración de relojes inteligentes — Especificación V4

## Objetivo
Permitir seguir y controlar una sesión ForgeFit desde móvil Android y reloj Wear OS, con sincronización bidireccional de ejercicio, biserie, series, descansos y tiempo transcurrido.

## Capas
1. Aplicación móvil React Native/Expo con build nativo.
2. App Wear OS propia, preferiblemente Kotlin + Jetpack Compose for Wear OS.
3. Wear OS Data Layer API para eventos de sesión y datos pequeños.
4. Health Services para métricas del reloj autorizadas.
5. Health Connect en Android para intercambio de registros de salud compatibles; no es sincronización en vivo de series.

## Compatibilidad
- Galaxy Watch con Wear OS: integración en vivo viable con app ForgeFit instalada en ambos dispositivos, sujeta a pruebas reales.
- Otros Wear OS: arquitectura compartida, confirmar versión y capacidades.
- Garmin, Fitbit, Amazfit y otros: posible importación de datos según servicios disponibles, sin prometer control en vivo.
- Apple Watch: fuera del alcance de integración directa Android/Wear OS.

## Protocolo de sincronización
Usar sessionId, profileId, deviceId, eventId, eventVersion, timestamps, tipo de evento, payload validado, ACK y resolución de conflictos. Eventos idempotentes, almacenamiento offline y reconciliación tras reconexión. Mantener una única línea temporal de pausas para calcular el tiempo efectivo de sesión.

## UX
Reloj: nombre de ejercicio, A1/A2, serie actual, peso y repeticiones, botón completar, descanso y cronómetro; sin 3D pesado. Móvil: detalles completos, anatomía 3D y analítica. Estados visibles de conectividad y permisos.

## Privacidad
Permisos mínimos y revocables; asociar dispositivo al perfil activo con confirmación; evitar fugas entre perfiles; no duplicar entrenamientos importados desde Samsung Health.

## Fuentes oficiales verificadas (noviembre 2026)
- https://developer.android.com/training/wearables/data/sync
- https://developer.android.com/training/wearables/data/overview
- https://developer.android.com/health-and-fitness/health-services
- https://developer.samsung.com/health/blog/en/accessing-samsung-health-data-through-health-connect
- https://developer.samsung.com/health/health-connect-faq.html
