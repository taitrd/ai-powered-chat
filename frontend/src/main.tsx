import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "./index.css";
import App from "./App";
import { makeStore } from "./stores";
import { loadPersistedState, startPersistence } from "./stores/persistence";

const store = makeStore(loadPersistedState());
startPersistence(store);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
);
