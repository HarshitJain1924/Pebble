import os
from PIL import Image

image_path = r"C:\Users\harsh\.gemini\antigravity-ide\brain\02b4de47-c5ac-48aa-ac38-ce60cefa8368\media__1780655025929.png"

with Image.open(image_path) as img:
    print(f"Format: {img.format}")
    print(f"Size: {img.size}")
    print(f"Mode: {img.mode}")
