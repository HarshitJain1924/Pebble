import os
from PIL import Image

brain_dir = r"C:\Users\harsh\.gemini\antigravity-ide\brain\02b4de47-c5ac-48aa-ac38-ce60cefa8368"
jar_path = os.path.join(brain_dir, "generated_empty_jar_1780655508527.png")
pebbles_path = os.path.join(brain_dir, "generated_pebbles_1780655528596.png")
crow_path = os.path.join(brain_dir, "generated_crow_1780655546174.png")

output_jar_dir = r"c:\Users\harsh\OneDrive\Desktop\todoapp\assets\images\jar_pebbles"
output_crow_dir = r"c:\Users\harsh\OneDrive\Desktop\todoapp\assets\images\crow"

os.makedirs(output_jar_dir, exist_ok=True)
os.makedirs(output_crow_dir, exist_ok=True)

def remove_background(img_path, bg_color, threshold=20):
    print(f"Processing background for {os.path.basename(img_path)}...")
    img = Image.open(img_path).convert("RGBA")
    w, h = img.size
    pixels = img.load()
    
    # Flood fill outer background
    visited = [[False] * h for _ in range(w)]
    queue = []
    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h - 1))
    for y in range(h):
        queue.append((0, y))
        queue.append((w - 1, y))
        
    bg_r, bg_g, bg_b = bg_color
    
    outer_bg = [[False] * h for _ in range(w)]
    while queue:
        x, y = queue.pop(0)
        if visited[x][y]:
            continue
        visited[x][y] = True
        
        r, g, b, a = pixels[x, y]
        dist = abs(r - bg_r) + abs(g - bg_g) + abs(b - bg_b)
        if dist < threshold:
            outer_bg[x][y] = True
            for nx, ny in [(x+1, y), (x-1, y), (x, y+1), (x, y-1)]:
                if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                    queue.append((nx, ny))
                    
    # Set transparency
    for y in range(h):
        for x in range(w):
            if outer_bg[x][y]:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                r, g, b, a = pixels[x, y]
                dist = abs(r - bg_r) + abs(g - bg_g) + abs(b - bg_b)
                if dist < threshold:
                    pixels[x, y] = (0, 0, 0, 0)
                    
    return img

# 1. Process Empty Jar
jar_img = remove_background(jar_path, (24, 25, 29), threshold=25)
# Find bbox of jar
bbox_jar = jar_img.getbbox()
if bbox_jar:
    cropped_jar = jar_img.crop(bbox_jar)
    cropped_jar.save(os.path.join(output_jar_dir, "empty_jar.png"))
    print(f"Saved generated empty jar (size {cropped_jar.size}) to empty_jar.png")

# 2. Process Crow Mascot
crow_img = remove_background(crow_path, (25, 25, 25), threshold=25)
bbox_crow = crow_img.getbbox()
if bbox_crow:
    cropped_crow = crow_img.crop(bbox_crow)
    # Save as idle_upright.png to overwrite and use as idle frame in jar animations
    cropped_crow.save(os.path.join(output_crow_dir, "idle_upright.png"))
    print(f"Saved generated crow mascot (size {cropped_crow.size}) to idle_upright.png")

# 3. Process Pebbles Sheet
pebbles_img = remove_background(pebbles_path, (45, 46, 51), threshold=25)
pixels_p = pebbles_img.load()
w_p, h_p = pebbles_img.size

# Connected component analysis to find individual pebbles
visited_p = [[False] * h_p for _ in range(w_p)]
pebble_components = []

for y in range(h_p):
    for x in range(w_p):
        _, _, _, a = pixels_p[x, y]
        if a > 0 and not visited_p[x][y]:
            comp_queue = [(x, y)]
            visited_p[x][y] = True
            min_x, min_y = x, y
            max_x, max_y = x, y
            comp_size = 0
            
            while comp_queue:
                cx, cy = comp_queue.pop(0)
                comp_size += 1
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in [(cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)]:
                    if 0 <= nx < w_p and 0 <= ny < h_p and not visited_p[nx][ny]:
                        _, _, _, na = pixels_p[nx, ny]
                        if na > 0:
                            visited_p[nx][ny] = True
                            comp_queue.append((nx, ny))
            
            # Keep reasonably sized pebbles
            if comp_size > 400:
                pebble_components.append((min_x, min_y, max_x, max_y))

print(f"Found {len(pebble_components)} generated pebbles.")

# Sort by size to extract largest stones
sorted_pebbles = sorted(pebble_components, key=lambda c: (c[2]-c[0])*(c[3]-c[1]), reverse=True)

pebble_names = [
    "pebble_regular_1",
    "pebble_regular_2",
    "pebble_shiny_1",
    "pebble_shiny_2",
    "pebble_legendary_1",
    "pebble_legendary_2"
]

# If we found at least 1 pebble, save them. If we found fewer than 6, reuse variants.
for i in range(6):
    name = pebble_names[i]
    if i < len(sorted_pebbles):
        min_x, min_y, max_x, max_y = sorted_pebbles[i]
        cropped = pebbles_img.crop((min_x, min_y, max_x + 1, max_y + 1))
    else:
        # Fallback to the first pebble if not enough generated
        min_x, min_y, max_x, max_y = sorted_pebbles[0] if sorted_pebbles else (0,0,10,10)
        cropped = pebbles_img.crop((min_x, min_y, max_x + 1, max_y + 1))
        
    output_path = os.path.join(output_jar_dir, f"{name}.png")
    cropped.save(output_path)
    print(f"Saved generated {name} (size {cropped.size}) to {output_path}")

print("Asset processing completed successfully!")
