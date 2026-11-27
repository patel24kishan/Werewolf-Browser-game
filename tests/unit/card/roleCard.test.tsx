// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoleCard } from '@/card/RoleCard';
import { ROLES } from '@/game';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness({ role }: { role: string }) {
  const [up, setUp] = useState(false);
  return <RoleCard role={role} faceUp={up} onToggle={() => setUp((v) => !v)} />;
}

function mockMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: matches && q.includes('reduce'),
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('RoleCard', () => {
  it('starts face down and toggles pressed state and name', () => {
    render(<Harness role="seer" />);
    const btn = screen.getByRole('button', { name: 'Your card, face down. Tap to reveal.' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    const up = screen.getByRole('button', { name: 'Your card: Seer. Tap to hide.' });
    expect(up.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(up);
    expect(screen.getByRole('button', { name: /face down/ }).getAttribute('aria-pressed')).toBe('false');
  });

  for (const [id, info] of Object.entries(ROLES).filter(([, r]) => r.dealt)) {
    it(`shows art, name and power for ${id}`, () => {
      const { container } = render(<Harness role={id} />);
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText(info.name)).toBeTruthy();
      expect(screen.getByText(info.power)).toBeTruthy();
      const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'));
      expect(srcs).toContain(`/cards/${info.art}`);
      expect(srcs).toContain('/cards/card-back.png');
    });
  }

  it('falls back safely for an unknown role id', () => {
    const { container } = render(<Harness role="../evil" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Unknown card')).toBeTruthy();
    for (const img of container.querySelectorAll('img')) expect(img.getAttribute('src')).toBe('/cards/card-back.png');
  });

  it('marks reduced motion when the media query matches', () => {
    mockMotion(true);
    const { container } = render(<Harness role="seer" />);
    expect(container.querySelector('.rcard')?.getAttribute('data-motion')).toBe('reduced');
  });

  it('uses full motion otherwise', () => {
    mockMotion(false);
    const { container } = render(<Harness role="seer" />);
    expect(container.querySelector('.rcard')?.getAttribute('data-motion')).toBe('full');
  });
});
