// Catálogo de ejercicios: patrón de movimiento + músculos + variantes con requisitos de equipo ALL/ANY.
// Los requisitos usan los ids estables de src/data/equipment.ts. Una variante es una forma concreta de hacer
// el ejercicio (barra, mancuernas, Smith…); nunca se asume que un equipo habilita toda su familia.
// Los músculos y articulaciones usan el mismo vocabulario que las precauciones del onboarding.

export type Req = string | { all: Req[] } | { any: Req[] };
export type Pattern =
  | 'push_horizontal' | 'push_vertical' | 'pull_horizontal' | 'pull_vertical'
  | 'squat' | 'hinge' | 'lunge' | 'core' | 'isolation' | 'carry' | 'conditioning';
export type Level = 1 | 2 | 3; // principiante, intermedio, avanzado
export type Variant = { id: string; es: string; requires: Req };
export type Exercise = {
  id: string; es: string; en: string; pattern: Pattern;
  primary: string[]; secondary: string[]; level: Level; stress: string[]; variants: Variant[];
};

const all = (...r: Req[]): Req => ({ all: r });
const any = (...r: Req[]): Req => ({ any: r });

// Piezas reutilizables de equipo (siempre con ids reales del catálogo).
const OLY_BAR = any('barbell_olympic_20', 'barbell_olympic_15', 'barbell_powerlifting');
const OLY_PLATES = any('plates_olympic_iron', 'plates_olympic_bumper', 'plates_olympic_competition');
const LOADED_BAR = any(all(OLY_BAR, OLY_PLATES), all('barbell_standard_25mm', 'plates_standard_25mm'));
const LOADED_EZ = any(all('barbell_ez_olympic', OLY_PLATES), all('barbell_ez_standard', 'plates_standard_25mm'));
const ANY_PLATES = any(OLY_PLATES, 'plates_standard_25mm');
const DB = any('dumbbells_fixed_hex', 'dumbbells_fixed_rubber', 'dumbbells_fixed_chrome', 'dumbbells_light_vinyl',
  'dumbbells_adjustable_plates', 'dumbbells_adjustable_selector', 'dumbbells_adjustable_dial');
const KB = any('kettlebell_cast_iron', 'kettlebell_competition', 'kettlebell_adjustable');
const FLAT = any('bench_flat_fixed', 'bench_adjustable', 'bench_flat_rack', 'bench_adjustable_rack', 'bench_utility_folding');
const INCLINE = any('bench_incline_fixed', 'bench_adjustable', 'bench_incline_rack', 'bench_adjustable_rack');
const DECLINE = any('bench_decline', 'bench_decline_rack');
const SQUAT_RACK = any('rack_squat_2post', 'rack_power_cage_4post', 'rack_wall_foldable', 'squat_stands');
// Press con barra: banco con soportes integrados, o banco + rack. Un banco solo NO basta.
const PRESS_FLAT = any('bench_flat_rack', 'bench_adjustable_rack', all(FLAT, SQUAT_RACK));
const PRESS_INCLINE = any('bench_incline_rack', 'bench_adjustable_rack', all(INCLINE, SQUAT_RACK));
const PRESS_DECLINE = any('bench_decline_rack', all(DECLINE, SQUAT_RACK));
const SMITH = any('smith_vertical', 'smith_inclined', 'smith_counterbalanced');
const CABLE_HIGH = any('cable_single_high', 'cable_single_adjustable', 'cable_crossover_dual_adjustable', 'cable_crossover_high',
  'cable_towers_independent', 'cable_wall_pulley', 'cable_row_station');
const CABLE_LOW = any('cable_single_low', 'cable_single_adjustable', 'cable_crossover_dual_adjustable', 'cable_crossover_low',
  'cable_towers_independent', 'cable_wall_pulley', 'cable_row_station');
// Crossover: dos salidas de cable compatibles. Una sola polea no cuenta.
const TWO_CABLES = any('cable_crossover_dual_adjustable', 'cable_towers_independent', 'cable_crossover_high', 'cable_crossover_mid', 'cable_crossover_low');
const PULLUP_BAR = any('pullup_bar_multigrip', 'pullup_bar_straight', 'pullup_bar_doorway', 'pullup_bar_wall', 'pullup_bar_rack');
const PARALLELS = any('dip_parallel_fixed', 'dip_parallel_adjustable', 'dip_attachment_rack', 'dip_leg_raise_tower');
const STEP = any('step_up_platform', 'plyo_box', 'aerobic_step');
const TRI_ATTACH = any('cable_att_rope', 'cable_att_bar_v', 'cable_att_bar_straight_short', 'cable_att_bar_ez');
const CURL_ATTACH = any('cable_att_bar_straight_short', 'cable_att_bar_ez', 'cable_att_handle_single', 'cable_att_rope');
const NONE = all(); // sin equipo: siempre disponible

type V = [id: string, es: string, requires: Req];
const E = (
  id: string, es: string, en: string, pattern: Pattern, primary: string[], secondary: string[],
  level: Level, stress: string[], variants: V[],
): Exercise => ({ id, es, en, pattern, primary, secondary, level, stress, variants: variants.map(([vid, ves, requires]) => ({ id: `${id}.${vid}`, es: ves, requires })) });

export const EXERCISES: Exercise[] = [
  // ── Pecho
  E('bench_press', 'Press de banca plano', 'Flat bench press', 'push_horizontal', ['pectoral'], ['triceps', 'deltoid'], 2, ['shoulder', 'elbow', 'wrist'], [
    ['barbell', 'Con barra', all(LOADED_BAR, PRESS_FLAT)], ['smith', 'En Smith', all(SMITH, FLAT)],
  ]),
  E('db_bench_press', 'Press de banca con mancuernas', 'Dumbbell bench press', 'push_horizontal', ['pectoral'], ['triceps', 'deltoid'], 1, ['shoulder', 'elbow'], [
    ['db', 'Con mancuernas', all(DB, FLAT)],
  ]),
  E('incline_bench_press', 'Press inclinado', 'Incline bench press', 'push_horizontal', ['pectoral', 'deltoid'], ['triceps'], 2, ['shoulder', 'elbow'], [
    ['barbell', 'Con barra', all(LOADED_BAR, PRESS_INCLINE)], ['smith', 'En Smith', all(SMITH, INCLINE)], ['db', 'Con mancuernas', all(DB, INCLINE)],
  ]),
  E('decline_bench_press', 'Press declinado', 'Decline bench press', 'push_horizontal', ['pectoral'], ['triceps'], 2, ['shoulder', 'elbow'], [
    ['barbell', 'Con barra', all(LOADED_BAR, PRESS_DECLINE)], ['db', 'Con mancuernas', all(DB, DECLINE)],
  ]),
  E('chest_press_machine', 'Press de pecho en máquina', 'Machine chest press', 'push_horizontal', ['pectoral'], ['triceps', 'deltoid'], 1, ['shoulder'], [
    ['machine', 'En máquina guiada', any('chest_press_machine_selectorized', 'chest_press_machine_plate', 'chest_press_convergent', 'chest_press_isolateral')],
  ]),
  E('incline_press_machine', 'Press inclinado en máquina', 'Machine incline press', 'push_horizontal', ['pectoral', 'deltoid'], ['triceps'], 1, ['shoulder'], [
    ['machine', 'En máquina guiada', any('chest_press_incline_selectorized', 'chest_press_incline_plate')],
  ]),
  E('decline_press_machine', 'Press declinado en máquina', 'Machine decline press', 'push_horizontal', ['pectoral'], ['triceps'], 1, ['shoulder'], [
    ['machine', 'En máquina guiada', 'chest_press_decline_machine'],
  ]),
  E('db_fly', 'Aperturas con mancuernas', 'Dumbbell fly', 'isolation', ['pectoral'], ['deltoid'], 2, ['shoulder'], [
    ['flat', 'En banco plano', all(DB, FLAT)], ['incline', 'En banco inclinado', all(DB, INCLINE)],
  ]),
  E('pec_deck', 'Aperturas en pec deck', 'Pec deck fly', 'isolation', ['pectoral'], ['deltoid'], 1, ['shoulder'], [
    ['machine', 'En pec deck o aperturas convergentes', any('pec_deck_fly', 'pec_deck_independent', 'pec_fly_convergent')],
  ]),
  E('cable_crossover', 'Cruce de poleas', 'Cable crossover', 'isolation', ['pectoral'], ['deltoid'], 2, ['shoulder'], [
    ['two_cables', 'Con dos salidas de cable', all(TWO_CABLES, 'cable_att_handle_single')],
  ]),
  E('dips', 'Fondos en paralelas', 'Parallel bar dips', 'push_vertical', ['pectoral', 'triceps'], ['deltoid'], 3, ['shoulder', 'elbow'], [
    ['bodyweight', 'Peso corporal', PARALLELS], ['weighted', 'Con lastre', all(PARALLELS, 'dip_belt', ANY_PLATES)],
    ['assisted', 'Asistidos en máquina', any('dip_machine_assisted', 'dip_assist_chin_combo')], ['machine', 'En máquina de fondos', 'dip_machine_weighted'],
  ]),
  E('pushup', 'Flexiones', 'Push-up', 'push_horizontal', ['pectoral'], ['triceps', 'deltoid', 'core'], 1, ['wrist', 'shoulder'], [
    ['floor', 'En el suelo', NONE], ['handles', 'Con asas', 'pushup_handles'],
  ]),

  // ── Espalda
  E('pullup', 'Dominadas', 'Pull-up', 'pull_vertical', ['lats_upper_back'], ['biceps', 'forearm'], 3, ['shoulder', 'elbow'], [
    ['bar', 'En barra', PULLUP_BAR], ['assisted', 'Asistidas en máquina', any('pullup_machine_assisted', 'dip_assist_chin_combo')],
    ['band', 'Con banda de asistencia', all(PULLUP_BAR, 'bands_pullup_assist')], ['weighted', 'Con lastre', all(PULLUP_BAR, 'dip_belt', ANY_PLATES)],
  ]),
  E('chinup', 'Dominadas supinas', 'Chin-up', 'pull_vertical', ['lats_upper_back', 'biceps'], ['forearm'], 2, ['shoulder', 'elbow'], [
    ['bar', 'En barra', PULLUP_BAR], ['assisted', 'Asistidas en máquina', any('pullup_machine_assisted', 'dip_assist_chin_combo')],
    ['band', 'Con banda de asistencia', all(PULLUP_BAR, 'bands_pullup_assist')],
  ]),
  E('neutral_pullup', 'Dominadas con agarre neutro', 'Neutral-grip pull-up', 'pull_vertical', ['lats_upper_back'], ['biceps', 'forearm'], 2, ['shoulder', 'elbow'], [
    ['multigrip', 'En barra multiagarre', 'pullup_bar_multigrip'],
  ]),
  E('lat_pulldown', 'Jalón al pecho', 'Lat pulldown', 'pull_vertical', ['lats_upper_back'], ['biceps', 'forearm'], 1, ['shoulder', 'elbow'], [
    ['station', 'En estación de jalón', any('lat_pulldown_conventional', 'lat_pulldown_convergent', 'lat_pulldown_unilateral', 'lat_pulldown_articulated')],
    ['cable', 'En polea con barra larga', all('cable_row_station', 'cable_att_bar_straight_long')],
  ]),
  E('barbell_row', 'Remo con barra', 'Barbell row', 'pull_horizontal', ['lats_upper_back'], ['biceps', 'lumbar_muscles', 'trapezius', 'forearm'], 3, ['lumbar_spine', 'elbow'], [
    ['barbell', 'Con barra', LOADED_BAR],
  ]),
  E('db_row', 'Remo con mancuerna a una mano', 'One-arm dumbbell row', 'pull_horizontal', ['lats_upper_back'], ['biceps', 'trapezius', 'forearm'], 1, ['elbow'], [
    ['bench', 'Apoyado en banco', all(DB, FLAT)], ['standing', 'Inclinado y de pie', DB],
  ]),
  E('chest_supported_db_row', 'Remo con apoyo pectoral con mancuernas', 'Chest-supported dumbbell row', 'pull_horizontal', ['lats_upper_back', 'trapezius'], ['biceps'], 1, ['elbow'], [
    ['bench', 'En banco inclinado o prone', all(DB, any(INCLINE, 'bench_prone'))],
  ]),
  E('seated_cable_row', 'Remo en polea baja', 'Seated cable row', 'pull_horizontal', ['lats_upper_back'], ['biceps', 'trapezius'], 1, ['elbow'], [
    ['station', 'En estación de remo', 'row_seated_cable'],
    ['cable', 'En polea baja con agarre', all(CABLE_LOW, any('cable_att_row_triangle', 'cable_att_row_wide', 'cable_att_handle_single'))],
  ]),
  E('machine_row', 'Remo en máquina', 'Machine row', 'pull_horizontal', ['lats_upper_back', 'trapezius'], ['biceps'], 1, ['elbow'], [
    ['machine', 'En máquina guiada', any('row_isolateral', 'row_high', 'row_convergent', 'row_chest_supported', 'row_lever')],
  ]),
  E('t_bar_row', 'Remo en T', 'T-bar row', 'pull_horizontal', ['lats_upper_back', 'trapezius'], ['biceps', 'lumbar_muscles'], 2, ['lumbar_spine'], [
    ['supported', 'Con apoyo', 'row_t_bar_supported'], ['landmine', 'Con barra landmine', all('landmine_anchor', LOADED_BAR)],
  ]),
  E('inverted_row', 'Remo invertido', 'Inverted row', 'pull_horizontal', ['lats_upper_back'], ['biceps', 'core', 'forearm'], 1, ['elbow'], [
    ['trx', 'Con sistema de suspensión', 'suspension_trainer'], ['rings', 'Con anillas', 'gymnastic_rings'], ['smith', 'En barra Smith baja', SMITH],
  ]),
  E('straight_arm_pulldown', 'Pullover en polea', 'Straight-arm pulldown', 'isolation', ['lats_upper_back'], ['triceps'], 2, ['shoulder'], [
    ['cable', 'En polea alta con barra', all(CABLE_HIGH, any('cable_att_bar_straight_short', 'cable_att_bar_straight_long'))], ['machine', 'En máquina de pullover', 'pullover_machine'],
  ]),
  E('face_pull', 'Face pull', 'Face pull', 'pull_horizontal', ['deltoid', 'trapezius'], ['lats_upper_back'], 1, ['shoulder'], [
    ['cable', 'En polea con cuerda', all(CABLE_HIGH, 'cable_att_rope')],
  ]),
  E('deadlift', 'Peso muerto convencional', 'Conventional deadlift', 'hinge', ['hamstrings', 'glutes', 'lumbar_muscles'], ['lats_upper_back', 'trapezius', 'forearm', 'quadriceps'], 3, ['lumbar_spine', 'hip', 'knee'], [
    ['barbell', 'Con barra', LOADED_BAR],
  ]),
  E('trap_bar_deadlift', 'Peso muerto con barra hexagonal', 'Trap bar deadlift', 'hinge', ['quadriceps', 'glutes', 'hamstrings'], ['lumbar_muscles', 'trapezius', 'forearm'], 2, ['lumbar_spine', 'hip', 'knee'], [
    ['trap', 'Con barra hexagonal', all(any('barbell_trap_hex', 'barbell_trap_hex_double'), OLY_PLATES)],
  ]),
  E('back_extension', 'Hiperextensiones', 'Back extension', 'hinge', ['lumbar_muscles'], ['glutes', 'hamstrings'], 1, ['lumbar_spine'], [
    ['bench', 'En banco romano o máquina', any('hyperextension_45', 'hyperextension_90', 'back_extension_machine')],
  ]),
  E('shrug', 'Encogimientos', 'Shrug', 'isolation', ['trapezius'], ['forearm'], 1, ['neck'], [
    ['db', 'Con mancuernas', DB], ['barbell', 'Con barra', LOADED_BAR], ['machine', 'En máquina', 'shrug_machine'],
  ]),

  // ── Hombros
  E('overhead_press', 'Press militar', 'Overhead press', 'push_vertical', ['deltoid'], ['triceps', 'trapezius', 'core'], 2, ['shoulder', 'elbow', 'lumbar_spine'], [
    ['barbell', 'De pie con barra', all(LOADED_BAR, SQUAT_RACK)], ['smith', 'En Smith', SMITH],
  ]),
  E('db_shoulder_press', 'Press de hombros con mancuernas', 'Dumbbell shoulder press', 'push_vertical', ['deltoid'], ['triceps'], 1, ['shoulder', 'elbow'], [
    ['seated', 'Sentado con respaldo', all(DB, any('bench_vertical_90', 'bench_adjustable'))], ['standing', 'De pie', DB],
  ]),
  E('shoulder_press_machine', 'Press de hombros en máquina', 'Machine shoulder press', 'push_vertical', ['deltoid'], ['triceps'], 1, ['shoulder'], [
    ['machine', 'En máquina guiada', any('shoulder_press_selectorized', 'shoulder_press_plate', 'shoulder_press_convergent', 'shoulder_press_isolateral')],
  ]),
  E('landmine_press', 'Press landmine', 'Landmine press', 'push_vertical', ['deltoid', 'pectoral'], ['triceps', 'core'], 2, ['shoulder'], [
    ['landmine', 'Con barra landmine', all('landmine_anchor', LOADED_BAR)],
  ]),
  E('lateral_raise', 'Elevaciones laterales con mancuernas', 'Dumbbell lateral raise', 'isolation', ['deltoid'], ['trapezius'], 1, ['shoulder'], [
    ['db', 'Con mancuernas', DB], ['band', 'Con banda', any('bands_tube_handles', 'bands_flat')],
  ]),
  E('cable_lateral_raise', 'Elevaciones laterales en polea', 'Cable lateral raise', 'isolation', ['deltoid'], [], 1, ['shoulder'], [
    ['cable', 'En polea baja', all(CABLE_LOW, 'cable_att_handle_single')],
  ]),
  E('lateral_raise_machine', 'Elevaciones laterales en máquina', 'Machine lateral raise', 'isolation', ['deltoid'], [], 1, ['shoulder'], [
    ['machine', 'En máquina', any('lateral_raise_selectorized', 'lateral_raise_unilateral', 'lateral_raise_plate')],
  ]),
  E('reverse_pec_deck', 'Pec deck inverso', 'Reverse pec deck', 'isolation', ['deltoid', 'trapezius'], ['lats_upper_back'], 1, ['shoulder'], [
    ['machine', 'En máquina de aperturas posteriores', any('rear_delt_fly', 'rear_delt_unilateral')],
  ]),
  E('reverse_fly_db', 'Pájaros con mancuernas', 'Dumbbell reverse fly', 'isolation', ['deltoid', 'trapezius'], ['lats_upper_back'], 1, ['shoulder'], [
    ['bent', 'Inclinado de pie', DB], ['prone', 'En banco prone', all(DB, 'bench_prone')],
  ]),
  E('front_raise', 'Elevaciones frontales', 'Front raise', 'isolation', ['deltoid'], ['pectoral'], 1, ['shoulder'], [
    ['db', 'Con mancuernas', DB], ['plate', 'Con disco', ANY_PLATES], ['machine', 'En máquina', 'front_raise_machine'],
  ]),
  E('external_rotation', 'Rotación externa de hombro', 'Shoulder external rotation', 'isolation', ['deltoid'], ['trapezius'], 1, [], [
    ['band', 'Con banda', any('bands_flat', 'bands_tube_handles')], ['cable', 'En polea baja', all(CABLE_LOW, 'cable_att_handle_single')], ['machine', 'En máquina', 'rotator_cuff_machine'],
  ]),

  // ── Bíceps
  E('barbell_curl', 'Curl con barra', 'Barbell curl', 'isolation', ['biceps'], ['forearm'], 1, ['elbow', 'wrist'], [
    ['straight', 'Barra recta', LOADED_BAR], ['ez', 'Barra EZ', LOADED_EZ],
  ]),
  E('db_curl', 'Curl con mancuernas', 'Dumbbell curl', 'isolation', ['biceps'], ['forearm'], 1, ['elbow'], [
    ['standing', 'De pie', DB], ['incline', 'En banco inclinado', all(DB, INCLINE)],
  ]),
  E('hammer_curl', 'Curl martillo', 'Hammer curl', 'isolation', ['biceps', 'forearm'], [], 1, ['elbow'], [
    ['db', 'Con mancuernas', DB], ['rope', 'En polea con cuerda', all(CABLE_LOW, 'cable_att_rope')],
  ]),
  E('preacher_curl', 'Curl predicador', 'Preacher curl', 'isolation', ['biceps'], ['forearm'], 2, ['elbow'], [
    ['bench_bar', 'En banco Scott con barra', all('preacher_bench_barbell', any(LOADED_EZ, LOADED_BAR))], ['bench_db', 'En banco Scott con mancuerna', all('preacher_bench_dumbbell', DB)],
    ['machine', 'En máquina', any('preacher_curl_machine_selectorized', 'preacher_curl_machine_plate')],
  ]),
  E('cable_curl', 'Curl en polea', 'Cable curl', 'isolation', ['biceps'], ['forearm'], 1, ['elbow'], [
    ['cable', 'En polea baja', all(CABLE_LOW, CURL_ATTACH)],
  ]),
  E('biceps_curl_machine', 'Curl de bíceps en máquina', 'Machine biceps curl', 'isolation', ['biceps'], [], 1, ['elbow'], [
    ['machine', 'En máquina', any('biceps_curl_unilateral', 'biceps_curl_seated')],
  ]),
  E('spider_curl', 'Curl araña', 'Spider curl', 'isolation', ['biceps'], [], 2, ['elbow'], [
    ['bench', 'En banco para curl araña', all('bench_spider_curl', any(DB, LOADED_EZ))],
  ]),
  E('concentration_curl', 'Curl concentrado', 'Concentration curl', 'isolation', ['biceps'], [], 1, ['elbow'], [
    ['db', 'Con mancuerna', DB],
  ]),

  // ── Tríceps
  E('close_grip_bench', 'Press de banca agarre cerrado', 'Close-grip bench press', 'push_horizontal', ['triceps'], ['pectoral', 'deltoid'], 2, ['elbow', 'wrist', 'shoulder'], [
    ['barbell', 'Con barra', all(LOADED_BAR, PRESS_FLAT)], ['smith', 'En Smith', all(SMITH, FLAT)],
  ]),
  E('skullcrusher', 'Rompecráneos', 'Skull crusher', 'isolation', ['triceps'], [], 2, ['elbow'], [
    ['bar', 'Con barra EZ o recta', all(any(LOADED_EZ, LOADED_BAR), FLAT)], ['db', 'Con mancuernas', all(DB, FLAT)],
  ]),
  E('triceps_pushdown', 'Extensión de tríceps en polea', 'Triceps pushdown', 'isolation', ['triceps'], [], 1, ['elbow'], [
    ['cable', 'En polea alta', all(CABLE_HIGH, TRI_ATTACH)],
  ]),
  E('overhead_db_triceps', 'Extensión de tríceps sobre la cabeza con mancuerna', 'Overhead dumbbell triceps extension', 'isolation', ['triceps'], [], 1, ['elbow', 'shoulder'], [
    ['db', 'Con mancuerna', DB],
  ]),
  E('overhead_cable_triceps', 'Extensión de tríceps sobre la cabeza en polea', 'Overhead cable triceps extension', 'isolation', ['triceps'], [], 1, ['elbow', 'shoulder'], [
    ['cable', 'En polea con cuerda', all(any(CABLE_LOW, CABLE_HIGH), 'cable_att_rope')],
  ]),
  E('triceps_machine', 'Tríceps en máquina', 'Machine triceps extension', 'isolation', ['triceps'], [], 1, ['elbow'], [
    ['machine', 'En máquina', any('triceps_extension_seated', 'triceps_extension_plate', 'triceps_overhead_machine', 'triceps_press_machine', 'triceps_dip_machine_seated')],
  ]),
  E('bench_dips', 'Fondos en banco', 'Bench dips', 'push_vertical', ['triceps'], ['pectoral', 'deltoid'], 1, ['shoulder', 'elbow', 'wrist'], [
    ['bench', 'Apoyado en banco o silla', any(FLAT, 'stable_chair', 'plyo_box')],
  ]),
  E('diamond_pushup', 'Flexiones diamante', 'Diamond push-up', 'push_horizontal', ['triceps', 'pectoral'], ['deltoid'], 2, ['wrist', 'elbow'], [
    ['floor', 'En el suelo', NONE],
  ]),
  E('db_kickback', 'Patada de tríceps con mancuerna', 'Dumbbell kickback', 'isolation', ['triceps'], [], 1, ['elbow'], [
    ['db', 'Con mancuerna', DB],
  ]),

  // ── Antebrazo y agarre
  E('wrist_curl', 'Curl de muñeca', 'Wrist curl', 'isolation', ['forearm'], [], 1, ['wrist'], [
    ['db', 'Con mancuerna', DB], ['barbell', 'Con barra', LOADED_BAR], ['machine', 'En máquina', 'wrist_curl_machine'], ['roller', 'Con rodillo de muñeca', 'wrist_roller'],
  ]),
  E('farmer_carry', 'Paseo del granjero', 'Farmer carry', 'carry', ['forearm', 'trapezius'], ['core', 'glutes'], 1, ['lumbar_spine'], [
    ['handles', 'Con asas de granjero', 'farmer_handles'], ['db', 'Con mancuernas', DB], ['kb', 'Con kettlebells', KB],
  ]),
  E('dead_hang', 'Colgarse de la barra', 'Dead hang', 'isolation', ['forearm'], ['lats_upper_back'], 1, ['shoulder'], [
    ['bar', 'En barra de dominadas', PULLUP_BAR],
  ]),

  // ── Cuádriceps
  E('back_squat', 'Sentadilla trasera', 'Back squat', 'squat', ['quadriceps', 'glutes'], ['hamstrings', 'lumbar_muscles', 'core', 'adductors'], 3, ['knee', 'hip', 'lumbar_spine'], [
    ['barbell', 'Con barra', all(LOADED_BAR, SQUAT_RACK)], ['safety', 'Con barra de seguridad', all('barbell_safety_squat', OLY_PLATES, SQUAT_RACK)],
  ]),
  E('front_squat', 'Sentadilla frontal', 'Front squat', 'squat', ['quadriceps'], ['glutes', 'core', 'lumbar_muscles'], 3, ['knee', 'wrist', 'lumbar_spine'], [
    ['barbell', 'Con barra', all(LOADED_BAR, SQUAT_RACK)],
  ]),
  E('goblet_squat', 'Sentadilla goblet', 'Goblet squat', 'squat', ['quadriceps', 'glutes'], ['core', 'adductors'], 1, ['knee'], [
    ['db', 'Con mancuerna', DB], ['kb', 'Con kettlebell', KB],
  ]),
  E('smith_squat', 'Sentadilla en Smith', 'Smith machine squat', 'squat', ['quadriceps', 'glutes'], ['hamstrings', 'adductors'], 1, ['knee', 'hip'], [
    ['smith', 'En Smith', SMITH],
  ]),
  E('bodyweight_squat', 'Sentadilla con peso corporal', 'Bodyweight squat', 'squat', ['quadriceps', 'glutes'], ['core'], 1, ['knee'], [
    ['floor', 'Sin equipo', NONE],
  ]),
  E('leg_press', 'Prensa de piernas', 'Leg press', 'squat', ['quadriceps', 'glutes'], ['hamstrings', 'adductors'], 1, ['knee', 'hip'], [
    ['machine', 'En prensa', any('leg_press_45_plate', 'leg_press_45_selectorized', 'leg_press_horizontal', 'leg_press_vertical', 'leg_press_unilateral')],
  ]),
  E('hack_squat', 'Hack squat', 'Hack squat', 'squat', ['quadriceps'], ['glutes'], 2, ['knee'], [
    ['machine', 'En máquina', any('hack_squat_plate', 'hack_squat_selectorized', 'hack_squat_reverse')],
  ]),
  E('pendulum_squat', 'Sentadilla péndulo', 'Pendulum squat', 'squat', ['quadriceps'], ['glutes'], 2, ['knee'], [['machine', 'En máquina', 'pendulum_squat']]),
  E('v_squat', 'Sentadilla en V', 'V-squat', 'squat', ['quadriceps', 'glutes'], [], 2, ['knee'], [['machine', 'En máquina', 'v_squat']]),
  E('belt_squat', 'Sentadilla con cinturón', 'Belt squat', 'squat', ['quadriceps', 'glutes'], [], 2, ['knee'], [['machine', 'En máquina', 'belt_squat']]),
  E('leg_extension', 'Extensión de cuádriceps', 'Leg extension', 'isolation', ['quadriceps'], [], 1, ['knee'], [
    ['machine', 'En máquina', any('leg_extension_bilateral', 'leg_extension_unilateral', 'leg_extension_plate')],
  ]),
  E('bulgarian_split_squat', 'Sentadilla búlgara', 'Bulgarian split squat', 'lunge', ['quadriceps', 'glutes'], ['hamstrings', 'adductors', 'core'], 2, ['knee', 'hip'], [
    ['db', 'Con mancuernas', all(DB, any(FLAT, 'stable_chair', STEP))], ['bodyweight', 'Con peso corporal', any(FLAT, 'stable_chair', STEP)],
  ]),
  E('lunge', 'Zancadas', 'Lunge', 'lunge', ['quadriceps', 'glutes'], ['hamstrings', 'adductors', 'core'], 1, ['knee', 'hip'], [
    ['bodyweight', 'Con peso corporal', NONE], ['db', 'Con mancuernas', DB], ['barbell', 'Con barra', LOADED_BAR],
  ]),
  E('step_up', 'Subidas al cajón', 'Step-up', 'lunge', ['quadriceps', 'glutes'], ['calves', 'hamstrings'], 1, ['knee'], [
    ['bodyweight', 'Con peso corporal', any(STEP, FLAT)], ['db', 'Con mancuernas', all(DB, any(STEP, FLAT))],
  ]),
  E('sissy_squat', 'Sentadilla sissy', 'Sissy squat', 'squat', ['quadriceps'], [], 3, ['knee'], [
    ['floor', 'Con peso corporal', NONE],
  ]),
  E('wall_sit', 'Sentadilla isométrica en pared', 'Wall sit', 'squat', ['quadriceps'], ['glutes'], 1, ['knee'], [
    ['wall', 'Contra una pared', NONE],
  ]),

  // ── Isquiotibiales
  E('romanian_deadlift', 'Peso muerto rumano', 'Romanian deadlift', 'hinge', ['hamstrings', 'glutes'], ['lumbar_muscles', 'forearm', 'trapezius'], 2, ['lumbar_spine', 'hip'], [
    ['barbell', 'Con barra', LOADED_BAR], ['db', 'Con mancuernas', DB],
  ]),
  E('leg_curl', 'Curl femoral en máquina', 'Machine leg curl', 'isolation', ['hamstrings'], ['calves'], 1, ['knee'], [
    ['machine', 'En máquina', any('leg_curl_seated', 'leg_curl_lying', 'leg_curl_standing_unilateral', 'leg_curl_unilateral', 'leg_curl_plate')],
  ]),
  E('nordic_curl', 'Curl nórdico', 'Nordic curl', 'isolation', ['hamstrings'], ['glutes'], 3, ['knee'], [
    ['bench', 'En banco nórdico o GHD', any('nordic_bench', 'glute_ham_developer')],
  ]),
  E('glute_ham_raise', 'Elevación glúteo-isquio (GHR)', 'Glute-ham raise', 'hinge', ['hamstrings', 'glutes'], ['lumbar_muscles'], 3, ['knee', 'lumbar_spine'], [
    ['ghd', 'En banco GHD', 'glute_ham_developer'],
  ]),
  E('good_morning', 'Buenos días', 'Good morning', 'hinge', ['hamstrings', 'lumbar_muscles'], ['glutes'], 3, ['lumbar_spine', 'hip'], [
    ['barbell', 'Con barra', all(LOADED_BAR, SQUAT_RACK)],
  ]),
  E('slider_leg_curl', 'Curl femoral con deslizadores', 'Slider leg curl', 'isolation', ['hamstrings'], ['glutes', 'core'], 2, ['knee'], [
    ['sliders', 'Con deslizadores', 'hamstring_sliders'],
  ]),
  E('single_leg_rdl', 'Peso muerto rumano a una pierna', 'Single-leg Romanian deadlift', 'hinge', ['hamstrings', 'glutes'], ['core', 'lumbar_muscles'], 2, ['lumbar_spine', 'hip', 'ankle'], [
    ['db', 'Con mancuerna', DB], ['kb', 'Con kettlebell', KB], ['bodyweight', 'Con peso corporal', NONE],
  ]),
  E('cable_pull_through', 'Pull-through en polea', 'Cable pull-through', 'hinge', ['glutes', 'hamstrings'], ['lumbar_muscles'], 1, ['hip'], [
    ['cable', 'En polea baja con cuerda', all(CABLE_LOW, 'cable_att_rope')],
  ]),

  // ── Glúteos
  E('hip_thrust', 'Hip thrust', 'Hip thrust', 'hinge', ['glutes'], ['hamstrings', 'adductors'], 2, ['hip', 'lumbar_spine'], [
    ['barbell', 'Con barra', all(LOADED_BAR, any(FLAT, 'hip_thrust_bench'))], ['machine', 'En máquina', 'hip_thrust_machine'], ['db', 'Con mancuerna', all(DB, any(FLAT, 'hip_thrust_bench'))],
  ]),
  E('glute_bridge', 'Puente de glúteos', 'Glute bridge', 'hinge', ['glutes'], ['hamstrings'], 1, ['hip'], [
    ['floor', 'Sin equipo', NONE],
  ]),
  E('cable_kickback', 'Patada de glúteo en polea', 'Cable glute kickback', 'isolation', ['glutes'], ['hamstrings'], 1, ['hip'], [
    ['cable', 'En polea baja con tobillera', all(CABLE_LOW, 'cable_att_ankle_strap')],
  ]),
  E('glute_kickback_machine', 'Patada de glúteo en máquina', 'Machine glute kickback', 'isolation', ['glutes'], [], 1, ['hip'], [
    ['machine', 'En máquina', any('glute_kickback_standing', 'glute_kickback_quadruped')],
  ]),
  E('hip_extension_machine', 'Extensión de cadera en máquina', 'Machine hip extension', 'isolation', ['glutes', 'hamstrings'], ['lumbar_muscles'], 2, ['hip', 'lumbar_spine'], [
    ['machine', 'En máquina', any('hip_extension_machine', 'reverse_hyper')],
  ]),
  E('banded_lateral_walk', 'Caminata lateral con banda', 'Banded lateral walk', 'isolation', ['glutes'], ['adductors'], 1, ['knee'], [
    ['band', 'Con mini banda', any('mini_bands_loop', 'bands_loop_long')],
  ]),
  E('donkey_kick', 'Patada de burro', 'Donkey kick', 'isolation', ['glutes'], ['core'], 1, ['wrist'], [
    ['floor', 'Sin equipo', NONE],
  ]),

  // ── Aductores y abductores
  E('hip_adduction_machine', 'Aductores en máquina', 'Machine hip adduction', 'isolation', ['adductors'], [], 1, ['hip'], [
    ['machine', 'En máquina', any('adductor_machine_seated', 'hip_abd_add_combo', 'multi_hip_machine')],
  ]),
  E('hip_abduction_machine', 'Abductores en máquina', 'Machine hip abduction', 'isolation', ['glutes'], [], 1, ['hip'], [
    ['machine', 'En máquina', any('abductor_machine_seated', 'hip_abd_add_combo', 'abductor_standing_machine', 'multi_hip_machine')],
  ]),
  E('side_lying_abduction', 'Abducción de cadera tumbado', 'Side-lying hip abduction', 'isolation', ['glutes'], [], 1, ['hip'], [
    ['floor', 'Sin equipo', NONE],
  ]),
  E('copenhagen_plank', 'Plancha Copenhague', 'Copenhagen plank', 'isolation', ['adductors'], ['core'], 3, ['hip', 'shoulder'], [
    ['bench', 'Con banco o silla', any(FLAT, 'stable_chair')],
  ]),

  // ── Gemelos
  E('standing_calf_raise', 'Elevación de gemelos de pie', 'Standing calf raise', 'isolation', ['calves'], [], 1, ['ankle'], [
    ['machine', 'En máquina', any('calf_standing_machine', 'calf_donkey_machine')], ['smith', 'En Smith con plataforma', all(SMITH, any('calf_smith_platform', 'calf_step_block'))],
    ['step', 'En escalón con peso corporal', any('calf_step_block', STEP)], ['db', 'En escalón con mancuernas', all(DB, any('calf_step_block', STEP))],
  ]),
  E('seated_calf_raise', 'Elevación de gemelos sentado', 'Seated calf raise', 'isolation', ['calves'], [], 1, ['ankle'], [
    ['machine', 'En máquina', 'calf_seated_machine'],
  ]),
  E('leg_press_calf_raise', 'Gemelos en prensa', 'Leg press calf raise', 'isolation', ['calves'], [], 1, ['ankle'], [
    ['press', 'En prensa de piernas', any('calf_leg_press', 'leg_press_45_plate', 'leg_press_45_selectorized', 'leg_press_horizontal')],
  ]),
  E('tibialis_raise', 'Elevación de tibial anterior', 'Tibialis raise', 'isolation', ['calves'], [], 1, ['ankle'], [
    ['device', 'Con dispositivo de tibial', 'tibialis_raise'],
  ]),

  // ── Abdomen y core
  E('plank', 'Plancha', 'Plank', 'core', ['core'], ['deltoid', 'glutes'], 1, ['shoulder', 'wrist'], [['floor', 'Sin equipo', NONE]]),
  E('side_plank', 'Plancha lateral', 'Side plank', 'core', ['core'], ['glutes', 'deltoid'], 1, ['shoulder', 'wrist'], [['floor', 'Sin equipo', NONE]]),
  E('crunch', 'Crunch abdominal', 'Crunch', 'core', ['core'], [], 1, ['neck', 'lumbar_spine'], [['floor', 'Sin equipo', NONE]]),
  E('dead_bug', 'Bicho muerto', 'Dead bug', 'core', ['core'], ['hip_flexors'], 1, [], [['floor', 'Sin equipo', NONE]]),
  E('bird_dog', 'Perro-pájaro', 'Bird dog', 'core', ['core', 'lumbar_muscles'], ['glutes'], 1, ['wrist'], [['floor', 'Sin equipo', NONE]]),
  E('mountain_climber', 'Escaladores', 'Mountain climber', 'conditioning', ['core'], ['quadriceps', 'deltoid', 'hip_flexors'], 2, ['wrist', 'shoulder'], [['floor', 'Sin equipo', NONE]]),
  E('crunch_machine', 'Crunch en máquina', 'Machine crunch', 'core', ['core'], [], 1, ['lumbar_spine'], [
    ['machine', 'En máquina', any('crunch_machine_selectorized', 'crunch_machine_plate')],
  ]),
  E('cable_crunch', 'Crunch en polea', 'Cable crunch', 'core', ['core'], [], 2, ['lumbar_spine', 'neck'], [
    ['cable', 'En polea alta con cuerda', all(CABLE_HIGH, 'cable_att_rope')],
  ]),
  E('hanging_leg_raise', 'Elevación de piernas colgado', 'Hanging leg raise', 'core', ['core', 'hip_flexors'], ['forearm'], 3, ['shoulder', 'lumbar_spine'], [
    ['bar', 'En barra', PULLUP_BAR], ['captain', 'En silla romana o captain chair', any('roman_chair', 'captain_chair', 'dip_leg_raise_tower')],
  ]),
  E('ab_wheel', 'Rueda abdominal', 'Ab wheel rollout', 'core', ['core'], ['lats_upper_back', 'deltoid'], 3, ['shoulder', 'lumbar_spine'], [
    ['wheel', 'Con rueda abdominal', 'ab_wheel'],
  ]),
  E('russian_twist', 'Giro ruso', 'Russian twist', 'core', ['core'], ['hip_flexors'], 1, ['lumbar_spine'], [
    ['bodyweight', 'Con peso corporal', NONE], ['weighted', 'Con carga', any(DB, 'medicine_ball')],
  ]),
  E('pallof_press', 'Press Pallof', 'Pallof press', 'core', ['core'], ['deltoid'], 1, [], [
    ['cable', 'En polea', all(CABLE_LOW, 'cable_att_handle_single')], ['band', 'Con banda', 'bands_tube_handles'],
  ]),
  E('decline_situp', 'Abdominales en banco declinado', 'Decline sit-up', 'core', ['core', 'hip_flexors'], [], 2, ['lumbar_spine', 'neck'], [
    ['bench', 'En banco declinado', any('bench_ab_declined', 'bench_decline')],
  ]),
  E('torso_rotation_machine', 'Rotación de torso en máquina', 'Machine torso rotation', 'core', ['core'], [], 1, ['lumbar_spine'], [
    ['machine', 'En máquina', 'torso_rotation_machine'],
  ]),
  E('landmine_rotation', 'Rotaciones con landmine', 'Landmine rotation', 'core', ['core'], ['deltoid'], 2, ['lumbar_spine'], [
    ['landmine', 'Con barra landmine', all('landmine_anchor', LOADED_BAR)],
  ]),

  // ── Cuerpo completo y funcional
  E('kettlebell_swing', 'Swing con kettlebell', 'Kettlebell swing', 'hinge', ['glutes', 'hamstrings'], ['lumbar_muscles', 'core', 'forearm'], 2, ['lumbar_spine', 'hip'], [
    ['kb', 'Con kettlebell', KB],
  ]),
  E('sled_push', 'Empuje de trineo', 'Sled push', 'conditioning', ['quadriceps', 'glutes'], ['calves', 'core'], 1, ['knee'], [
    ['sled', 'Con trineo', 'sled'],
  ]),
  E('battle_rope_waves', 'Ondas con cuerdas de combate', 'Battle rope waves', 'conditioning', ['deltoid', 'core'], ['forearm'], 2, ['shoulder'], [
    ['ropes', 'Con cuerdas de combate', 'battle_ropes'],
  ]),
  E('medicine_ball_slam', 'Lanzamiento de balón contra el suelo', 'Medicine ball slam', 'conditioning', ['core', 'lats_upper_back'], ['deltoid', 'glutes'], 2, ['lumbar_spine', 'shoulder'], [
    ['ball', 'Con balón', any('slam_ball', 'medicine_ball')],
  ]),
  E('box_jump', 'Salto al cajón', 'Box jump', 'conditioning', ['quadriceps', 'glutes'], ['calves'], 2, ['knee', 'ankle'], [
    ['box', 'Con cajón pliométrico', 'plyo_box'],
  ]),
  E('turkish_get_up', 'Levantamiento turco', 'Turkish get-up', 'core', ['core', 'deltoid'], ['glutes', 'quadriceps'], 3, ['shoulder', 'wrist', 'knee'], [
    ['kb', 'Con kettlebell', KB], ['db', 'Con mancuerna', DB],
  ]),
];
