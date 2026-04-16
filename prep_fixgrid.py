from PIL import Image
import numpy as np
import sys
import json

def dump_for_js(image_path, raw_out, meta_out):
    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    data = np.array(img)
    
    with open(raw_out, 'wb') as f:
        f.write(data.tobytes())
        
    with open(meta_out, 'w') as f:
        json.dump({"width": width, "height": height}, f)
    
    print(f"Dumped {width}x{height} to {raw_out}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        path = r'B:\Downloads\BrowserDownloads\BackgroundsGen2\fixgridtest.png'
    else:
        path = sys.argv[1]
    dump_for_js(path, 'temp_raw.bin', 'temp_meta.json')
