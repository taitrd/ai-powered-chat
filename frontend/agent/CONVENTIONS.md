Please follow the project structure and codebase conventions for the frontend in `chat-app` with the following rules:

1. **Types**
   - Only create new types if they do not exist.
   - Group related types into files under the `src/types` directory.

2. **Significant Architectural Scaffold**
   - Any implementation involves a significant architectural scaffold spanning Types `->` Services `->` Store Actions (Redux) `->` Components `->` Pages across. We will see the layers in `IMPLEMENTATION.md`
   - Write all data logic in **services** only.
   - Group service calls in the `src/services/api/*/*.ts` directory and through http client layer.
   - Call server API exclusively from **store actions**.
   - Group related service functions inside `src/services`.
     - Create subfolders if multiple specific files are needed (e.g., `utils`, `types`).

3. **State Management**
   - Use **context** only for layout states.
     - Group context providers in the `src/providers` directory.
     - Place context definitions in the `src/contexts` directory.
   - Use **store states** for all feature and data logics and API handling.
     - Always include loading state on any action and each display data block.
       e.g: Loading `conversations` data should have `loadingConversations` state
     - Should use `useEffect` for client fetching initial data at once only.

     ```jsx
     // Good
     export default function AuthHydration() {
       const dispatch = useAppDispatch();

       useEffect(() => {
         dispatch(fetchProfileThunk());
       }, [dispatch]);

       return null;
     }
     ```

     - Avoid use `useEffect` to `setState` in components.

     ```jsx
     // Bad
     const [role, setRole] = useState < string > "User";
     const [loading, setLoading] = useState(false);
     useEffect(() => {
       if (user) {
         setRole(user.role);
       }
     }, [user]);
     ```

     **Note on State Management**: Do not use `useEffect` to set state (especially derived state or syncing store state to local state). Rely on store layer or derive state directly during render to prevent unnecessary re-renders and synchronization bugs.

4. **Code Organization**
   - Code-split shared components into `components/shared`.
   - Code-split skeleton components into `components/skeletons`.
   - Code-split features into folders.
   - Place small components in `components/features`.
   - In the `features` directory, create a dedicated folder for each page containing its components by following established and sample structure:

   Established feature structure:

   ```
   components/features/<resource>/
       shared/ (zod schemas, shared utilities)
       forms/ (react-hook-form implementations)
       dialogs/ (modal wrappers utilizing forms)
       <Resource>Table.tsx
       <Resource>Toolbar.tsx
   ```

   Example:

   ```
   src/
     components/
       shared/                         ← reusable
         SearchPagesDialog.tsx
       skeletons/
         Card.tsx
         LoadingIndicator.tsx
       features/
         conversations/
           shared/
             FindConversationsDialog.tsx     ← reusable
             useFindConversations.ts         ← reusable
             schemas.ts                ← hook forms zod schemas
           dialogs/
             ViewConversationDialog.tsx
           ConversationList.tsx
           ConversationToolbar.tsx
   ```

- Group related client-side utility functions in `src/components/features/conversations/utils` (e.g., data formatting).
- Avoid duplicated types or functions; keep code clean and concise.

5. **UI & Styling**
   - Implement a **toolbar** with full applied shared UI components, depending on features:
     - Search input
     - Date filter button with multiple options (popup)
     - Bulk action button with popup for multiple selection and selected badge
     - Advanced filter button with popup
   - Pay attention to theme details such as font size, colors, and font style.
   - Design a **responsive interface** for both mobile and desktop using TailwindCSS.
     - Avoid scripts that cause unnecessary re-renders for best performance.
   - Use the **shadcn library** with theme's CSS variables for any components.
     - Use theme's class names (e.g, `bg-background`, `text-foreground`, `bg-secondary`, `text-secondary-foreground`)
     - Do not use hardcoded color class names (e.g., `bg-blue-500`, `text-blue-500`).
     - Use theme's class names for contrast (e.g `bg-destructive/10`, `text-destructive`)

6. **Error Handling**
   - Parse `error` when call an failed api call and show messages on alert component

7. **Form**

- Form validation should be applied on any form data with `@hookform zod schemas`.
- Declare regex patterns in shared `/lib/config/form.ts`

8. **Visibilities**

- Always use `formatDate` from a shared `utils` for formatting date fields.

9. **Environment variables**

- Declare configuration constants for environment variables in `lib/config/*.ts` by feature

Example contact configurations:

```ts
// lib/config/contact.ts
export const contactEmail =
  process.env.VITE_CONTACT_EMAIL || "support@chat.app";
```
