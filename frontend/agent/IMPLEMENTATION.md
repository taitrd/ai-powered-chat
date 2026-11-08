# Implement Features from API Resources

This plan details the implementation of pages and associated logic within the `chat-app`

## Overview

> The implementation involves a significant architectural scaffold spanning Types `->` Services `->` Store Actions (Redux) `->` Components `->` Pages across.

> We should overwrite the Redux Thunks implementations directly but keep anothers in slices if not implement yet.

## Proposed Changes

We will implement the following layers for any API resource.

---

### Types Layer (`src/types`)

Update or create TypeScript interfaces consistent with the request body, response body schemas.

Avoid duplication types

In form validation, follow request bodies to build valdation schemas.

---

### Services Layer (`src/services`)

Create API client service classes/functions using the base URL with prefix `/api` by constant.

---

### Store Actions Layer (`stores/features/[resource]`)

Expose API functions that consume `src/services` to be securely called by the client's Redux actions.

Get user info from authentication for payloads that need user id.

On existings actions, We should update payloads if form data and API request body are different.

On new actions, We should have consistent payload with API request body.

---

### State Management (Redux) (`stores/features`)

Build out standard CRUD Redux slices and asynchronous thunks to handle side-effects via Store Actions.

Handle forms, modals/dialogs, filters, loading, etc states in slice of that resource.

---

### Page Components (`components/features/`)

Under `CONVENTIONS.md`, pages should be cleanly split into the `components/features/` directory. see the sample and follow the structure.

## Verification Plan

### Automated Tests

- Run linting and TypeScript compilation checks: `npm run lint` and `npm run build`.
