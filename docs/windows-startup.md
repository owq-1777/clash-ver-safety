# Windows startup investigation

The reported Windows x64 installation opens a window with a warning icon and no usable interface. The exact installer build and Windows WebView2 error are not yet known.

## Confirmed frontend defect

The loading overlay was removed only after the layout mounted. A module-loading exception prevented the application from mounting, while a React startup exception could render its error fallback underneath the overlay.

A production frontend probe with unavailable Tauri window metadata reproduced a module exception, an empty root, and a loading overlay that remained visible. This is a reproduction of the hidden-error defect, not proof that missing metadata caused the reported Windows failure.

The entry point now catches module-loading errors and displays their text, and the React error boundary hides the loading overlay when it catches an error. Error text is assigned with `textContent`.

## Remaining diagnosis

- With a stubbed backend and the current CSP, the production frontend rendered its main interface in Chromium. This does not validate Windows WebView2 or the installed application.
- The existing Linux release started its window and core using temporary application data; its native logs did not identify the Windows failure.
- If WebView2 fails before loading the entry page, JavaScript diagnostics cannot run. The installed build, window appearance, and native log are needed to distinguish that case.

The Windows installation failure remains unresolved until its actual runtime error is identified and an updated installer is verified on Windows.
