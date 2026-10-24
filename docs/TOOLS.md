# Ecdys built-in tools

These tools use the existing desktop process and private browser connection. They require no extension installation or third-party service.

## Recovery Rehearsal

Select a profile and choose **Check recovery** beside a snapshot. Ecdys authenticates the encrypted configuration, validates it, and, when present, decrypts/decompresses and validates the browser archive in its existing bounded worker. It creates no staging directory and extracts no files to disk. One rehearsal runs at a time; Lock stops it.

The report distinguishes **Configuration only · no browser files** from **Configuration + browser state**. File, directory and byte counts come from the authenticated decoded contents. It identifies the checked snapshot, time and recorded browser version, without exposing contents or filenames. A failed check clears the previous successful report. Switching profiles or locking dismisses results.

This verifies readable saved contents. It does not establish successful browser startup, browser/OS compatibility, usable OS-protected cookies, routing or the health of current working files. Keep the complete workspace backup; a successful check is not an independent backup.

## Page archive (.mhtml)

Open **Page archive (.mhtml)** in profile details. An active managed session is required. Choose one of its HTTP/HTTPS pages and **Save archive…** to select a new `.mhtml` file through the native Save dialog. Current production launches remain blocked pending verified OS routing, so normal app capture remains unavailable. Local test supervisors exercise the capture engine; they do not enable app launches.

Chromium serializes the loaded page and available resources as a single MHTML document. This is similar in purpose to SingleFile but uses MHTML rather than SingleFile's HTML format. Capture does not navigate to a new URL or expose arbitrary DevTools commands. Browser storage/cookies are not exported as a session backup. Scripts, live media, remote resources and unsaved form state may not be preserved.

Exports contain unencrypted page content, URLs and loaded resources. Ecdys never opens or executes the archive in its renderer. The page picker shows titles and origins; URL paths, queries, fragments and credentials are not included in its metadata. Review the exported file before sharing it. Maximum archive size is 4 MiB. A SHA-256 digest is displayed after saving; it is an integrity reference, not proof of authorship or capture time.

The renderer cannot choose a filesystem path. Export uses a native chooser, private file permissions where supported and exclusive creation; existing files are preserved. Session identity is checked before/after capture and saving. A changed/closed session rejects the result. Oversized DevTools responses are drained within the existing frame limit without closing the browser connection.

Real local Chromium capture verifies rendered text, CSS and image resources. This executor's enterprise policy blocks `file://` navigation, so the separate offline-reopen assertion is skipped here. Cross-platform and broader website fidelity remain unverified.
