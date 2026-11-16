# ForgeFit — Design system aprobado

Fuente visual: `../visual/forgefit_aprobado_completo.png`. Las diez imágenes individuales son recortes de la misma referencia, no diseños alternativos.

## Tokens base
| Token | Valor | Uso |
|---|---|---|
| `bg.base` | `#101318` | Fondo |
| `surface.card` | `#222A33` | Tarjetas |
| `accent.volt` | `#B8F36B` | CTA, progreso, selección |
| `text.primary` | `#E8EDF2` | Títulos y contenido |
| `text.secondary` | `#98A3AE` | Descripciones |
| `border.default` | `#343D47` | Contornos |

Derivar y verificar estados hover/pressed/disabled/success/error; asegurar contraste accesible. 60/30/10 orientativo (superficie oscura/segundas superficies/acento). No utilizar verde como fondo de pantallas enteras.

## UI
- Tipografía Inter o equivalente con licencia, 4–5 escalones tipográficos; números tabulares.
- Sistema espaciado 4/8/12/16/24/32 dp; tarjetas radius 12–20 dp, botones 12–18 dp; valores orientativos a validar contra el mockup.
- Barra inferior persistente: Inicio, Rutinas, Ejercicios, Progreso, Más; indicador activo Volt.
- Tarjetas de información compactas, iconografía consistente, imágenes oscuras de entrenamiento con buen contraste, gráfico verde sobre carbón.
- Estado de serie completada: check y feedback háptico configurable. Biseries A1/A2 como control segmentado.
- No confundir mockup conceptual con layout pixel-perfect: implementar responsividad y safe area Android; revisar en tamaños pequeños y grandes.
