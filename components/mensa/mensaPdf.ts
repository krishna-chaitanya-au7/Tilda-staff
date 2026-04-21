import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { DayMenulines } from '@/components/mensa/mensaMealPlan';

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Simplified WeekplanForPdf-style HTML for expo-print */
export function buildSpeiseplanHtml(data: DayMenulines[]): string {
  const days = [...new Set(data.map((d) => d.date))].sort();
  if (!days.length) return '<html><body><p>Keine Daten</p></body></html>';

  const weekdayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
  const dayMap = new Map(data.map((d) => [d.date, d]));
  const weekDays = days
    .map((ymd) => {
      try {
        return parseISO(ymd);
      } catch {
        return null;
      }
    })
    .filter((d): d is Date => d != null);

  const maxMenus = Math.max(0, ...weekDays.map((d) => dayMap.get(format(d, 'yyyy-MM-dd'))?.menulines.length || 0));

  const rows: { key: string; label: string }[] = [
    { key: 'starter', label: 'Vorspeise' },
    ...Array.from({ length: maxMenus }, (_, i) => ({ key: `menu-${i + 1}`, label: `Menü ${i + 1}` })),
    { key: 'dessert', label: 'Nachspeise' },
  ];

  let tableBody = '';
  for (const row of rows) {
    tableBody += '<tr>';
    tableBody += `<td style="padding:8px;background:#f8fafc;font-weight:600;">${esc(row.label)}</td>`;
    for (let dayIdx = 0; dayIdx < weekDays.length; dayIdx++) {
      const day = weekDays[dayIdx];
      const ymd = format(day, 'yyyy-MM-dd');
      const dayData = dayMap.get(ymd);
      const menus = dayData?.menulines || [];
      let value = '—';
      if (row.key === 'starter') value = menus[0]?.starter?.title || '—';
      else if (row.key === 'dessert') value = menus[0]?.dessert?.title || '—';
      else {
        const index = Number(row.key.replace('menu-', '')) - 1;
        value = menus[index]?.mainCourse?.title || '—';
      }
      tableBody += `<td style="padding:8px;text-align:center;border:1px solid #e5e7eb;">${esc(value)}</td>`;
    }
    tableBody += '</tr>';
  }

  const hdr = weekDays
    .map((d, i) => {
      const label = weekdayLabels[i] || format(d, 'EEE', { locale: de });
      return `<th style="padding:8px;background:#fcfcfd;border:1px solid #e5e7eb;">${esc(label)}</th>`;
    })
    .join('');

  const title = `Speiseplan ${format(weekDays[0], 'dd.MM.yyyy')} – ${format(weekDays[weekDays.length - 1], 'dd.MM.yyyy')}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(title)}</title></head><body style="font-family:system-ui,sans-serif;">
  <h2 style="font-size:16px;">${esc(title)}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th style="width:120px;"></th>${hdr}</tr></thead>
  <tbody>${tableBody}</tbody></table></body></html>`;
}

export async function printOrShareSpeiseplan(data: DayMenulines[]): Promise<void> {
  const html = buildSpeiseplanHtml(data);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Speiseplan' });
  }
}
