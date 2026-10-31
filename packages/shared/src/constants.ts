export const MAX_ELEMENTS_PER_SNAPSHOT = 150;
export const SIBLING_COLLAPSE_THRESHOLD = 6;
export const SIBLING_COLLAPSE_KEEP = 3;
export const MAX_NAME_LENGTH = 80;
export const MAX_VALUE_LENGTH = 60;
export const DEFAULT_CDP_TIMEOUT_MS = 10000;

export const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'option',
  'slider',
  'spinbutton',
]);

export const LANDMARK_ROLES = new Set([
  'banner',
  'navigation',
  'main',
  'search',
  'form',
  'dialog',
]);

export const HEADING_ROLES = new Set([
  'heading',
]);

export const CONTAINER_DISCARD_ROLES = new Set([
  'generic',
  'none',
  'presentation',
]);
