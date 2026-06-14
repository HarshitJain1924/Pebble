import os
from PIL import Image

brain_dir = r"C:\Users\harsh\.gemini\antigravity-ide\brain\02b4de47-c5ac-48aa-ac38-ce60cefa8368"
files = [
    "generated_empty_jar_1780655508527.png",
    "generated_pebbles_1780655528596.png",
    "generated_crow_1780655546174.png"
]

for filename in files:
    filepath = os.path.join(brain_dir, filename)
    if os.path.exists(filepath):
        with Image.open(filepath) as img:
            print(f"\nFile: {filename}")
            print(f"Size: {img.size}")
            print(f"Mode: {img.mode}")
            print("Corner pixel (0,0):", img.getpixel((0, 0)))
            print("Edge pixel (100,0):", img.getpixel((100, 0)))
    else:
        print(f"File {filename} not found")
