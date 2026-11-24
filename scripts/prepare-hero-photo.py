"""Build the licensed, pinned photograph used by desktop and mobile hero."""
import hashlib
import io
import pathlib
import urllib.request
from PIL import Image, ImageOps
URL = "https://upload.wikimedia.org/wikipedia/commons/7/7a/0998Ac4._Evening_over_the_free_Neva_%28Palace_Bridge%29.jpg"
SHA1 = "430b0c2fce400251c299125e6740185af429f1de"
request = urllib.request.Request(URL, headers={"User-Agent": "SHODI/2.0 (https://github.com/epbloger/shodi; helpmoorkis@yandex.ru)"})
with urllib.request.urlopen(request, timeout=45) as response:
    if response.geturl() != URL:
        raise RuntimeError("Unexpected image redirect")
    data = response.read(5_000_001)
if len(data) > 5_000_000 or hashlib.sha1(data).hexdigest() != SHA1:
    raise RuntimeError("Hero photograph checksum mismatch")
with Image.open(io.BytesIO(data)) as photo:
    if photo.format != "JPEG" or photo.size != (4494, 3027):
        raise RuntimeError("Unexpected original photograph dimensions")
    photo.load()
    result = ImageOps.fit(ImageOps.exif_transpose(photo).convert("RGB"), (1440, 960), method=Image.Resampling.LANCZOS)
    target = pathlib.Path(__file__).resolve().parents[1]/"public/assets/city-guide.webp"
    result.save(target, "WEBP", quality=84, method=6)
with Image.open(target) as check:
    check.load()
    if check.format != "WEBP" or check.size != (1440,960):
        raise RuntimeError("Invalid hero output")
print("Verified actual Palace Bridge photograph:",target.stat().st_size,"bytes")
