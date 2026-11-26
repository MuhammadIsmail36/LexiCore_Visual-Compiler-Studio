/** Pointer-driven resizable splitter between IDE panels. */

import { useCallback, useRef } from 'react';

interface Props {
  orientation: 'vertical' | 'horizontal';
  onResize: (delta: number) => void;
  label: string;
}

export function Splitter({ orientation, onResize, label }: Props) {
  const origin = useRef<number | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      origin.current = orientation === 'vertical' ? event.clientX : event.clientY;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [orientation],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (origin.current === null) return;
      const current = orientation === 'vertical' ? event.clientX : event.clientY;
      const delta = current - origin.current;
      if (delta !== 0) {
        onResize(delta);
        origin.current = current;
      }
    },
    [onResize, orientation],
  );

  const onPointerUp = useCallback(() => {
    origin.current = null;
  }, []);

  return (
    <div
      className={`splitter splitter-${orientation}`}
      role="separator"
      aria-label={label}
      aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
