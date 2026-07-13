// Minimal declaration of the Firefox-only global the spike touches. Only exists
// on Firefox; every use sits behind a `!("sidePanel" in chrome)` or
// `typeof browser === "undefined"` gate. Phase 1 replaces this with the fuller
// sidebarAction declaration called for in the port plan.
declare const browser: {
  sidebarAction: {
    open(): Promise<void>;
    toggle(): Promise<void>;
  };
};
