# ForgeFit — Kit de identidad oficial (concepto A, contorno premium)

## Identidad
- Marca: F geométrica verde `#B8F36B` sobre carbón `#202326`.
- El contorno verde pertenece al icono independiente (favicon, launcher legacy y presentación).
- Android adaptive icon: foreground, background y monochrome por separado; el sistema aplica la máscara. **No incrustar un contorno exterior** en la capa foreground para evitar recortes.
- Tipografía de interfaz recomendada: Inter, sujeta a licencia y disponibilidad; no se incluyen fuentes.

## Entregables
- `icons/forgefit_icon_master.svg`: icono maestro vectorial.
- `icons/favicon`: PNG 16–1024 e ICO multiresolución.
- `icons/android`: capas SVG y PNG, launcher legacy y XML de ejemplo.
- `icons/wear-os`: lanzador de reloj y variante monocroma.
- `logos`: versiones horizontal oscura/clara y marca transparente.
- `splash`: pantalla vertical SVG y PNG 1080×2400.
- `guidelines/design_tokens.json`: tokens de color.

## Accesibilidad y validación
- Comprobar contraste de textos y estados con WCAG 2.2 AA (4.5:1 texto normal; 3:1 texto grande y elementos no textuales relevantes).
- Probar en dispositivos reales: recorte de máscaras Android, tema claro/oscuro, densidades, pantallas pequeñas y Wear OS circular.
- Iconos gráficos no sustituyen descripciones accesibles de controles.
- Las piezas son recursos vectoriales originales basados en la propuesta visual; no son archivos nativos Figma ni modelos anatómicos 3D.
