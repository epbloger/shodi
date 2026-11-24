import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "ru.moorkis.shodi.debug"
def adb(*args, timeout=40):
    return subprocess.check_output(["adb", *args], stderr=subprocess.STDOUT, timeout=timeout).decode("utf-8", "replace")
def hierarchy():
    adb("shell", "uiautomator", "dump", "/sdcard/shodi-window.xml", timeout=25)
    return ET.fromstring(adb("shell", "cat", "/sdcard/shodi-window.xml"))
def find_text(text, timeout=60):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        try:
            for node in hierarchy().iter("node"):
                if text in (node.get("text",""),node.get("content-desc","")):
                    return node
        except (ET.ParseError,subprocess.SubprocessError):
            pass
        time.sleep(2)
    raise AssertionError("Android UI element not found: "+text)
def tap(text):
    node=find_text(text)
    x1,y1,x2,y2=map(int,re.findall(r"\d+",node.get("bounds")))
    adb("shell","input","tap",str((x1+x2)//2),str((y1+y2)//2))
def launch():
    adb("shell","am","start","-W","-n",PACKAGE+"/ru.moorkis.shodi.MainActivity")
def capture(name):
    with open(name,"wb") as f:
        subprocess.run(["adb","exec-out","screencap","-p"],stdout=f,check=True,timeout=20)
adb("install","-r","apk/app-debug.apk")
adb("shell","pm","clear",PACKAGE)
adb("logcat","-c")
launch()
tap("Не даю согласия")
find_text("О приложении")
tap("О приложении")
find_text("Разработчик и поддержка")
capture("android-about.png")
adb("shell","input","keyevent","4")
adb("shell","svc","wifi","disable")
adb("shell","svc","data","disable")
adb("shell","am","force-stop",PACKAGE)
launch()
find_text("О приложении")
capture("android-offline.png")
assert adb("shell","pidof",PACKAGE).strip(),"Application process stopped"
log=adb("logcat","-d","-s","AndroidRuntime:E")
assert "Process: "+PACKAGE not in log,"Android runtime crash: "+log[-3000:]
adb("shell","svc","wifi","enable")
print("Android emulator: launch, legal section, refusal and offline restart passed")
