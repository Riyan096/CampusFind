export interface LeafletMapLike {
  setView(center: [number, number], zoom: number, options?: { animate?: boolean }): LeafletMapLike;
  remove(): void;
  on(event: string, handler: (event?: unknown) => void): LeafletMapLike;
}

export interface LeafletMarkerLike {
  addTo(map: LeafletMapLike): LeafletMarkerLike;
  on(event: 'click', handler: (event: { originalEvent: Event }) => void): LeafletMarkerLike;
}

export interface LeafletNamespace {
  map(container: HTMLElement, options?: Record<string, boolean>): LeafletMapLike;
  tileLayer(url: string, options: { attribution: string }): { addTo(map: LeafletMapLike): unknown };
  divIcon(options: {
    className: string;
    html: string;
    iconSize: [number, number];
    iconAnchor: [number, number];
  }): unknown;
  marker(coords: [number, number], options: { icon: unknown }): LeafletMarkerLike;
  DomEvent: { stopPropagation(event: Event): void };
}

declare global {
  interface Window {
    L?: LeafletNamespace;
  }
}

export {};
