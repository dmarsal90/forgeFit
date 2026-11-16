# ForgeFit — Anatomía 3D y movimiento

## Requisito no negociable
Las pantallas 05, 08 y el mapa de la 10 requieren **malla anatómica 3D real**, no sprites 2D ni ilustraciones estáticas. Se puede entregar un fallback técnico temporal, claramente identificado, pero no dar por completado el módulo sin modelo interactivo.

## Modelo
GLB/glTF optimizado, mallas o grupos identificables, asignación estable de identificadores a músculos (pectoralis_major, latissimus_dorsi, deltoid_anterior, triceps_brachii, etc.), materiales de base gris oscuro y resaltado Volt para primarios, verde menos intenso para secundarios. Textos descriptivos accesibles fuera del canvas.

## Interacciones
Girar 360°, zoom limitado, botón reset, alternar anterior/posterior, tocar músculo para ficha; cámara y luces consistentes con referencias. Evitar gestos que interfieran con scroll. Limitar FPS/LOD en equipos de gama media; carga diferida y pausa cuando la pantalla no esté activa.

## Animación
Transiciones 180–320 ms según contexto, entrada escalonada sutil, gráficos que revelan datos, temporizador circular fluido, respuesta de completar serie. Respeto al ajuste de movimiento reducido de Android; no depender de animación para comunicar estado. La exactitud de tiempos se calibra con pruebas reales, no con la imagen.

## Assets y derechos
Las imágenes del mockup son referencias de diseño. El modelo anatómico 3D y los vídeos deben ser creados o licenciados separadamente, con inventario de fuentes, derechos y atribuciones.
