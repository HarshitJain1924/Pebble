import os
from PIL import Image

image_path = r"C:\Users\harsh\.gemini\antigravity-ide\brain\02b4de47-c5ac-48aa-ac38-ce60cefa8368\media__1780647919872.png"

img = Image.open(image_path).convert("RGBA")
w, h = img.size
pixels = img.load()

# Step 1: Same checks as extract_frames.py
def is_background_color(r, g, b):
    if abs(r - g) > 8 or abs(g - b) > 8 or abs(r - b) > 8:
        return False
    avg = (r + g + b) // 3
    if (110 <= avg <= 150) or (165 <= avg <= 210):
        return True
    return False

visited = [[False] * h for _ in range(w)]
queue = []
for x in range(w):
    queue.append((x, 0))
    queue.append((x, h - 1))
for y in range(h):
    queue.append((0, y))
    queue.append((w - 1, y))

background_mask = [[False] * h for _ in range(w)]
while queue:
    x, y = queue.pop(0)
    if visited[x][y]:
        continue
    visited[x][y] = True
    r, g, b, a = pixels[x, y]
    if is_background_color(r, g, b):
        background_mask[x][y] = True
        for nx, ny in [(x+1, y), (x-1, y), (x, y+1), (x, y-1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                queue.append((nx, ny))

for y in range(h):
    for x in range(w):
        if background_mask[x][y] or is_background_color(*pixels[x, y][:3]):
            pixels[x, y] = (0, 0, 0, 0)

visited_components = [[False] * h for _ in range(w)]
components = []
for y in range(h):
    for x in range(w):
        _, _, _, a = pixels[x, y]
        if a > 0 and not visited_components[x][y]:
            comp_pixels = []
            comp_queue = [(x, y)]
            visited_components[x][y] = True
            min_x, min_y = x, y
            max_x, max_y = x, y
            while comp_queue:
                cx, cy = comp_queue.pop(0)
                comp_pixels.append((cx, cy))
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in [(cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)]:
                    if 0 <= nx < w and 0 <= ny < h and not visited_components[nx][ny]:
                        _, _, _, na = pixels[nx, ny]
                        if na > 0:
                            visited_components[nx][ny] = True
                            comp_queue.append((nx, ny))
            comp_w = max_x - min_x + 1
            comp_h = max_y - min_y + 1
            if len(comp_pixels) > 1000 and comp_w > 80 and comp_h > 80:
                components.append((min_x, min_y, max_x, max_y))

# Sort
components_sorted_by_y = sorted(components, key=lambda c: c[1])
rows = []
for c in components_sorted_by_y:
    added = False
    for r in rows:
        row_avg_y = sum(item[1] for item in r) / len(r)
        if abs(c[1] - row_avg_y) < 60:
            r.append(c)
            added = True
            break
    if not added:
        rows.append([c])

for r in rows:
    r.sort(key=lambda c: c[0])

# Print component positions and compute grid cells
frame_names = [
    "idle_upright",       # Row 1, Col 1
    "look_down_pebble",   # Row 1, Col 2
    "hold_pebble_up",     # Row 1, Col 3
    "hold_pebble_mid",    # Row 2, Col 1
    "look_down_ground",   # Row 2, Col 2
    "hold_pebble_neck",   # Row 3, Col 3
    "flight",             # Row 3, Col 1
    "stand_down_right",   # Row 3, Col 2
]

idx = 0
for r_num, r in enumerate(rows):
    print(f"\n--- Row {r_num + 1} ---")
    for c_num, box in enumerate(r):
        min_x, min_y, max_x, max_y = box
        w_c = max_x - min_x + 1
        h_c = max_y - min_y + 1
        # Let's see: we can estimate the center of each cell.
        # Let's say columns are Col 1: x ~ 0-340, Col 2: x ~ 340-680, Col 3: x ~ 680-1024
        # Rows are Row 1: y ~ 0-186, Row 2: y ~ 186-372, Row 3: y ~ 372-559
        col_idx = 0 if min_x < 340 else (1 if min_x < 680 else 2)
        row_idx = r_num
        
        # Grid cell center
        cell_w = 341
        cell_h = 186
        cell_cx = col_idx * cell_w + cell_w // 2
        cell_cy = row_idx * cell_h + cell_h // 2
        
        # Bounding box center
        bbox_cx = (min_x + max_x) // 2
        bbox_cy = (min_y + max_y) // 2
        
        # Offset to align centers
        offset_x = bbox_cx - cell_cx
        offset_y = bbox_cy - cell_cy
        
        name = frame_names[idx] if idx < len(frame_names) else f"frame_{idx}"
        print(f"Frame {idx}: '{name}' | BBox: ({min_x}, {min_y}) to ({max_x}, {max_y}) | Size: {w_c}x{h_c} | BBox Center: ({bbox_cx}, {bbox_cy}) | Offsets: ({offset_x}, {offset_y})")
        idx += 1
