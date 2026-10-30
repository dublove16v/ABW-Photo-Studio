# ABW Photo Studio

Vehicle photo pipeline for A Better Way Wholesale Autos. Capture, cutout, review, and deliver listing photos.

## Deploy

GitHub repo, then Vercel.

1. Push this folder to a GitHub repo (for example `dublove16v/ABW-Photo-Studio`).
2. In Vercel, import the repo. Framework preset is handled by `vercel.json` and the Nitro Vercel preset.
3. Add environment variables if you use R2:

```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_URL
WORKER_SECRET
```

Without R2, photos land on the local disk of the container (not durable). Use R2 for production.

## Cutout worker

The web app does not run rembg. A separate worker polls `/api/studio/jobs` and writes results back. Run it on a machine with Python and rembg:

```
python worker/cutout_worker.py --app https://your-app.vercel.app --secret $WORKER_SECRET
```

## Suite links

The top bar links to the other ABW apps. Edit `SUITE` in `src/components/shell.tsx` when the real Vercel URLs are known.
