import {
  CONTAINER_DISCARD_ROLES,
  HEADING_ROLES,
  INTERACTIVE_ROLES,
  LANDMARK_ROLES,
  MAX_NAME_LENGTH,
  MAX_VALUE_LENGTH,
  type ElementState,
  type ParsedElement,
} from '@aether/shared';
import type { RefRegistry } from './registry.js';

export interface RawAXValue {
  type: string;
  value?: unknown;
}

export interface RawAXProperty {
  name: string;
  value: RawAXValue;
}

export interface RawAXNode {
  nodeId: string;
  ignored?: boolean;
  role?: RawAXValue;
  name?: RawAXValue;
  value?: RawAXValue;
  properties?: RawAXProperty[];
  childIds?: string[];
  parentId?: string;
  backendDOMNodeId?: number;
}

export class AXExtractor {
  public static extractFrameElements(
    rawNodes: RawAXNode[],
    frameOrdinal: number,
    registry: RefRegistry,
  ): ParsedElement[] {
    const nodeMap = new Map<string, RawAXNode>();
    for (const node of rawNodes) {
      nodeMap.set(node.nodeId, node);
    }

    // Identify roots: nodes without parentId or whose parent is not in nodeMap
    const rootNodes: RawAXNode[] = [];
    for (const node of rawNodes) {
      if (!node.parentId || !nodeMap.has(node.parentId)) {
        rootNodes.push(node);
      }
    }

    // Track seen backendDOMNodeIds in this frame to prevent duplicates
    const seenNodeIds = new Set<number>();

    const processNode = (node: RawAXNode): ParsedElement[] => {
      const roleStr = String(node.role?.value || '').toLowerCase();
      const rawName = String(node.name?.value || '').trim();
      const rawValue = node.value?.value !== undefined ? String(node.value.value).trim() : undefined;

      // Extract states
      const states: ElementState[] = [];
      let level: number | undefined;

      if (node.properties) {
        for (const prop of node.properties) {
          const val = prop.value?.value;
          if (prop.name === 'level' && typeof val === 'number') {
            level = val;
          } else if (prop.name === 'focused' && (val === true || val === 'true')) {
            states.push('focused');
          } else if (prop.name === 'disabled' && (val === true || val === 'true')) {
            states.push('disabled');
          } else if (prop.name === 'checked' && (val === true || val === 'true' || val === 'mixed')) {
            states.push('checked');
          } else if (prop.name === 'expanded' && (val === true || val === 'true')) {
            states.push('expanded');
          } else if (prop.name === 'required' && (val === true || val === 'true')) {
            states.push('required');
          }
        }
      }

      // Process children recursively
      const childElements: ParsedElement[] = [];
      if (node.childIds && node.childIds.length > 0) {
        for (const cId of node.childIds) {
          const childNode = nodeMap.get(cId);
          if (childNode) {
            childElements.push(...processNode(childNode));
          }
        }
      }

      // Check if node is ignored
      if (node.ignored) {
        // Drop unless it has interactive descendants (keep children flattened)
        return childElements;
      }

      // Check if container discard role (generic, none, presentation)
      if (CONTAINER_DISCARD_ROLES.has(roleStr)) {
        return childElements;
      }

      // Check if role is kept: interactive roles, headings, landmarks
      const isInteractive = INTERACTIVE_ROLES.has(roleStr);
      const isHeading = HEADING_ROLES.has(roleStr);
      const isLandmark = LANDMARK_ROLES.has(roleStr);

      if (!isInteractive && !isHeading && !isLandmark) {
        // If not kept, flatten children
        return childElements;
      }

      // Must have backendDOMNodeId
      if (!node.backendDOMNodeId) {
        return childElements;
      }

      // Deduplicate backendDOMNodeId in this frame
      if (seenNodeIds.has(node.backendDOMNodeId)) {
        return childElements;
      }
      seenNodeIds.add(node.backendDOMNodeId);

      const ref = registry.getOrAssign(frameOrdinal, node.backendDOMNodeId);

      const name = rawName.length > MAX_NAME_LENGTH
        ? `${rawName.slice(0, MAX_NAME_LENGTH - 3)}...`
        : rawName;

      const value = rawValue && rawValue.length > MAX_VALUE_LENGTH
        ? `${rawValue.slice(0, MAX_VALUE_LENGTH - 3)}...`
        : rawValue;

      const element: ParsedElement = {
        ref,
        backendDOMNodeId: node.backendDOMNodeId,
        frameOrdinal,
        role: roleStr,
        name,
        value,
        level,
        states,
        children: childElements.length > 0 ? childElements : undefined,
      };

      return [element];
    };

    const result: ParsedElement[] = [];
    for (const root of rootNodes) {
      result.push(...processNode(root));
    }
    return result;
  }
}
