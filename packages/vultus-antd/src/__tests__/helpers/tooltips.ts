/**
 * The tooltips that are open. jsdom never ends antd's leave motion, so a
 * closed tooltip stays mounted with a `-leave` class; it does not count, nor
 * does a hidden one. Popconfirms are popovers, not tooltips.
 */
export function openTooltips(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ant-tooltip')).filter((t) =>
    !t.classList.contains('ant-tooltip-hidden') && !Array.from(t.classList).some((c) => c.endsWith('-leave')));
}
