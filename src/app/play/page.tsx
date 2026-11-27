import { Suspense } from 'react';
import { PlayScreen } from '@/play/PlayScreen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PlayScreen />
    </Suspense>
  );
}
