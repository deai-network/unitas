import type { Decorator, Preview } from '@storybook/react-vite';
import { App, ConfigProvider, theme } from 'antd';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { VultusProvider } from 'vultus-antd';

// vultus-core's actions translate through react-i18next; the gallery has no texts of its own.
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: {}, interpolation: { escapeValue: false } });
}

/** Every story in antd's default look (light or dark from the toolbar), inside VultusProvider. */
const withVultus: Decorator = (Story, context) => {
  const dark = context.globals.scheme === 'dark';
  return (
    <ConfigProvider theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      <App style={{ minHeight: '100vh', padding: 32, background: dark ? '#141414' : '#fff', color: dark ? '#fff' : undefined }}>
        <VultusProvider>
          <Story />
        </VultusProvider>
      </App>
    </ConfigProvider>
  );
};

const preview: Preview = {
  globalTypes: {
    scheme: {
      description: 'antd light or dark algorithm',
      toolbar: {
        title: 'Scheme',
        icon: 'mirror',
        items: [{ value: 'light', title: 'Light' }, { value: 'dark', title: 'Dark' }],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { scheme: 'light' },
  decorators: [withVultus],
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
};

export default preview;
