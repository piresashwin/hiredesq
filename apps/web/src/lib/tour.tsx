"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Joyride,
  ACTIONS,
  EVENTS,
  STATUS,
  type EventData,
  type Options,
  type Step,
} from "react-joyride";
import type { TourScreen } from "@hiredesq/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TOURS } from "@/lib/tours";
import { TourTooltip } from "@/components/shell/TourTooltip";

// Guided-tour runtime. One controlled <Joyride> lives here; the per-screen help
// icon (TourButton) calls startTour(screen) to run it. Completion is synced to
// the account via the same PATCH /auth/profile path as the theme preference, so
// the "unseen" dot on the icon follows the user across devices.

interface TourContextValue {
  /** Run the tour for a given screen from the top. */
  startTour: (screen: TourScreen) => void;
  /** Whether the user has already finished/dismissed this screen's tour. */
  hasSeen: (screen: TourScreen) => boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

// react-joyride options mapped to our design tokens (theme-aware via the CSS
// vars). zIndex sits above the top bar (z-30) and bottom tabs (z-40). skipBeacon
// jumps straight to the tooltip (no click-the-dot step), and `buttons` keeps the
// skip control live for our custom tooltip.
const tourOptions: Partial<Options> = {
  zIndex: 10_000,
  primaryColor: "rgb(var(--color-brand))",
  backgroundColor: "rgb(var(--color-surface))",
  arrowColor: "rgb(var(--color-surface))",
  textColor: "rgb(var(--color-ink))",
  overlayColor: "rgb(var(--color-ink) / 0.45)",
  spotlightRadius: 10,
  skipBeacon: true,
  buttons: ["back", "primary", "skip"],
};

export function TourProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useAuth();
  const [screen, setScreen] = useState<TourScreen | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [run, setRun] = useState(false);

  const steps: Step[] = screen ? TOURS[screen] : [];

  const startTour = useCallback((next: TourScreen) => {
    setScreen(next);
    setStepIndex(0);
    setRun(true);
  }, []);

  const hasSeen = useCallback(
    (s: TourScreen) => Boolean(user?.tourProgress?.[s]),
    [user?.tourProgress],
  );

  // Persist "seen" for a screen — optimistic local update, then sync to the
  // account (merged server-side). Non-fatal on failure: the local flag sticks
  // for the session and we never block the user on it.
  const markSeen = useCallback(
    (s: TourScreen) => {
      if (!user || user.tourProgress?.[s]) return;
      updateUser({ ...user, tourProgress: { ...user.tourProgress, [s]: true } });
      void api
        .updateProfile({ tourProgress: { [s]: true } })
        .then(updateUser)
        .catch(() => {
          /* keep the optimistic flag; the user can replay anytime */
        });
    },
    [user, updateUser],
  );

  const endTour = useCallback(
    (markCurrentSeen: boolean) => {
      if (markCurrentSeen && screen) markSeen(screen);
      setRun(false);
      setStepIndex(0);
      setScreen(null);
    },
    [screen, markSeen],
  );

  // react-joyride v3 controlled mode: we own stepIndex and advance it from events.
  const handleEvent = useCallback(
    (data: EventData) => {
      const { action, index, status, type } = data;

      // Finished the last step or hit Skip → done, count it as seen.
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        endTour(true);
        return;
      }

      // Closing (X / Esc) also ends the tour and counts as seen.
      if (action === ACTIONS.CLOSE && type === EVENTS.STEP_AFTER) {
        endTour(true);
        return;
      }

      // Advance / go back between steps.
      if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
        setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
      }
    },
    [endTour],
  );

  const value = useMemo<TourContextValue>(() => ({ startTour, hasSeen }), [startTour, hasSeen]);

  return (
    <TourContext.Provider value={value}>
      {children}
      <Joyride
        steps={steps}
        run={run}
        stepIndex={stepIndex}
        continuous
        scrollToFirstStep
        onEvent={handleEvent}
        tooltipComponent={TourTooltip}
        options={tourOptions}
      />
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}
