import re
import subprocess
import time
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "ru.moorkis.shodi.debug"
def adb(*args, timeout=40):
    return subprocess.check_output(["adb", *args], stderr=subprocess.STDOUT, timeout=timeout).decode("utf-8", "replace")
def normalized(text):
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())
def hierarchy():
    adb("shell", "uiautomator", "dump", "/sdcard/shodi-window.xml", timeout=25)
    return ET.fromstring(adb("shell", "cat", "/sdcard/shodi-window.xml"))
def matches(node, text):
    return any(normalized(node.get(attr,"")) == normalized(text) for attr in ("text","content-desc"))
def find_text(text, timeout=90, dialog_button=None, dialog_title=None):
    end=time.monotonic()+timeout
    seen=[]
    while time.monotonic()<end:
        try:
            nodes=list(hierarchy().iter("node"))
            seen=[n.get("text") or n.get("content-desc") or n.get("resource-id") for n in nodes]
            for node in nodes:
                if matches(node,text):
                    return node
            if dialog_button and any(matches(n,dialog_title) for n in nodes):
                for node in nodes:
                    if node.get("resource-id")==dialog_button and node.get("enabled")=="true":
                        # Android themes may transform button labels to all caps.
                        assert matches(node,text), "Unexpected consent button label: "+str(node.attrib)
                        return node
        except (ET.ParseError,subprocess.SubprocessError):
            pass
        time.sleep(2)
    raise AssertionError("Android UI element not found: "+text+"; visible nodes: "+str(seen[:80]))
def tap(text, **kwargs):
    node=find_text(text, **kwargs)
    x1,y1,x2,y2=map(int,re.findall(r"\d+",node.get("bounds")))
    assert x2>x1 and y2>y1,"Empty touch bounds"
    adb("shell","input","tap",str((x1+x2)//2),str((y1+y2)//2))
def launch():
    result=adb("shell","am","start","-W","-n",PACKAGE+"/ru.moorkis.shodi.MainActivity")
    print(result,flush=True)
    assert "Error:" not in result and "Exception" not in result
def capture(name):
    with open(name,"wb") as f:
        subprocess.run(["adb","exec-out","screencap","-p"],stdout=f,check=True,timeout=20)
def assert_refusal():
    raw=adb("shell","run-as",PACKAGE,"cat","shared_prefs/privacy.xml")
    prefs=ET.fromstring(raw)
    assert any(n.get("name")=="ads_allowed" and n.get("value")=="false" for n in prefs),"Consent refusal not persisted"
def run():
    adb("install","-r","apk/app-debug.apk")
    adb("shell","pm","clear",PACKAGE)
    adb("logcat","-c")
    launch()
    find_text("Обработка данных для рекламы")
    capture("android-consent.png")
    tap("Не даю согласия",dialog_button="android:id/button2",dialog_title="Обработка данных для рекламы")
    find_text("О приложении")
    assert_refusal()
    tap("О приложении")
    find_text("Разработчик и поддержка")
    capture("android-about.png")
    adb("shell","input","keyevent","4")
    adb("shell","svc","wifi","disable")
    adb("shell","svc","data","disable")
    adb("shell","am","force-stop",PACKAGE)
    launch()
    find_text("О приложении")
    assert_refusal()
    capture("android-offline.png")
    assert adb("shell","pidof",PACKAGE).strip(),"Application process stopped"
    log=adb("logcat","-d","-s","AndroidRuntime:E")
    assert "Process: "+PACKAGE not in log,"Android runtime crash: "+log[-3000:]
    print("Android emulator: launch, legal section, persisted refusal and offline restart passed")
try:
    run()
except Exception:
    for action in (
        lambda: capture("android-failure.png"),
        lambda: Path("android-failure.xml").write_text(ET.tostring(hierarchy(),encoding="unicode"),encoding="utf-8"),
        lambda: Path("android-failure-log.txt").write_text(adb("logcat","-d","-s","AndroidRuntime:E","ActivityTaskManager:I"),encoding="utf-8"),
    ):
        try: action()
        except Exception as e: print("Diagnostic capture failed:",e,flush=True)
    raise
finally:
    try:
        adb("shell","svc","wifi","enable")
        adb("shell","svc","data","enable")
    except Exception:
        pass
