import os
from PIL import Image

image_path = r"C:\Users\harsh\.gemini\antigravity-ide\brain\02b4de47-c5ac-48aa-ac38-ce60cefa8368\media__1780655025929.png"
output_dir = r"c:\Users\harsh\OneDrive\Desktop\todoapp\assets\images\jar_pebbles"
os.makedirs(output_dir, exist_ok=True)

def is_background_pixel(r, g, b, y):
    bg_r = 40 + (y / 559.0) * 4.0
    bg_g = 43 + (y / 559.0) * 2.0
    bg_b = 48 + (y / 559.0) * 2.0
    dist = abs(r - bg_r) + abs(g - bg_g) + abs(b - bg_b)
    return dist < 15

print("Loading image...")
img = Image.open(image_path).convert("RGBA")
w, h = img.size
pixels = img.load()

# Step 1: Flood fill from borders to identify outer background
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

# Step 2: Clear background pixels and handle transparency in the jar
# For the empty jar's interior, the pixels show the background color. We want to clear this background color,
# leaving just the glass reflections and outlines.
# If we set the background color to transparent inside the jar, the interior becomes clear!
print("Applying transparency mask...")
for y in range(h):
    for x in range(w):
        if outer_background[x][y]:
            pixels[x, y] = (0, 0, 0, 0)
        else:
            r, g, b, a = pixels[x, y]
            if is_background_pixel(r, g, b, y):
                pixels[x, y] = (0, 0, 0, 0)

# Crop the items directly using our verified bounding boxes
items = {
    "empty_jar": (544, 284, 610, 383),
    "pebble_regular_1": (639, 91, 697, 127),
    "pebble_regular_2": (639, 178, 698, 214),
    "pebble_shiny_1": (721, 83, 799, 133),
    "pebble_shiny_2": (722, 172, 799, 221),
    "pebble_legendary_1": (918, 87, 989, 131),
    "pebble_legendary_2": (918, 175, 988, 218)
}

print("Cropping and saving components...")
for name, box in items.items():
    min_x, min_y, max_x, max_y = box
    cropped = img.crop((min_x, min_y, max_x + 1, max_y + 1))
    
    # Optional visual polish: clean up edges for smoother rendering
    output_path = os.path.join(output_dir, f"{name}.png")
    cropped.save(output_path)
    print(f"Saved {name} (size: {cropped.size}) to {output_path}")

print("Extraction complete!")
