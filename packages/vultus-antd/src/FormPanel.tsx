import { useState } from 'react';
import { Form, Alert } from 'antd';
import type { FormProps } from 'antd';
import type React from 'react';
import { ActionErrorContext } from 'vultus-core';

type Props = Omit<FormProps, 'form'> & {
  children: React.ReactNode;
};

export function FormPanel({ children, ...formProps }: Props) {
  const [form] = Form.useForm();
  const [inlineError, setInlineError] = useState<string | null>(null);

  return (
    <ActionErrorContext.Provider value={{ form, setInlineError }}>
      <Form form={form} {...formProps}>
        {children}
        {inlineError && (
          <Form.Item>
            <Alert
              type="error"
              showIcon
              closable={{ onClose: () => setInlineError(null) }}
              title={inlineError}
            />
          </Form.Item>
        )}
      </Form>
    </ActionErrorContext.Provider>
  );
}
