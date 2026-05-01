# qr-manager-ui

Admin UI for `qr-manager-api`. Create, list, edit, deactivate QR code records and download QR images.

## API Dependencies

| API | Config key | Operations |
|-----|------------|------------|
| `qr-manager-api` | `apiBaseURL` (runtime config) | Full CRUD on `/qr-codes`, image download |

## Runtime Config

Loaded from `/config.json` before React bundle runs. In production: k8s ConfigMap.

| Key | Description |
|-----|-------------|
| `apiBaseURL` | Base URL of `qr-manager-api` |
