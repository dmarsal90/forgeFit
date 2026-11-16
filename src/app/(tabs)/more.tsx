import { EmptyState, Screen, Text } from '../../ui/components';

export default function MoreScreen() {
  return (
    <Screen>
      <Text variant="title">Más</Text>
      <EmptyState icon="ellipsis-horizontal" title="Sin datos todavía" body="Perfiles, entornos, reloj y datos estarán aquí." />
    </Screen>
  );
}
