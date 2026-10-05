"""Photographic-entropy 9k JPEG, roughly 25 MB. Requires Pillow on development machine.
This generator may hold the full fixture in host RAM; the app does not use it.
"""
from PIL import Image, ImageDraw
from pathlib import Path
out = Path(__file__).resolve().parents[1] / 'fixtures'
out.mkdir(exist_ok=True)
image = Image.effect_noise((4500,4500),55).resize((9000,9000),Image.Resampling.BILINEAR).convert('RGB')
draw = ImageDraw.Draw(image)
for n in range(0,9000,512):
    draw.line([(n,0),(n,9000)], fill=(157,181,151), width=3)
    draw.line([(0,n),(9000,n)], fill=(157,181,151), width=3)
for progressive in [False, True]:
    target = out / f'map-9000-detail{"-progressive" if progressive else ""}.jpg'
    image.save(target, quality=82, progressive=progressive)
    print(f'{target.name}: {target.stat().st_size/1048576:.2f} MiB',flush=True)
image.close()
