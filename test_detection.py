import sys
from PIL import Image
import numpy as np

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

def detect_settings(image_path, tolerance=10):
    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    data = np.array(img)
    
    # Sample 0,0 for clear color
    clear_color = tuple(data[0, 0][:3])
    print(f"Sampled Clear Color at (0,0): {clear_color}")
    
    r, g, b, a = data[..., 0], data[..., 1], data[..., 2], data[..., 3]
    cr, cg, cb = clear_color
    
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
                if (x2 - x1 >= 8) and (y2 - y1 >= 8):
                    islands.append((x1, y1, x2, y2))
    
    print(f"Tolerance: {tolerance}")
    print(f"Total islands found: {len(islands)}")
    if not islands: return
    
    max_w = 0; max_h = 0
    for i in islands:
        max_w = max(max_w, i[2] - i[0] + 1)
        max_h = max(max_h, i[3] - i[1] + 1)
    
    cell_size = max(max_w, max_h)
    # Refined snapping logic
    cell_size = int(round(cell_size / 4) * 4)
    
    h_gaps = []; v_gaps = []
    for i in range(len(islands)):
        for j in range(i + 1, len(islands)):
            a = islands[i]; b = islands[j]
            if min(a[3], b[3]) - max(a[1], b[1]) > 0:
                gap = abs(a[0] - b[2]) - 1 if a[0] > b[2] else abs(b[0] - a[2]) - 1
                if 0 < gap < cell_size: h_gaps.append(gap)
            if min(a[2], b[2]) - max(a[0], b[0]) > 0:
                gap = abs(a[1] - b[3]) - 1 if a[1] > b[3] else abs(b[1] - a[3]) - 1
                if 0 < gap < cell_size: v_gaps.append(gap)
    
    def get_median(arr):
        if not arr: return 0
        arr.sort()
        return arr[len(arr)//2]
    
    h_gap = get_median(h_gaps)
    v_gap = get_median(v_gaps)
    padding = min(h_gap, v_gap) // 2 if h_gaps and v_gaps else 0
    
    print(f"Refined Cell Size: {cell_size}")
    print(f"Detected Padding: {padding}")
    return islands, cell_size, padding

if __name__ == "__main__":
    for t in [10, 20, 30, 40, 50]:
        detect_settings('exampleatlas.jpeg', tolerance=t)
