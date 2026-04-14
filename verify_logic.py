import sys
from PIL import Image
import numpy as np

def rgb_to_hex(r, g, b):
    return "#{:02X}{:02X}{:02X}".format(r, g, b)

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

def get_median(arr):
    if not arr: return 0
    arr.sort()
    return arr[len(arr)//2]

def detect_settings(image_path, tolerance=10):
    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    data = np.array(img)
    
    # Sample 0,0 for clear color (mimicking JS data[0], data[1], data[2])
    r0, g0, b0 = data[0, 0][:3]
    clear_color_hex = rgb_to_hex(r0, g0, b0)
    clear_color = (r0, g0, b0)
    
    print(f"File: {image_path}")
    print(f"Sampled Clear Color: {clear_color_hex} ({r0}, {g0}, {b0})")
    
    r, g, b, a = data[..., 0], data[..., 1], data[..., 2], data[..., 3]
    cr, cg, cb = clear_color
    
    # JS: alpha < 5 || isColorClose
    mask = (a < 5) | (
        (np.abs(r.astype(int) - cr) <= tolerance) & 
        (np.abs(g.astype(int) - cg) <= tolerance) & 
        (np.abs(b.astype(int) - cb) <= tolerance)
    )
    
    grid = (~mask).astype(int)
    visited = np.zeros_like(grid, dtype=bool)
    islands = []
    
    for y in range(height):
        for x in range(width):
            if grid[y, x] == 1 and not visited[y, x]:
                x1, y1, x2, y2 = x, y, x, y
                queue = [(x, y)]
                visited[y, x] = True
                head = 0
                while head < len(queue):
                    cx, cy = queue[head]
                    head += 1
                    x1 = min(x1, cx); y1 = min(y1, cy)
                    x2 = max(x2, cx); y2 = max(y2, cy)
                    for nx, ny in [(cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)]:
                        if 0 <= nx < width and 0 <= ny < height:
                            if grid[ny, nx] == 1 and not visited[ny, nx]:
                                visited[ny, nx] = True
                                queue.append((nx, ny))
                
                # JS Filter: x2 - x1 >= 8 && y2 - y1 >= 8
                if (x2 - x1 >= 8) and (y2 - y1 >= 8):
                    islands.append({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2})
    
    print(f"Islands found: {len(islands)}")
    if not islands: return
    
    max_w = 0; max_h = 0
    for i in islands:
        max_w = max(max_w, i['x2'] - i['x1'] + 1)
        max_h = max(max_h, i['y2'] - i['y1'] + 1)
    
    raw_cell_size = max(max_w, max_h)
    
    # Power of 2 Snapping (match JS)
    p2s = [64, 128, 256, 512, 1024, 2048]
    nearest_p2 = min(p2s, key=lambda x: abs(x - raw_cell_size))
    
    if abs(nearest_p2 - raw_cell_size) / nearest_p2 < 0.1:
        cell_size = nearest_p2
    else:
        cell_size = int(round(raw_cell_size / 4) * 4)
    
    print(f"Raw Max Dim: {raw_cell_size} -> Snapped Cell Size: {cell_size}")
    
    h_gaps = []; v_gaps = []
    
    sorted_by_y = sorted(islands, key=lambda i: i['y1'])
    for i in range(len(sorted_by_y) - 1):
        for j in range(i + 1, len(sorted_by_y)):
            a = sorted_by_y[i]
            b = sorted_by_y[j]
            x_overlap = min(a['x2'], b['x2']) - max(a['x1'], b['x1'])
            if x_overlap > 0:
                gap = b['y1'] - a['y2'] - 1
                if 0 <= gap < cell_size:
                    v_gaps.append(gap)
                    break
                    
    sorted_by_x = sorted(islands, key=lambda i: i['x1'])
    for i in range(len(sorted_by_x) - 1):
        for j in range(i + 1, len(sorted_by_x)):
            a = sorted_by_x[i]
            b = sorted_by_x[j]
            y_overlap = min(a['y2'], b['y2']) - max(a['y1'], b['y1'])
            if y_overlap > 0:
                gap = b['x1'] - a['x2'] - 1
                if 0 <= gap < cell_size:
                    h_gaps.append(gap)
                    break

    h_gap = get_median(h_gaps)
    v_gap = get_median(v_gaps)
    padding = int(min(h_gap, v_gap) // 2)
    
    print(f"Median H Gap: {h_gap}, Median V Gap: {v_gap}")
    print(f"Final Padding: {padding}")

if __name__ == "__main__":
    detect_settings(r'B:\Downloads\BrowserDownloads\Images\backgrounds8x8.png', tolerance=10)
