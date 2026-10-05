"""Bounded-memory test maps. PNG needs only stdlib; optional Pillow makes JPEG/WebP.
Run: npm run fixtures -- --sizes 1000 4000 9000 15000
JPEG: python3 -m venv /tmp/map-fixtures; /tmp/map-fixtures/bin/pip install Pillow
      /tmp/map-fixtures/bin/python scripts/generate-fixtures.py --jpeg --sizes 9000
"""
import argparse, pathlib, struct, zlib, random
parser=argparse.ArgumentParser()
parser.add_argument('--sizes', nargs='+', type=int, default=[1000,4000,9000,15000])
parser.add_argument('--jpeg',action='store_true')
parser.add_argument('--webp',action='store_true')
parser.add_argument('--noise',action='store_true',help='Produce larger, photographic-like entropy fixtures')
args=parser.parse_args()
OUT=pathlib.Path(__file__).resolve().parents[1]/'fixtures';OUT.mkdir(exist_ok=True)
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
for size in args.sizes:
    path=OUT/f'map-{size}{"-noise" if args.noise else ""}.png'
    compressor=zlib.compressobj(3)
    rng=random.Random(size)
    with path.open('wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0)))
        for y in range(size):
            row=bytearray(size*3)
            noise=rng.randbytes(size*3) if args.noise else None
            for x in range(size):
                if noise:
                    color=tuple(130+noise[x*3+c]//4 for c in range(3))
                elif x%512<3 or y%512<3:color=(43,60,48)
                elif x%128<2 or y%128<2:color=(157,174,140)
                elif abs((x*3-y*2)%(size//2)-size//4)<8:color=(91,151,171)
                else:color=(205+(x//512)%12,216+(y//512)%12,182+((x+y)//128)%20)
                row[x*3:x*3+3]=bytes(color)
            compressed=compressor.compress(b'\0'+row)
            if compressed:f.write(chunk(b'IDAT',compressed))
        f.write(chunk(b'IDAT',compressor.flush())+chunk(b'IEND',b''))
    print(f'{path.name}: {path.stat().st_size/1048576:.1f} MB',flush=True)
    if args.jpeg or args.webp:
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = None  # These are our own intentionally large test files.
        image=Image.open(path)
        if args.jpeg:
            for progressive in [False,True]:
                target=path.with_name(path.stem+('-progressive' if progressive else '')+'.jpg')
                image.save(target,quality=90,progressive=progressive)
                print(f'{target.name}: {target.stat().st_size/1048576:.1f} MB',flush=True)
        if args.webp:
            image.save(path.with_suffix('.webp'),quality=90)
        image.close()
