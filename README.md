# Simple Lecture — mobile app

The Expo (React Native) app for Simple Lecture: video lectures, notes, tests, forum, rewards, and the
live **AI Teacher / Ask AI** voice tutor.

This repository holds the mobile app only. It is a clean snapshot: the history of the old repo was
unrecoverably shallow (a grafted commit whose parent object no longer exists anywhere), so this starts
fresh at one commit instead of carrying a history that cannot be pushed.

## Running it

A plain Expo Go client is not enough — the app uses native modules (`expo-dev-client`, FCM, audio), so
it needs a **development build** installed on the device.

```bash
npm install
npx expo start --dev-client
```

`start.bat` does the same with the port cleared first; `run.bat` starts a tunnel for a device that is
not on the same network.

- Native `android/` and `ios/` folders are generated (`npx expo prebuild`) and intentionally not committed.
- Builds go through EAS; see `eas.json`.

## Layout

| Path | What is in it |
|---|---|
| `src/screens` | One file per screen (course, lecture player, tests, forum, profile…) |
| `src/components` | Shared UI; `components/askAssistant` and `components/aiteacher` are the AI tutor |
| `src/services` | Supabase access, payments, notifications, the live AI teacher client |
| `src/navigation` | Stack and tab navigators |
| `supabase-functions`, `supabase-migrations` | Copies of the backend pieces this app depends on |
| `store-assets` | Play Store screenshots and listing assets |

Tests are Jest: `npx jest`.

## Not in this repository, on purpose

The Android signing keystore (`android_keystore.jks`), `credentials.json` and the upload certificates
are ignored by `.gitignore` and must be kept outside git. Losing the signing key means losing the
ability to ship an update to an existing Play listing, so keep a backup of it somewhere safe.

`google-services.json` and `GoogleService-Info.plist` *are* committed: they ship inside the app binary
and are client configuration, not secrets.
