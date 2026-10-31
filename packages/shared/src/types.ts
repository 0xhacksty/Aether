export type ElementState = 'checked' | 'disabled' | 'expanded' | 'focused' | 'required';

export interface ParsedElement {
  ref: string;
  backendDOMNodeId: number;
  frameOrdinal: number;
  role: string;
  name: string;
  value?: string;
  level?: number;
  states: ElementState[];
  children?: ParsedElement[];
}

export interface FrameInfo {
  frameId: string;
  parentId?: string;
  ordinal: number;
  url: string;
  sessionId?: string;
}

export interface OutlineSnapshot {
  url: string;
  title: string;
  framesCount: number;
  elements: ParsedElement[];
  elementCount: number;
  formattedText: string;
  tokenEstimate: number;
  truncated: boolean;
}

export interface DeltaItem {
  type: 'added' | 'changed' | 'removed';
  ref: string;
  element?: ParsedElement;
}

export interface Delta {
  step: number;
  status: 'ok' | 'error';
  urlChanged: boolean;
  url?: string;
  focusRef?: string;
  added: ParsedElement[];
  changed: ParsedElement[];
  removed: string[];
  formattedText: string;
  tokenEstimate: number;
}

export type ActionOp = 'click' | 'type' | 'key' | 'select' | 'scroll' | 'hover';
export type ActionRisk = 'read' | 'reversible' | 'irreversible';

export interface ActionItem {
  ref: string;
  op: ActionOp;
  value?: string;
}

export interface ActParams {
  actions: ActionItem[];
  risk: ActionRisk;
  why: string;
}
