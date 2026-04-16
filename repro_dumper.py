from PIL import Image
import numpy as np
import sys

def dump_pixels(image_path, output_path):
    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    data = np.array(img)
    print(f"Dumping {width}x{height} pixels to {output_path}")
    with open(output_path, 'wb') as f:
        f.write(data.tobytes())

if __name__ == "__main__":
    dump_pixels(r'B:\Downloads\BrowserDownloads\BackgroundsGen2\test2.png', 'test2_raw.bin')
