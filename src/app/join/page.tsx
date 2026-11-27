import { Suspense } from 'react';
import { JoinFlow } from '@/join/JoinFlow';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <JoinFlow />
    </Suspense>
  );
}
