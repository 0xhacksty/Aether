import {
  SIBLING_COLLAPSE_KEEP,
  SIBLING_COLLAPSE_THRESHOLD,
  type ParsedElement,
} from '@aether/shared';

export interface CollapsedMarker {
  isCollapsedMarker: true;
  role: string;
  count: number;
}

export type OutlineNode = ParsedElement | CollapsedMarker;

export function isCollapsedMarker(node: OutlineNode): node is CollapsedMarker {
  return (node as CollapsedMarker).isCollapsedMarker === true;
}

export class SiblingCollapser {
  public static collapseSiblings(elements: ParsedElement[]): OutlineNode[] {
    const output: OutlineNode[] = [];
    let i = 0;

    while (i < elements.length) {
      const current = elements[i];
      if (!current) break;

      // Find consecutive run of same role
      let j = i + 1;
      while (j < elements.length && elements[j]?.role === current.role) {
        j++;
      }

      const runLength = j - i;
      if (runLength >= SIBLING_COLLAPSE_THRESHOLD) {
        // Keep first 3
        for (let k = 0; k < SIBLING_COLLAPSE_KEEP; k++) {
          const el = elements[i + k];
          if (el) {
            output.push(SiblingCollapser.collapseElementTree(el));
          }
        }

        // Add collapse marker for the rest
        const remaining = runLength - SIBLING_COLLAPSE_KEEP;
        output.push({
          isCollapsedMarker: true,
          role: current.role,
          count: remaining,
        });
      } else {
        // Keep all in this run
        for (let k = i; k < j; k++) {
          const el = elements[k];
          if (el) {
            output.push(SiblingCollapser.collapseElementTree(el));
          }
        }
      }

      i = j;
    }

    return output;
  }

  private static collapseElementTree(element: ParsedElement): ParsedElement {
    if (!element.children || element.children.length === 0) {
      return element;
    }

    // Recursively collapse children
    const collapsedChildrenNodes = SiblingCollapser.collapseSiblings(element.children);
    // Filter back into ParsedElement (or keep markers if handled by serializer)
    const processedChildren: ParsedElement[] = [];

    for (const node of collapsedChildrenNodes) {
      if (isCollapsedMarker(node)) {
        processedChildren.push({
          ref: '',
          backendDOMNodeId: -1,
          frameOrdinal: element.frameOrdinal,
          role: 'collapsed_marker',
          name: `... ${node.count} more similar ${node.role}s (use find or read)`,
          states: [],
        });
      } else {
        processedChildren.push(node);
      }
    }

    return {
      ...element,
      children: processedChildren,
    };
  }
}
