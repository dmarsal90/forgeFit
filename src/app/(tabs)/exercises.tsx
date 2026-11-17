import { EmptyState, Screen, Text } from '../../ui/components';

export default function ExercisesScreen() {
  return (
    <Screen tab>
      <Text variant="title">Ejercicios</Text>
      <EmptyState icon="barbell-outline" title="Sin datos todavía" body="La biblioteca de ejercicios llegará en una fase posterior." />
    </Screen>
  );
}
