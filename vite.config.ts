import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: true as const,
      hmr: process.env.DISABLE_HMR === 'true' ? false : {
        clientPort: 443,
        protocol: 'wss',
      },
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
