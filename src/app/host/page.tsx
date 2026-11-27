import { Suspense } from 'react';
import { HostScreen } from '@/host/HostScreen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HostScreen />
    </Suspense>
  );
}
