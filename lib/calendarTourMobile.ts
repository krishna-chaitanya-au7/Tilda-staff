/**
 * Kalender guided tour — same steps/copy as bissfest_tool calendarTour.ts (driver.js).
 * Mobile has no "Ganztag" tab; description text kept aligned with web.
 */

export type TourTarget = 'perspective' | 'add' | 'settings' | 'nav' | 'grid' | 'legend';

export type CalendarTourStep = {
  target: TourTarget;
  title: string;
  description: string;
};

export const STAGE_PADDING = 8;

export function buildCalendarTourSteps(includeSettingsStep: boolean): CalendarTourStep[] {
  const steps: CalendarTourStep[] = [
    {
      target: 'perspective',
      title: 'Perspektiven',
      description:
        'Wechsle zwischen verschiedenen Ansichten: Schule, Klassen, Ganztag, Lehrer, Kinder und Räume. Jede Perspektive zeigt die relevanten Termine.',
    },
    {
      target: 'add',
      title: 'Eintrag hinzufügen',
      description:
        'Erstelle neue Einträge wie Unterrichtsstunden, Termine, Kurse oder Krankmeldungen.',
    },
  ];

  if (includeSettingsStep) {
    steps.push({
      target: 'settings',
      title: 'Einstellungen',
      description:
        'Verwalte Schließtage/Ferien und definiere die Stundentafel mit Unterrichtszeiten und Pausen.',
    });
  }

  steps.push(
    {
      target: 'nav',
      title: 'Navigation',
      description:
        'Navigiere zwischen Wochen oder Monaten. Wechsle die Ansicht zwischen Wochen- und Monatsdarstellung.',
    },
    {
      target: 'grid',
      title: 'Kalender',
      description:
        'Hier siehst du alle Termine auf einen Blick. Klicke auf einen Eintrag, um Details anzuzeigen.',
    },
    {
      target: 'legend',
      title: 'Legende',
      description:
        'Die Farbcodes zeigen dir auf einen Blick, welcher Typ von Eintrag vorliegt: Unterricht, Termine, Kurse und mehr.',
    }
  );

  return steps;
}
