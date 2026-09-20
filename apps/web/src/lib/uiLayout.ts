/**
 * UI layout options for the New Inspection form.
 *
 *  - 'modern'  : wide layout, sticky neutral sidebar with always-expanded
 *                step cards and a floating submit bar at the bottom.
 *  - 'classic' : wide layout, green sticky progress sidebar with
 *                collapsible step cards and a floating green submit bar.
 *
 * Kept in sync with `UiLayout` in
 * `apps/api/src/database/entities/user.entity.ts`. The web side never
 * imports the API entity directly — we re-declare the union here so the
 * boundary stays explicit.
 */
export type UiLayout = 'modern' | 'classic';

export const UI_LAYOUTS: ReadonlyArray<{
  id: UiLayout;
  label: string;
  blurb: string;
}> = [
  {
    id: 'modern',
    label: 'Modern',
    blurb: 'Sticky neutral sidebar · always-expanded cards · floating submit',
  },
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'Sticky green sidebar · collapsible cards · floating green submit',
  },
];

export function isUiLayout(v: unknown): v is UiLayout {
  return v === 'modern' || v === 'classic';
}
