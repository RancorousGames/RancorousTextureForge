from PIL import Image, ImageDraw
import numpy as np
import json

def generate_test():
    # 1024x1024 Black background
    img = Image.new('RGBA', (1024, 1024), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)
    
    # Helper to draw a "Cross" icon to easily see stretching/cropping
    def draw_icon(x, y, w, h, color):
        # Draw a border
        draw.rectangle([x, y, x+w-1, y+h-1], outline=color, width=2)
        # Draw a cross
        draw.line([x, y, x+w-1, y+h-1], fill=color, width=4)
        draw.line([x+w-1, y, x, y+h-1], fill=color, width=4)
        # Draw a circle in the middle
        mid_x, mid_y = x + w//2, y + h//2
        r = min(w, h) // 4
        draw.ellipse([mid_x-r, mid_y-r, mid_x+r, mid_y+r], fill=color)

    print("Generating icons...")
    # 1. Correct-ish (256x256 at roughly 0,0 with 8px padding) -> [8, 8, 256, 256]
    draw_icon(8, 8, 250, 250, (255, 0, 0, 255)) 
    
    # 2. Misaligned (Should snap to 256+8, 8) -> [272, 8]
    draw_icon(280, 20, 240, 240, (0, 255, 0, 255))
    
    # 3. Small (Needs stretching) -> [520, 520]
    draw_icon(550, 550, 80, 80, (0, 0, 255, 255))
    
    # 4. Large (Needs squashing) -> [10, 600]
    draw_icon(20, 700, 400, 300, (255, 255, 0, 255))

    img.save('repro_input.png')
    
    # Dump for JS
    data = np.array(img)
    with open('repro_raw.bin', 'wb') as f:
        f.write(data.tobytes())
    with open('repro_meta.json', 'w') as f:
        json.dump({"width": 1024, "height": 1024}, f)
    
    print("Generated repro_input.png and raw buffers.")

if __name__ == "__main__":
    generate_test()
