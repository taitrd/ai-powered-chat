# Frontend

React app for the chat UI, built with TypeScript, Vite, Tailwind CSS and Redux Toolkit. It streams AI replies from the backend over SSE and caches conversations in the browser.

## Agent and contributor docs

Read these before changing frontend code:

| Document                                             | What it covers                                                                         |
| :--------------------------------------------------- | :------------------------------------------------------------------------------------- |
| [`agent/CONVENTIONS.md`](agent/CONVENTIONS.md)       | Layer rules, state management, code organization, UI and styling, errors, forms        |
| [`agent/IMPLEMENTATION.md`](agent/IMPLEMENTATION.md) | Step-by-step guide for adding a feature: Types → Services → Store (Redux) → Components |

Project-wide docs: [architecture](../docs/architecture.md), [local setup](../docs/local-setup.md), [design decisions](../docs/design-decisions.md) and the [plan](../PLAN.md).

## Commands

```bash
npm install
npm run dev     # http://localhost:5173, proxies /api to http://localhost:8000
npm test        # Vitest and React Testing Library
npm run build   # Type-check and production build
```

You can also run it with Docker from the repository root: `docker compose up -d web`. The backend must be running for real data; `make up-core` starts it.

The container keeps `node_modules` in its own volume. After `package.json` changes, rebuild with `docker compose up -d --build --renew-anon-volumes web`.

## Services (HTTP client and API modules)

```text
src/lib/config/api.ts        apiBaseUrl (VITE_API_BASE_URL, default /api/v1)
src/services/
  http/client.ts             HTTP client layer: base URL, auth headers, ApiError, http.get/post/patch/delete
  api/
    conversations/conversationsApi.ts   list, create, rename, delete
    messages/messagesApi.ts             list messages, streamChat (SSE)
    models/modelsApi.ts                 active AI providers
```

- Every backend call goes through `http/client.ts`. API modules never call `fetch` directly.
- Failed calls throw `ApiError` with the backend's `detail` message, so toasts show the real reason, such as "Daily user limit reached".
- Add one folder per resource under `services/api/<resource>/`, and call its functions only from thunks.

## State management (Redux Toolkit)

```text
src/stores/
  index.ts          makeStore(), RootState, AppDispatch, AppThunk
  hooks.ts          useAppDispatch, useAppSelector, createAppAsyncThunk
  persistence.ts    Browser cache (conversations, messages, selected model)
  features/
    auth/           authSlice.ts, authThunks.ts
    conversations/  conversationsSlice.ts, conversationsThunks.ts
    chat/           chatSlice.ts, chatThunks.ts (streaming)
    ui/             uiSlice.ts, uiThunks.ts (toasts, models)
```

- Components read state with `useAppSelector` and change it only by dispatching actions or thunks.
- Only thunks call the API modules in `src/services/api/`.
- Each data block has its own loading flag, such as `loadingConversations`, `loadingMessages` or `loadingModels`.
- State stays serializable:
  - The stream's `AbortController` lives in `chatThunks.ts`.
  - Toast retries are stored as data (`retryMessage`), not functions.
- Tests create a fresh store with `makeStore()` and render with `renderWithStore()` from `src/test/`.

## Where the code differs from `agent/CONVENTIONS.md`

The conventions describe the target structure. The current code doesn't fully match it yet:

- **Framework:** the app uses Vite, so read environment variables through `import.meta.env.VITE_*`, as in `src/lib/config/api.ts`. The `process.env.VITE_*` example in the conventions doesn't work in Vite browser code.
- **Lint script:** there's no `npm run lint` yet. Verification is `npm run build` (type-check) and `npm test`.
- **Not adopted yet:** shadcn/ui, theme color tokens, react-hook-form with zod, the `src/types/` folder and the `components/features/` structure. Moving to them is follow-up work.
