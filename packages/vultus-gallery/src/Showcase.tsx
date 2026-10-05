import type { ReactNode } from 'react';
import { Typography } from 'antd';

/** Gallery layout: a titled block of labelled examples. */
export function Showcase({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>{title}</Typography.Title>
      {note && <Typography.Paragraph type="secondary" style={{ maxWidth: 760 }}>{note}</Typography.Paragraph>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>{children}</div>
    </section>
  );
}

export function Example({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure style={{ margin: 0, minWidth: 180 }}>
      <figcaption style={{ marginBottom: 8, fontSize: 12, opacity: 0.65, fontFamily: 'monospace' }}>{label}</figcaption>
      {children}
    </figure>
  );
}

/** A pretend server round trip. */
export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
