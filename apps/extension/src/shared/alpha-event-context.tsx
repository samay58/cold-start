import { createContext, useCallback, useContext, type ReactNode } from "react";
import type { AlphaEventName, AlphaEventPropertiesByName, AlphaSurface } from "@cold-start/core";
import { enqueueAlphaEvent } from "./alpha-analytics";
import type { Settings } from "./extension-config";

const AlphaAnalyticsContext = createContext<Settings | undefined>(undefined);

export function AlphaAnalyticsProvider({
  children,
  settings
}: {
  children: ReactNode;
  settings: Settings | undefined;
}) {
  return <AlphaAnalyticsContext.Provider value={settings}>{children}</AlphaAnalyticsContext.Provider>;
}

// Call sites still own event timing; the provider only removes settings prop-drilling.
export function useAlphaEvent() {
  const settings = useContext(AlphaAnalyticsContext);
  return useCallback(
    <Name extends AlphaEventName>(
      eventName: Name,
      properties: AlphaEventPropertiesByName[Name],
      surface?: AlphaSurface,
      interactionId?: string
    ) => {
      if (!settings) {
        return;
      }
      if (interactionId !== undefined) {
        void enqueueAlphaEvent(settings, eventName, properties, surface, interactionId);
      } else if (surface !== undefined) {
        void enqueueAlphaEvent(settings, eventName, properties, surface);
      } else {
        void enqueueAlphaEvent(settings, eventName, properties);
      }
    },
    [settings]
  );
}
