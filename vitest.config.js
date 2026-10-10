import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { pool: 'threads', maxWorkers: 1, environment: 'jsdom', include: ['src/ui.test.jsx', 'src/coach.test.jsx'], setupFiles: ['./src/ui.setup.js'] } });
