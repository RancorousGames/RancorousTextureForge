from PIL import Image
import numpy as np
import time
import os
import re

def fix_grid(image_path, out_path, cell_w, padding, tolerance=15):
    start_time = time.perf_counter()
    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    data = np.array(img)

    # Sample background color from the first pixel
    bg_color = tuple(data[0, 0])
    print(f"Sampled background color: {bg_color}")

    # Convert to int16 for safe subtraction without overflow
    data_int = data.astype(np.int16)
    bg_np = np.array(bg_color[:3], dtype=np.int16)

    # Fast check for background
    def is_not_bg(y, x):
        pixel = data_int[y, x]
        if pixel[3] < 5: return False
        # Vectorized-style manual check for speed in Python loop
        dr = abs(pixel[0] - bg_np[0])
        dg = abs(pixel[1] - bg_np[1])
        db = abs(pixel[2] - bg_np[2])
        return dr >= tolerance or dg >= tolerance or db >= tolerance

    visited = np.zeros((height, width), dtype=bool)
    islands = []

    detect_start = time.perf_counter()
    print(f"Detecting islands in {width}x{height} image (Optimized Scan)...")
    # SCANNING STRATEGY: Use a coarse grid to find seeds
    scan_step = 4 
    for sy in range(0, height, scan_step):
        for sx in range(0, width, scan_step):
            if visited[sy, sx] or not is_not_bg(sy, sx):
                continue

            # Found a seed! Now flood fill with bridging
            x1, y1, x2, y2 = sx, sy, sx, sy
            queue = [(sx, sy)]
            visited[sy, sx] = True
            head = 0
            while head < len(queue):
                cx, cy = queue[head]
                head += 1
                x1, y1 = min(x1, cx), min(y1, cy)
                x2, y2 = max(x2, cx), max(y2, cy)

                # Bridging neighbors: check a window around current point
                # Reduced range to 4px to avoid jumping 8-9px gutters
                for dy in range(-4, 5): 
                    for dx in range(-4, 5):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < width and 0 <= ny < height and not visited[ny, nx] and is_not_bg(ny, nx):
                            visited[ny, nx] = True
                            queue.append((nx, ny))
            if (x2-x1) >= 4 and (y2-y1) >= 4:
                islands.append((x1, y1, x2-x1+1, y2-y1+1))

    detect_end = time.perf_counter()
    print(f"Found {len(islands)} islands.")
    
    # Create output atlas with requested padding and grid using sampled bg_color
    out_img = Image.new('RGBA', (width, height), bg_color)
    
    for i, (ix, iy, iw, ih) in enumerate(islands):
        step = cell_w + padding * 2
        cx, cy = ix + iw/2, iy + ih/2
        
        col = round((cx - padding - cell_w/2) / step)
        row = round((cy - padding - cell_w/2) / step)
        
        target_x = padding + col * step
        target_y = padding + row * step
        
        icon_box = (ix, iy, ix+iw, iy+ih)
        icon_snippet = img.crop(icon_box)
        stretched_icon = icon_snippet.resize((cell_w, cell_w), Image.LANCZOS)
        out_img.paste(stretched_icon, (int(target_x), int(target_y)))

    out_img.save(out_path)
    
    end_time = time.perf_counter()
    total_dur = end_time - start_time
    detect_dur = detect_end - detect_start
    print(f"Saved fixed result to {out_path}")
    print(f"Time: {total_dur:.4f}s (Detection: {detect_dur:.4f}s)")

if __name__ == "__main__":
    input_dir = r"D:\SSDProjects\Tools\Rancorous-Texture-Forge\Testinputs"
    pattern = re.compile(r"^gridfix_(\d+)_(\d+).*\.png$")
    
    found_any = False
    for filename in os.listdir(input_dir):
        # Skip output files
        if "fixed" in filename:
            continue
            
        match = pattern.match(filename)
        if match:
            found_any = True
            cell_w = int(match.group(1))
            padding = int(match.group(2))
            
            in_path = os.path.join(input_dir, filename)
            # Create output name: strip .png and add _fixed.png
            out_name = os.path.splitext(filename)[0] + "_fixed.png"
            out_path = os.path.join(input_dir, out_name)
            
            print(f"\n--- Processing {filename} (Cell: {cell_w}, Padding: {padding}) ---")
            fix_grid(in_path, out_path, cell_w, padding)
            
    if not found_any:
        print(f"No files matching 'gridfix_N_Y_*.png' found in {input_dir}")
