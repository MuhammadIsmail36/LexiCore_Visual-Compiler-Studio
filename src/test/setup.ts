import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Give async UI assertions room when the machine is busy (e.g. during a parallel build).
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});
