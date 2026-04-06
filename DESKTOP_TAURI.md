# Desktop App (Tauri)

This branch contains a Tauri desktop wrapper for the existing Vite app.

## Run desktop in development

```bash
npm install
npm run desktop:dev
```

## Build desktop installer

```bash
npm run desktop:build
```

Build artifacts are generated under `src-tauri/target/release/bundle/`.

## Notes

- This branch is isolated from `main` for safe Coolify deployments.
- Web backend/API remains unchanged; desktop app uses the same hosted API.
