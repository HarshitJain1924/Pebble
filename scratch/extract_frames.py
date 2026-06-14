import os
from PIL import Image

image_path = r"C:\Users\harsh\.gemini\antigravity-ide\brain\02b4de47-c5ac-48aa-ac38-ce60cefa8368\media__1780647919872.png"
output_dir = r"c:\Users\harsh\OneDrive\Desktop\todoapp\assets\images\crow"
os.makedirs(output_dir, exist_ok=True)

def is_background_color(r, g, b):
    # Neutral gray check (r, g, b are very close)
    if abs(r - g) > 8 or abs(g - b) > 8 or abs(r - b) > 8:
        return False
    # Intensity check for checkerboard grays (around 130 and 188)
    avg = (r + g + b) // 3
    if (110 <= avg <= 150) or (165 <= avg <= 210):
        return True
    return False

print("Loading image...")
img = Image.open(image_path).convert("RGBA")
w, h = img.size
pixels = img.load()

# Step 1: Flood fill from all edges to identify background
print("Running flood fill from borders...")
visited = [[False] * h for _ in range(w)]
queue = []

# Add all border pixels to queue
for x in range(w):
    queue.append((x, 0))
    queue.append((x, h - 1))
for y in range(h):
    queue.append((0, y))
    queue.append((w - 1, y))

background_mask = [[False] * h for _ in range(w)]

# Perform BFS
while queue:
    x, y = queue.pop(0)
    if visited[x][y]:
        continue
    visited[x][y] = True
    
    r, g, b, a = pixels[x, y]
    if is_background_color(r, g, b):
        background_mask[x][y] = True
        # Add neighbors
        for nx, ny in [(x+1, y), (x-1, y), (x, y+1), (x, y-1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                queue.append((nx, ny))

# Step 2: Make background pixels transparent, and also catch internal checkerboard holes
print("Removing background and cleaning internal holes...")
for y in range(h):
    for x in range(w):
        if background_mask[x][y]:
            pixels[x, y] = (0, 0, 0, 0)
        else:
            r, g, b, a = pixels[x, y]
            # If it's a checkerboard color and not yet marked, let's double check if it's an internal hole
            if is_background_color(r, g, b):
                pixels[x, y] = (0, 0, 0, 0)

# Save the full transparent sprite sheet for verification
cleaned_sheet_path = os.path.join(output_dir, "crow_sheet_clean.png")
img.save(cleaned_sheet_path)
print(f"Saved cleaned sprite sheet to {cleaned_sheet_path}")

# Step 3: Connected Component analysis to find bounding boxes of crows
print("Finding connected components (crows)...")
visited_components = [[False] * h for _ in range(w)]
components = []

for y in range(h):
    for x in range(w):
        _, _, _, a = pixels[x, y]
        if a > 0 and not visited_components[x][y]:
            # Found a new component, BFS to find all connected non-transparent pixels
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
            # Filter out tiny noise and pebbles (crows are at least 100x100)
            if len(comp_pixels) > 1000 and comp_w > 80 and comp_h > 80:
                components.append((min_x, min_y, max_x, max_y))

print(f"Found {len(components)} crow components.")

# Sort components: first by row (y), then by column (x)
# To group by row, we can cluster y values that are close
sorted_components = []
components_sorted_by_y = sorted(components, key=lambda c: c[1])

rows = []
for c in components_sorted_by_y:
    added = False
    for r in rows:
        # If the top y of this component is close to the average top y of the row
        row_avg_y = sum(item[1] for item in r) / len(r)
        if abs(c[1] - row_avg_y) < 60: # Row height threshold
            r.append(c)
            added = True
            break
    if not added:
        rows.append([c])

# Sort each row by x coordinate
for r in rows:
    r.sort(key=lambda c: c[0])

# Flatten the list of sorted components
flat_sorted_components = []
for i, r in enumerate(rows):
    print(f"Row {i+1} count: {len(r)}")
    flat_sorted_components.extend(r)

# Save each frame
frame_names = [
    "idle_upright",       # Row 1, Col 1
    "look_down_pebble",   # Row 1, Col 2
    "hold_pebble_up",     # Row 1, Col 3
    "hold_pebble_mid",    # Row 2, Col 1
    "look_down_ground",   # Row 2, Col 2
    "hold_pebble_neck",   # Row 2, Col 3
    "flight",             # Row 3, Col 1
    "stand_down_right",   # Row 3, Col 2
]

for i, box in enumerate(flat_sorted_components):
    min_x, min_y, max_x, max_y = box
    # Crop the frame
    cropped_img = img.crop((min_x, min_y, max_x + 1, max_y + 1))
    
    # Give it a descriptive name
    name = frame_names[i] if i < len(frame_names) else f"frame_{i}"
    output_path = os.path.join(output_dir, f"{name}.png")
    cropped_img.save(output_path)
    print(f"Saved {name} (size: {cropped_img.size}) to {output_path}")

print("Extraction completed successfully!")
