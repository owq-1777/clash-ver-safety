# Windows startup investigation

The reported Windows x64 installation opens a window with a warning icon and no usable interface. The exact installer build and Windows WebView2 error are not yet known.

## Confirmed frontend defect

Tauri's packaged HTML processing adds a nonce to every static style element and appends that nonce to `style-src`. Browsers ignore `'unsafe-inline'` when that directive also contains a nonce. The application creates Emotion/MUI and theme style elements at runtime without that nonce, so the packaged policy blocks their styles.

A Chromium production frontend probe using the policy after Tauri's transformation reproduced CSP violations and an Emotion style element without an active stylesheet. The earlier probe using the raw configuration did not cover this transformation. Automatic CSP modification is now disabled for `style-src` only, so its configured `'self' 'unsafe-inline'` policy remains effective for runtime styles. Script CSP modification remains enabled.

The corrected probe produced no CSP violations, with 7 theme rules and 366 Emotion rules active. `cargo check -p clash-verge --lib --locked` passed with the corrected configuration. This correction is released as v2.5.9; v2.5.8 contains only the hidden-error correction.

The loading overlay was removed only after the layout mounted. A module-loading exception prevented the application from mounting, while a React startup exception could render its error fallback underneath the overlay.

A production frontend probe with unavailable Tauri window metadata reproduced a module exception, an empty root, and a loading overlay that remained visible. This is a reproduction of the hidden-error defect, not proof that missing metadata caused the reported Windows failure.

The entry point now catches module-loading errors and displays their text, and the React error boundary hides the loading overlay when it catches an error. Error text is assigned with `textContent`.

## Remaining diagnosis

- With a stubbed backend and the raw CSP, the production frontend rendered its main interface in Chromium. This did not validate the packaged policy or Windows WebView2.
- The existing Linux release started its window and core using temporary application data; its native logs did not identify the Windows failure.
- No Windows runtime diagnostics were supplied. Whether native log files exist is unknown; the earlier response did not establish their absence.

The packaged style-policy conflict and hidden-error defect are reproduced and corrected. Their relationship to the user's exact Windows screen has not been verified on Windows.
