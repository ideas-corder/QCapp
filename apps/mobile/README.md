# qc_inspector

Flutter mobile app for QC Inspector.

## Pointing the app at your backend

There is **no hardcoded default** — the APK ships without any preset server
address, because it's intended to run on real phones (not just the emulator).
On first launch you'll see a **Server URL** setup screen before login is even
shown.

You have three ways to configure the URL, in priority order:

1. **At runtime, on the device** — first launch shows a "Server URL" card.
   Enter the address, tap **Continue** and you're in. To change later, tap
   the 🗄 icon (top-right of the login screen) → enter the new URL → **Save &
   retry**. The setting persists in `SharedPreferences`. **Reset** on that
   sheet (or uninstall/reinstall) puts the setup screen back.
2. **At build time** — pass `--dart-define=API_URL=...` to `flutter build`:
   ```bash
   flutter build apk --release --dart-define=API_URL=http://192.168.1.10:3002
   ```
   The compile-time value is pre-filled on the setup screen and stored
   automatically on first save. Use this when shipping to a known endpoint.
3. **(Removed)** — there is no emulator default. `http://10.0.2.2:3002` is
   no longer baked into the app.

### Picking the right URL

The phone must be able to reach the URL you enter. Pick whichever fits:

| Source | Example |
| --- | --- |
| PC on the same Wi-Fi as the phone | `http://192.168.1.10:3002` |
| ngrok tunnel | `https://abc.ngrok.app` (no port needed) |
| Deployed server | `https://qc.example.com` |

The API must allow inbound on port 3002 and Windows Firewall must let it
through (or you can disable the firewall temporarily to test).

## Build

```bash
flutter build apk --release
# APK lands at build/app/outputs/flutter-apk/app-release.apk
```

```bash
# With a baked-in URL so the setup screen pre-fills:
flutter build apk --release --dart-define=API_URL=http://192.168.1.10:3002
```

## Install

```bash
adb install -r build/app/outputs/flutter-apk/app-release.apk
```
