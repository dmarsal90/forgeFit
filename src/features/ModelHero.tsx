import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { heroTargets, type HeroModel } from '../lib/hero';

// Ilustraciones de los bocetos aprobados (Perfil básico: sin elegir, Modelo Masculino y Modelo Femenino). Tres capas que se funden entre sí;
// en las dos de selección el otro modelo ya aparece difuminado de fondo, con el mismo estilo en ambas.
const BOTH = require('../../assets/images/hero_both.webp');
const MALE = require('../../assets/images/hero_male.webp');
const FEMALE = require('../../assets/images/hero_female.webp');

/** Decorativa (oculta a lectores de pantalla): la selección real la hacen los botones del formulario. */
export function ModelHero({ model }: { model: HeroModel }) {
  const reduce = useReducedMotion();
  const both = useSharedValue(1);
  const male = useSharedValue(0);
  const female = useSharedValue(0);

  useEffect(() => {
    const t = heroTargets(model);
    const cfg = { duration: reduce ? 0 : 650, easing: Easing.inOut(Easing.cubic) };
    both.value = withTiming(t.both, cfg);
    male.value = withTiming(t.male, cfg);
    female.value = withTiming(t.female, cfg);
  }, [model, reduce, both, male, female]);

  const bothStyle = useAnimatedStyle(() => ({ opacity: both.value }));
  const maleStyle = useAnimatedStyle(() => ({ opacity: male.value }));
  const femaleStyle = useAnimatedStyle(() => ({ opacity: female.value }));
  const fill = { position: 'absolute', width: '100%', height: '100%' } as const;

  return (
    <View style={{ width: '100%', aspectRatio: 960 / 740 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.Image source={BOTH} resizeMode="contain" style={[fill, bothStyle]} />
      <Animated.Image source={MALE} resizeMode="contain" style={[fill, maleStyle]} />
      <Animated.Image source={FEMALE} resizeMode="contain" style={[fill, femaleStyle]} />
    </View>
  );
}
