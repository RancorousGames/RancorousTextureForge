import sys
from PIL import Image
import numpy as np

def rgb_to_hex(r, g, b):
    return "#{:02X}{:02X}{:02X}".format(r, g, b)

def get_median(arr):
    if not arr: return 0
    arr.sort()
    return arr[len(arr)//2]

def detect_settings(image_path, tolerance=10):
    try:
        img = Image.open(image_path).convert('RGBA')
    except Exception as e:
        print(f"Error opening image: {e}")
        return
    
    width, height = img.size
    data = np.array(img)
    
    r0, g0, b0 = data[0, 0][:3]
    clear_color_hex = rgb_to_hex(r0, g0, b0)
    clear_color = (r0, g0, b0)
    
    print(f"File: {image_path} ({width}x{height})")
    print(f"Sampled Clear Color: {clear_color_hex} ({r0}, {g0}, {b0})")
    
    r, g, b, a = data[..., 0], data[..., 1], data[..., 2], data[..., 3]
    cr, cg, cb = clear_color
    
    mask = (a < 5) | (
        (np.abs(r.astype(int) - cr) <= tolerance) & 
        (np.abs(g.astype(int) - cg) <= tolerance) & 
        (np.abs(b.astype(int) - cb) <= tolerance)
    )
    
    # Projection Analysis (matching my recent TS change)
    energy = (~mask).astype(int)
    col_energy = np.sum(energy, axis=0)
    row_energy = np.sum(energy, axis=1)
    
    def find_clusters(energy, label):
        max_e = np.max(energy)
        threshold = max(2, max_e * 0.15)
        print(f"{label} Peak Energy: {max_e}, Threshold: {threshold}")
        
        clusters = []
        start = -1
        for i in range(len(energy)):
            active = energy[i] > threshold
            if active and start == -1:
                start = i
            elif not active and start != -1:
                # Gap check
                is_real_gap = True
                for lookahead in range(1, 5):
                    if i + lookahead < len(energy) and energy[i+lookahead] > threshold:
                        is_real_gap = False
                        break
                if is_real_gap:
                    clusters.append({'start': start, 'end': i-1, 'size': i - start})
                    start = -1
        if start != -1:
            clusters.append({'start': start, 'end': len(energy)-1, 'size': len(energy) - start})
        return clusters

    col_clusters = find_clusters(col_energy, "Col")
    row_clusters = find_clusters(row_energy, "Row")
    
    print(f"Clusters Found: X:{len(col_clusters)} Y:{len(row_clusters)}")
    for c in col_clusters: print(f"  Col Cluster: {c['start']}-{c['end']} (size {c['size']})")
    for r in row_clusters: print(f"  Row Cluster: {r['start']}-{r['end']} (size {r['size']})")

    if not col_clusters or not row_clusters: return

    median_w = get_median([c['size'] for c in col_clusters])
    median_h = get_median([r['size'] for r in row_clusters])
    base_size = max(median_w, median_h)
    
    def find_step(clusters):
        if len(clusters) < 2: return 0
        diffs = [clusters[i+1]['start'] - clusters[i]['start'] for i in range(len(clusters)-1)]
        return get_median(diffs)

    step_x = find_step(col_clusters)
    step_y = find_step(row_clusters)
    median_step = max(step_x, step_y)
    
    print(f"Median Sizes: {median_w}x{median_h}, Median Step: {median_step}")

if __name__ == "__main__":
    path = r'B:\Downloads\BrowserDownloads\BackgroundsGen2\test2.png'
    detect_settings(path, tolerance=10)
