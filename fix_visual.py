from PIL import Image
import numpy as np
import time

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
    bg_np = np.array(bg_color, dtype=np.int16)

    # Simple isClear for island detection based on sampled background
    def is_clear(y, x):
        pixel = data_int[y, x]
        # Check alpha first
        if pixel[3] < 5: return True
        # Check RGB distance to sampled background
        return np.all(np.abs(pixel[:3] - bg_np[:3]) < tolerance)

    visited = np.zeros((height, width), dtype=bool)
    islands = []

    detect_start = time.perf_counter()
    print(f"Detecting islands in {width}x{height} image...")
    for y in range(height):
        for x in range(width):
            if visited[y, x] or is_clear(y, x):
                continue
            
            # BFS with bridging for island
            x1, y1, x2, y2 = x, y, x, y
            queue = [(x, y)]
            visited[y, x] = True
            head = 0
            while head < len(queue):
                cx, cy = queue[head]
                head += 1
                x1, y1 = min(x1, cx), min(y1, cy)
                x2, y2 = max(x2, cx), max(y2, cy)
                
                # Check neighbors with bridging (up to 10px gap)
                for dy in range(-10, 11, 2): # Finer step
                    for dx in range(-10, 11, 2):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < width and 0 <= ny < height and not visited[ny, nx] and not is_clear(ny, nx):
                            # Found something in range, now do fine scan
                            for fdy in range(-5, 6):
                                for fdx in range(-5, 6):
                                    fnx, fny = nx + fdx, ny + fdy
                                    if 0 <= fnx < width and 0 <= fny < height and not visited[fny, fnx] and not is_clear(fny, fnx):
                                        visited[fny, fnx] = True
                                        queue.append((fnx, fny))
            
            if (x2-x1) >= 4 and (y2-y1) >= 4:
                islands.append((x1, y1, x2-x1+1, y2-y1+1))

    detect_end = time.perf_counter()
    print(f"Found {len(islands)} islands.")
    
    # Create output atlas with requested padding and grid using sampled bg_color
    out_img = Image.new('RGBA', (width, height), bg_color)
    
    for i, (ix, iy, iw, ih) in enumerate(islands):
        # 1. Snap center to grid cell using the Gutter Logic
        # Step = cell_w + 2 * padding
        step = cell_w + padding * 2
        cx, cy = ix + iw/2, iy + ih/2
        
        # To find the col, we subtract the initial outer padding and half a cell
        col = round((cx - padding - cell_w/2) / step)
        row = round((cy - padding - cell_w/2) / step)
        
        target_x = padding + col * step
        target_y = padding + row * step
        
        # 2. Extract and Stretch AGGRESSIVELY to fill exactly cell_w x cell_w
        icon_box = (ix, iy, ix+iw, iy+ih)
        icon_snippet = img.crop(icon_box)
        
        # AGGRESSIVE NON-UNIFORM SCALE
        stretched_icon = icon_snippet.resize((cell_w, cell_w), Image.LANCZOS)
        
        # 3. Place in the exact top-left of the target cell (inside the padding)
        out_img.paste(stretched_icon, (int(target_x), int(target_y)))

    out_img.save(out_path)
    
    end_time = time.perf_counter()
    total_dur = end_time - start_time
    detect_dur = detect_end - detect_start
    print(f"Saved fixed result to {out_path}")
    print(f"Time: {total_dur:.4f}s (Detection: {detect_dur:.4f}s)")

if __name__ == "__main__":
    import os
    input_dir = r"D:\SSDProjects\Tools\Rancorous-Texture-Forge\Testinputs"
    
    tasks = [
        ("visual_input.png", "visual_output_fixed.png", 256, 8),
        ("fixgridtest.png", "fixgridtest_fixed.png", 128, 4),
        ("test2048.png", "test2048_fixed.png", 1024, 16)
    ]
    
    for in_name, out_name, cell_w, padding in tasks:
        in_path = os.path.join(input_dir, in_name)
        out_path = os.path.join(input_dir, out_name)
        if os.path.exists(in_path):
            print(f"\n--- Processing {in_name} ---")
            fix_grid(in_path, out_path, cell_w, padding)
        else:
            print(f"Skipping {in_name}: File not found.")
