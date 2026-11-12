# Upload interface

The upload card was redesigned from the user's visual reference to [BeUI File Upload by Saurabh](https://21st.dev/@starc007/components/be-ui-file-upload). This repository contains an independently authored Svelte/CSS implementation; it does not embed the React component, its demonstration timers, or additional dependencies.

## Content

Use short, factual Traditional Chinese. Every message must explain an action, state, limit or consequence. Omit slogans, decorative English and repeated instructions.

## Interaction

- One compact drop zone presents file selection and limits directly. There is no layout switch, hero, brand navigation or feature promotion. Brand details, source and theme preference are confined to the footer.
- New uploads default to public, 24-hour sharing. Visibility is an independent control: public files appear in the functional list below the uploader; unlisted files require a share link. No invitation code is required. Existing files are not automatically listed.
- Every file row represents a real user selection or upload attempt. Empty state includes no simulated example uploads.
- Preparing, uploading, server confirmation, success and error states come from the actual API/XHR lifecycle. The progress bar reaches 100% only after the server confirms storage.
- Retry requires a fresh Turnstile challenge; cancellation also aborts an in-flight reservation request. The backend retains its existing stale-reservation cleanup guarantees.
- Recent successful/failed attempts remain in memory while the page stays open (up to four previous entries plus the current file). Successful entries can reopen their share/management links. Reloading clears this local history; capabilities are not persisted in localStorage.
- Removing a row only removes that browser record. Cloud deletion remains available through the separately authenticated private management link.
- Dark is the initial theme. A saved light-mode preference is respected. Mobile layouts, reduced motion, named controls and semantic progress elements are supported.

The D1/R2 lifecycle, storage limits, one-time claims and private management capabilities are unchanged by the redesign.
