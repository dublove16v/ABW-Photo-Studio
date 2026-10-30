# Cutout worker

Separate process. Do not run this on Vercel or inside the web app.

## Where it runs

A small always-on Linux box. Recommended: Hetzner CX22 (2 vCPU, 4 GB) in Ashburn or Hillsboro, close to Cloudflare.

## Cost at about 450 photos a day

- Box: about $6 / month
- Cloudflare R2: originals plus listing WebP. About 4 MB kept per photo. 450/day is ~54 GB added per month.
  - Month 1 storage: about $1
  - Month 12 storage: about $10
  - No egress fee
- Total: about $15–25 / month after the library has been growing for a year. First months are closer to $8.

A GPU box is not required at this volume. BiRefNet on CPU is about 15–25 seconds a photo. 450 photos is 2–3 hours of CPU a day, which one CX22 handles with room to spare. Add a RunPod serverless GPU later only if edge quality needs it (about $30–50 more).

## Run

```
pip install pillow numpy opencv-python-headless rembg
python cutout_worker.py --app https://YOUR-APP --secret $WORKER_SECRET
```

It only claims photos whose hash is new. Re-runs happen when Review asks for one.
