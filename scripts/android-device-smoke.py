import re
import subprocess
import time
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "ru.moorkis.shodi.debug"
LAUNCHER = "com.google.android.apps.nexuslauncher"
def adb(*args, timeout=40):
    return subprocess.check_output(["adb", *args], stderr=subprocess.STDOUT, timeout=timeout).decode("utf-8", "replace")
def normalized(text):
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())
def hierarchy():
    adb("shell", "uiautomator", "dump", "/sdcard/shodi-window.xml", timeout=25)
    return ET.fromstring(adb("shell", "cat", "/sdcard/shodi-window.xml"))
def matches(node, text):
    return any(normalized(node.get(attr,"")) == normalized(text) for attr in ("text","content-desc"))
def find_text(text, timeout=90, dialog_button=None, dialog_title=None, recover_launcher=False):
    end=time.monotonic()+timeout
    seen=[]
    recovered=False
    while time.monotonic()<end:
        try:
            nodes=list(hierarchy().iter("node"))
            seen=[n.get("text") or n.get("content-desc") or n.get("resource-id") for n in nodes]
            launcher_anr = any(n.get("package") == "android" and normalized(n.get("text","")) in ("pixel launcher isn't responding", "pixel launcher isn’t responding") for n in nodes)
            if launcher_anr and recover_launcher and not recovered:
                # Only recover the confirmed unrelated system launcher ANR once.
                # Never dismiss or retry an ANR of SHODI itself.
                print("Recovering emulator Pixel Launcher ANR", flush=True)
                capture("android-launcher-anr.png")
                adb("shell", "am", "force-stop", LAUNCHER)
                launch()
                recovered=True
                time.sleep(3)
                continue
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
def wait_for_boot():
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        try:
            if adb("shell", "getprop", "sys.boot_completed").strip() == "1" and "package:" in adb("shell", "pm", "path", "android"):
                break
        except subprocess.SubprocessError:
            pass
        time.sleep(3)
    else:
        raise AssertionError("Emulator package manager not ready")
    adb("shell", "input", "keyevent", "KEYCODE_WAKEUP")
    adb("shell", "wm", "dismiss-keyguard")
    # boot_completed can precede launcher startup and its initial workload.
    time.sleep(12)
    if "package:" in adb("shell", "pm", "path", LAUNCHER):
        adb("shell", "am", "force-stop", LAUNCHER)

def launch():
    result=adb("shell","am","start","-W","-n",PACKAGE+"/ru.moorkis.shodi.MainActivity")
    print(result,flush=True)
    assert "Error:" not in result and "Exception" not in result and "Status: ok" in result, result
def capture(name):
    with open(name,"wb") as f:
        subprocess.run(["adb","exec-out","screencap","-p"],stdout=f,check=True,timeout=20)
def assert_refusal():
    raw=adb("shell","run-as",PACKAGE,"cat","shared_prefs/privacy.xml")
    prefs=ET.fromstring(raw)
    assert any(n.get("name")=="ads_allowed" and n.get("value")=="false" for n in prefs),"Consent refusal not persisted"
def run():
    wait_for_boot()
    adb("install","-r","apk/app-debug.apk")
    adb("shell","pm","clear",PACKAGE)
    adb("logcat","-b","main","-b","system","-b","events","-b","crash","-c")
    launch()
    find_text("Обработка данных для рекламы", timeout=120, recover_launcher=True)
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
    anrs=adb("logcat","-d","-b","events","-s","am_anr:I")
    assert not any(PACKAGE in line for line in anrs.splitlines()),"SHODI ANR: "+anrs[-3000:]
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
