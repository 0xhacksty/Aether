export interface RefMapping {
  ref: string;
  frameOrdinal: number;
  backendDOMNodeId: number;
}

export class RefRegistry {
  private counter = 1;
  private keyToRef = new Map<string, string>();
  private refToMapping = new Map<string, RefMapping>();

  private makeKey(frameOrdinal: number, backendDOMNodeId: number): string {
    return `${frameOrdinal}:${backendDOMNodeId}`;
  }

  public getOrAssign(frameOrdinal: number, backendDOMNodeId: number): string {
    const key = this.makeKey(frameOrdinal, backendDOMNodeId);
    let ref = this.keyToRef.get(key);
    if (!ref) {
      ref = `e${this.counter++}`;
      this.keyToRef.set(key, ref);
      this.refToMapping.set(ref, {
        ref,
        frameOrdinal,
        backendDOMNodeId,
      });
    }
    return ref;
  }

  public getExisting(frameOrdinal: number, backendDOMNodeId: number): string | undefined {
    return this.keyToRef.get(this.makeKey(frameOrdinal, backendDOMNodeId));
  }

  public resolve(ref: string): RefMapping | undefined {
    return this.refToMapping.get(ref);
  }

  /**
   * Clears the current mapping on page navigation, but preserves the monotonic counter.
   * This guarantees that new elements after navigation get new unique IDs and stale refs fail loudly.
   */
  public resetMappings(): void {
    this.keyToRef.clear();
    this.refToMapping.clear();
  }

  /**
   * Full reset (e.g. for a brand new tab)
   */
  public clearAll(): void {
    this.counter = 1;
    this.resetMappings();
  }
}
