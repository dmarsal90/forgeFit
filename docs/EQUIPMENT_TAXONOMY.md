# Catálogo técnico de equipamiento — ForgeFit V6

## Reglas de modelado
No usar un checkbox genérico «banco» o «polea» como sustituto de variantes. Cada ítem tendrá `id`, nombre ES/EN, aliases, familia, variante, atributos, accesorios y estado disponible/no disponible/desconocido. Los siguientes son grupos iniciales, ampliables sin despliegue de código.

## Pecho
Bancos plano fijo, ajustable por ángulos, inclinado fijo, declinado, banco con soporte integrado; estación de press horizontal guiado, press inclinado guiado, press declinado guiado, convergente, iso-lateral, plate-loaded, selectorizado, Smith; pec deck de aperturas, contractor con brazos independientes, aperturas convergentes, estación de cable crossover doble regulable, cruces altos/medios/bajos, estación simple de polea alta/baja, paralelas, máquina de fondos asistidos, máquina de fondos lastrados, cinturón de lastre, asas de flexiones.

## Espalda
Dominadas barra fija neutra/prona/supina, asistida y lastre; jalón dorsal convencional, convergente, unilateral, articulado; remo polea baja, remo iso-lateral, remo alto, remo convergente, remo T apoyado, landmine, remo con apoyo pectoral, remo de palanca; máquina pullover, polea alta con barra recta para pullover, banco romano y extensión lumbar.

## Hombros
Press de hombro convergente, selectorizado, plate-loaded, Smith, rack; elevación lateral selectorizada, unilateral, cable; pec deck inverso específico, reverse fly, face pull con polea ajustable y cuerda, encogimientos y landmine.

## Piernas y glúteos
Rack, jaula, soportes de sentadilla, Smith vertical/inclinada, hack squat, pendulum squat, V-squat, belt squat, prensa 45 grados, horizontal, vertical, unilateral; extensión de cuádriceps bilateral/unilateral, curl femoral sentado/tumbado/de pie/unilateral, aductores, abductores, kickback glúteos, hip thrust, glute ham raise, banco nórdico, gemelos sentado/de pie/prensa, plataforma step-up.

## Brazos
Banco Scott, curl predicador máquina, curl unilateral, poleas baja/alta con barra EZ/recta, cuerda, agarres individuales, tríceps pushdown, extensión por encima de cabeza, máquina de fondos, máquina extensión de tríceps, rodillo de muñeca y antebrazo.

## Core y funcional
Crunch máquina, banco declinado, silla romana, captain chair, estación elevación piernas, polea crunch, rueda abdominal, rotación de torso, colchoneta, fitball, TRX, bandas, kettlebells, mancuernas ajustables/fijas, barra olímpica, barra EZ, barra hexagonal, safety squat, multigrip, discos, discos fraccionales, chaleco/cinturón de lastre, cajón, trineo, balón medicinal, battle ropes.

## Cardio y movilidad
Cinta, bicicleta estática, bicicleta de aire, elíptica, escaladora, remo ergómetro, SkiErg, assault bike, rodillos, bandas de movilidad, esterilla, espacio libre.

## Atributos imprescindibles
- Banco: fijo/ajustable, posiciones y ángulos, capacidad y soporte de barra disponible.
- Polea: número de torres, altura ajustable, puntos simultáneos, accesorios, capacidad y recorrido.
- Barra/mancuernas: tipo, rango de peso y saltos disponibles, discos y cierres.
- Máquinas: movimiento, lateralidad, recorrido, resistencia, apoyos y ajustes.
- Paralelas: asistidas, lastradas o libres; cinturón/chaleco disponible.
- Entorno: gimnasio/casa/viaje/exterior; inventario editable y reutilizable.

## Requisitos expresivos
`allOf`, `anyOf`, `optional`, `constraints` y `alternatives` por ejercicio. Nunca asumir que un equipo habilita todos los ejercicios de su familia. Ejemplo press barra: allOf [barra, discos, banco plano, soportes apropiados]; crossover: allOf [dos salidas de cable compatibles, dos agarres]. Las variantes no deben confundirse con el ejercicio ni con el implemento físico.
