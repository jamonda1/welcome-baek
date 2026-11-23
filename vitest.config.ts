import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'],
    environmentOptions: { jsdom: { url: 'https://www.acmicpc.net/problem/1000', pretendToBeVisual: true } } }
});
