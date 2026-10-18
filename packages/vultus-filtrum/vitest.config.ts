import { defineConfig } from 'vitest/config';

export default defineConfig({
  // No DOM and no React: the package runs where the server builds its queries.
  test: { environment: 'node' },
});
