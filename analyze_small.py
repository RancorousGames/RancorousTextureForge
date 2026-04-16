from PIL import Image, ImageDraw
import numpy as np
import time

def analyze_and_visualize(image_path, out_path, tolerance=15):
    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    data = np.array(img)
    bg_color = tuple(data[0, 0])
    data_int = data.astype(np.int16)
    bg_np = np.array(bg_color[:3], dtype=np.int16)

    def is_not_bg(y, x):
        pixel = data_int[y, x]
        if pixel[3] < 5: return False
        dr = abs(pixel[0] - bg_np[0])
        dg = abs(pixel[1] - bg_np[1])
        db = abs(pixel[2] - bg_np[2])
        return dr >= tolerance or dg >= tolerance or db >= tolerance

    visited = np.zeros((height, width), dtype=bool)
    islands = []
    
    # Use the exact same logic as fix_visual.py
    scan_step = 4 
    for sy in range(0, height, scan_step):
        for sx in range(0, width, scan_step):
            if visited[sy, sx] or not is_not_bg(sy, sx):
                continue

            x1, y1, x2, y2 = sx, sy, sx, sy
            queue = [(sx, sy)]
            visited[sy, sx] = True
            head = 0
            while head < len(queue):
                cx, cy = queue[head]
                head += 1
                x1, y1 = min(x1, cx), min(y1, cy)
                x2, y2 = max(x2, cx), max(y2, cy)

                # Current bridging logic: 4px range
                for dy in range(-4, 5): 
                    for dx in range(-4, 5):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < width and 0 <= ny < height and not visited[ny, nx] and is_not_bg(ny, nx):
                            visited[ny, nx] = True
                            queue.append((nx, ny))
            
            if (x2-x1) >= 4 and (y2-y1) >= 4:
                islands.append((x1, y1, x2-x1+1, y2-y1+1))

    print(f"Found {len(islands)} islands.")

    # Visualization
    viz_img = img.copy()
    draw = ImageDraw.Draw(viz_img, "RGBA")
    
    colors = [
        (255, 0, 0, 100),   # Red
        (0, 255, 0, 100),   # Green
        (0, 0, 255, 100),   # Blue
        (255, 255, 0, 100), # Yellow
        (255, 0, 255, 100), # Magenta
        (0, 255, 255, 100)  # Cyan
    ]

    for i, (ix, iy, iw, ih) in enumerate(islands):
        color = colors[i % len(colors)]
        # Draw semi-transparent box
        draw.rectangle([ix, iy, ix+iw, iy+ih], fill=color, outline=(255, 255, 255, 255))
        # Draw label
        draw.text((ix + 2, iy + 2), f"#{i}", fill=(255, 255, 255, 255))
        print(f"Island #{i}: [{ix}, {iy}] {iw}x{ih}")

    viz_img.save(out_path)
    print(f"Visualization saved to {out_path}")

if __name__ == "__main__":
    analyze_and_visualize(
        r'D:\SSDProjects\Tools\Rancorous-Texture-Forge\Testinputs\gridfix_128_4_small.png',
        r'D:\SSDProjects\Tools\Rancorous-Texture-Forge\Testinputs\debug_islands.png'
    )
