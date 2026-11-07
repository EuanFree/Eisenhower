# Eisenhower Portfolio Manager — Vendored Web Fonts

This directory contains locally vendored web fonts for air-gapped deployment.

## Font Files Required

Place the following `.woff2` font files in their respective subdirectories:

### JetBrains Mono (Monospace)

Download from: https://github.com/JetBrains/JetBrainsMono/releases

```
frontend/public/fonts/JetBrainsMono/
├── JetBrainsMono-Regular.woff2
├── JetBrainsMono-Medium.woff2
├── JetBrainsMono-Bold.woff2
└── JetBrainsMono-Italic.woff2
```

### Inter (Sans-Serif)

Download from: https://github.com/rsms/inter/releases

```
frontend/public/fonts/Inter/
├── Inter-Regular.woff2
├── Inter-Medium.woff2
├── Inter-SemiBold.woff2
└── Inter-Bold.woff2
```

## Automatic Download

Run `python -m scripts.build_offline_bundle` on a connected build host to
automatically download and place all font files in the correct directories.

## License

Both fonts are released under the SIL Open Font License 1.1 (OFL-1.1).
