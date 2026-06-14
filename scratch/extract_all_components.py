import os
from PIL import Image

image_path = r"C:\Users\harsh\.gemini\antigravity-ide\brain\02b4de47-c5ac-48aa-ac38-ce60cefa8368\media__1780655025929.png"
output_dir = r"c:\Users\harsh\OneDrive\Desktop\todoapp\assets\images\jar_pebbles"
os.makedirs(output_dir, exist_ok=True)

# Function to check if a pixel is part of the dark background gradient
def is_background_pixel(r, g, b, y):
    # Interpolated background color from top (40, 43, 48) to bottom (44, 45, 50)
    bg_r = 40 + (y / 559.0) * 4.0
    bg_g = 43 + (y / 559.0) * 2.0
    bg_b = 48 + (y / 559.0) * 2.0
    
    # Distance to background color
    dist = abs(r - bg_r) + abs(g - bg_g) + abs(b - bg_b)
    # Threshold for background (very close to the dark gradient)
    return dist < 15

print("Loading image...")
img = Image.open(image_path).convert("RGBA")
w, h = img.size
pixels = img.load()

# Step 1: Flood fill from borders to find outer background
print("Finding outer background...")
visited = [[False] * h for _ in range(w)]
queue = []
for x in range(w):
    queue.append((x, 0))
    queue.append((x, h - 1))
for y in range(h):
    queue.append((0, y))
    queue.append((w - 1, y))

outer_background = [[False] * h for _ in range(w)]
while queue:
    x, y = queue.pop(0)
    if visited[x][y]:
        continue
    visited[x][y] = True
    
    r, g, b, a = pixels[x, y]
    if is_background_pixel(r, g, b, y):
        outer_background[x][y] = True
        for nx, ny in [(x+1, y), (x-1, y), (x, y+1), (x, y-1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                queue.append((nx, ny))

# Step 2: Make background transparent, and handle empty space inside translucent elements
print("Removing background pixels...")
for y in range(h):
    for x in range(w):
        if outer_background[x][y]:
            pixels[x, y] = (0, 0, 0, 0)
        else:
            # If a pixel is inside the image and matches the background color (e.g. inside the mouth of an empty jar),
            # we make it transparent too
            r, g, b, a = pixels[x, y]
            if is_background_pixel(r, g, b, y):
                # Make it semi-transparent or transparent
                # For empty jar interiors, they should have a slight tint.
                # Let's check how the pixels inside the jar look. If it's pure background, make it 100% transparent.
                pixels[x, y] = (0, 0, 0, 0)

# Save the transparent sheet
cleaned_sheet_path = os.path.join(output_dir, "cleaned_sheet.png")
img.save(cleaned_sheet_path)
print(f"Saved cleaned sprite sheet to {cleaned_sheet_path}")

# Step 3: Connected Component analysis to find bounding boxes
print("Finding components...")
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
            # Keep anything with area > 100 pixels
            if len(comp_pixels) > 100:
                components.append((min_x, min_y, max_x, max_y, len(comp_pixels)))

print(f"Found {len(components)} components.")
for i, comp in enumerate(components):
    min_x, min_y, max_x, max_y, size = comp
    print(f"Comp {i}: BBox: ({min_x}, {min_y}) to ({max_x}, {max_y}) | Size: {max_x-min_x+1}x{max_y-min_y+1} | Pixels: {size}")
