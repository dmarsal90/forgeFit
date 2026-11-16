# ForgeFit V5 — referencia visual definitiva

## Prioridad visual
La composición `visual/v5_aprobado/ForgeFit_V5_boceto_completo.png` es la **referencia principal aprobada** para las pantallas nuevas y su estilo. Las 12 capturas individuales están en `visual/v5_aprobado/pantallas_individuales/`. Las tres vistas del reloj están en `visual/v5_aprobado/reloj_individual/`. Las 10 pantallas de `visual/individual/` son referencias originales complementarias para pantallas no desarrolladas en la composición V5. Ante diferencias de estilo, prevalece V5.

## Sistema visual
- Dark Performance premium: negro carbón `#101318`, superficies `#222A33`, verde Volt `#B8F36B`, texto `#E8EDF2`, texto secundario `#98A3AE`, bordes `#343D47`.
- Jerarquía de tarjetas oscuras con radios amplios, iconografía lineal, barras y botones lima, indicadores circulares, brillos verdes contenidos y fondos atmosféricos sin sacrificar contraste.
- Tipografía sans geométrica legible (Inter o equivalente con licencia), números tabulares para tiempo, repeticiones y métricas.
- Pantallas del reloj: diseño circular, controles grandes, un dato prioritario por vista, animaciones ligeras y optimización de batería.
- Ilustraciones anatómicas en el boceto son referencia estética: la app real DEBE usar modelos 3D GLB/glTF interactivos originales/licenciados, modelos masculino/femenino opcionales y músculos resaltados.
- Las fotos/ilustraciones del mockup no conceden derechos de uso comercial de imágenes ni sustituyen recursos de producción.

## Correspondencia de vistas V5
01 Bienvenida sin perfil, 02 Selección de modelo anatómico (ninguna opción seleccionada inicialmente), 03 Datos personales opcionales vacíos, 04 Objetivo sin selección inicial, 05 Días y descansos sin selección inicial, 06 Previsualización de plan generado solo tras completar onboarding, 07 Inicio sin plan con CTA, 08 Biserie y registro de series, 09 Anatomía 3D, 10 Rendimiento, 11 Conectar/sincronizar reloj, 12 Conjunto de pantallas Wear OS. Las tres vistas Wear OS separadas muestran cronómetro, serie y descanso.

## Correcciones obligatorias del boceto (los datos ilustrativos NO son defaults)
- Aunque la imagen muestra una tarjeta masculina marcada, objetivo fuerza, 5 días y fin de semana de descanso, son **datos de demostración visual exclusivamente**. En instalación limpia, no seleccionar ni guardar ninguno.
- El plan de cinco días de la imagen es solo un ejemplo. No mostrar una recomendación personalizada antes de recoger datos mínimos, solicitar consentimiento y generar el plan.
- La pantalla de inicio de perfil vacío no debe saludar a una persona existente ni mostrar progreso inventado.
- Los gráficos, peso, series, porcentajes y cronómetros del boceto son muestras de composición; en producción deben venir de registros reales o mostrarse como estados vacíos claramente identificados.
- No prometer compatibilidad universal con todos los relojes. Wear OS permite app complementaria; otros fabricantes dependen de APIs y permisos, Health Connect no da control en vivo de series.

## Criterios de fidelidad
Comparar capturas de cada pantalla implementada con la referencia individual equivalente: composición, tipografía, color, separación, radios, jerarquía, iconos y estados. Asegurar escalabilidad de Android y pantallas circulares, modo accesible, legibilidad y controles táctiles. Documentar desviaciones necesarias, no inventar rediseños.
