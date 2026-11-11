# Todo frontend

The frontend uses Create React App through `react-scripts`.

## Development

```powershell
npm install
npm start
```

The development server listens on port 3001 and proxies API and upload requests to the backend on port 3000.

## Production build

```powershell
npm run build
```

Set `REACT_APP_API_URL` at build time to override the default `/api` endpoint.
