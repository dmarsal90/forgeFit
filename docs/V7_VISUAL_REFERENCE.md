# FORGEFIT V7 — NUEVAS REFERENCIAS VISUALES APROBADAS

## Jerarquía
1. `visual/v5_aprobado/ForgeFit_V5_boceto_completo.png` define identidad y apariencia general aprobada.
2. `visual/v7_nuevas_pantallas/ForgeFit_V7_formularios_completo.png` define composición de seis nuevas pantallas del onboarding, inventario y modos de generación; cada una tiene recorte individual en `individuales/`.
3. Las pantallas de `visual/individual/` son apoyo funcional previo.

## Seis nuevas vistas
1. `01_evaluacion_deportiva.png`: experiencia, historial, recuperación y precauciones opcionales.
2. `02_objetivos_avanzados.png`: objetivo principal y secundarios, sin valores predeterminados.
3. `03_entornos_entrenamiento.png`: gimnasio, casa y varios entornos, inventarios separados.
4. `04_inventario_pecho.png`: selección granular de máquinas, bancos, cruces, poleas, fondos y accesorios.
5. `05_inventario_piernas.png`: prensa 45°, hack, pendulum, extensiones, curls, Smith y variantes.
6. `06_generador_local_ia_hibrido.png`: elección del modo, consentimiento granular y proveedor externo.

## Nota crucial sobre maquetas
Las selecciones, cantidades, datos personales, métricas y nombres de proveedores dibujados son **solo ilustrativos**. La aplicación real debe iniciar sin perfil, sin objetivo, sin equipamiento, sin proveedor, sin consentimiento y sin modo seleccionado. Las capturas no son una lista exhaustiva de máquinas; el catálogo real debe cubrir `docs/EQUIPMENT_TAXONOMY.md` y permitir ampliación, filtros y búsqueda. No usar ilustraciones de las máquinas como fotografías reales de equipamiento verificadas.

## Sistema visual
Fondo #101318, superficie #222A33, acento #B8F36B, texto #E8EDF2, secundario #98A3AE, borde #343D47. Tarjetas oscuras, trazos finos, selección lima, navegación accesible, tipografía de alto contraste y áreas táctiles de al menos 48dp. Mantener el diseño V5 en la app y extenderlo a estos formularios; no crear una estética nueva.

## Interacciones no deducibles de imágenes
- Formularios multi-etapa con volver, guardar progreso, omitir opcionales, errores, estados vacíos y búsqueda.
- Inventario con ALL/ANY por accesorios y requisitos; distinguir no marcado de confirmado ausente.
- IA opcional con consentimiento granular revocable, coste aproximado si aplica, proveedor disponible y alternativa local.
- Generación de plan con vista previa editable, razones, incompatibilidades y aprobación explícita.
- Somatotipos no son criterio válido de selección; composición corporal opcional y privada.
