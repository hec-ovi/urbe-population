/** JSON presentation tree. Data and actions are supplied by the host adapter. */
export interface ElementSpec {
  tag: keyof HTMLElementTagNameMap;
  className?: string;
  text?: string;
  attrs?: Record<string, string | number>;
  children?: ElementSpec[];
  each?: string;
  when?: string;
  action?: string;
  event?: 'click' | 'input';
}

export type ViewData = Record<string, unknown>;
export type ViewActions = Record<string, (event: Event, data: ViewData) => void>;
