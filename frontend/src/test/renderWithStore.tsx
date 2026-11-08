import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore, type AppStore, type RootState } from "../stores";

interface Options extends Omit<RenderOptions, "wrapper"> {
  preloadedState?: Partial<RootState>;
  store?: AppStore;
}

/** Renders a component inside a fresh Redux store, and returns the store for assertions. */
export function renderWithStore(
  ui: ReactElement,
  { preloadedState, store = makeStore(preloadedState), ...options }: Options = {}
) {
  return {
    store,
    ...render(ui, {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
      ...options,
    }),
  };
}
