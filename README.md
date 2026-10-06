# CampusMate AI — Fixed React Project

This version keeps the existing UI and application behavior and fixes the Tailwind/PostCSS startup error.

## Clean install on Windows

If you previously ran `npm install` in this folder, remove the old dependencies first:

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install
npm run dev
```

The project is pinned to **Tailwind CSS 3.4.17**, which matches the existing PostCSS configuration and the `@tailwind` / `@apply` directives used by the project.

If you want to preserve the supplied lockfile instead, you can simply run:

```powershell
npm ci
npm run dev
```

Do not install `tailwindcss` v4 for this project unless the PostCSS configuration and CSS are intentionally migrated to Tailwind v4.
