from PIL import Image

image_path = r"C:\Users\harsh\.gemini\antigravity-ide\brain\02b4de47-c5ac-48aa-ac38-ce60cefa8368\media__1780655025929.png"

with Image.open(image_path) as img:
    print("Border pixels:")
    print("Top-left:", img.getpixel((0, 0)))
    print("Top-middle:", img.getpixel((512, 0)))
    print("Bottom-left:", img.getpixel((0, 558)))
    print("Row 0 center segment (10 pixels):", [img.getpixel((x, 0)) for x in range(10)])
