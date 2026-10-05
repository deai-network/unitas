import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: {
    disableTelemetry: true,
    // Host names the dev server answers to besides localhost and IP addresses
    // (for example the machine's tailnet names), comma-separated.
    allowedHosts: process.env.STORYBOOK_ALLOWED_HOSTS?.split(',').map((host) => host.trim()).filter(Boolean),
  },
  viteFinal: (vite) => ({
    ...vite,
    // One copy of each context-carrying library through the workspace links.
    resolve: { ...vite.resolve, dedupe: ['react', 'react-dom', 'antd', 'react-i18next', 'i18next'] },
  }),
};

export default config;
