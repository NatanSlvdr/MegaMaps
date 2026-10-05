"""Generate the PWA's self-contained raster/vector icon set; no external assets."""
import pathlib, struct, zlib
OUT = pathlib.Path(__file__).resolve().parents[1] / 'public' / 'icons'
OUT.mkdir(exist_ok=True)
POLYGONS = [([(118,150),(210,116),(210,352),(118,386)],(174,207,144)), ([(210,116),(302,151),(302,386),(210,352)],(204,232,175)), ([(302,151),(394,116),(394,352),(302,386)],(148,183,121))]
def png(size):
    data = bytearray([17,25,23,255] * (size*size))
    for polygon, color in POLYGONS:
        points = [(x*size/512,y*size/512) for x,y in polygon]
        for y in range(size):
            crossings=[]
            for i,(x1,y1) in enumerate(points):
                x2,y2=points[(i+1)%len(points)]
                if min(y1,y2) <= y+.5 < max(y1,y2): crossings.append(x1+(y+.5-y1)*(x2-x1)/(y2-y1))
            crossings.sort()
            for i in range(0,len(crossings),2):
                for x in range(max(0,round(crossings[i])),min(size,round(crossings[i+1]))):
                    p=(y*size+x)*4;data[p:p+4]=bytes((*color,255))
    def chunk(kind,payload):
        return struct.pack('>I',len(payload))+kind+payload+struct.pack('>I',zlib.crc32(kind+payload))
    rows=b''.join(b'\0'+data[y*size*4:(y+1)*size*4] for y in range(size))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')
for name,size in [('icon-192.png',192),('icon-512.png',512),('maskable-512.png',512),('apple-touch-icon.png',180)]:
    (OUT/name).write_bytes(png(size))
(OUT/'icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#111917"/><path d="m118 150 92-34v236l-92 34Z" fill="#aecf90"/><path d="m210 116 92 35v235l-92-34Z" fill="#cce8af"/><path d="m302 151 92-35v236l-92 34Z" fill="#94b779"/></svg>')
