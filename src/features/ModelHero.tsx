import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { heroTargets, type HeroModel } from '../lib/hero';

// Ilustración del boceto aprobado (ForgeFit_Bocetos_Seleccion_3D_v1). Tres capas que se funden entre sí.
const BOTH = require('../../assets/images/hero_both.webp');
const MALE = require('../../assets/images/hero_male.webp');
const WOMAN = require('../../assets/images/hero_woman.webp');

/** Decorativa (oculta a lectores de pantalla): la selección real la hacen los botones del formulario. */
export function ModelHero({ model }: { model: HeroModel }) {
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const both = useSharedValue(1);
  const male = useSharedValue(0);
  const woman = useSharedValue(0);
  const scale = useSharedValue(1);
  const shift = useSharedValue(0);

  useEffect(() => {
    const t = heroTargets(model);
    const cfg = { duration: reduce ? 0 : 650, easing: Easing.inOut(Easing.cubic) };
    both.value = withTiming(t.both, cfg);
    male.value = withTiming(t.male, cfg);
    woman.value = withTiming(t.woman, cfg);
    scale.value = withTiming(t.womanScale, cfg);
    shift.value = withTiming(t.womanShift, cfg);
  }, [model, reduce, both, male, woman, scale, shift]);

  const bothStyle = useAnimatedStyle(() => ({ opacity: both.value }));
  const maleStyle = useAnimatedStyle(() => ({ opacity: male.value }));
  const womanStyle = useAnimatedStyle(() => ({ opacity: woman.value, transform: [{ translateX: shift.value * width }, { scale: scale.value }] }));
  const fill = { position: 'absolute', width: '100%', height: '100%' } as const;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ width: '100%', aspectRatio: 960 / 740 }}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    >
      <Animated.Image source={BOTH} resizeMode="contain" style={[fill, bothStyle]} />
      <Animated.Image source={MALE} resizeMode="contain" style={[fill, maleStyle]} />
      <Animated.Image source={WOMAN} resizeMode="contain" style={[fill, womanStyle]} />
    </View>
  );
}
